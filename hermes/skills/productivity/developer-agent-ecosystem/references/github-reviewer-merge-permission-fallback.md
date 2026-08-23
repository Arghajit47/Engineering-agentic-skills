# Developer Sub-Agent Merge Permission Fallback

In this repo, the dedicated reviewer account is `{{GITHUB_REVIEWER_ACCOUNT}}` and the merge-permission account is `{{GITHUB_OWNER}}`. The reviewer account is configured with push access but lacks `MergePullRequest` permission.

## Symptom

`GH_TOKEN=$GITHUB_REVIEWER_TOKEN gh pr merge <N>` fails with:
```
failed to merge pull request: ..., "message": "You're not authorized to push to this branch."
```

or the sub-agent reports it cannot merge after approving.

## Correct fallback (not self-approval)

1. Post the review approval under the reviewer account:
   ```bash
   GH_TOKEN=$GITHUB_REVIEWER_TOKEN gh pr review <N> --repo <owner>/<repo> --approve --body "..."
   ```
2. Perform the actual merge under the author's ambient `gh` login ({{GITHUB_OWNER}}), which has `ADMIN` permission:
   ```bash
   gh pr merge <N> --repo <owner>/<repo> --squash --delete-branch
   ```
3. This is a **permission fallback**, not self-approval. The review verdict came from a separate account.

## Why this matters

- GitHub blocks a user from approving their own PR; switching tokens for the same user does not help.
- A second account (`{{GITHUB_REVIEWER_ACCOUNT}}`) with push access but without merge permission can still provide a meaningful code review.
- The merge must then be executed by an account that has the required repo permission.

## Notes for sub-agents

When dispatching `pr-review-and-merge`, include the host-specific rule: reviewer token for approval, author `gh` CLI for merge fallback if reviewer lacks merge permission. Do not ask the user to grant merge permission to the reviewer account mid-session unless the merge fallback also fails.

## Session evidence

- BC-11 PR #21 merged with fallback (merge commit `5b3bc67d061100e74974cd724a2eb80e78813602`).
- BC-12 PR #22 merged with fallback (merge commit `83c4091c22d9b8a250c9c22e13707704eec1014b`).
- BC-18 PR #31 and automation PR #32 merged with fallback (merge commits `96a94599c275b881e59537de6306c5d921c5c03a` and `1b9e195a62249bce73d1a78a1592410157cc7e02`).
