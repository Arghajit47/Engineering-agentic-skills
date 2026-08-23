# QA Handoff Fallback When `Skill` Tool Is Unavailable

The `pr-review-and-merge` workflow ends by handing the merged, "In Testing"
ticket to the `quality-analyst` skill. In some environments the
`Skill(skill="quality-analyst", args="...")` tool is not available.

## What to do

1. Confirm the parent ticket is in **In Testing** and assigned to the
   developer/reviewer who performed the code review.
2. Confirm a QA subtask exists (e.g. **BC-71 — QA Testing for BC-9**). If not,
   create one named "QA Testing for {JIRA_KEY}" as a `Task` with a `Relates`
   link to the parent.
3. Add a Jira comment to the parent ticket with:
   - Merge commit / MR link.
   - Review verdict and verification evidence.
   - Statement that QA handoff is next and the QA subtask key.
4. If the chat environment supports gateway slash commands, also send:
   ```
   /quality-analyst {JIRA_KEY}
   ```
5. If neither `Skill` nor slash commands are available, stop cleanly after the
   Jira comment. The user or next agent can continue QA.

## Rationale

The review-and-merge skill owns **review → merge → In Testing**. The QA skill
owns **In Testing → Done**. Blocking at the handoff because the dispatch tool
is missing over-engineers the session; a clear handoff note preserves the
audit trail and lets QA pick up where review left off.
