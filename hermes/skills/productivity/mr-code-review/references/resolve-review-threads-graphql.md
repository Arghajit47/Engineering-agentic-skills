# Resolving GitHub Review Threads via GraphQL

GitHub does **not** mark a review thread as resolved when you reply to it. A reply alone leaves the thread open. You must explicitly call `resolveReviewThread` (the same mutation the web UI's "Resolve conversation" button uses).

## Fetch all unresolved thread IDs

```graphql
{
  repository(owner: "{{GITHUB_OWNER}}", name: "{{PROJECT_NAME}}") {
    pullRequest(number: 10) {
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

## Resolve a single thread

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

## Python script for bulk resolve

Use this when a PR has many inline comments and the web UI would be tedious:

```python
import requests
import json
import os

with open(os.path.expanduser('~/.env')) as f:
    for line in f:
        if line.startswith('GITHUB_TOKEN='):
            token = line.strip().split('=', 1)[1]
            break

url = 'https://api.github.com/graphql'
headers = {'Authorization': f'Bearer {token}'}

# 1. Fetch unresolved threads
query = '''
{
  repository(owner: "{{GITHUB_OWNER}}", name: "{{PROJECT_NAME}}") {
    pullRequest(number: 10) {
      reviewThreads(first: 100) {
        nodes { id isResolved }
      }
    }
  }
}
'''

r = requests.post(url, headers=headers, json={'query': query})
data = r.json()
threads = data['data']['repository']['pullRequest']['reviewThreads']['nodes']
unresolved = [t['id'] for t in threads if not t['isResolved']]

# 2. Resolve each thread
mutation = '''
mutation($id: ID!) {
  resolveReviewThread(input: {threadId: $id}) {
    thread { id isResolved }
  }
}
'''

for tid in unresolved:
    r = requests.post(url, headers=headers, json={'query': mutation, 'variables': {'id': tid}})
    if r.status_code == 200 and 'errors' not in r.json():
        print(f'resolved {tid}')
    else:
        print(f'failed {tid}: {r.status_code} {r.text[:200]}')
```

## Verification

Re-query `reviewThreads` and confirm `isResolved: true` for every thread before merging.

## Merge gate

**Rule:** A PR must have zero unresolved review threads before `gh pr merge`. This applies even in self-review setups.

## Related

See `quality-analyst/references/bc6-automation-skeleton-reuse.md` for a real case where this script resolved 37 threads after domain-cleanup fixes.
