# Native Hermes execution notes for /developer workflow

The `developer-agent-ecosystem` skill was originally written for a gateway/slash-command environment where agents can invoke `/behavior <model>` and `/custom-agent <role>` and use `Skill(skill="...", args="...")` dispatch. In native Hermes (this runtime), those constructs are not available. This reference records the concrete adaptations that worked in this session (BC-9) so future /developer runs don't have to rediscover them.

## Test-automation architecture constitution

Before adding any Playwright files for an Integration ticket, read `test-automation/INSTRUCTIONS.md` (if it exists). That document overrides generic patterns and often enforces strict POM + fixtures architecture:
- Specs must contain zero logic and zero raw locators.
- Selectors live in `locators/` as `[data-testid="..."]` strings.
- Static values live in `constants/`.
- Page objects live in `pages/` and are injected via fixtures.
- A single spec file per UI page/domain is required; avoid `footer.spec.ts`, `navbar.spec.ts`, etc.

If the implementation agent adds a raw spec (e.g. `footer.spec.ts` with `page.locator('[data-testid="..."]')` and inline strings), the Automation SDET step must refactor it into the POM architecture. This creates avoidable rework. Integration developers should either follow the constitution from the start or keep coverage minimal and defer full POM automation to the QA/Automation SDET phase.

## What to do instead of `Skill(skill="...", args="...")` handoffs

The skill says to hand off to sub-skills like `pr-review-and-merge` and `quality-analyst` via `Skill(...)`.

In native Hermes:
- **Prefer `delegate_task` with the full skill content as context.** Load the target skill with `skill_view(name)` first, then dispatch a leaf sub-agent with `goal` and `context` containing the workflow steps, constraints, and any session-specific data (MR URL, Jira key, repo path, verification evidence).
- **Fallback is restricted.** The parent agent may execute the handoff workflow directly only when (a) `delegate_task` is unavailable in the runtime, or (b) a previous `delegate_task` handoff demonstrably failed and re-dispatch would also fail. This is a narrow exception, not a convenience shortcut. Document the exception in a JIRA comment before proceeding manually.

Example dispatch for `pr-review-and-merge`:
```python
delegate_task(
  goal="Run the pr-review-and-merge workflow...",
  context="SKILL.md content from skill_view('github/pr-review-and-merge')... MR URL... self-review note...",
  toolsets=["terminal", "file", "web"]
)
```

## What to do instead of `Bash(command="compact")`

The skill instructs `Bash(command="compact")` before each `delegate_task` / `Skill(...)` handoff. There is no `compact` shell command in Hermes.

- Simply keep the `goal` and `context` concise before dispatching.
- Do not try to run `compact` in a terminal; it will fail with `command not found`.

## `/behavior` and `/custom-agent` commands

These are gateway slash commands. In native Hermes:
- Model behavior is set by the active session model, not by an in-chat `/behavior` command.
- Use `delegate_task` with explicit roles in the `goal`/`context` instead of `/custom-agent Plan`, `/custom-agent Explore`, etc.

## Verify local git identity before committing

If the repo does not have `user.name`/`user.email` set locally, `git commit` may fall back to the machine hostname email (`arghajitsingha@<hostname>`). This is a workflow hygiene issue that breaks commit attribution.

Before committing in a fresh repo:
```bash
git config user.email "{{JIRA_EMAIL}}"
git config user.name "Arghajit Singha"
```

If a commit was already made with the wrong identity:
```bash
git commit --amend --reset-author --no-edit
git push --force-with-lease origin <branch>
```

## Background `delegate_task` may not return

In this session, a background `delegate_task` for `pr-review-and-merge` was dispatched and later no longer appeared in `process list`. The parent recovered by executing the workflow directly. When dispatching long or critical handoffs in native Hermes, prefer synchronous (foreground) `delegate_task` and wait for the result. If a background result never surfaces, try a synchronous re-dispatch before falling back to manual execution, and document the fallback in a JIRA comment. Manual execution is a last resort, not the default.

## Avoid duplicate handoff dispatches

If you already dispatched a review/merge or QA sub-agent for a PR/ticket and the user then invokes `/pr-review-and-merge <MR>` or `/quality-analyst <KEY>` again, check whether the earlier `delegate_task` is still in flight or has already reported back before starting a second run. Duplicating the handoff wastes tokens and can produce conflicting review comments or double merges. In native Hermes:

1. Scan recent tool results and async delegation completion messages for the same PR/JIRA key.
2. If a prior handoff is `dispatched` but not yet completed, wait for its result instead of re-running the workflow.
3. If a prior handoff completed and produced a clear outcome (merged / QA verdict / fix required), use that outcome to decide the next step rather than re-executing.
4. Only run the workflow manually as a recovery action when the prior handoff is confirmed lost or failed.

## Netlify deploy lag for QA verification

After merging to `main`, the live Netlify site ({{DEPLOYED_URL}}/) may still serve the pre-merge build for several minutes. For QA verification, run the production build locally and test against `http://localhost:3000` instead of blocking on the production URL.

```bash
npm run build
npm start -- --port 3000
# In another shell:
BASE_URL=http://localhost:3000 npx playwright test ...
```

Remember to stop the local server after verification:
```bash
kill $(lsof -ti:3000)
```

## Self-review / self-approval fallback still applies

When the PR author is the same as the authenticated `gh` user, `gh pr review --approve` returns `422: Review Can not approve your own pull request`. Use the self-approval fallback already documented in `pr-review-and-merge/references/self-approval-fallback.md`: post the verdict as a `gh pr comment --body-file`, optionally add a `gh pr review --comment`, then merge.
