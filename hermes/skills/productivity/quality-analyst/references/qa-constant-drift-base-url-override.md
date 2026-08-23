# QA Pitfall: UI Text / Constant Drift + BASE_URL Override

## When this fires

During Integration QA you run the existing Playwright spec and it fails because a heading assertion expects the old constant text while the frontend now renders new Figma-aligned copy. Example from KAN-43:

- Constant: `CONTACT_TEXT.PAGE_TITLE = "Get in Touch"`
- UI after frontend rebuild: `Get in Touch with Estatein`
- Result: `Expected: "Get in Touch"; Received: "Get in Touch with Estatein"`

This happens when frontend is rebuilt after the integration sub-agent wrote automation against the old copy.

## Fix

Update the constant in `test-automation/constants/*-constants.ts` to match the live UI text. Do not change the UI to match an outdated constant unless the UI text is actually wrong.

## Prevention

When rebuilding UI to match Figma, scan the `test-automation/constants/` layer for any text that references the old copy and update it in the same branch. Run the affected Playwright spec locally before raising the frontend MR.

## Local BASE_URL override recipe

If the automation package hardcodes a production `BASE_URL` and `ApiHelper` / `BaseAPI` instantiate `request.newContext({ baseURL: BASE_URL })`, local QA hits the deployed site instead of the branch.

Minimal fix (env override, no constant edit):

```typescript
// test-automation/base/api-base.ts
const API_BASE_URL = process.env.BASE_URL || BASE_URL;
```

Then replace every `BASE_URL` usage inside `ApiHelper` and `BaseAPI` with `API_BASE_URL`. Run tests with:

```bash
cd test-automation
BASE_URL=http://localhost:3000 npx playwright test specs/frontend-integration-test/contact-page.spec.ts
```

If the repo already supports `process.env.BASE_URL`, just verify it before assuming the test is exercising the branch.

## Evidence to post

In the QA subtask comment, note:
- The constant that drifted.
- Whether the fix was applied in the automation branch or the parent MR.
- That the Playwright spec now passes against `http://localhost:3000`.

---

See also: `references/contact-form-qa-reviewer-override.md` for handling reviewer comments that override the recommended form-submission evidence pattern.
