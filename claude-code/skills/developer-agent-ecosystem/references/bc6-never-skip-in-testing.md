# BC-6 Corrected Workflow — Never Skip In Testing for Integration Tickets

## What happened

For Integration ticket BC-6, the agent completed the implementation, self-reviewed and merged MR #9, then incorrectly moved BC-6 and its QA subtask BC-68 directly to `Done` without running the Integration QA pass and without creating the required Automation SDET branch/PR.

## User correction

The user pointed out:
1. The ticket had never been in `In Testing` on the board.
2. The agent had no authority to skip `In Testing`.
3. For Integration scope, the `quality-analyst` Automation SDET step must run after a clean manual pass.
4. Automation changes must never be pushed directly to `main`.

## Corrected flow

1. Revert BC-6 to `In Testing` and BC-68 to `In Progress`.
2. Assign both to Developer.
3. Run manual Integration QA against local dev server.
4. Post QA evidence to BC-68.
5. Run Automation SDET step:
   - Read `test-automation/INSTRUCTIONS.md`.
   - Inspect existing skeleton.
   - Add backend + frontend Playwright specs.
   - Verify locally.
   - Branch `Automation/BC-68/navbar-auth-integration`.
   - Open MR #10.
   - Halt for user approval.
6. Only after MR approval/merge: transition BC-6 and BC-68 to `Done` and assign Reviewer.

## Lessons

- `In Testing` is a mandatory status, not an optional column.
- Integration tickets require sequential manual QA → Automation SDET.
- Automation SDET changes are a separate branch + PR + explicit user approval.
- Auto-mode runs every step without pause but does not remove any step.

## Related reference

- `quality-analyst/references/bc6-automation-skeleton-reuse.md` for the automation implementation details.
