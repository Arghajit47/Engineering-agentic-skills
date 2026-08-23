# Review Final Branch State and Live Smoke Test

Session: KAN-43 contact page integration + frontend rebuild.

## Problem

The integration sub-agent completed and raised MR #65. The senior dev then
widened scope ("frontend is also in scope because the current UI mismatches
Figma"), rebuilt `ContactHeader` and `GeneralContactForm`, and pushed more
commits on top. The ticket was almost transitioned to Code Review / QA before
the MR was actually reviewed against the final branch state. The user's
feedback: "you skipped the MR review completely."

## Lesson

A PR's title/body and the original sub-agent report describe the *starting*
state of the branch, not the state at review time. For full-stack / integration
PRs especially, always verify the final branch diff before posting a verdict.

## Recovery recipe

1. **Switch to the actual PR branch / head**
   ```bash
   git fetch origin pull/<N>/head:pr-<N>
   git checkout pr-<N>
   git diff main...pr-<N> --stat
   ```

2. **Read every changed file end-to-end**
   Use `read_file`, not diff alone. Pay special attention to files the
   sub-agent did not touch but that were modified later (e.g. rebuilt
   components, review fixes, constants alignment).

3. **Run the verification suite on the final branch**
   - `npx tsc --noEmit` (root)
   - `npx tsc --noEmit` (any sub-package, e.g. `test-automation/`)
   - `npm run build`
   - unit / route tests for the touched areas
   - `eslint` on changed frontend files

4. **Run a live server smoke test for integration PRs**
   Unit tests alone do not prove the frontend calls the backend correctly or
   that the real build renders the page.

   ```bash
   # build first
   npm run build

   # start production server in background
   npm start -- --port 3000

   # in another shell
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/contact
   curl -s http://localhost:3000/api/offices | head -c 200
   curl -s http://localhost:3000/api/gallery | head -c 200
   curl -s -o /dev/null -w "%{http_code}" -X POST \
     -H "Content-Type: application/json" \
     -d '{"inquiryType":"general","name":"Test","email":"test@example.com","phone":"+15551234567","message":"x"}' \
     http://localhost:3000/api/contact/general

   # stop server
   lsof -ti:3000 | xargs kill -9
   ```

5. **Apply any blockers found during the review directly to the branch**
   In this session: `ContactHeader.tsx` had a malformed `tel:` href
   (`tel:+112****7890` → `tel:+11234567890`). Fix, commit, push, re-verify.

6. **Only then post the verdict and merge**
   - Write the review to a `.md` file (not JSON).
   - Use `gh pr comment <N> --body-file <review>.md`.
   - If self-review (author == reviewer), use `gh pr review --comment`, not
     `--approve` (GitHub blocks self-approval).
   - Merge with `gh pr merge <N> --squash --delete-branch`.

7. **Verify merge state**
   ```bash
   gh pr view <N> --json state,mergedAt,mergeCommit
   # expect "state":"MERGED"
   ```

## When to use

- The user says a review was skipped.
- Scope widened after the original MR was raised.
- A senior dev pushed additional commits/fixed sub-agent work before review.
- The PR touches frontend + backend integration (API calls, form submission,
  data fetching).

## Signs the review state is stale

- PR title does not mention frontend changes but the diff contains them.
- `git diff main...pr-<N>` shows commits not reflected in the PR body.
- Sub-agent completion report references an old SHA.
- Jira status is Code Review / In Testing but no review comment exists on GitHub.
