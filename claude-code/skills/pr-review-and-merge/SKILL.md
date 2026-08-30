---
name: pr-review-and-merge
description: "Review a PR against its ticket ACs under /behavior claude-opus-5, post a verdict, and merge if approved. Uses /custom-agent Explore for diff exploration, /custom-agent Plan for review planning, and /custom-agent worker for running verification checks. Covers the self-review case where reviewer == PR author."
version: 1.4.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [github, code-review, pull-request, merge, jira, acceptance-criteria]
    related_skills: [github-code-review, github-pr-workflow, requesting-code-review, jira, behavior, custom-agent, claude-opus-5, Explore, Plan, worker]
---

# PR Review and Merge

> **Setup values.** This skill contains no account ids, site hosts, project keys, or
> deployed URLs — they appear as `{{PLACEHOLDER}}`. Resolve them from
> `project-config.local.md` in the skills directory. If that file is missing, or the
> value you need is absent or still `{{...}}`, **stop and ask the user for it** (batch
> the asks if you need several), then offer to save it so you never ask again. Never
> guess one, never carry one over from another project, and never invent a
> plausible-looking account id — a wrong id silently misassigns tickets and a wrong URL
> silently grades the wrong site. Full table and asking rules: `PROJECT-CONFIG.md`.


## JIRA content format — ADF only, no exceptions

**Every** JIRA description, comment, reply, and subtask body this skill writes is
Atlassian Document Format (ADF) v3 JSON. There is no "quick comment" exemption.

**Start from this skill's own template — do not compose ADF by hand:**

| Template | Use for |
|---|---|
| `templates/adf/comment.adf.json` | any other comment on a ticket |
| `templates/adf/review-verdict.adf.json` | the AC-by-AC review verdict |

Each is valid ADF v3 with `{{PLACEHOLDER}}` tokens. Load it, substitute, post the
object as the body — `commentBody` for Rovo MCP, `{"body": …}` or
`{"fields": {"description": …}}` for REST v3. Delete any row or section the ticket
genuinely does not need; never leave a `{{PLACEHOLDER}}` in a posted body.

```bash
python3 ~/.claude/skills/scripts/adf.py --validate <filled>.adf.json   # before posting
```

**Never** send Jira wiki markup (`h2.`, `||header||`, `{code}`), HTML (`<table>`), or raw
Markdown (`## heading`, `| a | b |`, `**bold**`). All three render as broken literal text
in the modern issue view.

Templates are generated from `templates/adf/_src/pr-review-and-merge/*.adf.md` by
`templates/adf/build.sh` — edit the source and rebuild, never the JSON. Full node spec:
`rules/ADF.md`. Which template a skill uses at which gate, for the whole
pipeline: `templates/TEMPLATES.md` (generated — do not edit by hand).

## Pipeline position and gates

```
/architect → /ba → /developer → **/pr-review-and-merge** → /release → /quality-analyst → /sre → /docs
                                          ↑
                              /security-review (BLOCKING)
```

Full map: `PIPELINE.md` in the Skills bundle.

**Two changes to this skill's contract:**

1. **`/security-review` is a blocking gate before the merge decision** (new step 7.5).
2. **After merge the next hop is `/release`, not `/quality-analyst`** (revised step 10).
   `/release` proves the deploy carries the merge commit; QA then grades a build it has
   been shown is live. Previously QA could grade the *previous* build whenever CI went
   red after merge and the Netlify deploy never ran.

Also enforced here on behalf of upstream skills:

- **Frozen contracts.** A diff that changes a type, route, or error shape named in the
  epic's Accepted ADR without a superseding ADR is a **blocking** finding. Escalate to
  `/architect`; do not approve it as a "small refactor".
- **Test contract integrity.** If `/test-strategy` produced a contract for this ticket,
  `git diff --stat -- '*.test.*'` must show additions only. An edited contract row means
  the implementation moved the goalposts — blocking.
- **Design tokens.** A raw hex or a default `sm/md/lg/xl/2xl` variant in a component on
  a project with custom Figma frames is a known defect family, not a style preference.

## When to use

- User says "review PR #N for <TICKET>" and expects a merge decision.
- User wants a PR verified against Jira acceptance criteria, not just diff'd.
- The PR author is the same GitHub account as the only available credential
  (self-review — see Pitfalls).
- **Fallback:** the user invoked `/code-review <MR_URL>` but the gateway did not
  visibly route it (no response after a reasonable wait). Do not keep waiting;
  run this skill's workflow directly and finish the review + merge.

## Trigger fallback check

`/code-review` is a gateway slash command and may not surface a response in the
chat. If the user says "start code review" or the slash command was issued and
nothing happened within ~30 seconds, assume the gateway did not deliver it and
execute this skill manually.

## Prerequisites

- `gh` CLI authenticated (`gh auth status` works). This is the preferred path —
  plain `git` + `curl` with a token is the fallback but `gh` is simpler and the
  consent guard on this machine blocks `curl` calls that source tokens from
  `~/.env`. Prefer `gh` to avoid that friction.
- Jira MCP configured if a ticket key is given (for AC lookup).
- Local clone of the target repo.

## Workflow

### 1. Gather PR context

```bash
gh pr view <N> --repo <owner/repo> --json title,state,mergeable,headRefOid,baseRefName,changedFiles,body,author
gh pr diff <N> --repo <owner/repo> --name-only
```

Capture `headRefOid` (head SHA) — needed for any inline review comments and to
pin the review to the exact commit. Also capture `author.login`; compare it to
the currently authenticated `gh` user. If they match, this is a self-review and
you must use the self-approval fallback in step 7.

### 2. Fetch the PR locally for full review

```bash
git fetch origin pull/<N>/head:pr-<N>
git checkout pr-<N>
git diff main...pr-<N> --stat
```

This gives `read_file` / `search_files` / test runs access to the real code,
not just the diff. Diffs alone miss issues visible only with surrounding context.

### 3. If a Jira ticket is referenced, pull the ACs

Use the `jira` MCP tools (`mcp__jira__jira_get_issue`, or fetch the linked
epic/parent for the AC list). Build a checklist of acceptance criteria and map
each changed file to the AC it satisfies. The review verdict must explicitly
confirm or deny each AC — a generic "looks good" is not enough.

### 4. Read every changed file

Use `read_file` on each changed file. Do not review from the diff alone —
the diff shows what changed, `read_file` shows whether the result is correct
in context. Batch the reads in one assistant turn (parallel tool calls).

### 5. Run real verification

**CI-green hard gate — do this first, before reading a single line of the diff.**
Merging on a red or missing pipeline is a workflow violation. In `{{PROJECT_NAME}}` the
Netlify workflow runs `vitest` *before* the deploy step, so one stale assertion blocks the
deploy entirely; seven consecutive merges once landed red and the live site sat seven
merges behind while every ticket was marked merged, stranding QA at the deploy gate.

```bash
sha=$(gh api repos/<owner>/<repo>/pulls/<N> -q .head.sha)
gh api "repos/<owner>/<repo>/commits/$sha/check-runs" \
  -q '.check_runs[] | "\(.name): \(.conclusion)"'      # every conclusion must be success
```

Red, pending, or **no checks at all** = do not merge; report it. A PR with zero checks is
usually a workflow that lacks a `pull_request:` trigger — say so rather than treating the
absence as a pass. **After** merging, confirm a deploy run for the merge commit actually
succeeded (`gh run list --branch main --limit 1`) before handing off to QA.

The root pattern behind those red merges: **a ticket changed a component's Tailwind classes
or copy and never updated the corresponding `*.test.tsx`.** Treat a class/copy diff with no
test file touched as incomplete, not as a clean small diff.

Then actually execute the checks — never report a result you didn't run. For each
command, capture the **real exit code and output count** so it can be quoted in
the review comment as evidence, not described:

- `npx tsc --noEmit` (run in both the root and any sub-package with its own
  `tsconfig.json`, e.g. `test-automation/`)
- `npm test` / `pytest` / `cargo test` / `go test ./...`
- `grep` for leftover light-theme classes, `any` types, debug prints, secrets
- **Constants / typo drift check:** when the PR changes a hard-coded value, email, URL, color, or fixes a typo in runtime code, search the same old/new string across `src/**`, `test-automation/**`, and any other test/fixture directories. Runtime fixes frequently leave stale test mocks, POM constants, and automation fixtures behind, causing an avoidable follow-up PR. Verify the old value is gone everywhere the new value should be present.
- **Verify removals, not just additions.** When the diff deletes a class or string, `grep -c` it across `src/**` and confirm 0. A fix that layers an override while the offender survives is a different fix with different behaviour, and it will resurface.
- **Responsive ladder completeness.** For any diff touching responsive utilities, check each property has a value for each real Figma frame and no invented tier — and specifically that no `laptop:` sets a property without a `desktop:` counterpart, and no 1440/1920 value is bound to `md:`/`lg:`. This one defect family produced eight tickets on `{{PROJECT_NAME}}`. See `developer-agent-ecosystem/references/responsive-breakpoint-ladder.md`.
- **Both render branches.** These components render a skeleton branch and a loaded branch reusing the same `data-testid`. A class fix present once (`grep -c` → 1) instead of twice leaves first paint defective — this shipped undetected once already.
- **Sibling starvation after a flex/width change.** Re-measure the *siblings* of any changed flex or width utility, not just the element the ticket names. Removing one offset once left a hero image 0px wide because a sibling's `md:w-full` on a `shrink-0` card starved the `flex-1` wrapper.
- **Evidenced deviation is welcome; unevidenced deviation is not.** If the developer departed from the prescribed fix, the PR must carry a before/after table across several widths **including the widths that must not change**. A prescribed fix is a hypothesis: two on this project would not have worked, and the developer was right to deviate. Verify any specificity claim against compiled CSS — e.g. Tailwind v4 `divide-x` emits `:where(.divide-x > :not(:last-child)) { border-inline-end-width: 1px }`, a **right** border at **zero** specificity, so a prescribed `border-l` reasoning is simply wrong.
- **Compare like with like on test counts.** A `--project unit` count and a full-suite count are different figures; if the PR quotes one and you run the other, the gap reads as a regression that isn't there. Ask which command produced the number.
- **Binary asset completeness check:** for every image, SVG, or font referenced in the diff, run `git ls-files --error-unmatch <path>` in the repo root. If the command errors, the file was never committed — it works locally (untracked) but is missing from the deployed build. This is a P1 production defect. Reject any PR where a referenced asset is not tracked in git.
- **z-index stacking check:** when the diff adds or moves an absolute-positioned decorative element alongside a foreground image or card, verify `z-index` ordering in the component. Decorative background elements must be `z-0` (or lower); foreground content wrappers must be `relative z-10`. A missing z-index leaves the hero image invisible behind the illustration on production. Check via `getComputedStyle` or `grep -n "z-"` on the changed component.
- **Asset origin vs Figma spec check:** verify the asset filename referenced in the diff (e.g., `abstract_design.svg`) maps to the Figma node ID cited in the ticket ACs, not to a reused asset from a different page. Cross-page asset reuse produces visually wrong output that only a side-by-side Figma comparison catches.
- For any URL referenced in the diff, `curl -s -o /dev/null -w "%{http_code}" -L <url>`
  to confirm it's not a 404
- **Backend / Prisma PRs specifically:**
  - `npx prisma generate` — client must regenerate cleanly after schema changes.
  - `npx prisma db push --accept-data-loss --skip-generate` (when no migration history exists) or `npx prisma migrate deploy` (when migrations exist) — apply schema changes.
  - `npm run seed` — confirm seed data populates new tables/columns and matches ticket requirements.
  - For form endpoints, test rate limiting and validation edge cases.
  - **Read-only backend PRs:** If the PR adds only GET endpoints and the generic ticket ACs mention POST/PUT Zod validation or rate limiting, verify the developer documented the exemption in a route comment instead of adding phantom POST endpoints. See `developer-agent-ecosystem/references/backend-read-only-scope-exemption.md`.
  - See `developer-agent-ecosystem/references/nextjs-prisma-vitest-backend.md` for the full Next.js + Prisma + SQLite verification recipe.

### Local server verification for full-stack PRs

When the PR touches both frontend and backend, run the production build locally and exercise the live route through real HTTP/Playwright rather than relying only on unit tests:

```bash
cd <repo>
npm run build
npm start        # confirm port 3000 is free; kill any stale process first
```

Then, in another shell:
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/<page>` for reachability.
- Use a small Playwright script to fill/submit forms and inspect the real DB row.
- For SQLite, the running Next.js app copies `prisma/dev.db` to `/tmp/dev.db`; query `/tmp/dev.db` for inserted rows, or query `prisma/dev.db` before/after the server copies it. Do not write to `prisma/dev.db` while `npm start` is running.

Always stop the dev server after verification:
```bash
lsof -ti:3000 | xargs kill -9
```

Capture the **real exit codes and counts** — the review comment must cite them
as evidence, not describe what was expected to happen.

### 6. Ponytail check (unrequested abstractions)

Before approving, check that any new files are justified, not speculative:
- A test harness page that exists only to give browser tests a stable URL for
  an empty/loading state is justified (unit tests can't reach it). Shortest
  path to browser-testable fixtures.
- An interface with one implementation, a factory for one product, a config
  for a value that never changes = unrequested abstraction. Flag it.

### 7. Post the review verdict

Write the review body to a `/tmp/*.md` file (formatted markdown), then post.
See `references/self-approval-fallback.md` for the full template and the
reason `gh pr review --approve` fails when reviewer == author.

```bash
# Post the formatted markdown comment (NOT json — gh posts --body-file bytes verbatim)
gh pr comment <N> --repo <owner/repo> --body-file /tmp/pr<N>-review.md

# Optional: a COMMENT-event review (allowed for self-review; only APPROVE/REQUEST_CHANGES are blocked)
gh pr review <N> --repo <owner/repo> --comment --body "Full review in comment above."
```

The review body must include:
- **Verdict: APPROVED ✅** (or Changes Requested)
- A verification table with real exit codes / test counts / HTTP statuses
- An AC checklist mapping each criterion to evidence
- A ponytail-check note for any new files
- Non-blocking suggestions as inline-style notes

### 7.5 Security gate (BLOCKING — before any merge)

```
Skill(skill="security-review", args="<PR_NUMBER>")
```

`/security-review` returns exactly one of **PASS**, **PASS WITH NOTES**, or **BLOCK**.

- **PASS / PASS WITH NOTES** → continue to step 8. Carry its scan table into the review
  verdict comment so the evidence is on the ticket, not only in this session.
- **BLOCK** → **do not merge.** Transition the parent ticket back to "In Progress",
  assign the Dev account (per `jira-workflow`), and hand the blocking findings to
  `/developer`. Re-enter this skill at step 1 on the fix PR.

The gate covers both application security (injection, authz, secrets, dependency
advisories, the Next.js server/client import boundary) and **harness security** —
token separation (`GITHUB_TOKEN` vs `GITHUB_REVIEWER_TOKEN` must never appear in the
same command), prompt-injection surfaces where JIRA/Figma/PR text reaches a shell, hook
configs, and MCP write scope.

The `--body` backtick hazard documented later in this skill is one instance of that
injection family; `/security-review` treats any unquoted attacker-influenceable text
reaching a shell the same way.

**Do not skip this gate on a refactor PR.** "Just moving code" is exactly how a
server-only import crosses into a client component.

### 8. Merge if approved

```bash
gh pr merge <N> --repo <owner/repo> --squash --delete-branch
```

Verify the merge state after:

```bash
gh pr view <N> --repo <owner/repo> --json state,mergedAt,mergedBy,mergeCommit
# Expect: "state":"MERGED"
```

### 9. Clean up local branch

```bash
git checkout main
git branch -D pr-<N>
```

**Husky branch-name guard:** Some repos enforce branch-name templates in a
`pre-commit` hook (e.g. `Fix/<JIRA_KEY>/<Component>` or `Automation/<JIRA_KEY>/<Component>`).
If you created a temporary `pr-<N>` branch during review, do **not** commit on
it — the hook will reject the branch name. Treat `pr-<N>` as read-only; if you
need to apply a fix, create a new compliant branch from `pr-<N>` or `main`.
See `references/husky-temp-branch-cleanup.md` for the full recipe.

Note: `git fetch origin` and branch cleanup may be blocked by the local consent
guard on this machine. That's fine — the remote state is already confirmed via
`gh` in step 8. Manual local cleanup is optional; do **not** retry cleanup
commands that the consent guard already blocked.

### Reviewer-comment resolution workflow (self-review or otherwise)
### Reviewer-comment resolution workflow (self-review or otherwise)

Review comments are blocking until resolved. **Replying is NOT resolving.** GitHub keeps review threads open until the `Resolve conversation` button (or GraphQL `resolveReviewThread`) is explicitly invoked. A PR with unresolved threads must not be merged.

When the PR author is also the reviewer (self-review setup), comments posted to the MR still carry the same weight as teammate feedback.

1. Fetch both top-level comments and inline review threads:
   ```bash
   # General conversation comments
   gh pr view <N> --repo <owner/repo> --json comments

   # Inline code review comments (Files changed tab)
   gh api repos/<owner>/<repo>/pulls/<N>/comments

   # For programmatic access, also call:
   # GET /repos/{owner}/{repo}/issues/{pr}/comments  (conversation)
   # GET /repos/{owner}/{repo}/pulls/{pr}/comments   (inline review)
   # and merge arrays by created_at to get every comment in chronological order.
   ```
2. Fix root cause with the smallest diff. Prefer project conventions over
   generic skill recipes when they conflict — the local repo's constitution
   wins. Document any deliberate trade-off in a PR comment reply.
3. Re-verify after every amend (`tsc`, tests, build, relevant Playwright specs).
   For projects with separate test-automation packages, run `npx tsc --noEmit`
   **inside each package** (root + `test-automation/`) because the root
   `tsconfig.json` may exclude the sub-package.
4. Reply to each inline review thread explaining the resolution. Then mark
   each thread **resolved** explicitly — GitHub does not mark a reply as
   resolved automatically.

   **Mark resolved via GitHub GraphQL API** (the web UI button calls this):
   ```graphql
   mutation ResolveReviewThread($id: ID!) {
     resolveReviewThread(input: { threadId: $id }) {
       thread { id isResolved }
     }
   }
   ```
   Fetch thread IDs with:
   ```graphql
   {
     repository(owner: "<owner>", name: "<repo>") {
       pullRequest(number: <N>) {
         reviewThreads(first: 100) {
           nodes { id isResolved }
         }
       }
     }
   }
   ```
5. Confirm zero unresolved threads remain by re-querying `reviewThreads`.
   Only then proceed to merge.
6. Post a resolution summary comment, then merge.

**Re-verification discipline:** After any fix amend (whether from reviewer
feedback or from a QA failure), re-run the full verification suite before
posting an updated verdict. Do not post a new "APPROVED" comment based only on
a partial fix or on the previous passing run.

If comments reveal a bug in already-merged `main`, create a follow-up branch
from `main`, fix it, and open a new MR — never rewrite `main` history.
posting an updated verdict. Do not post a new "APPROVED" comment based only on
a partial fix or on the previous passing run.

If comments reveal a bug in already-merged `main`, create a follow-up branch
from `main`, fix it, and open a new MR — never rewrite `main` history.

### 10. Post-merge handoff

After the MR is merged and the parent ticket is transitioned to "In Testing"
(by the code review skill), load **`/release` first** — not QA:

```
Skill(skill="release-engineer", args="{JIRA_KEY}")
```

`/release` watches the post-merge `main` run to completion and then proves the deploy
carries the merge commit: the served HTML must contain a token the diff **added** and
must not contain a token the diff **removed**. A 200 is not proof.

Only once that proof passes does `/release` invoke
`Skill(skill="quality-analyst", args="{JIRA_KEY}")` itself. Do not invoke QA directly
from here — that is the path by which QA grades a stale build. If `/release` reports the
deploy is stale or CI went red after merge, the ticket goes back to "In Progress" and
QA never starts.

Both handoffs are automatic. Do not ask for confirmation at either.

If the `Skill` tool is unavailable in the current environment, do **not**
block the workflow. Add a Jira comment on the parent ticket summarizing the
review evidence, confirming it is in "In Testing", and explicitly stating that
QA handoff is next. Include the QA subtask key if one already exists
(e.g. `{QA_SUBTASK_KEY}`). If the chat environment supports gateway slash
commands, you may also issue `/quality-analyst {JIRA_KEY}`; otherwise leave
the handoff note and stop. See `references/qa-handoff-skill-tool-fallback.md`.

**QA feedback loop handling:** If the quality-analyst skill finds a defect and
the parent ticket is moved back to "In Progress" for a fix, the developer must
open a **new MR** for the fix (do not push directly to `main`). After that MR
is ready, load `pr-review-and-merge` again for the new MR URL, then immediately
re-run `quality-analyst` for the same JIRA_KEY. Keep cycling until QA passes and
the parent reaches Done. Do not ask the user at any handoff.

If the QA re-test fails, the quality-analyst skill dispatches the fix
sub-agent, raises a new MR, and loads the next skill directly via
`Skill(skill="pr-review-and-merge", args="{NEW_MR_URL}")`. After that merge,
quality-analyst re-runs automatically. Do not ask the user at any handoff.

### Jira MCP unavailable during review

If the Jira MCP returns "Unknown tool" or fails when looking up the ticket ACs,
proceed with the review using the PR title/body, the diff, and any linked Jira
ticket mentioned in the branch or description. Post the verdict and note in the
comment that ACs were verified from available context because Jira was
temporarily unreachable. Do **not** block the merge solely because the MCP lookup
failed if the PR scope is otherwise clear and verification passed.

**GitHub forbids approving your own PR.** `gh pr review --approve` returns
`422: Review Can not approve your own pull request` when the authenticated
account is the PR author.

A second token for the **same user account** does not help — GitHub keys the
block on the user identity, not the token. `GITHUB_REVIEWER_TOKEN` only helps
if it authenticates a *different* GitHub account (a real bot/teammate account).

Fallback: post the verdict as a `gh pr comment` with a formatted `.md` file
(lead with "**Verdict: APPROVED ✅**" and a note about the self-approval
constraint), optionally add a `gh pr review --comment`, then merge. The local
verification evidence is real and durable regardless of how it's posted.

See `references/self-approval-fallback.md` for the exact commands and the
`--body-file` gotcha.

### `/code-review` may not route visibly through the gateway

The gateway slash command is asynchronous. If the user issues it and no review
response appears in the chat after a short wait, the command may have been
dropped, delayed, or handled in another thread. Do not repeatedly re-issue it
hoping for a visible reply — load this skill and execute the workflow manually.

### `gh pr comment --body-file` posts bytes verbatim

If the file is a JSON review payload, it posts raw JSON, not rendered markdown.
Always write the review to a `.md` file and pass that. If you accidentally post
JSON, delete it (`gh api -X DELETE repos/.../issues/comments/<id>`) and repost
the `.md`.

### Consent guard blocks `curl` with sourced tokens

On this machine, `curl` calls that `source ~/.env` to get `GITHUB_TOKEN` /
`GITHUB_REVIEWER_TOKEN` are blocked by the consent guard. `gh` CLI (keyring
auth) is not blocked. Prefer `gh` for all GitHub interactions here.

### `gh pr create --body` with backticks is interpreted by the shell

When creating a PR from the terminal, a `--body` string containing backticks is executed as command substitution by bash. This can run arbitrary commands, embed build/test output into the PR body, and garble the description. Always write the body to a `.md` file and use `--body-file`:

```bash
gh pr create --title "..." --body-file /tmp/pr<N>-body.md
```

If the body was already garbled, use `gh pr edit <N> --body-file /tmp/pr<N>-body.md` to rewrite it cleanly.

On this machine, `curl` calls that `source ~/.env` to get `GITHUB_TOKEN` /
`GITHUB_REVIEWER_TOKEN` are blocked by the consent guard. `gh` CLI (keyring
auth) is not blocked. Prefer `gh` for all GitHub interactions here.

### `gh auth login --with-token` is overridden by `GITHUB_TOKEN` env var

If `GITHUB_TOKEN` is set in the environment, `gh auth login --with-token` is a
no-op — `gh` uses the env var. To actually switch accounts, unset `GITHUB_TOKEN`
first, or use `GH_TOKEN=<token> gh ...` per-command. But note: if the second
token is for the same user, switching won't unblock self-approval anyway.

### Two `tsconfig.json` files

A Next.js root `tsconfig.json` that `exclude`s `test-automation/` means
`tsc --noEmit` at the root does NOT type-check the test-automation package.
Run `tsc` in both directories separately. A clean root build can hide
type errors in the test package.

### `read_file` with an empty or whitespace path loops silently

If a prior tool call returns an empty path (for example, a malformed relative
path or a dedup hit that lost the filename), repeatedly calling `read_file("")`
fails with "File not found" and does not advance the task. **Stop and recover**
instead of retrying:
1. Check the actual file path from `git status`, `search_files`, or the tool
   result that produced the path.
2. Use the absolute path or a clearly relative path like `src/app/globals.css`.
3. If the file content was already returned earlier in the conversation, use that
   cached content instead of re-reading.

### `replace_all` amplifies bad-diff damage

When a file has structural corruption from a bad diff (escaped `\"`, embedded
literal `\n`, truncated strings), `patch(..., replace_all=true)` with a simple
character substitution corrupts it further. The `replace_all` replaces ALL
occurrences — including ones inside already-damaged string literals — turning
one broken region into several.

**Rule:** if the file has malformed strings or embedded whitespace that isn't
normal JSX formatting, rewrite with `write_file`. If the file looks structurally
sound and only has wrong values (e.g. wrong className values throughout), a
targeted patch with enough context is safe.

### `git status` shows unintended changes after a fix

LSP auto-formatting on file open can revert part of a rewrite. Always check
`git diff <file>` before committing — discard with `git checkout -- <file>` if
it contains changes you didn't intend.

## Reference files

Every file in `references/` is listed here. Generated by
`scripts/refindex.py` — descriptions you write by hand are preserved.

- `references/auto-handoff-failure-case-study.md` — why `/quality-analyst` did not auto-start after a merge, and the handoff check that prevents a ticket stalling silently between gates.
- `references/automation-coverage-gate-recipe.md` — KAN-37 reproduction of the automation-coverage gate — how to prove an Integration PR actually carries the Playwright spec it claims.
- `references/bad-diffs-build-fixes.md` — common bad-diff patterns (escaped
  quotes in JSX, truncated slugs, embedded `\n` in string attrs) and the
  rewrite-vs-replace decision tree. Read this before fixing build errors on an
  MR branch.
- `references/bulk-github-pr-review-comment-resolution.md` — Resolving Bulk GitHub PR Review Comments.
- `references/follow-up-fix-scope-check.md` — the scope test for a follow-up fix — what may ride along in the current diff and what must become its own ticket.
- `references/follow-up-pr-patterns.md` — when a fix belongs in a follow-up PR instead of the current one, and how to open it without losing the ticket link.
- `references/github-graphql-outage-rest-fallback.md` — **when `gh pr create`/`gh pr merge`/`gh pr view` fail with 503, GraphQL is down but REST is healthy.** Exact REST equivalents for create, comment, merge, state and CI checks; what has no REST equivalent (thread resolution); and why you must never push to `main` to work around it.
- `references/husky-temp-branch-cleanup.md` — how to clean up temporary `pr-<N>` review branches when the repo enforces branch-name templates in Husky.
- `references/lead-reviewer-dispatch.md` — the dispatch templates for the lead reviewer, including the wording that hands a PR to a reviewer sub-agent. Read before dispatching, not after.
- `references/nextjs-frontend-pr-review-checklist.md` — checklist for frontend-only PRs.
- `references/playwright-local-base-url.md` — **pre-merge only.** Run Playwright against a local build of the branch under review, because the deployed site still carries the old build. This is the one stage that uses localhost — every gate from `/release` onward is deployed-URL only.
- `references/qa-handoff-skill-tool-fallback.md` — what to do when the
  `quality-analyst` skill cannot be dispatched via `Skill()` in the current
  environment.
- `references/resolve-review-threads-graphql.md` — exact GraphQL script to fetch and resolve GitHub review threads in bulk. A reply alone does not mark a thread resolved; this reference is required reading before merging a PR with inline comments.
- `references/review-final-branch-state-and-live-smoke-test.md` — verify the final branch state and run a live smoke test before approving; a green diff is not a working build.
- `references/self-approval-fallback.md` — exact commands for the self-review
  case, the `--body-file` gotcha, and the review comment template.

## Related skills

- `github-code-review` (bundled) — the diff/comment mechanics this skill builds on
- `github-pr-workflow` (bundled) — the branch/commit/CI/merge lifecycle
- `requesting-code-review` — pre-commit verification of your own changes
- `jira` — AC lookup via Jira MCP