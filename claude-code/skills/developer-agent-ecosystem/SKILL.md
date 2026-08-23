---
name: developer-agent-ecosystem
description: "Developer Team Ecosystem (/developer): Senior full-stack dev agent analyzes JIRA tickets by scope (frontend/backend/integration), attaches execution plans, dispatches specialized sub-agents (Frontend Dev, Backend Dev, Integration Dev) via the Agent tool, and builds toward DOD. Sub-agents halt on missing info and trigger /ba-reply to the BA manager, then resume via /frontend-dev-resume, /backend-dev-resume, /integration-dev-resume. Enforces hard delegation: main agent must not write implementation code assigned to a sub-agent."
version: 1.10.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [developer, jira, frontend, backend, integration, code-review, sprint, workflow]
    related_skills: [business-analyst-workflow, jira, subagent-driven-development, requesting-code-review, mr-code-review, behavior, custom-agent, claude-sonnet-5, Plan, teammate]
---

# Developer Team Ecosystem (/developer)

> **Setup values.** This skill contains no account ids, site hosts, project keys, or
> deployed URLs — they appear as `{{PLACEHOLDER}}`. Resolve them from
> `project-config.local.md` in the skills directory. If that file is missing, or the
> value you need is absent or still `{{...}}`, **stop and ask the user for it** (batch
> the asks if you need several), then offer to save it so you never ask again. Never
> guess one, never carry one over from another project, and never invent a
> plausible-looking account id — a wrong id silently misassigns tickets and a wrong URL
> silently grades the wrong site. Full table and asking rules: `PROJECT-CONFIG.md`.


## Figma read path — bridge or Figma MCP

Read **`FIGMA_READ_PATH`** from `project-config.local.md` and use it. **Never ask the
user which path to take** — the decision was recorded at install.

| Value | Use |
|---|---|
| `bridge` | Local AI Bridge on `http://localhost:47291` (port mandatory) |
| `figma-mcp` | the official `plugin:figma` MCP server |

Same facts, different transport:

| Need | `bridge` | `figma-mcp` |
|---|---|---|
| Tokens / variables | `GET /api/variables` | `get_variable_defs` |
| Frame list, structure | `GET /api/frames`, `/api/document` | `get_metadata` |
| Per-node CSS, layout, fills | `GET /api/node/:id/context`, `/css` | `get_design_context` |
| Vector export | `GET /api/node/:id/svg` | `download_assets` |
| Rendered image | bridge screenshot endpoints | `get_screenshot` |

**Key missing?** Probe once — `curl -s --max-time 2 http://localhost:47291/api/whoami`
— use `bridge` if it answers, `figma-mcp` if not. State which you picked and offer to
record it. Do not interrogate the user.

**`bridge` selected but unreachable, or its plugin closed?** Say so, fall back to
`figma-mcp` for this run if it is available, and suggest they either start the bridge or
set `FIGMA_READ_PATH: figma-mcp`. Do not silently switch every run.

**Neither available?** **Halt and say so.** Never estimate a design value — that is
invariant 13. Degraded bridge (plugin closed) still gives geometry, layout, and text, but
**not** CSS, tokens, or SVG export; label anything you cannot verify as UNAVAILABLE.


**Behavior/agent wiring:** Main agent runs `/behavior claude-sonnet-5`. Sub-agents load `/behavior claude-sonnet-5` then `/custom-agent Plan`. Parallel coordination uses `/custom-agent teammate`. Exploration uses `/custom-agent Explore`; design/spec gaps use `/custom-agent visualize`; verification uses `/custom-agent worker`.

Senior full-stack dev agent analyzes JIRA tickets by scope (frontend/backend/integration), attaches execution plans, dispatches specialized sub-agents (Frontend Dev, Backend Dev, Integration Dev) to build toward DOD. Sub-agents halt on missing info and trigger /ba-reply to the BA manager, then resume via /frontend-dev-resume, /backend-dev-resume, /integration-dev-resume.

**Trigger Commands:** `/developer <JIRA_TICKET_ID>`, or auto-invoked via `Skill(skill="developer-agent-ecosystem", args="{JIRA_KEY}")`

**Related Skills:** `business-analyst-workflow` (BA manager — upstream), `jira` (JIRA MCP tools), `subagent-driven-development`

## Pipeline position and gates

```
/em --plan → /architect → /ba → **/developer** → /pr-review-and-merge → /release → /quality-analyst → /sre → /docs
                                    ↑                      ↑
                            /test-strategy (RED)   /security-review (BLOCK)
```

Full map: `PIPELINE.md` in the Skills bundle.

### Inbound gate — /architect Frozen contracts

If the ticket's epic has an Accepted ADR, its **Frozen contracts** block (data model,
API table, shared types, state ownership, error model) is **read-only input**. Sub-agents
implement to it and never change it. A sub-agent that finds a contract unimplementable
**halts** and triggers `/ba-reply`, which escalates to `/architect` — it does not patch
around the contract in a PR. A PR that changes a type or route named in a Frozen
contract without a superseding ADR is a blocking review finding.

### Inbound gate — /design-system tokens

Implementation consumes **tokens, not values**. Before writing any class:

- Colour → a `--color-*` token from `@theme inline`, never a raw hex in a component.
- Breakpoint → a named frame variant (`laptop:` = 1440, `desktop:` = 1920), never
  default `sm/md/lg/xl/2xl` on a project with custom frames.
- Spacing/radius/type → the token scale, never `p-[24px]`.

If the value you need has no token, that is a `/design-system --sync` item — say so in
the ticket and escalate. Do not inline the hex "just this once"; that is precisely how
the drift register fills up.

### HARD GATE — /test-strategy RED evidence (before implementation)

**Runs at Execution Flow step 12.5, before any sub-agent is dispatched to write
implementation code.**

1. Invoke `Skill(skill="test-strategy", args="{JIRA_KEY}")` to derive the test contract
   from the ticket's ACs and the ADR contract.
2. The specs are written and run **first**. Every contract row must appear as a **named
   failing test**, failing on its assertion — not on a missing import, and not because
   the config never collected the file.
3. Post the RED evidence (`npm test -- --project unit` output, failed/passed counts,
   the list of failing rows) as a JIRA comment before implementation starts.
4. GREEN is: every contract row passes and **no contract row was edited** to get there.
   `git diff --stat -- '*.test.*'` must show additions only.

A test that has never failed has never been shown to test anything. Retrofitting specs
after the implementation asserts the code rather than the requirement, and it is why
QA rework concentrated in a handful of defect families.

**Scope note:** this skill's sub-agents write unit/component/route specs beside the
source. `test-automation/` remains SDET-owned — the existing prohibition is unchanged
and `/test-strategy` does not relax it.

### Outbound handoff — /release before QA

After merge, the pipeline goes to `/release`, **not** straight to `/quality-analyst`.
`/release` proves the deploy actually carries the merge commit (served-HTML token
proof, not a 200). Without that step QA can grade the previous build while believing it
is testing the fix. See the JIRA Status Transitions table below.


References:
- `references/responsive-breakpoint-ladder.md` — **read this before writing or reviewing any responsive Tailwind class.** The `laptop:`-leak defect family (BC-155→BC-188): min-width variants leak upward, the ladder idiom, how to audit for it (grep misses the worst case), Figma-derivation traps, and why prescribed fixes are hypotheses.
- `references/parallel-worktree-isolation.md` — running two implementation agents at once via git worktrees; symlinked `node_modules`, `--project unit` inside a worktree, safe teardown, Husky single-key branch names.
- `references/figma-pixel-sampling.md` — PIL color extraction from Figma screenshots. **Last resort only.** The bridge now returns exact colours as data via `/api/node/:id/context` (`fills`, `css`, `tokens`) — sample pixels only for flattened raster content where no fill data exists.
- `references/local-ai-bridge-coordinate-crop.md` — **legacy fallback.** Coordinate cropping from full-frame screenshots (BC-72). Per-node SVG/PNG export and exact CSS now work, so use `/api/node/:id/svg` and `/api/node/:id/css` instead; crop only for raw pixels out of flattened rasters.
- `references/figma-services-preview-extraction.md` — extracting multi-section Frontend content from Local AI Bridge JSON/PNGs
- `references/figma-png-bug-direct-fix.md` — senior-dev direct fix for Figma-only PNG bug tickets that also touch backend data shape (KAN-90)
- `references/test-automation-layout.md` — actual `test-automation/` package layout for this repo (route list lives in `constants/index.ts`, not `test-constants.ts`)
- `references/route-handler-test-include.md` — add `src/app/**/route.test.ts` to `vitest.config.ts` include pattern so route-handler tests are picked up
- `references/backend-contract-from-frontend.md` — reverse-engineering backend API contracts from already-built frontends
- `references/figma-page-vs-section-scope-check.md` — deciding whether a Frontend ticket is a new page route or a section component
- `references/new-route-nav-seed-mismatch.md` — aligning nav fallbacks, DB seed, hardcoded links, tests, and redirects after creating new routes
- `references/integration-skip-figma-reanalysis.md` — skip redundant Figma analysis on Integration tickets whose Frontend sibling is Done
- `references/integration-swr-sibling-self-fetch.md` — SWR self-fetching component refactor and parent-agent recovery pattern (KAN-52)
- `references/swr-hydration-mismatch-fix.md` — page-level hydration guard for SWR client components
- `references/swr-self-fetching-component-hydration-guard.md` — component-level hydration guard when self-fetching components keep `data`/`isLoading` props (KAN-82)
- `references/swr-vitest-mock-pattern.md` — mocking SWR-backed hooks (`useAuthStatus`) in Vitest with stable mock state switches
- `references/husky-branch-commit-guard.md` — branch + commit naming enforced by Husky in this repo
- `references/jira-transition-name-variability.md` — BC project uses `In Review` and `In Testing`, not `Code Review`
- Frontend QA verification recipes live in the `qa` skill, not here — `qa/references/playwright-frontend-audit.md` and `qa/references/grading-scope-and-termination.md`. **There is deliberately no "local verification" recipe:** QA evidence comes from the deployed URL only, never `localhost` (an absolute user-stated gate). A previously-cited `qa-frontend-local-verification.md` never existed and its name contradicted that gate.
- `references/native-hermes-execution-notes.md` — how to run this /developer workflow when gateway slash commands (`/behavior`, `/custom-agent`, `Skill(...)`) are unavailable
- `references/jira-v2-fallback.md` — when Jira MCP/v3 REST is unavailable, use `/rest/api/2/` for reads and plain-text comments (worked in this session while v3 returned "Site temporarily unavailable")
- `references/resume-existing-work-detection.md` — detect a prior run's already-pushed branch/commit/MR before re-dispatching an implementation sub-agent (BC-11); includes reviewer-merge-permission fallback
- `references/subagent-runtime-failure-fallback.md` — when a dispatched sub-agent fails mid-execution due to provider/model errors (402, rate limits, model unavailable), the main agent picks up the work directly rather than re-dispatching into the same failing provider
- `references/qa-automation-architecture-compliance.md` — strict Page Object Model rules from `test-automation/INSTRUCTIONS.md`: selectors live in `locators/`, no hardcoded URLs/text, integration tests assert real API responses with Zod, no redundant `waitForSelector`
- `references/automation-branch-merge-conflicts.md` — resolving merge conflicts on long-lived `Automation/` branches against `origin/main`, including deduplicating page-object methods after main adds similar helpers
- `references/github-review-thread-graphql.md` — query and resolve GitHub PR review threads via GraphQL; mutation names are `resolveReviewThread` / `unresolveReviewThread`, not `resolvePullRequestReviewThread`
- `references/github-reviewer-merge-permission-fallback.md` — when reviewer `{{GITHUB_REVIEWER_ACCOUNT}}` approves but lacks merge permission, merge via ambient author `gh` login as a permission fallback (BC-11, BC-12, BC-18, PR #32)
- `references/qa-automation-empty-pr-recovery.md` — when the QA sub-agent cannot open an Automation PR because coverage was already merged with the implementation PR, add a minimal architecture-compliant automation-only commit to unblock Done transitions (BC-18 / BC-87)
- `references/frontend-hero-asset-extraction.md` — concrete recipe for extracting and staging Figma SVG assets via the Local AI Bridge before dispatching a Frontend Developer (BC-19): includes checklist, sequential export loop, text extraction script, and JIRA attachment gotcha
- `references/frontend-section-asset-extraction.md` — generalized class-level recipe for any [Frontend] section with Figma assets (BC-22): screenshot + scene tree + sequential SVG export + text extraction + sanity checks
- `references/subagent-false-ba-reply-recovery.md` — when a dispatched sub-agent posts a premature /ba-reply because it mistakenly believes design sources are unreachable, override and re-dispatch with concrete local file paths (BC-19)
- `references/backend-execution-plan-delivery.md` — same false /ba-reply prevention for Backend Developer tickets: attach plan to JIRA AND copy to repo root, include local path in sub-agent context (BC-20)
- `references/subagent-merge-claim-verification.md` — sub-agents sometimes falsely claim a PR merged; verify via `gh pr view` / `git log` before transitioning JIRA (BC-20)
- `references/bc21-qa-recovery-and-hero-automation-pattern.md` — QA sub-agent false terminal-block recovery, manual QA steps, and concrete POM/Zod pattern for adding Hero Section integration coverage (BC-21 / BC-90)

## 1. Main Agent: Senior Full-Stack Developer

- **Role:** Senior full-stack developer with 19+ years of experience across all tech stacks mentioned in tickets.
- **Primary Responsibility:** Analyze the requirement to the fullest based on card type/scope (frontend, backend, or integration).

### Execution Flow

1. Determine strictly which files to create, reuse, or modify.
2. Clearly mention what needs to be done.
3. Generate instructions and attach them as a `.txt` document in a comment to the Jira story.
4. **Crucial Backend Rule:** If the ticket scope is backend, strictly generate and attach a `backend-execution-plan.txt` file in the comment detailing the backend execution plan. **This is a distinct artifact from `backend-structure-source.txt`** (the BA workflow's user-supplied requirements source of truth, already attached to the ticket by the BA agent) — do NOT reuse that filename. `backend-structure-source.txt` = what to build (requirements); `backend-execution-plan.txt` = how to build it (this agent's execution plan). The Backend Developer sub-agent must read BOTH.
5. Ensure every comment has a heading specifying who is instructing whom (e.g., "Senior Developer instructing Backend Developer").
6. Transition the Jira ticket to "In Progress" (`mcp_jira_jira_transition_issue` with transition_name "In Progress") and **assign to Developer** (`mcp_jira_jira_update_issue(issue_key={KEY}, assignee_id="{{JIRA_DEV_ACCOUNT_ID}}")`). Every transition MUST update the assignee — see JIRA Status Transitions table below.
7. **MR Access Verification (HARD GATE):** verify the ambient `gh` CLI (`gh auth status && gh repo view --json viewerPermission`) for push access; sub-agents ultimately use the same CLI.
8. **Load the canonical Local AI Bridge skill first.** Before any Figma extraction, call `skill_view('local-ai-bridge')` and follow **all** instructions in that skill for server startup, health checks, endpoint usage, and sequential SVG fetching. The inline notes below are a summary; the loaded skill is the source of truth.
9. **Figma JSON Spec Analysis (HARD GATE for Frontend scope — MUST happen before writing `instructions.txt`):** download all `figma-spec-{RESOLUTION}-{section-slug}.json` attachments and build a per-resolution mapping table. Include the table verbatim in `instructions.txt`.

   Where JSON is missing, pull the spec from the bridge as **data**, not pixels:
   ```bash
   curl -s "http://localhost:47291/api/node/{NODE_ID}/css?format=text" > /tmp/{slug}.css
   curl -s "http://localhost:47291/api/node/{NODE_ID}/context"         > /tmp/{slug}-context.json
   curl -s "http://localhost:47291/api/variables?format=css"           > /tmp/design-tokens.css
   ```
   `context` carries `layout` (→ flexbox: gap, padding, alignment), `sizing` (FIXED/HUG/FILL), fills/strokes/effects, full type metrics, `tokens`/`styles` names, and `component.mainComponent`. Paste the real values into `instructions.txt` so the sub-agent never guesses.

   **PIL pixel sampling is a last resort**, only for flattened raster content with no fill data. It is never a substitute for `/context` or `/css`.
10. **PIL Pixel Sampling (HARD GATE for Frontend scope):** sample screenshots for design theme fallback where JSON doesn't cover.
11. **Image URL Validation (HARD GATE for Frontend scope):** `curl` all mock image URLs and flag 404s.
12. **Compact before dispatch:** Keep the `goal` and `context` concise. In native Hermes there is no `Bash(command="compact")` command; do not attempt to run it. See `references/native-hermes-execution-notes.md` for native-Hermes adaptations of `/behavior`, `/custom-agent`, and `Skill(...)` handoffs.
13. Trigger the appropriate sub-agent based on the analyzed scope.
14. **After sub-agent completes DOD and raises MR:** run `git diff --stat`, `npx eslint`, `npx tsc --noEmit` yourself. **Then run the Merge Verification Hard Gate (see subsection above) before transitioning JIRA.** Keep context concise, transition to review, and hand off to code review via `delegate_task` carrying the `pr-review-and-merge` skill content. In native Hermes, use `delegate_task` for the review handoff; do not execute the review workflow yourself unless the runtime lacks the required tools.
15. **Review-comment fixes must be checked against the repo's INSTRUCTIONS.md:** Before resolving a GitHub review comment or declaring a fix complete, re-read the project-level `INSTRUCTIONS.md` (e.g. `test-automation/INSTRUCTIONS.md`) and verify the diff still obeys its non-negotiable rules. Common misses: inline selector construction in page files, magic strings/numbers/URLs, hardcoded schema validation labels, or API query strings that should live in `constants/`. Fix architecture violations before resolving the thread. When the user says a fix "goes against INSTRUCTIONS.md", stop, re-read the rule, and refactor the diff into constants/locators before replying or resolving. Do not satisfy the review comment text at the expense of the project-level architecture rules.

### Responsive Breakpoint Ladder Hard Gate (Frontend scope)

Before writing `instructions.txt` for any ticket that touches responsive layout, spacing,
or typography, do this — it is the highest-yield check in this skill. **Eight tickets and a
70-utility audit on `{{PROJECT_NAME}}` were all the same defect.** Full detail and the
audit method: `references/responsive-breakpoint-ladder.md`.

1. **Enumerate the design's frames.** Parse the Local AI Bridge snapshot and list every
   top-level frame width. That list is the complete set of widths anything may be graded
   against. For `{{PROJECT_NAME}}` it is exactly **390 / 1440 / 1920**.
2. **Map each frame to its Tailwind prefix** from the repo's `@theme inline` block — do not
   assume. In `{{PROJECT_NAME}}`: base=390, `laptop:`=`90rem`=1440, `desktop:`=`120rem`=1920,
   while `md:`(768) and `lg:`(1024) have **no frame at all**.
3. **Write the brief as a per-property ladder**, one row per property, one column per frame,
   and cite the **node ID and frame width for every single value**. A value without its
   node and frame is not usable by the sub-agent — and it is how I shipped a wrong ticket
   that compared a 1920 implementation against the laptop frame.
4. **Flag the two leak directions explicitly in the brief:**
   - a `laptop:` utility with no `desktop:` counterpart renders 1440's value at 1920;
   - a 1440/1920 value bound to `md:`/`lg:` renders it from 768 up, across a band the
     design never specifies. (`md:-ml-[260px]` occluded a hero image 100% from 768–1439.)
5. **State what must NOT change**, by class string. Every ladder fix risks disturbing a
   neighbouring tier, and sub-agents have regressed 1920 while fixing 1440.
6. **Tell the sub-agent the brief is a hypothesis.** Instruct it to verify each prescribed
   selector against compiled CSS, to re-measure the *siblings* of any flex/width change,
   and to deviate with evidence — a before/after table across widths, including the widths
   that must not move — rather than implementing a prescription it can prove wrong.

### Scope Determination

Check the ticket title keywords (set by the BA workflow):
- `[Frontend]` → dispatch Frontend Developer (Sub-Agent 1)
- `[Backend]` → dispatch Backend Developer (Sub-Agent 2)
- `[Integration]` → dispatch Integration Developer (Sub-Agent 3)

If the title is ambiguous, read the ticket description and labels to determine scope. If still unclear, ask the user.

### HARD DELEGATION RULE

**The main agent is forbidden from executing work assigned to a sub-agent.**

- If `delegate_task` is available, Frontend Developer, Backend Developer, and Integration Developer tasks MUST be dispatched via `delegate_task`. It is a workflow violation for the main agent to implement the feature directly because the ticket is small, familiar, or "just a quick fix."
- The main agent's job is: ticket analysis, plan attachment, status/assignee transitions, sub-agent dispatch, verification of the sub-agent's output (eslint/tsc/build), and handoff to code review/QA. It must not write component code, route handlers, integration wiring, or tests that are the sub-agent's responsibility.
- If a sub-agent fails or returns incomplete work, the main agent must re-dispatch with tighter instructions or escalate to the user. It must not "finish the last few files" itself.
- The only exception is when the runtime literally lacks `delegate_task` or the required behavior/custom-agent infrastructure. In that case, document the manual fallback in a JIRA comment and proceed, but never silently.

### Direct-Fix Shortcut (Deprecated)

The previous "Direct-Fix Shortcut" allowing the main agent to skip the sub-agent pipeline for small tickets is **removed**. All implementation work must go through the appropriate sub-agent. The main agent may still perform verification, run tooling, and handle transitions, but it may not write implementation code.

If a previous run or prompt references the Direct-Fix Shortcut, ignore it and dispatch a sub-agent.

### Resume Detection: Prior-Run Work Already Exists (Main Agent)

**Before** dispatching an implementation sub-agent, check whether a prior run already completed the work. Fresh `/developer <KEY>` invocations often land on tickets that are already In Progress with an attached plan, a pushed branch, and a commit/open MR from an earlier (possibly interrupted) session.

1. Check comments/attachments: execution-plan comment + attached `instructions.txt`/`backend-execution-plan-*.txt` already present means analysis was done and a sub-agent was dispatched.
2. Check the branch: `cd {repo} && git branch -a --list '*{JIRA_KEY}*'` and `git status -sb`.
3. Check the commits: `git log origin/main..{branch} --oneline`.
4. Check for an existing MR: `gh pr list --head {branch} --state all --json number,url,state`.

If a compliant branch + commit + open MR already exist, **do NOT re-dispatch the implementation sub-agent.** Re-running it wastes tokens and risks duplicate or force-pushed work. Instead, the main agent performs its explicitly allowed duties: verification (`git diff main...HEAD --stat`, `npx tsc --noEmit`, `npx eslint` on changed files, `npx vitest run` on changed tests), then transition to In Review (assign Reviewer), then hand off to review. This is NOT the deprecated Direct-Fix Shortcut: the sub-agent still did the implementation in the prior run; the main agent is only verifying and moving status. See `references/resume-existing-work-detection.md` for the BC-11 session recipe and the reviewer-merge-permission fallback.

### Merge Verification Hard Gate

Sub-agents (including `pr-review-and-merge`) sometimes self-report a successful merge and return a plausible-looking SHA when the PR is actually still open. Treat every "PR merged" claim as untrusted until the main agent verifies it with live GitHub state.

**Mandatory before transitioning a parent ticket to `In Testing`:**

1. Run `gh pr view <PR_NUMBER> --json state,mergeCommit,mergedAt,mergedBy` and confirm `state` is `MERGED`.
2. Run `git checkout main && git pull origin main && git log --oneline -5` and confirm the merge commit appears in `main`.
3. If either check fails, the PR is NOT merged. Fetch the branch, re-run verification, approve via `GITHUB_REVIEWER_TOKEN` (`{{GITHUB_REVIEWER_ACCOUNT}}`), and merge via the ambient author `gh` login if the reviewer lacks merge permission.
4. Only after both checks pass may you transition the parent ticket to `In Testing` and dispatch QA.

See `references/subagent-merge-claim-verification.md` for full detection/recovery recipe and the BC-20 / PR #34 example.

### Main Agent Comment Template

```
{Heading: "Senior Developer instructing {Frontend/Backend/Integration} Developer"}

Based on the ticket {JIRA_KEY}, here is the execution plan:

{detailed instructions}

{Attach instructions.txt}

— Senior Developer
```

### Attaching Files to JIRA Comments

1. Write the file locally to `/tmp/{filename}.txt`
2. Use `mcp__jira__jira_add_attachment` with base64-encoded content when available.
3. **Verify the attachment size in the tool response.** If the returned `size` is unexpectedly tiny (e.g. 9 bytes for a 245 KB PNG), the MCP base64 payload was truncated. In that case, use the Jira REST v2 multipart upload recipe below and pass the actual file path.
4. Add a comment referencing the attachment.

### Jira MCP fallback via direct REST API

If the `mcp__jira__jira_*` tools return `Unknown tool` or otherwise fail, use the Jira REST API directly with credentials from `~/.env` or environment variables.

**Prefer `/rest/api/2/` for reads and plain-text comments.** `/rest/api/3/` returns Atlassian Document Format (ADF) descriptions and has sometimes returned `Site temporarily unavailable` while `/rest/api/2/` succeeded for the same ticket. For most programmatic parsing, v2 is simpler and more reliable.

```bash
# Read the ticket (v2 — plain text description)
JIRA_EMAIL="{{JIRA_EMAIL}}"
JIRA_API_KEY="..."
curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" \
  -H 'Accept: application/json' \
  'https://{{ATLASSIAN_SITE}}/rest/api/2/issue/{KEY}?fields=summary,description,status,labels,attachment,issuelinks,assignee,reporter,priority'

# Add a plain-text comment (v2)
curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  'https://{{ATLASSIAN_SITE}}/rest/api/2/issue/{KEY}/comment' \
  -d '{"body":"Senior Developer instructing Frontend Developer: see attached execution plan."}'

# List transitions (v2)
curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" \
  -H 'Accept: application/json' \
  'https://{{ATLASSIAN_SITE}}/rest/api/2/issue/{KEY}/transitions'

# Transition (use the numeric id from the v2 transitions response)
curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  'https://{{ATLASSIAN_SITE}}/rest/api/2/issue/{KEY}/transitions' \
  -d '{"transition":{"id":"21"}}'

# Assign
curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" \
  -H 'Content-Type: application/json' \
  -X PUT \
  'https://{{ATLASSIAN_SITE}}/rest/api/2/issue/{KEY}/assignee' \
  -d '{"accountId":"{{JIRA_DEV_ACCOUNT_ID}}"}'

# Upload attachment (multipart/form-data, no JSON Content-Type)
curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" \
  -H 'X-Atlassian-Token: no-check' \
  -X POST \
  'https://{{ATLASSIAN_SITE}}/rest/api/2/issue/{KEY}/attachments' \
  -F 'file=@/tmp/{filename}'
```

Notes:
- Do not source `~/.env` inside a `curl` pipeline on this host — the consent guard blocks it. Read the values into variables first, then pass them explicitly.
- Transitions use integer `id` (e.g. `21` for In Progress), not the status name.
- For the `BC` project, the observed transition IDs are: `21` = In Progress, `31` = In Review, `41` = Done, `2` = In Testing. Prefer listing transitions fresh for unknown projects, but cache these for BC.
- ADF comments (v3) can fail with `Comment body is not valid!` when the JSON shape is slightly off. v2 plain-string comments avoid this entirely.

### Auto-Mode Execution

When the user explicitly says "go on auto mode until this completes to DONE STATE" (or similar), do not pause for confirmation after each sub-step. Run the full pipeline in one pass:

1. Analyze ticket → attach plan → transition In Progress.
2. Implement (dispatch sub-agent and wait; no direct-fix shortcut).
3. Verify: `npx tsc --noEmit`, `npm run test`, `npm run build`, `npx eslint` on changed files.
4. Branch, commit, push, open MR.
5. Transition parent ticket to "In Review" (assign Reviewer).
6. **Invoke `Skill(skill="pr-review-and-merge", args="{MR_URL}")`** to run review, resolve comments, and merge. In native Hermes, use `delegate_task` carrying the `pr-review-and-merge` skill content as the default path. Manual execution is only allowed when `delegate_task` is unavailable and must be documented in a JIRA comment. Before approving/merging, check for merge conflicts with `origin/main` and resolve them (see `references/automation-branch-merge-conflicts.md`). **After the sub-agent reports a merge, verify with `gh pr view <n> --json state,mergeCommit` and `git log main` before transitioning to In Testing; see `references/subagent-merge-claim-verification.md`.**
7. After merge, transition parent ticket to "In Testing" (assign Developer) and invoke `Skill(skill="quality-analyst", args="{JIRA_KEY}")`. In native Hermes, use `delegate_task` carrying the `quality-analyst` skill content as the default path. Manual execution is only allowed when `delegate_task` is unavailable and must be documented in a JIRA comment.
8. QA pass + automation SDET PR merged/approved → transition parent + QA subtask to Done.

Only stop auto-mode if verification fails and cannot be repaired in one attempt, or if the user sends a new message.

### When the QA sub-agent cannot open an Automation PR

In some cases the integration code's Playwright coverage is already merged with the implementation PR (because the Integration Developer sub-agent also modified `test-automation/`, despite the `test-automation/` access prohibition). The QA sub-agent then creates branch `Automation/<QA_SUBTASK_KEY>/<component>` but `gh pr create` fails with "No commits between main and ..." because there are no new commits to PR. **Do not leave the parent ticket blocked at In Testing.**

**Recovery pattern (parent agent):**
1. Check out `main`, pull latest.
2. Inspect `test-automation/specs/` for what's missing relative to the ACs (e.g., no API contract tests for additional FAQ pages).
3. Add the missing automation-only commit directly to the existing `Automation/<QA_SUBTASK_KEY>/<component>` branch — this is a legitimate **automation-SDET** commit, not implementation code. Keep it minimal and architecture-compliant.
4. Verify locally: `npx tsc --noEmit` in root and `test-automation/`, run the new automation tests against a local server.
5. Push the branch and open the Automation PR with reviewer `{{GITHUB_REVIEWER_ACCOUNT}}`.
6. Approve via `GITHUB_REVIEWER_TOKEN` and merge via author `gh` login if reviewer lacks merge permission.
7. Then transition the QA subtask and parent ticket to Done.

See session BC-18 / BC-87 for the concrete example: added `test-automation/specs/api-test/faq-api-contract.spec.ts` and registered an `api-test` project in `playwright.config.ts` so the Automation PR had a real diff to merge.

### Parallel Helper: @mainDevAgentVision

Spawn a background PTY Hermes session with a vision model (`llama3.2-vision`) when the main agent's text-only model cannot resolve a specific visual question from the JSON/PIL data. See full subsection in SKILL.md v1.7.0 or `references/figma-screenshot-vision-analysis.md`.

## 2. Sub-Agent 1: Frontend Developer

- **Role:** Frontend Developer with 5+ years of experience, works under the senior dev.
- **Trigger Condition:** Main agent determines ticket scope is frontend.
- **Input Context:** Story contains all Figma node links for specific components/sections, specified ACs, business rules, and clear instructions from the main agent.
- **Initial Action:** Go through each provided instruction, document, and image.

### ⛔ test-automation/ ACCESS PROHIBITION — FRONTEND DEVELOPER

**You are NOT an Automation SDET. You do NOT have permission to read, write, modify, or delete any file inside `test-automation/`.**

- Any `git add`, `git diff`, or file write targeting `test-automation/**` is a workflow violation.
- If your commit accidentally stages a file in `test-automation/`, remove it with `git restore --staged test-automation/` before committing.
- The `test-automation/` codebase is exclusively owned by the Automation SDET sub-agent, which is dispatched only by the QA skill after a clean manual Integration QA pass.
- This prohibition applies even if the ticket's DOD or the main agent's instructions reference `test-automation/` — defer that work to the SDET. Never touch it yourself.

### Scenario 1: Missing Information / Halt State

Drop a JIRA comment mentioning the BA manager and end with `/ba-reply kindly look into this comment and reply with the needed details`.

### Scenario 2: Clear Requirements / Development State

Develop the story toward completion/DOD. Use RAG, Harness Engineering, and Loop Genetic Engineering.

### Branch Creation (Before Starting Development)

Use the repo's enforced template:
- **Husky-guarded convention:** `Fix/<JIRA_KEY>/<Component_name>` or `Automation/<JIRA_KEY>/<Component_name>` (see `references/husky-branch-commit-guard.md`).
- **Legacy convention:** `<JIRA_KEY>-<PAGE>-<SECTION>-<SCOPE>` — only if Husky guards are absent.
- **Branch from a clean main (HARD GATE):** before creating any branch, run `git fetch origin && git diff origin/main --stat`. The local main must be up-to-date with remote and have no uncommitted changes. Starting from a stale or dirty main causes merge conflicts and partial diffs downstream. Fix: `git checkout main && git pull origin main` before `git checkout -b`.
- **Asset origin verification (HARD GATE):** every asset (SVG, PNG, font) used in the implementation must be traced back to the specific Figma node cited in the ticket. Using an asset from a sibling page or component (e.g., the home-hero abstract design on the careers page) counts as a regression. Before committing, confirm the filename maps to the correct Figma node ID mentioned in the ticket ACs.
- **z-index stacking rule:** when a section has a decorative absolute-positioned background element (SVG, illustration) and a foreground image or content card, always set `z-0` (or lower) on the decorative element and `relative z-10` on every foreground wrapper. Omitting this leaves the background painted on top. Confirm stacking in the component before raising an MR.

### Commit Message Template (STRICT)

All commits must follow: `<JIRA_KEY> <SUMMARIZED_MSG>`
- Example: `BC-64 initial project setup`
- Single line, JIRA key first, space, then lowercase summarized message
- No period at end
- JIRA key must match the branch key

### MR Creation Steps

1.  **Stage all files including binary assets:** run `git status` and for every `public/assets/` file that is untracked, run `git ls-files --error-unmatch <path>` — if it errors the file was never committed. Stage it explicitly: `git add public/assets/<path>`. Then `git commit -m "<JIRA_KEY> <SUMMARIZED_MSG>"`. Missing binary assets on a remote deployment is a P1 defect (blank images, broken illustrations).
2. `git push -u origin <compliant-branch-name>`
3. `gh pr create --title "[{JIRA_KEY}] {summary}" --body "Closes {JIRA_KEY}" --base main --reviewer {{GITHUB_REVIEWER_ACCOUNT}}`  
   **Use `--body-file` if the body contains backticks** to avoid bash command substitution. Write the body to `/tmp/pr-{JIRA_KEY}-body.md` and pass `--body-file /tmp/pr-{JIRA_KEY}-body.md`.
4. If reviewer not collaborator, add them first: `gh api repos/{owner}/{repo}/collaborators/{{GITHUB_REVIEWER_ACCOUNT}} -X PUT -f permission=push`
5. Capture MR URL; do NOT merge.

**Git identity check:** before committing, verify the repo has `user.name` and `user.email` set. If not, set them to the user's identity to avoid commits authored as `username@hostname`. If a wrong-identity commit is pushed, amend with `git commit --amend --reset-author --no-edit` and force-with-lease push.

### Dispatch via delegate_task

**Compact first:** keep the `goal` and `context` concise, then dispatch with goal/context containing the full instructions, Figma JSON mapping, DESIGN THEME, ACs, and DOD checklist. Toolsets: `terminal`, `file`.

In native Hermes, `/behavior` and `/custom-agent` slash commands are unavailable; `delegate_task` is the equivalent dispatch mechanism.

## 3. Sub-Agent 2: Backend Developer

- **Role:** Backend Developer with 5+ years of experience.
- **Trigger Condition:** Main agent determines ticket scope is backend.
- **Input Context:** `backend-structure-source.txt` (BA requirements) + `backend-execution-plan.txt` (this agent's plan).
- Follow the same RAG/Harness/Loop pattern, halt on missing info, and raise MR.

### ⛔ test-automation/ ACCESS PROHIBITION — BACKEND DEVELOPER

**You are NOT an Automation SDET. You do NOT have permission to read, write, modify, or delete any file inside `test-automation/`.**

- Any `git add`, `git diff`, or file write targeting `test-automation/**` is a workflow violation.
- If your commit accidentally stages a file in `test-automation/`, remove it with `git restore --staged test-automation/` before committing.
- The `test-automation/` codebase is exclusively owned by the Automation SDET sub-agent. Never touch it yourself.

## 4. Sub-Agent 3: Mid Full-Stack Developer (Integration Agent)

- **Role:** Integration specialist.
- **Trigger Condition:** Integration scope, AND both linked Frontend and Backend tickets are **Done**.
- Never dispatch while either dependency is short of Done.
- Wire frontend to backend API, handle loading/error/empty states, and hydration guards. Do **not** touch `test-automation/` — that is the Automation SDET's exclusive domain.

### ⛔ test-automation/ ACCESS PROHIBITION — INTEGRATION DEVELOPER

**You are NOT an Automation SDET. You do NOT have permission to read, write, modify, or delete any file inside `test-automation/`.**

- Any `git add`, `git diff`, or file write targeting `test-automation/**` is a workflow violation.
- If your commit accidentally stages a file in `test-automation/`, remove it with `git restore --staged test-automation/` before committing.
- Automation test coverage for the integration wiring you build is added by the Automation SDET after QA manually validates your work. That is a separate, later step — not your responsibility.
- Never touch `test-automation/` yourself, even if the main agent's instructions say to add automation coverage.

## 5. Definition of Done (DOD) — Global

1. Works as per functionality expected, covering all rules and ACs.
2. Unit/E2E test cases cover all possible scenarios.
3. None of the other sections/components/endpoints are broken.
4. All screenshots, logs, or network traces have been attached.
5. All open queries resolved/answered.
6. All mock image URLs return HTTP 200 (Frontend/Integration).
7. Component visual design matches the Design Theme.
8. Every value at every breakpoint is traceable to that exact resolution's `figma-spec-*.json`.
9. New page/route noted in the MR description so the Automation SDET can register it in `test-automation/constants/index.ts` — developer sub-agents must NOT touch `test-automation/` directly.
10. `npx eslint` run on all changed files passes.
11. **Any PR that changes a class string or copy also updates the affected `*.test.tsx` in the same commit.** The Netlify workflow runs `vitest` *before* deploying, so one stale assertion blocks the deploy silently — seven consecutive merges once landed on a red pipeline this way and the live site sat seven merges behind while tickets were marked merged.
12. **Responsive ladders complete** — every property touched has a value for each Figma frame it differs at and no invented intermediate tiers; no `laptop:` without a `desktop:` counterpart (or a comment saying why); resolved values measured in a real browser at every frame width. See `references/responsive-breakpoint-ladder.md`.
13. **Removals verified absent, not merely overridden** — `grep -c '<removed-class>'` returns 0 across `src/`. A fix that layers an override while leaving the offender in place is a different fix with different behaviour.
14. **Both render branches fixed.** Components here render a skeleton branch and a loaded branch that reuse the same `data-testid`; a class fix applied to one leaves first paint defective. `grep -c` for the new class should return 2, not 1.
15. **RED evidence recorded before implementation.** The `/test-strategy` contract exists on the ticket, every row failed on its assertion first, and no contract row was edited to reach GREEN (`git diff --stat -- '*.test.*'` shows additions only).
16. **No raw design values in components.** `grep -rnE '#[0-9a-fA-F]{6}' src/ --include=*.tsx` returns 0 outside the token layer, and no default `sm/md/lg/xl/2xl` variant is used on a project with custom Figma frames.
17. **Frozen contracts unchanged.** If the epic has an Accepted ADR, no type, route, or error shape it names was altered by this PR.
18. **`/security-review` returns PASS or PASS WITH NOTES** on the PR before the merge decision. A BLOCK verdict sends the ticket back to In Progress.


## 6. Resume Commands

- `/frontend-dev-resume <JIRA_KEY>` or `<MR_URL>`
- `/backend-dev-resume <JIRA_KEY>` or `<MR_URL>`
- `/integration-dev-resume <JIRA_KEY>` or `<MR_URL>`

Disambiguation: URL pattern → fix code-review findings; JIRA key → resume after BA reply.

## 7. JIRA Status Transitions

**Canonical source of truth:** This table is duplicated in `mr-code-review` and `quality-analyst`. Update here first.

| Action | Transition Name | Assignee | Tool |
|--------|----------------|----------|------|
| Main agent starts work | "In Progress" | Developer (`{{JIRA_DEV_ACCOUNT_ID}}`) | transition + update |
| Sub-agent completes DOD + raises MR | "In Review" / "Code Review" | Reviewer (`{{JIRA_REVIEWER_ACCOUNT_ID}}`) | transition + update |
| Code review APPROVE (pre-merge) | — | — | `Skill(skill="security-review", args="{PR_NUMBER}")` must return PASS before merge |
| Merged | "In Testing" | Developer (`{{JIRA_DEV_ACCOUNT_ID}}`) | transition + update + `Skill(skill="release-engineer", args="{JIRA_KEY}")` |
| Deploy verified carries commit | "In Testing" (unchanged) | Developer | `Skill(skill="quality-analyst", args="{JIRA_KEY}")` |
| QA pass → post-deploy soak | "Done" | Reviewer (`{{JIRA_REVIEWER_ACCOUNT_ID}}`) | transition + update + `Skill(skill="sre-watch", args="{JIRA_KEY}")` + `Skill(skill="tech-writer", args="{JIRA_KEY}")` |
| QA pass | "Done" | Reviewer (`{{JIRA_REVIEWER_ACCOUNT_ID}}`) | transition + update |
| Code review re-review fails | "In Progress" (back) | Developer | transition + update + escalate |

**Transition-name variability:** JIRA projects may use different names for the same logical state. For the BC project, the review state is `In Review` (not `Code Review`) and QA handoff state is `In Testing`. If a transition call fails with "Transition 'X' not available", use the exact available name from the error. See `references/jira-transition-name-variability.md`.

**Never mark Done before QA.** Even if the workflow allows moving from "In Review" directly to "Done", hand off to QA via `In Testing` first. The user explicitly corrected a premature Done transition in this session.

**Hard rule for auto-mode:** Even when the user says "go on auto mode until this completes to DONE STATE", the pipeline must still move the parent ticket to `In Testing` and invoke `Skill(skill="quality-analyst", args="{JIRA_KEY}")` before transitioning to `Done`. Auto-mode does not mean skip QA; it means run every step without pausing for confirmation. It also does **not** override the Automation SDET rule: after a clean manual Integration QA pass, automation tests must be branched, PR'd, and merged (or approved) before the parent can be marked Done.

## 8. QA Subtask Convention

For this JIRA project, the Story issue type does not accept child issues. Create QA subtasks as `Task` with a `Relates` issue link to the parent, named `QA Testing for {JIRA_KEY}`. Do not create duplicate QA subtasks; reuse existing ones when re-testing.

## 9. Escalation Protocol

When a single round of re-review/re-test fails, post a JIRA comment listing remaining issues and @-mention the reporter/watcher. If no immediate channel exists, say so in final output.

## 10. Remember

Main agent verifies MR access → analyzes ticket → attaches plan → transitions to In Progress → **`Skill(test-strategy)` RED evidence** → dispatches sub-agent → sub-agent builds to DOD (GREEN, contract rows unedited) → main agent runs eslint/tsc/build → transitions to In Review → `Skill(pr-review-and-merge)` → **`Skill(security-review)` PASS** → merge → `In Testing` → **`Skill(release-engineer)` deploy proven** → `Skill(quality-analyst)` → QA pass → Done → **`Skill(sre-watch)` soak** + **`Skill(tech-writer)` docs**.

Never push directly to main; always branch, PR, approve, merge.
DOD includes tests, no breakages, evidence, and eslint on changed files.
Responsive work: enumerate the design's frames first; only those widths can be graded; never leave a `laptop:` without a `desktop:`; never bind a 1440/1920 value to `md:`/`lg:`. `references/responsive-breakpoint-ladder.md`.
HARD DELEGATION: main agent never writes implementation code assigned to Frontend/Backend/Integration Developer.
RED before GREEN: no implementation starts until the /test-strategy contract has failed for the right reason.
Tokens, not values: named colour tokens and named breakpoints (laptop:/desktop:) — a raw hex in a component is a known defect.
After merge the next hop is /release, NOT /quality-analyst — QA must never grade an unproven deploy.
⛔ TEST-AUTOMATION ACCESS: Frontend Developer, Backend Developer, and Integration Developer sub-agents have ZERO permission to touch `test-automation/`. Only the Automation SDET (dispatched by the QA skill) may read or write files inside `test-automation/`. Any developer sub-agent commit that includes a `test-automation/` file must be rejected and the file unstaged before pushing.
See `references/bc6-never-skip-in-testing.md` for the concrete failure mode where an Integration ticket was marked Done before `In Testing` and before the Automation SDET branch/PR was created.
