# BC-9 Footer Integration — Automation refactor recipe

Concrete example from BC-9 of converting a non-compliant raw Playwright spec into the strict POM architecture required by `test-automation/INSTRUCTIONS.md`.

## Problem

The implementation MR added a raw spec:

```typescript
// test-automation/specs/frontend-integration-test/footer.spec.ts (non-compliant)
import { test, expect } from "@playwright/test";
import { BASE_URL } from "@constants/index";

test.describe("Footer Integration", () => {
  test("footer renders with API-driven email visible", async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: "load" });
    const footerEmail = page.locator('[data-testid="footer-email"]');
    await expect(footerEmail).toBeVisible();
    await expect(footerEmail).toContainText("@");
  });
});
```

Violations:
- Raw locator string in a spec.
- Inline literal `"@"`.
- Separate spec file for a layout component that appears on every page (the repo requires one spec per page/domain).

## Refactored structure

1. **Locator layer** — `test-automation/locators/footer-locators.ts`:
   ```typescript
   export const FOOTER_LOCATORS = {
     footer: '[data-testid="footer"]',
     footerEmail: '[data-testid="footer-email"]',
     // ...
   } as const;
   ```

2. **Constants layer** — `test-automation/constants/footer-constants.ts`:
   ```typescript
   export const FOOTER_TEXT = { DEFAULT_EMAIL: "...", ... };
   export const FOOTER_API_PATH = "/api/config/footer";
   export interface FooterApiResponse { ... }
   ```

3. **Page object** — `test-automation/pages/frontend/footer-page.ts`:
   - Injects `InitializationPage` and `ApiHelper`.
   - `assertFooterRendersFromApi()` calls the live API, validates the response shape/status, and asserts the rendered footer matches the API values.

4. **Fixture** — `test-automation/fixtures/ui-fixtures.ts`:
   - Extends Playwright `test` with `footerPage: FooterPage`.

5. **Spec** — `test-automation/specs/frontend-integration-test/home-page.spec.ts`:
   - Adds one line: `test("footer renders with API-driven contact details", async ({ footerPage }) => { await footerPage.assertFooterRendersFromApi(); });`

6. **Delete** the raw `footer.spec.ts`.

## Verification

- `npx tsc --noEmit` inside `test-automation/` must pass.
- `BASE_URL=http://localhost:3000 npx playwright test specs/frontend-integration-test/home-page.spec.ts --project=frontend-integration-test` must pass.
- Existing backend tests should still pass.

## Branch naming

Use the QA subtask key, not the parent implementation key:
```
Automation/BC-71/Footer-Integration
```

Where BC-71 is the QA subtask named "QA Testing for BC-9".

## Key takeaway

When an `INSTRUCTIONS.md` mandates strict POM, do not add raw specs during implementation. Either:
- Add the full POM page object + locator + constant + fixture + spec line during implementation, or
- Add only unit/component tests during implementation and let the Automation SDET create the POM coverage in a dedicated branch.

Mixing raw specs into a merged implementation branch forces a refactor PR and delays marking the parent ticket Done.
