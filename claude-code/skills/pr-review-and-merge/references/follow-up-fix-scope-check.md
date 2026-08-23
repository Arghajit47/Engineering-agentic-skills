# Follow-up fix scope check

Session: KAN-34 Property Details Gallery & Details integration.

## Scenario

1. Original MR #58 for KAN-34 was reviewed, approved, and merged.
2. Post-merge QA found TC-010: the `PropertyInquiryForm` on `/properties/[slug]`
   rendered a success state but never POSTed to `/api/contact/property` because the
   page rendered it without an `onSubmit` handler.
3. A fix was committed locally, then accidentally pushed directly to `main`.
4. Recovery:
   - `git revert` the direct commit on `main` and push.
   - Re-apply the fix on the feature branch.
   - Update the existing MR (or open a fresh one) with the corrected diff.
5. During review of the follow-up MR (#59), the PR diff initially did not include
   the inquiry-form fix because the branch still pointed at the original
   integration commit. The reviewer must push the fix to the branch before
   approving.

## Recovery commands

```bash
# On main: revert the accidental direct commit
git checkout main
git pull origin main
git revert --no-edit <direct-fix-sha>
git push origin main

# On feature branch: re-apply / verify the fix
git checkout <feature-branch>
git log main..HEAD --oneline   # confirm the fix commit is here
# if missing, cherry-pick or rewrite it here
git push origin <feature-branch>
```

## Lesson

Before approving any MR whose title claims a specific bug fix, inspect the diff
with `git diff main...pr-<N>` and read the changed files. If the claimed fix is
not present, update the branch first. Do not post an approval for a description
that does not match the code.

## Verification used this session

- `npx tsc --noEmit` — clean
- `npm test` — 480/480 passed (after `npm run seed` and starting `npm start`)
- `npm run build` — clean
- Playwright end-to-end: form submit → 201 → DB row persisted
