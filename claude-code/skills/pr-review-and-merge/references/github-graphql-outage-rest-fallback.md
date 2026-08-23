# When GitHub's GraphQL API is down, `gh pr` breaks but REST still works

Hit repeatedly during BC-181 → BC-188 (2026-08-15..18). GitHub returned `503` from the
GraphQL endpoint for a sustained period. Because `gh pr create`, `gh pr merge`, `gh pr view`
and `gh pr review` are all GraphQL-backed, the entire PR half of the CLI failed while the
REST API was completely healthy.

**Symptom:** `gh pr create` / `gh pr merge` fail with a 503 or "GraphQL: Something went
wrong". Retrying does not help. `gh api repos/...` calls in the same shell succeed.

**Do not** conclude the merge is blocked, and do not push to `main` to work around it.

## Create a PR via REST

```bash
python3 - <<'PY'
import json
json.dump({
  "title": "BC-186 / BC-187 — hero image visible in the 768-1439 band",
  "head":  "Fix/BC-186/Hero-Sections",
  "base":  "main",
  "body":  open('/tmp/pr-body.md').read(),
}, open('/tmp/pr.json','w'))
PY

gh api repos/<owner>/<repo>/pulls -X POST --input /tmp/pr.json -q '.number,.html_url'
```

Build the JSON with `python3`/`jq`, never by string-interpolating a markdown body into a
shell heredoc — backticks in the body are command substitution, and the body will be
garbled or will execute code (see the `gh pr create --body` pitfall in the main skill).

## Comment via REST

```bash
python3 -c "import json;json.dump({'body':open('/tmp/review.md').read()},open('/tmp/c.json','w'))"
gh api repos/<owner>/<repo>/issues/<N>/comments -X POST --input /tmp/c.json -q .id
```

Note the endpoint is `/issues/<N>/comments` for a conversation comment — `/pulls/<N>/comments`
is for *inline* review comments and requires a commit SHA, path and position.

## Merge via REST

```bash
gh api repos/<owner>/<repo>/pulls/<N>/merge -X PUT -f merge_method=squash \
  -q '"merged=\(.merged) sha=\(.sha)"'
```

## Read state via REST (replaces `gh pr view --json`)

```bash
gh api repos/<owner>/<repo>/pulls/<N> -q '.state,.merged,.head.sha,.mergeable_state'

# CI conclusion for the head SHA — replaces `gh pr checks`
sha=$(gh api repos/<owner>/<repo>/pulls/<N> -q .head.sha)
gh api "repos/<owner>/<repo>/commits/$sha/check-runs" \
  -q '.check_runs[] | "\(.name): \(.conclusion)"'
```

That last command is the one to reach for anyway — it is the CI-green gate, and it works
whether or not GraphQL is up.

## What has no REST equivalent

**Resolving review threads is GraphQL-only** (`resolveReviewThread`). During an outage you
cannot resolve threads. Reply to each thread via REST, state in the merge comment that
threads could not be marked resolved due to the API outage, and resolve them once GraphQL
recovers. Do not treat unresolvable-due-to-outage as resolved.

## Also worth knowing

- Squash-merging via REST does **not** delete the branch. Delete it explicitly:
  `gh api repos/<owner>/<repo>/git/refs/heads/<branch> -X DELETE`.
- The self-approval block (`422: Can not approve your own pull request`) is enforced at the
  identity layer and is unrelated to the outage — see `self-approval-fallback.md`.
