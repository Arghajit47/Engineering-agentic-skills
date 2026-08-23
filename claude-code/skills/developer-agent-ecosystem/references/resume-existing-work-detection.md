# Detecting a prior run's work before re-dispatching a sub-agent

Cited by the main agent's **Resume Detection** step. A fresh `/developer <KEY>` frequently
lands on a ticket an earlier (interrupted) session already advanced: plan attached, branch
pushed, commit made, sometimes an open MR. Re-dispatching the implementation sub-agent
there wastes tokens and risks duplicate or force-pushed work.

## The four checks

```bash
KEY=BC-186; REPO=~/Code/{{PROJECT_NAME}}; cd $REPO

# 1. Was analysis already done? (plan comment / attached instructions.txt)
curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" \
  "https://{{ATLASSIAN_SITE}}/rest/api/2/issue/$KEY?fields=comment,attachment" \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['fields']; \
print('attachments:', [a['filename'] for a in d['attachment']]); \
print('comments:', len(d['comment']['comments']))"

# 2. Does a compliant branch exist, local or remote?
git branch -a --list "*${KEY}*"; git status -sb

# 3. Are there commits on it beyond main?
BR=$(git branch -a --list "*${KEY}*" | head -1 | sed 's/^[* ]*//;s|remotes/origin/||')
git log origin/main..$BR --oneline

# 4. Is there already an MR?
gh pr list --head "$BR" --state all --json number,url,state,mergedAt
```

## Decision table

| Branch | Commits | MR | Action |
|---|---|---|---|
| none | — | — | Normal flow: analyse, attach plan, dispatch sub-agent. |
| exists | none | none | Branch was cut and abandoned. Dispatch the sub-agent onto the existing branch — do not cut a second one (Husky allows only one name per key). |
| exists | yes | none | **Do not re-dispatch.** Verify, then open the MR yourself and hand to review. |
| exists | yes | open | **Do not re-dispatch.** Verify, transition to In Review, hand to review. |
| exists | yes | merged | Work is done. Verify it is in `main`, then move the ticket toward In Testing / QA. |

**This is not the deprecated Direct-Fix Shortcut.** The sub-agent still did the
implementation in the prior run; the main agent is only verifying and moving status —
explicitly within its allowed duties.

## What "verify" means here

```bash
git diff main...$BR --stat          # scope is what the ticket claims, nothing more
npx tsc --noEmit
npx eslint <changed files>
npx vitest run --project unit      # --project unit if you are in a worktree
gh api "repos/<owner>/<repo>/commits/$(git rev-parse $BR)/check-runs" \
  -q '.check_runs[] | "\(.name): \(.conclusion)"'
```

Also confirm the DOD items the prior run may have skipped — in particular that class/copy
changes updated their `*.test.tsx` in the same commit, since that omission blocks the
Netlify deploy.

## Never trust a "merged" claim

Sub-agents report merges that did not happen. Always confirm with live state:

```bash
gh api repos/<owner>/<repo>/pulls/<N> -q '.state,.merged,.merge_commit_sha'
git checkout main && git pull origin main && git log --oneline -5
```

Both must agree before the parent ticket moves to In Testing. Full recipe:
`subagent-merge-claim-verification.md`.

## Reviewer-merge-permission fallback

If the reviewer account (`{{GITHUB_REVIEWER_ACCOUNT}}`) approves but cannot merge, merge with the
ambient author `gh` login — see `github-reviewer-merge-permission-fallback.md`. And if
`gh pr merge` itself fails with a 503, GraphQL is down and REST still works:
`pr-review-and-merge/references/github-graphql-outage-rest-fallback.md`.
