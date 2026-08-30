---
name: eng-manager
description: "Engineering Manager (/em): the layer above /ba. Owns backlog shape, sprint scope, WIP limits, blocked-ticket detection, and release notes. Reads JIRA and reports on flow — cycle time, rework rate, where tickets stall — and recommends what to work on next. Decides nothing unilaterally: produces a prioritised recommendation the user approves. Never auto-files, never transitions a ticket the user has not agreed to."
version: 1.0.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [engineering-manager, backlog, sprint, planning, release-notes, jira, flow, workflow]
    related_skills: [business-analyst-workflow, architect, developer-agent-ecosystem, quality-analyst, refactor-debt, tech-writer, jira-workflow, behavior, custom-agent, claude-opus-5]
---

# Engineering Manager (/em)

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
| `templates/adf/flow-report.adf.json` | the cycle-time and rework report |
| `templates/adf/sprint-plan.adf.json` | the ranked sprint recommendation |
| `templates/adf/standup.adf.json` | the board state |

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

Templates are generated from `templates/adf/_src/eng-manager/*.adf.md` by
`templates/adf/build.sh` — edit the source and rebuild, never the JSON. Full node spec:
`rules/ADF.md`. Which template a skill uses at which gate, for the whole
pipeline: `templates/TEMPLATES.md` (generated — do not edit by hand).

## Why this skill exists

`/ba` authors tickets on demand and everything downstream executes them. Nothing looked
at the board as a whole: what is stuck, what is being reworked, whether three things are
in flight at once, what should be next. That judgement was happening implicitly, ticket
by ticket, with no memory across them.

## Hard rules

1. **Recommends; does not decide.** Priority is the user's call. This skill produces a
   ranked list with reasoning, then stops.
2. **Never auto-files.** Not a single ticket, ever. Gaps in the backlog are reported;
   `/ba` authors tickets only when the user asks.
3. **Never transitions a ticket the user has not agreed to move.** The one exception is
   the standing handoff chain (MR merged + In Testing → QA), which other skills own.
4. **Assignee follows state on every transition** — In Progress / In Testing → Dev
   account; Code Review / Done → Reviewer account. See `jira-workflow`. Never leave an
   assignee stale.
5. **WIP limit is 1 by default.** One person plus one agent pipeline cannot genuinely
   parallelise three tickets; parallel WIP here shows up as rework, not throughput.

## Workflow — `--standup`

```
# mcp: searchJiraIssuesUsingJql(
#   jql="project = <KEY> AND status != Done ORDER BY status, updated DESC")
```

```markdown
## Board — <project> · <date>

| Status | Key | Title | Assignee | Age | Flag |
|---|---|---|---|---|---|
| In Progress | BC-190 | [Frontend] Services grid | Dev | 2d | — |
| Code Review | BC-188 | [Integration] Contact form | Reviewer | 5d | **STALLED** |
| In Testing | BC-185 | [Backend] Rates API | Dev | 1d | — |

**WIP: 3** (limit 1) — over limit.
**Stalled (>3d in one state):** BC-188 in Code Review since <date>.
**Assignee mismatches:** none.
**Next action:** BC-188 is the constraint. Finish it before starting anything new.
```

Stall thresholds: In Progress > 3d, Code Review > 2d, In Testing > 2d. A stalled ticket
is always the top recommendation — an aging ticket costs more than a new one earns.

## Workflow — `--plan`

### 1. Inputs

- Open backlog, ranked as it currently stands.
- Any `/architect` ADRs in `Proposed` — an unaccepted ADR blocks its whole epic.
- The `/refactor --register` top items.
- The `/design-system --audit` drift assessment.
- Open incidents from `/sre` and their "what would have caught this" lines.

### 2. Ranking heuristic, in order

1. **Unblock the constraint.** Anything stalled, or anything blocking a stalled item.
2. **Finish before starting.** In Testing → Code Review → In Progress, oldest first.
3. **Pay the debt that is charging interest.** A register item with high churn beats a
   new feature of equal size; it makes every subsequent ticket cheaper.
4. **Architecture before its dependants.** An epic with a `Proposed` ADR cannot start —
   `/architect` first.
5. **Then new feature work,** in the user's stated priority order.

### 3. Output

```markdown
## Sprint Recommendation — <project>

**Capacity assumption:** one dev + agent pipeline, WIP 1. Historic throughput: <n> pts/week (from --flow).

| # | Item | Pts | Why now | Entry point |
|---|---|---|---|---|
| 1 | BC-188 unstick | — | 5d in Code Review, blocking WIP | `/pr-review-and-merge 42` |
| 2 | Debt #3 dead exports | 1 | free, −180 LOC | `/refactor 3` |
| 3 | EPIC-12 Rates page | 13 | ADR-0004 still Proposed | `/architect EPIC-12` first |

**Total: <n> pts vs <n> capacity.**
**Deliberately excluded:** <items, and why>.
**Approve this order and I will start at #1.**
```

Always name what was excluded. A plan that only lists inclusions hides the decision.

## Workflow — `--flow`

Reads JIRA changelogs to measure the pipeline rather than guess at it.

```markdown
## Flow Report — <project> · last <n> tickets

| Metric | Value | Read |
|---|---|---|
| Median cycle time (In Progress → Done) | 3.2d | — |
| Median time in Code Review | 1.8d | largest single stage |
| **Rework rate** (In Testing → In Progress) | 38% | **high** |
| Tickets reopened after Done | 1 | — |
| Median story points completed / week | 11 | — |

### Rework analysis
Of <n> QA failures: <n> responsive/breakpoint, <n> missing test update, <n> other.

**Assessment:** rework is concentrated in one defect family, not spread. That is a
pipeline gap, not a discipline problem — the fix is a gate, not more care.
**Recommended:** `/design-system --init` to remove the breakpoint family at the source.
```

Rework rate is the single most useful number here. High rework with a concentrated
cause means a **missing gate**, and the fix belongs in a skill — hand it to `/agent-eval`.

## Workflow — `--release-notes <RANGE>`

```bash
git log --oneline --no-merges <FROM>..<TO>
gh pr list --repo <owner/repo> --state merged --search "merged:><date>" \
  --json number,title,body,mergedAt
```

Group by user-visible outcome, not by ticket type. Nobody outside the team cares that
something was `[Integration]`.

```markdown
## Release <vX.Y.Z> — <date>

### New
- Services page with live rate data. (BC-185, BC-188)

### Improved
- Correct layout at 1920px across all pages. (BC-190)

### Fixed
- Contact form no longer silently drops submissions on slow connections. (BC-191)

### Internal
- Removed 180 lines of dead code; design tokens centralised.
```

## Pitfalls

- **Planning more than capacity.** An over-full sprint just moves the choosing to the
  end of the week, when it is made under pressure and badly.
- **Treating rework rate as a quality problem.** 38% rework with one dominant cause is a
  missing gate. More diligence will not fix it; a token layer will.
- **Recommending new features while something is stalled.** Starting is not progress.
- **Filing tickets for backlog gaps.** Report the gap; `/ba` authors only on request.
- **Letting an ADR sit in `Proposed`.** It silently blocks an entire epic and nothing on
  the board shows it.
