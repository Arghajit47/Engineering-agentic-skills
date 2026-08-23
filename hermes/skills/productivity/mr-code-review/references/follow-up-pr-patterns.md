# Follow-up PR Patterns

Real examples of small but avoidable follow-up PRs that escaped the initial review.

## 1. Typo / constant drift between runtime and test mocks

**Scenario:** A PR fixes a typo in a runtime default constant (e.g. `hello@skillbirdge.com` → `hello@skillbridge.com`). The same typo is duplicated in a test mock default config, but only the runtime file is changed.

**Result:** The initial PR passes all tests because the test uses the same typo as the mock. After merge, the inconsistency remains and a second PR is needed to clean it up.

**Prevention during review:**

```bash
# Search both the old (wrong) and new (correct) values across the whole repo
search_files --pattern "skillbirdge|skillbridge" --target content --path .
# or
grep -R "skillbirdge" --include="*.{ts,tsx,js,jsx,json,md}" .
```

Do not approve until the old value is gone from every source file, test file, and automation constant where the new value should appear.

**Related discipline:** Whenever you change a hard-coded string, color, email, URL, or phone number in runtime code, assume it is also duplicated in:
- Unit test mocks and fixtures
- Storybook args
- Playwright / automation constants and page objects
- API route tests
- README / docs examples

Run the search before merging.

## 2. Self-review and follow-up branches

When reviewer == author, the merge can happen via comment + `gh pr merge`. But self-review is more likely to miss fixture drift because the author already knows the "intent" and skims the test files. Add an explicit step: re-read every changed test file for hard-coded values that should match the runtime change.

If a bug is discovered after merge, open a new branch from `main`, fix it, open a new PR, and run `pr-review-and-merge` again. Never rewrite `main` history.
