# Auto-Handoff Failure Case Study — Why `/quality-analyst` Did Not Start Automatically

Session: KAN-8 integration QA, 2026-07-17.

## Symptom

User asked: "Seems like in the skills, the auto calling of the next skill, transitions of tickets from one status to another status automatically, seems like these has been changed/revoked. Why?"

Specifically, the `/quality-analyst` skill did not auto-trigger after the MR for KAN-8 was merged.

## Root cause

PR #8 was merged **manually by the main agent** (`gh pr merge 8 --squash --delete-branch`), not by the `/code-review` skill's Phase 6 flow. Because the skill never executed its own merge step, it also never executed the subsequent steps:

1. Post JIRA comment: "Code review PASSED ... Moving to In Testing."
2. Transition ticket to "In Testing" + assign to Developer.
3. Invoke `/quality-analyst <JIRA_TICKET_URL>`.

The skill rules were still present in the registered SKILL.md files; nothing had been revoked. The handoff simply did not run because the skill's orchestration path was bypassed.

## Other ways the handoff can silently stall

| Failure mode | How it looks | Why it happens |
|--------------|--------------|----------------|
| Manual merge | `/quality-analyst` never runs | Main agent merges outside the `/code-review` skill |
| Transition returns 200 but status unchanged | Ticket stays in Code Review | Wrong transition name, missing workflow permission, or board does not allow the transition |
| Assignee not updated | Status moved, but wrong owner | `mcp_jira_jira_update_issue` not called after transition, or wrong account ID |
| Slash command not callable | No skill starts, no error shown | `/quality-analyst` and `/code-review` are user-level slash commands, not agent-callable tools; the main agent cannot literally "invoke" them unless a tool exists |
| Context compaction / session boundary | Handoff step is dropped | Long multi-step flows get compacted or the session ends before Phase 6 |

## Fix added to the pipeline skills

The following verification steps were added to `mr-code-review`, `quality-analyst`, `developer-agent-ecosystem`, and `business-analyst-workflow`:

1. **After every transition**: re-fetch the ticket (`mcp_jira_jira_get_issue`) and confirm `fields.status.name` matches the target.
2. **After every assignee update**: re-fetch and confirm `fields.assignee.accountId` matches the intended assignee.
3. **If the check fails**: retry once; if it still fails, STOP and tell the user the exact current status.
4. **Before invoking the next skill**: only proceed if the previous transition/assignee succeeded.
5. **If the next skill cannot be auto-invoked** (no callable tool for `/quality-analyst` or `/code-review`): post a clear user-facing instruction such as "Next step: run `/quality-analyst {JIRA_TICKET_URL}`" instead of silently skipping.
6. **Log every transition/handoff** in the final response: `{JIRA_KEY}: {oldStatus} → {newStatus}, assignee → {accountId}, next step → {action}`.

## Lesson

Slash commands (`/quality-analyst`, `/code-review`, `/developer`, `/ba`) are **user-facing triggers**, not internal agent tools. A skill can document "auto-invoke `/quality-analyst`" as the intended workflow, but the running agent may not have a function that literally sends that slash command. The skill must therefore:

- Prefer an actual tool call when one exists (e.g. `mcp_jira_jira_transition_issue`, `delegate_task`).
- Fall back to an explicit, copy-pasteable user instruction when only a slash command is available.
- Never silently skip a handoff.

## Verification checklist for future code-review runs

Before claiming a review is complete, confirm:

- [ ] MR was merged by the code review agent (or note if merged manually).
- [ ] JIRA ticket status is "In Testing" after merge.
- [ ] JIRA ticket assignee is the Developer account ID.
- [ ] `/quality-analyst` was either invoked as a tool OR the user was told exactly how to invoke it.
- [ ] The final response logs the transition and next step.
