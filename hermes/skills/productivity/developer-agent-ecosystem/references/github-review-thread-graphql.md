# Resolving GitHub Review Threads via GraphQL

When a code review comment appears on a GitHub PR, the visible top-level comment may only be an auto-generated summary (e.g., from CodeRabbit). The **actionable** findings are stored in review threads (`pullRequest.reviewThreads`). Always query threads, not just `comments`, before deciding whether a PR has unresolved feedback.

## Query review threads

```graphql
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 10) {
            nodes {
              author { login }
              body
            }
          }
        }
      }
    }
  }
}
```

Run with `gh api graphql`:

```bash
gh api graphql -f query='...' -F owner={{GITHUB_OWNER}} -F repo={{PROJECT_NAME}} -F pr=23
```

## Reply to a thread

```graphql
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(
    input: { pullRequestReviewThreadId: $threadId, body: $body }
  ) {
    comment { id }
  }
}
```

## Resolve / unresolve a thread

The mutation name is `resolveReviewThread` / `unresolveReviewThread`, **not** `resolvePullRequestReviewThread`.

```graphql
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
```

```graphql
mutation($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
```

## Practical workflow

1. Query threads and filter by `isResolved == false`.
2. Fix the code locally.
3. Run the relevant verification (`npx tsc --noEmit`, `npm run test:ui`, etc.).
4. Commit and push.
5. Post a reply explaining the fix.
6. Resolve the thread with `resolveReviewThread`.
7. If you need to add a follow-up commit after resolving, unresolve the thread first, post the follow-up explanation, and resolve again.

## Why this matters

CodeRabbit and similar bots post a top-level summary comment that can look like a harmless "walkthrough." That summary is attached to an **unresolved review thread** containing the actual finding. Replying only to the top-level comment does not resolve the blocking review. Use the GraphQL mutations above or the GitHub UI's "Resolve conversation" button.
