# Cleaning up temporary PR branches when Husky enforces branch names

Some repos run a Husky `pre-commit` hook that rejects any branch name that does
not match the project's template (e.g. `Fix/<JIRA_KEY>/<Component>` or
`Automation/<JIRA_KEY>/<Component>`). This becomes a problem after a review
because the skill recommends creating a temporary local branch like `pr-<N>`
via:

```bash
git fetch origin pull/<N>/head:pr-<N>
git checkout pr-<N>
```

If you later need to apply a fix on that temporary branch (e.g. a QA-found
detail) or even just commit a final cleanup change, the Husky hook will block
the commit with:

```
❌ Invalid branch name: 'pr-17'
Branch name must follow one of these templates:
  Fix/<JIRA_KEY>/<Component_name>
  Automation/<JIRA_KEY>/<Component_name>
```

## Safe patterns

1. **Do not commit on the temporary `pr-<N>` branch.** Treat it as read-only.
   After fetching and checking it out, make any fix commits on a compliant
   branch instead:

   ```bash
   git checkout pr-<N>
   git checkout -b Fix/<JIRA_KEY>/<Component>-review-fix
   # make fix, commit, push, open follow-up PR
   ```

2. **If you already have uncommitted changes on `pr-<N>`**, move them to a
   compliant branch before committing:

   ```bash
   git stash
   git checkout -b Fix/<JIRA_KEY>/<Component>-review-fix
   git stash pop
   ```

3. **Force-switch back to `main` without committing** when the only goal is
   cleanup:

   ```bash
   git checkout -f main
   git branch -D pr-<N>
   ```

   This discards any uncommitted work on `pr-<N>`. Only do this if that work
   has already been moved or is intentionally disposable.

4. **Avoid `--no-verify` as a habit.** It bypasses all hooks, not just the
   branch-name guard, and can let lint/type checks slip through. Prefer a
   compliant branch name instead.

## Link to follow-up fix workflow

When review or QA reveals a defect after the original MR is merged, create a new
compliant branch from `main`, implement the smallest correct diff, open a new
PR, self-review (if author == reviewer), merge, and re-run QA. Do not try to
reopen or force-push the already-merged original branch.
