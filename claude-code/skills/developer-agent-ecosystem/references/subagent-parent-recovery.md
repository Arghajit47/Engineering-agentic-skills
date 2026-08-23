# Sub-agent parent recovery workflow

When a `delegate_task` sub-agent returns before finishing commit / push / MR, the main agent must recover the pipeline **without doing the sub-agent's work itself**. This is common on large integration tickets where the sub-agent exhausts its tool-call budget after writing code but before the final git/MR steps.

## Recovery principle

**The main agent is forbidden from writing implementation code, committing on behalf of the sub-agent, or creating the MR itself.** The recovery action is to re-dispatch a sub-agent (a "merge finisher" or "fixer" sub-agent) with the exact repo state and a narrow goal. The main agent may run read-only diagnostics and quality gates to prepare the re-dispatch, but the git commit/push/MR creation must be done by a sub-agent unless the runtime literally lacks `delegate_task`.

## Why this happens

- `delegate_task` sub-agents have ~50 tool calls.
- Large integration tickets often consume calls on reading code, implementation, test runs, and fixing failures.
- The final commit/push/MR steps may not fit.

## Recovery steps

1. Inspect repo state:
   ```bash
   git branch --show-current
   git status --short
   git diff --stat
   ```

2. Determine whether the work on disk is complete enough to commit. If it is uncommitted but complete, **do not commit it yourself**. Re-dispatch a sub-agent:
   ```
   delegate_task(
     goal="Finish the commit/push/MR for {JIRA_KEY} on branch {BRANCH}",
     context="""
     Repo is at {ABSOLUTE_PATH}. Current branch: {BRANCH}. Uncommitted changes are the implementation for {JIRA_KEY}; they are complete and verified. Your job only:
     1. git add -A
     2. git commit -m "{JIRA_KEY} <lowercase summary>"
     3. git push -u origin {BRANCH}
     4. Run npx tsc --noEmit, npx eslint <changed files>, npm test <changed tests>, npm run build. If any fail, stop and report.
     5. gh pr create --title "[{JIRA_KEY}] {summary}" --body "Closes {JIRA_KEY}" --base main --reviewer {{GITHUB_REVIEWER_ACCOUNT}}
     6. Return the MR URL.
     """,
     toolsets=['terminal', 'file']
   )
   ```

3. If the expected branch does not exist but the work is on the current branch, have the recovery sub-agent create the branch from the current state and push/MR. The main agent may run `git checkout -b` only as part of a re-dispatched sub-agent task, not in the parent session.

4. Verify quality gates **read-only in the parent** only to decide whether the sub-agent's work is safe to hand off. Do not run them as a substitute for the sub-agent's final verification.

5. If `delegate_task` is unavailable, document the exception in a JIRA comment before proceeding manually.

## What changed from the old recovery note

The previous version told the parent agent to commit, push, and create the MR itself. That violated hard delegation. The new recovery note treats those steps as sub-agent work; the parent diagnoses and re-dispatches.

## Real example: KAN-37 (revised)

The Integration Developer sub-agent dispatched for KAN-37 modified `src/app/properties/[slug]/page.tsx` and its test file on an unrelated automation branch. The sub-agent returned before creating the feature branch or MR. The main agent:

- Checked `git status` and saw the changes on `Automation/KAN-84/property-details-inquiry`.
- Re-dispatched a sub-agent with the goal: "Create the correct feature branch from main, move only the KAN-37 integration changes, run quality gates, commit/push/MR."
- The recovery sub-agent created `KAN-37-Property-Details-Pricing-Contact-Integration`, moved the changes, fixed a `global.fetch` mock collision between the pricing and contact endpoints, verified `tsc`/`eslint`/Vitest/`next build`, and opened MR #61.

## Test mock pitfall from KAN-37

When a page uses `global.fetch` for multiple endpoints (e.g. one SWR fetcher and another direct `fetch` call), a blanket `vi.fn().mockResolvedValue(...)` in a test returns the same object for every endpoint. The SWR-driven component may crash because it receives a response shape intended for a different endpoint.

**Fix:** disambiguate by URL in the mock:

```ts
global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
  const urlString = typeof url === "string"
    ? url
    : url instanceof URL
      ? url.toString()
      : url.url;

  if (urlString.includes("/api/contact/property")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({ success: true, message: "Submitted" }),
    });
  }

  return Promise.resolve({
    ok: true,
    json: async () => MOCK_PRICING,
  });
});
```

Per-test overrides should also preserve the URL disambiguation if the test still exercises multiple endpoints.
