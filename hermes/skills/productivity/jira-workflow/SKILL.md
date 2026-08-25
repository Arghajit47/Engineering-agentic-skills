---
name: jira-workflow
description: JIRA assignee account per ticket state (ids resolved from project-config.local.md at setup, never hardcoded). Use whenever transitioning a JIRA ticket via Atlassian Rovo MCP tools (transitionJiraIssue + editJiraIssue) — the assignee must be updated to match the new state on EVERY transition. In Progress / In Testing → Dev account; Code Review / Done → Reviewer account. Never leave the assignee stale after a transition.
version: 1.0.0
author: Arghajit Singha
license: MIT
---

# JIRA Workflow — Assignee per State

> **Setup values.** This skill contains no account ids, site hosts, project keys, or
> deployed URLs — they appear as `{{PLACEHOLDER}}`. Resolve them from
> `project-config.local.md` in the skills directory. If that file is missing, or the
> value you need is absent or still `{{...}}`, **stop and ask the user for it** (batch
> the asks if you need several), then offer to save it so you never ask again. Never
> guess one, never carry one over from another project, and never invent a
> plausible-looking account id — a wrong id silently misassigns tickets and a wrong URL
> silently grades the wrong site. Full table and asking rules: `PROJECT-CONFIG.md`.


## JIRA content format — ADF only, no exceptions

This skill transitions tickets; it does not author content. But every skill that *does*
post — description, comment, reply, subtask body — sends Atlassian Document Format v3
JSON, with no exemptions.

Each posting skill owns its templates at `<skill>/templates/adf/*.adf.json`, generated
from `templates/adf/_src/<skill>/` by `templates/adf/build.sh`. Never wiki markup, HTML,
or raw Markdown — all three render as broken literal text.

Validate before posting:

```bash
python3 ~/.claude/skills/scripts/adf.py --validate <filled>.adf.json
```

Spec: `rules/ADF.md`.

## Mapping

| Target state           | Assignee account | GUID |
|------------------------|------------------|------|
| `In Progress`          | Dev              | `{{JIRA_DEV_ACCOUNT_ID}}` |
| `In Testing`           | Dev              | `{{JIRA_DEV_ACCOUNT_ID}}` |
| `Code Review`          | Reviewer         | `{{JIRA_REVIEWER_ACCOUNT_ID}}` |
| `Done`                 | Reviewer         | `{{JIRA_REVIEWER_ACCOUNT_ID}}` |

## Which skill owns which transition

| Transition | Owned by | Assignee after |
|---|---|---|
| → `In Progress` (start work) | `developer-agent-ecosystem` | Dev |
| → `In Progress` (security BLOCK) | `security-review` | Dev |
| → `In Progress` (QA / perf fail) | `quality-analyst` | Dev |
| → `In Progress` (incident fix-forward) | `sre-watch` | Dev |
| → `Code Review` / `In Review` | `developer-agent-ecosystem` | Reviewer |
| → `In Testing` (merged) | `pr-review-and-merge` | Dev |
| → `Done` | `quality-analyst` only | Reviewer |

**Nothing else may transition to `Done`.** `/release`, `/sre`, `/docs`, `/perf-budget`,
and `/security-review` all report and escalate; they never close a ticket. `/em` reports
on the board and never transitions anything the user has not agreed to move.

`/architect`, `/design-system`, `/refactor-debt`, `/agent-eval`, and `/tech-writer`
produce documents, PRs, or reports and **create no tickets at all** — the standing
no-endless-ticketing rule applies to every one of them.

## How to apply

- After every `transitionJiraIssue` call, follow up with an `editJiraIssue` that sets the assignee to the GUID matching the new state.
- Never leave the assignee stale after a transition — treat transition + reassign as a single atomic action.
- These GUIDs correspond to the same person across two Atlassian accounts (Dev vs Reviewer); they are not two separate humans. Pair with the matching GitHub token (`GITHUB_TOKEN` for dev work, `GITHUB_REVIEWER_TOKEN` for review/merge) — see memory `reference_github_tokens.md`.

## Related

- Skill: `ba` (creates tickets that will move through these states)
- Skill: `qa` (drives the `In Testing → Done` transition — the only skill that may)
- Skill: `release-engineer` (sits between merge and QA; transitions nothing, but blocks QA if the deploy is stale)
- Skill: `eng-manager` (reads the board; recommends, never transitions)
- Full lifecycle map: `PIPELINE.md` in the Skills bundle
- Memory: `feedback_workflow_handoffs.md`, `reference_github_tokens.md`
