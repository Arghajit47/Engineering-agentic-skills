# Resolving Merge Conflicts on Automation Branches

Automation branches (`Automation/<KEY>/<Component>`) in the Banking Company repo are long-lived enough that `main` advances while the QA sub-agent is still fixing review comments. When the user asks "merge conflicts?" the branch must be reconciled with `origin/main` and the resulting conflicts fixed *before* the PR can be merged cleanly.

## Workflow

1. **Detect conflicts without applying them first:**
   ```bash
   cd /path/to/repo
   git fetch origin main
   git merge --no-commit --no-ff origin/main
   ```
   If no conflicts, the merge can be committed. If conflicts exist, note the files.

2. **Abort the dry-run merge to inspect both sides cleanly:**
   ```bash
   git merge --abort
   ```
   Use `gh api repos/{owner}/{repo}/contents/{path}?ref=main` or `git show origin/main:{path}` to read main's version.

3. **Re-run the actual merge and resolve conflicts:**
   ```bash
   git merge --no-commit --no-ff origin/main
   ```
   Resolve conflict markers, then:
   - remove duplicate methods introduced by the merge (common when `main` and the branch independently added similar helpers),
   - replace any stale hardcoded strings/URLs that came from `main` with the current constants,
   - re-run `npx tsc --noEmit` and `npm run test` before committing.

4. **Commit and push:**
   ```bash
   git add -A
   git reset HEAD test-results/  # do not commit Playwright artifact dirs
   git commit -m "<JIRA_KEY> resolve merge conflicts with main"
   git push origin Automation/<KEY>/<Component>
   ```

## Common automation-branch conflict pattern

Main often gains extra tests or page-object methods while the automation branch is being reviewed. The conflict file is usually the spec (`specs/frontend-integration-test/home-page.spec.ts`) because both sides added CTA tests. The resolution must:
- keep all tests from `main`,
- ensure every test method exists and is implemented correctly,
- deduplicate any methods that `main` and the branch both added,
- make sure the surviving implementation follows `INSTRUCTIONS.md` (constants, locators, API validation).

## Verification is mandatory

A resolved merge is not done until:
- `npx tsc --noEmit` is clean,
- `npm run test` passes (API + UI projects),
- the diff against `origin/main` contains no new hardcoded strings or duplicate page-object methods.
