# QA Automation Code Architecture Compliance for Integration Tickets

This reference captures the strict architecture rules enforced by `test-automation/INSTRUCTIONS.md` in the Banking Company repo, and the concrete mistakes made on the BC-77 / PR #23 automation branch.

## What happened

PR #23 fixed a flaky CTA Section Playwright test after BC-12 integration. The first attempt constructed `:not([aria-hidden="true"])` selectors inline in `pages/frontend/home-page.ts` and added redundant `waitForSelector` calls. The user flagged this as non-compliant with INSTRUCTIONS.md. A second pass then missed several hardcoded constants, and a merge from `main` introduced duplicate/stale page-object methods that also had to be reconciled.

## Correct pattern (per INSTRUCTIONS.md)

1. **Selectors live in `locators/` (Rule 2).**
   - Bad: `const ctaHeadingReal = `${HOMEPAGE_LOCATORS.ctaHeading}:not([aria-hidden="true"])`;` inside a page object.
   - Good: add the full CSS selector to `locators/homepage-locators.ts`:
     ```ts
     ctaHeadingReal: '[data-testid="cta-heading"]:not([aria-hidden="true"])',
     ctaBodyReal: '[data-testid="cta-body"]:not([aria-hidden="true"])',
     ctaButtonReal: '[data-testid="cta-button"]:not([aria-hidden="true"])',
     ```

2. **No hardcoded routes or URLs in page files (Rule 4).**
   - Bad: `await this.initializationPage.goto("/");`
   - Good: add `UI_ROUTES.HOME` to `constants/routes.ts` (re-exported via `constants/index.ts`) and use it everywhere.

3. **No hardcoded text/attribute expectations (Rule 4).**
   - Bad: hardcoded `"/"` for button href check.
   - Good: centralize in `constants/homepage-constants.ts` (e.g., `CTA_UI.HOME_PATH`).

4. **No hardcoded query strings or API paths in page files (Rule 4).**
   - Bad: `\`${API_PATHS.CTA_CONFIG}?page=${CTA_UI.DEFAULT_PAGE_PARAM}\`` inside a page method.
   - Good: define `CTA_ENDPOINTS.HOME` in `constants/api-constants.ts` using `API_PATHS.CTA_CONFIG`.

5. **No hardcoded schema validation labels (Rule 4).**
   - Bad: `this.apiHelper.assertSchemaValid(validation, "cta config schema");`
   - Good: `CTA_SCHEMA_LABELS.CTA_CONFIG` from `constants/homepage-constants.ts`.

6. **No hardcoded viewport dimensions or animation waits (Rule 4).**
   - Bad: `await page.setViewportSize({ width: 375, height: 667 });` and `await this.initializationPage.waitForSomeTime(300);`
   - Good: `CTA_UI.MOBILE_VIEWPORT` and `CTA_UI.MENU_ANIMATION_DELAY_MS`.

7. **Integration tests validate the real API (Rule 6).**
   - Bad: asserting static `CTA_TEXT` constants only.
   - Good: call `this.apiHelper.getRequest(CTA_ENDPOINTS.HOME)` in the page object, validate `ctaConfigSchema`, then assert the UI contains the API response values.

8. **No redundant waits (Playwright locator auto-waiting).**
   - Bad: `await page.waitForSelector(...)` before `expectTextContains` / `expectVisible`.
   - Good: pass the selector to the assertion method; Playwright's locator already retries until visible/text matches.

9. **Specs remain thin wrappers (Rule 5).**
   - Move loops, API calls, and assertions into page object methods. Spec files should only declare tests and call fixture methods.

## Before resolving a review comment

1. Re-read `test-automation/INSTRUCTIONS.md` in full.
2. Scan the diff for bare strings, bare numbers, inline selector construction, raw URLs, and duplicated page-object methods.
3. Run the canonical verification suite:
   - `npx tsc --noEmit`
   - `npm run test:api`
   - `npm run test:ui`
   - `npm run test`

## Key insight

For this repo, integration tests are **backend-driven UI assertions**, not static UI smoke tests. Mirror the pattern used in `pages/frontend/footer-page.ts` for any section whose data comes from `/api/config/*`.
