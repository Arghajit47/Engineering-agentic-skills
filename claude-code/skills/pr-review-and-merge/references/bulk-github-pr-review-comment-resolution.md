# Resolving Bulk GitHub PR Review Comments

When a PR has dozens of inline comments, the browser UI is too slow and the `gh` CLI approval path is blocked for self-review. Resolve the threads programmatically via the GitHub REST/GraphQL APIs.

## Two comment streams

GitHub splits PR comments into two APIs:

1. **Conversation comments** — posted on the main PR discussion tab. Because every PR is also an issue, use the Issues API.
   ```http
   GET /repos/{owner}/{repo}/issues/{pr_number}/comments
   ```
2. **Inline code-review comments** — comments attached to specific lines in the Files changed tab. Use the Pulls API.
   ```http
   GET /repos/{owner}/{repo}/pulls/{pr_number}/comments
   ```

For a complete chronological view, fetch both and merge by `created_at`.

## Reusable Python snippet (REST)

```python
import requests, json, os

with open(os.path.expanduser('~/.env')) as f:
    token = [l.split('=',1)[1].strip() for l in f if l.startswith('GITHUB_TOKEN=')][0]

headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': f'Bearer {token}',
    'X-GitHub-Api-Version': '2022-11-28'
}

owner, repo, pr = '{{GITHUB_OWNER}}', '{{PROJECT_NAME}}', 10

# Conversation comments
conv = requests.get(
    f'https://api.github.com/repos/{owner}/{repo}/issues/{pr}/comments',
    headers=headers
).json()

# Inline review comments
review = requests.get(
    f'https://api.github.com/repos/{owner}/{repo}/pulls/{pr}/comments',
    headers=headers
).json()

reply_body = "Resolved: ..."
for c in review:
    requests.post(
        f'https://api.github.com/repos/{owner}/{repo}/pulls/{pr}/comments',
        headers=headers,
        json={'in_reply_to': c['id'], 'body': reply_body}
    )
```

## Marking threads resolved (not just replying)

A reply does **not** mark a review thread resolved. The GitHub web UI Resolve button calls the GraphQL mutation below. You must call it for each unresolved thread after replying.

### Fetch thread IDs

```graphql
{
  repository(owner: "<owner>", name: "<repo>") {
    pullRequest(number: <N>) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
        }
      }
    }
  }
}
```

### Resolve each thread

```graphql
mutation ResolveReviewThread($id: ID!) {
  resolveReviewThread(input: { threadId: $id }) {
    thread {
      id
      isResolved
    }
  }
}
```

## Why not just use the GitHub web UI?

- 30+ comments require many clicks and page reloads.
- The agent workflow is deterministic and leaves an audit trail.
- It prevents accidentally missing a thread, which keeps the PR in an unresolved state.

## When to use this

- Self-review PRs where the reviewer == author and all comments are your own corrections.
- Any PR with more than ~10 inline comments that share the same root cause (e.g., "remove real-estate constants" applied to 30 lines).
- After resolving, always re-verify (`tsc`, tests, build) before merging and update the review verdict comment.
