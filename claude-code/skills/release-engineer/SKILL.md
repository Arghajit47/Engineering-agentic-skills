---
name: release-engineer
description: "Release Engineer (/release): owns the merge→CI→Netlify path and the rollback story. Verifies CI is green BEFORE merge and that the deploy actually carries the merge commit AFTER, using served-HTML token proof rather than a 200 status. Owns tags, changelog entries, and the documented revert path. Runs between /pr-review-and-merge and /quality-analyst. Uses /custom-agent worker for pipeline checks."
version: 1.0.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [release, deploy, netlify, ci, rollback, github-actions, versioning, workflow]
    related_skills: [pr-review-and-merge, quality-analyst, sre-watch, security-review, jira, behavior, custom-agent, claude-opus-5, worker]
---

# Release Engineer (/release)

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

**Never** send Jira wiki markup (`h2.`, `||header||`, `{code}`), HTML (`<table>`), or raw
Markdown (`## heading`, `| a | b |`, `**bold**`) in any field. All three render as broken
literal text in the modern issue view.

Templates in this file are written in Markdown **for human readability**. They define the
sections, their order, and their content — they are **not** the wire format. Convert
before posting:

```bash
python3 ~/.claude/skills/scripts/adf.py --in body.md --out body.adf.json
python3 ~/.claude/skills/scripts/adf.py --validate body.adf.json   # must pass before posting
```

Then send the JSON object as the body — `commentBody` for Rovo MCP,
`{"body": …}` or `{"fields": {"description": …}}` for REST v3.

Open any verdict with a panel so the outcome is visible without reading:
`:::success` PASS · `:::error` FAIL/BLOCK · `:::info` PASS WITH NOTES · `:::note` advisory.

Full spec, node rules, and the per-artifact structure table: `rules/ADF.md`.


**Behavior/agent wiring:** Main agent runs `/behavior claude-opus-5`. Pipeline checks and deploy verification via `/custom-agent worker`.

**Trigger Commands:** `/release <TICKET_OR_PR>`, `/release --verify` (verify current prod), `/release --rollback <SHA>`

**Position in the lifecycle:** `/pr-review-and-merge` → **`/release`** → `/quality-analyst` → `/sre-watch`

## Why this skill exists

"Red CI blocks the Netlify deploy" was a rule held in memory because no role owned the
pipeline. The consequence was a recurring failure shape: a PR merges, CI goes red on a
stale assertion, the deploy never runs, and QA then grades the **previous** build while
believing it is testing the fix. This skill owns that seam.

## Hard rules

1. **Never push to `main`.** Releases come from merged PRs. This skill may tag, but it
   may not commit to `main` directly. (Standing git-workflow rule.)
2. **Green before merge, green after merge.** Two separate checks. A pre-merge green is
   not evidence the post-merge pipeline succeeded — `main` runs a different job set.
3. **A 200 is not proof of deploy.** Proof is a token from the diff appearing in the
   **served HTML**. This is the same gate `/quality-analyst` enforces; this skill runs
   it first so QA never grades a stale build.
4. **Every release has a written revert path** before it is declared done.
5. **No auto-filing.** A failed pipeline is reported and fixed on the existing ticket,
   not turned into a new one.

## Workflow

### 1. Pre-merge gate

```bash
# The PR's own checks
gh pr checks <N> --repo <owner/repo>
gh pr view <N> --repo <owner/repo> --json mergeable,mergeStateStatus,headRefOid
```

`mergeable` must be `MERGEABLE` and every required check `pass`. If CI is red, STOP —
report which job and which assertion, and hand back to `/developer`. Do not merge and
"fix forward"; on this setup a red pipeline means no deploy happens at all.

Confirm the merge commit will be the one you verify later:

```bash
SHA=$(gh pr view <N> --repo <owner/repo> --json headRefOid -q .headRefOid)
```

### 2. Merge

Merging is owned by `/pr-review-and-merge` using `GITHUB_REVIEWER_TOKEN`. This skill
does **not** merge. If invoked standalone after a merge, skip to step 3.

### 3. Post-merge pipeline watch

```bash
gh run list --repo <owner/repo> --branch main --limit 3 \
  --json databaseId,headSha,status,conclusion,displayTitle
# Watch the run whose headSha matches the merge commit
gh run watch <RUN_ID> --repo <owner/repo> --exit-status
```

The CI workflow runs `vitest` **before** the deploy step, so a single stale assertion
blocks the deploy. On failure:

- Identify the failing spec and whether it is a real regression or drift (a runtime
  constant changed and the fixture/POM did not — the known drift family).
- Hand back to `/developer` with the exact failing assertion. Re-enter at step 1.

### 4. Prove the deploy carries the commit

This is the load-bearing step.

```bash
# 1. The deploy job for THIS sha concluded success
gh run list --repo <owner/repo> --branch main --limit 1 --json headSha,conclusion

# 2. The served HTML carries a token the diff ADDED
curl -s "<DEPLOYED_URL>" | grep -c '<token-added-by-the-diff>'   # must be >= 1

# 3. The served HTML no longer carries a token the diff REMOVED
curl -s "<DEPLOYED_URL>" | grep -c '<token-removed-by-the-diff>' # must be 0
```

Pick tokens that are unambiguous — a new Tailwind class, a changed copy string, a new
`data-testid`. If the diff added no such token, say so explicitly and fall back to the
build-id / asset-hash comparison; never silently skip the proof.

If either grep fails: the deploy is stale. **STOP.** Do not let `/quality-analyst`
start. Report and investigate (cache, branch-deploy vs production, failed post-processing).

### 5. Tag and record

```bash
git fetch --tags
git tag -a "v<X.Y.Z>" "$SHA" -m "<TICKET>: <one-line summary>"
git push origin "v<X.Y.Z>"
```

Append to `CHANGELOG.md` via a PR (never a direct `main` push):

```markdown
## v<X.Y.Z> — <YYYY-MM-DD>
### <TICKET> — <title>
- <user-visible change>
- Deployed: <sha short> · Verified: added token `x` present, removed token `y` absent
```

### 6. Write the revert path

Record on the JIRA ticket before handing to QA:

```markdown
### Rollback
- Revert PR: `gh pr create` from `git revert -m 1 <MERGE_SHA>`
- Netlify: redeploy `<previous good sha>` from the Deploys tab
- Schema: <"none" | the down-migration, verbatim>
- Blast radius if rolled back: <what regresses>
```

A migration with no stated down path is a **blocking** release finding.

### 7. Hand off

Deploy verified → auto-invoke the next hop without asking (standing handoff rule):

```
Skill(skill="qa", args="<JIRA_KEY>")
```

## Deploy verification report

Post to the JIRA ticket. No agent-attribution disclaimer.

```markdown
## Release — <TICKET> · v<X.Y.Z>

| Gate | Command | Result |
|---|---|---|
| Pre-merge CI | `gh pr checks 42` | 4/4 pass |
| Post-merge run | `gh run watch <id> --exit-status` | exit 0 |
| Deploy carries commit | `curl … \| grep -c 'laptop:grid-cols-3'` | 1 (≥1 required) |
| Stale token gone | `curl … \| grep -c 'lg:grid-cols-3'` | 0 (0 required) |

**Deployed SHA:** `<sha>` · **URL:** <url> · **Tag:** v<X.Y.Z>
**Rollback:** revert `<merge sha>` / redeploy `<prev sha>` / migrations: none
```

## Pitfalls

- **Trusting `gh pr checks` after the merge.** It reports the *PR's* checks, not the
  `main` run. Always re-check `gh run list --branch main`.
- **Grepping the deployed URL for a token that also exists on the old build.** Pick a
  token the diff genuinely introduced; verify by grepping the diff itself first.
- **Verifying a branch-deploy preview URL instead of production.** Confirm the URL is
  the production alias.
- **Tagging before the deploy is proven.** A tag on a build that never shipped is worse
  than no tag.
- **Treating a schema change as revertible because the code is.** Data migrations are
  the reason a rollback fails at 2am. State the down path or block.
