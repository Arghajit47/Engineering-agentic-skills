# QA Automation Empty-PR Recovery

When the QA sub-agent reaches the Automation SDET step for an Integration ticket, it is supposed to branch from `main` and add Playwright coverage under `test-automation/`. If the Integration Developer sub-agent already included `test-automation/` changes inside the implementation PR (a workflow violation, but one that does happen), the QA branch `Automation/<QA_SUBTASK_KEY>/<component>` ends up with **zero commits ahead of main**. `gh pr create` then fails:

```
No commits between main and Automation/<QA_SUBTASK_KEY>/<component>
```

This leaves the parent ticket stuck at `In Testing`. The correct recovery is for the parent agent to add a minimal, architecture-compliant automation-only commit to that branch.

## Recovery steps

1. Switch to `main`, pull latest, then check out the QA branch:
   ```bash
   git checkout main
   git pull origin main
   git checkout Automation/<QA_SUBTASK_KEY>/<component>
   ```

2. Inspect the existing `test-automation/specs/` layout and the ticket ACs for a gap that is not already covered. Typical gaps:
   - API contract tests for the other `page` query values (`careers`, `security`).
   - A missing Playwright project entry in `test-automation/playwright.config.ts`.
   - A cross-page smoke test that exercises the new component on a non-home route.
   - A missing fixture entry for the new page object.

3. Add the smallest change that produces a real, valuable diff. Example from BC-18 / BC-87:
   - Added `test-automation/specs/api-test/faq-api-contract.spec.ts` with three tests for `/api/faq?page={home,careers,security}`.
   - Added an `api-test` project in `test-automation/playwright.config.ts`.
   - Reused existing `FAQ_ENDPOINTS`, `faqResponseSchema`, and `FAQ_SCHEMA_LABELS` from `faq-constants.ts` so no new constants violated the architecture.

4. Verify locally against a running server:
   ```bash
   cd /path/to/repo
   npm run build
   npm start -- -p 3000            # in background
   cd test-automation
   npx tsc --noEmit
   BASE_URL=http://localhost:3000 npx playwright test --project=api-test
   ```
   Kill the server after the run.

5. Commit, push, open PR:
   ```bash
   git add -A
   git commit -m "<QA_SUBTASK_KEY> add <automation coverage summary>"
   git push -u origin Automation/<QA_SUBTASK_KEY>/<component>
   gh pr create --title "[<QA_SUBTASK_KEY>] <Component> automation" --body "Closes <QA_SUBTASK_KEY>" --base main --reviewer {{GITHUB_REVIEWER_ACCOUNT}}
   ```

6. Approve via reviewer token, merge via author `gh` login fallback if needed.

7. Transition QA subtask and parent ticket to Done.

## Why this is legitimate parent-agent work

The code being added is **automation SDET coverage**, not implementation code. The parent agent is not stealing work from the Integration Developer; it is closing a hole created by the QA sub-agent's inability to create a non-empty PR. The commit should contain only test files and test configuration.

## Prevention

The root cause is the Integration Developer sub-agent touching `test-automation/`. The `developer-agent-ecosystem` SKILL.md already has a hard prohibition against this. Re-dispatch instructions should explicitly remind sub-agents that they are not allowed to read or write `test-automation/` files.
