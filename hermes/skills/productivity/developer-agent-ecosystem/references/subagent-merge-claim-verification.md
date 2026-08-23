# Verifying Sub-Agent Merge Claims

## Problem

`pr-review-and-merge` sub-agents sometimes self-report a successful merge and even return a plausible-looking merge commit SHA, but the PR remains open on GitHub. The reported SHA may be fabricated or partially reused from a prior merge (e.g., the tail of the SHA matches an older merge commit). If the main agent trusts this self-report and immediately transitions the JIRA ticket to `In Testing`, the pipeline continues on false premises.

## Detection

After a sub-agent claims a PR merged, always verify independently before transitioning JIRA:

```bash
# 1. Check PR state via GitHub CLI
gh pr view <PR_NUMBER> --json state,mergeCommit,mergedAt,mergedBy,headRefName,baseRefName

# 2. Check the actual main history
git checkout main
git pull origin main
git log --oneline -5
```

Signs of a false merge claim:
- `state` is still `OPEN`
- `mergeCommit` is `null`
- The returned SHA does not appear in `git log main`
- The SHA's tail matches a previous merge commit (copy-paste artifact)
- `gh pr merge <PR_NUMBER>` would still succeed, meaning the PR was never merged

## Recovery

If the PR is still open:
1. Fetch and check out the PR head branch locally.
2. Re-run verification: `npx tsc --noEmit`, `npx eslint`, tests, `npm run build`.
3. Read changed files and confirm AC coverage.
4. Post the review verdict as a regular issue comment via `GITHUB_REVIEWER_TOKEN` if an inline review comment fails.
5. Submit an `APPROVE` review via `GITHUB_REVIEWER_TOKEN` ({{GITHUB_REVIEWER_ACCOUNT}}).
6. Merge via the ambient author `gh` login if the reviewer account lacks merge permission: `gh pr merge <PR_NUMBER> --squash --delete-branch`.
7. Pull `main` and confirm the merge commit appears in history.
8. Only then transition JIRA to `In Testing` and dispatch QA.

## Prevention

- Do not dispatch the next pipeline step based solely on a sub-agent summary.
- Add an explicit main-agent verification gate between "sub-agent says merged" and "transition to In Testing".
- When reviewing `delegate_task` results, treat "PR merged" claims as untrusted until verified by `gh pr view` or `git log`.

## Session Examples

- BC-20 / PR #34: sub-agent returned a fabricated SHA (`bb43b5c3ccde2c26300de0af8d750f4a9ffd3c`) whose tail duplicated BC-19's merge (`88fe33d25643ae4d26300de0af8d750f4a9ffd3c`). Manual verification showed PR #34 was still open; main agent approved via reviewer token and merged via author `gh` login, producing actual merge commit `fa5f0d0`.
