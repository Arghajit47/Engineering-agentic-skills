---
name: sre-watch
description: "SRE / Post-Deploy Watch (/sre): the stage after Done. Runs a timed soak on the deployed URL after a release, triages 'it is live and broken' reports, and owns the incident record. Evidence comes from the deployed URL only. Produces a soak report or an incident timeline; escalates to /release --rollback or /developer. Never auto-files tickets."
version: 1.0.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [sre, monitoring, incident, post-deploy, soak, observability, rollback, workflow]
    related_skills: [release-engineer, quality-analyst, developer-agent-ecosystem, security-review, jira, behavior, custom-agent, claude-opus-5, worker]
---

# SRE / Post-Deploy Watch (/sre)

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
| `templates/adf/incident.adf.json` | an incident record |
| `templates/adf/soak-report.adf.json` | the post-deploy soak |

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

Templates are generated from `templates/adf/_src/sre-watch/*.adf.md` by
`templates/adf/build.sh` — edit the source and rebuild, never the JSON. Full node spec:
`rules/ADF.md`. Which template a skill uses at which gate, for the whole
pipeline: `templates/TEMPLATES.md` (generated — do not edit by hand).

## Why this skill exists

The pipeline previously ended at Done. Everything before it grades a build at one
moment in time against a specification. Nothing watched what happened once real
traffic, real data, and real time hit it. This skill covers the gap between "QA passed"
and "the user tells us it is broken".

## Hard rules

1. **Deployed URL only.** Same absolute gate as QA. Never `localhost`, never a local
   build, never a preview alias standing in for production.
2. **Never auto-file.** A slow response or a console warning is a *measurement*. It
   becomes a ticket only when the user says so. Report; do not create.
3. **Rollback beats debugging under active impact.** If production is degraded and a
   known-good SHA exists, recommend `/release --rollback` first and investigate after.
4. **Never mutate production data to test it.** Read-only probes. If a write path must
   be exercised, use the designated test record and say which one.
5. **Do not restate QA's job.** QA graded the build against Figma and the ACs. This
   skill watches behaviour over time: errors, latency, regressions in what was already
   passing.

## Soak workflow (`/sre <TICKET>`)

Runs immediately after a release is verified and QA has passed.

### 1. Baseline

```bash
URL="<deployed production url>"
curl -s -o /dev/null -w 'status=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n' "$URL"
```

Capture the same three numbers for every route the ticket touched, plus `/` as a control.

### 2. Probe sweep

Dispatch `/custom-agent worker` with a Playwright pass against the **deployed** URL:

- Every route the ticket touched, at the design's real frame widths (for
  `{{PROJECT_NAME}}`: 390 / 1440 / 1920 — the design has no other frames).
- Collect: HTTP status, console errors, failed network requests, uncaught rejections.
- Re-run the ticket's happy path once. Not the full QA suite — QA already did that.
  This is a liveness check, not a re-grade.

```js
// evidence shape expected back
{ route, width, status, consoleErrors: [], failedRequests: [], ttfbMs }
```

### 3. Regression sweep

Hit the three highest-value routes the ticket did **not** touch. Post-deploy breakage
most often lands somewhere nobody was looking — a shared layout, nav, or footer change
that the ticket's own scope never exercised.

### 4. Verdict

| Signal | Threshold | Action |
|---|---|---|
| Any 5xx | 1 occurrence | **INCIDENT** — go to the incident workflow |
| Uncaught console error | 1 occurrence | **INCIDENT** if it breaks a user path, else note |
| TTFB regression vs control | > 2× the control route | Note; hand to `/perf-budget` |
| Failed network request | any non-analytics | **INCIDENT** |
| Clean | — | **SOAK PASS** — post report, close the loop |

Post the soak report as a JIRA comment on the ticket (no disclaimer):

```markdown
## Post-Deploy Soak — <TICKET>

**Verdict: SOAK PASS | INCIDENT**
**Deployed SHA:** `<sha>` · **URL:** <url> · **Window:** <start>–<end>

| Route | Width | Status | TTFB | Console errors | Failed requests |
|---|---|---|---|---|---|
| /foo | 1440 | 200 | 180ms | 0 | 0 |

**Untouched routes checked:** /, /about, /contact — all 200, 0 errors.
**Notes (non-blocking):** …
```

## Incident workflow (`/sre --incident`)

### 1. Establish impact before cause

Answer these four, in order, before reading any code:

1. **What is broken** — the observable symptom, on which route, at which width.
2. **Since when** — correlate to a deploy: `gh run list --branch main --limit 10 --json headSha,createdAt,conclusion`.
3. **How bad** — every user, or one path? Data loss, or cosmetic?
4. **Is there a known-good SHA** — the last deploy that passed soak.

### 2. Decide: roll back or fix forward

Roll back when: the symptom is user-visible **and** a known-good SHA exists **and**
no schema migration blocks the revert. Otherwise fix forward.

```
Skill(skill="release-engineer", args="--rollback <last-good-sha>")
```

State the decision and the reason explicitly in the incident record. "We chose to fix
forward because the migration is not reversible" is a legitimate answer; silence is not.

### 3. Correlate

Dispatch `/custom-agent Explore`:

> The deployed site errors with `<exact message>` on route `<route>` at width `<w>`.
> Diff `<last-good-sha>..<current-sha>` touched these files: `<list>`. Identify which
> change can produce this symptom. Excerpts and reasoning only — do not fix.

Check the usual suspects for this stack first: SWR hydration mismatch, a serverless
SQLite path assumption that holds locally and not on Netlify, a `laptop:`/`lg:`
breakpoint leak that only manifests at one real width, an env var present locally and
absent in the deploy.

### 4. Incident record

Post as a JIRA comment on the affected ticket (or the epic if it spans several):

```markdown
## Incident — <one-line symptom>

**Status:** Mitigated | Resolved | Investigating
**Detected:** <ts> · **Mitigated:** <ts> · **Resolved:** <ts>

### Timeline
- <ts> — <event>

### Impact
<Who saw what, on which routes, for how long.>

### Cause
<The specific change and the specific mechanism. Not "a regression".>

### Mitigation
<Rollback to `<sha>` | fix in PR #N>

### What would have caught this
<One concrete gate: a QA check, a soak probe, a review rule. One item, actionable.>
```

That last section is the point of the record. It feeds `/agent-eval` — a repeated
"what would have caught this" is a missing gate in the pipeline, and that is a skill
change, not a ticket.

### 5. Hand off

- Rollback path → `/release --rollback`, then re-enter `/developer` on the ticket.
- Fix-forward path → transition the ticket to **In Progress**, assign the Dev account
  per `jira-workflow`, auto-invoke `/developer`.

## Pitfalls

- **Grading the design again.** Soak is liveness and errors, not pixel parity. Sending
  Figma deviations through this skill duplicates QA and produces the endless-ticketing
  pattern the user has explicitly rejected.
- **Probing a preview URL.** Branch deploys have different env vars and often different
  data. Confirm the production alias.
- **Declaring "no errors" from a single width.** The breakpoint-leak defect family is
  invisible at 1440 and obvious at 1920. Probe every frame width the design defines.
- **Treating analytics/third-party request failures as incidents.** Note them; they are
  not your outage.
- **Writing a cause of "a regression in the last deploy".** That is a restatement of the
  symptom. Name the file, the line, and the mechanism.
