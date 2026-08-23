# Case Study: KAN-34 Automation SDET — Constant Layer Correction

## Context
KAN-34 was an Integration story: wire the property details page to the live API and ensure the inquiry form submits to `/api/contact/property`.

After manual Integration QA passed, the Automation SDET sub-agent created a new Playwright spec. The first draft placed literals directly in the spec file:

```typescript
const PROPERTY_SLUG = "modern-villa-in-sunset-hills";
const DB_PATH = process.env.E2E_DB_PATH || "../prisma/dev.db";
```

## User correction
> "should not be happening, read the test-automation/INSTRUCTIONS.md"

The repo's `test-automation/INSTRUCTIONS.md` Rule 4 and Rule 9 forbid hardcoded text/numbers/paths in specs. All static values must live in the constants layer.

## Fix applied

1. Read `test-automation/INSTRUCTIONS.md` fully before creating more files.
2. Added a single source-of-truth constant in `test-automation/constants/properties-constants.ts`:
   ```typescript
   export const PROPERTY_DETAILS = {
     SLUG: "modern-villa-in-sunset-hills",
     INQUIRY_NAME: "Automation SDET",
     INQUIRY_EMAIL: "sdet+automation@example.com",
     INQUIRY_PHONE: "+1 555 000 1234",
     INQUIRY_MESSAGE: "Interested in this property for automated regression testing.",
   } as const;
   ```
3. Exported it through `test-automation/constants/index.ts`.
4. Removed `DB_PATH` from the spec entirely. The form-submit test asserts the real browser POST returns 201 via `page.waitForResponse`, which is sufficient evidence that the UI is wired to the endpoint. No direct DB query needed in the spec.
5. Updated the page object to import `PROPERTY_DETAILS` from `@constants/index` and used it for slug, route, form payload, and breakpoints.

## Final spec shape

```typescript
import { test } from "@fixtures/ui-fixtures";

test("Property details page renders live API data", async ({ propertyDetailsPage }) => {
  await propertyDetailsPage.assertLiveApiDataValidation();
});

test("Property details inquiry form submits", async ({ propertyDetailsPage }) => {
  await propertyDetailsPage.assertInquiryFormSubmission();
});

test("Property details page is responsive at all breakpoints", async ({ propertyDetailsPage }) => {
  await propertyDetailsPage.assertResponsiveLayout();
});

test("Property details page has no console or image errors", async ({ propertyDetailsPage }) => {
  await propertyDetailsPage.assertNoConsoleOrImageErrors();
});
```

## Lessons

- **Always read `test-automation/INSTRUCTIONS.md` first** when extending an existing automation package. It overrides generic POM guidance.
- **Specs must contain zero logic and zero literals.** If a value appears in a spec, it belongs in `constants/`.
- **DB assertions in specs are usually unnecessary for form integration tests.** Capturing the actual browser request/response is stronger evidence and keeps specs clean. Direct DB reads belong in backend API specs or page-object helpers, not in UI integration specs.
- **Use `page.waitForResponse` for form submissions** to prove the UI triggered a real network call, then assert status/body. Standalone `ApiHelper` checks alone do not prove the form is wired.

## Verification

- `npx tsc --noEmit` in `test-automation/` → 0 errors
- `BASE_URL=http://localhost:3000 npm test` in `test-automation/` → 28/28 passed (22 UI + 6 API)
