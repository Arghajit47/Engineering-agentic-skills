# Local test-automation layout — Estatein project

This reference captures the actual structure of the `test-automation/` package in the Estatein repo so future agents don't waste time looking for files that don't exist.

## Layout

```
test-automation/
  constants/
    index.ts          # barrel file: BASE_URL, API_PATHS, UI_ROUTES, VIEWPORTS, SEED_COUNTS, etc.
    homepage-constants.ts
    properties-constants.ts
    api-constants.ts
  locators/
    homepage-locators.ts
    propertiespage-locators.ts
  pages/frontend/
    home-page.ts
    properties-page.ts
  specs/frontend-integration-test/
    home-page.spec.ts
    properties-page.spec.ts
  fixtures/
    ui-fixtures.ts
    api-fixtures.ts
  base/
    ui-base.ts        # InitializationPage with generic assertion helpers
    api-base.ts       # ApiHelper with REST helpers
```

## Key facts

- There is **no** `test-automation/constants/test-constants.ts` and **no** `KNOWN_PAGES` constant in this repo.
- Registered UI routes live in `test-automation/constants/index.ts` as `UI_ROUTES` and currently include:
  - `HOME: "/"`
  - `EMPTY_PROPERTIES: "/test-harness/empty-properties"`
  - `EMPTY_REVIEWS: "/test-harness/empty-reviews"`
  - `LOADING: "/test-harness/loading"`
  - `PROPERTIES: "/properties"`
  - `SERVICES: "/services"`  ← added by KAN-17
- New genuinely new routes must be added to `UI_ROUTES` in `test-automation/constants/index.ts` as part of the same Frontend ticket that creates the route, or QA's visual regression baseline will never look at the page.
- `test-automation/pages/frontend/` is where page objects for integration tests go (mirrors the pattern in `home-page.ts` / `properties-page.ts`).
- `test-automation/specs/frontend-integration-test/` is where the `.spec.ts` test files go.
- `test-automation/locators/` holds data-testid selectors; `test-automation/constants/` holds the expected text/count values.
- The `base/ui-base.ts` `InitializationPage` class already provides generic helpers: `assertNoConsoleErrors`, `assertNoImage404s`, `assertGridTrackCount`, `validateCardsDataAgainstApi`, `mockJsonResponse`, `mockAbortRoute`, `mockDelayRoute`, etc.

## When adding a new page integration test

1. Add route to `UI_ROUTES` in `test-automation/constants/index.ts` (if new route).
2. Create `test-automation/constants/<page>-constants.ts` with expected text/counts.
3. Create `test-automation/locators/<page>-locators.ts` with data-testid selectors.
4. Create `test-automation/pages/frontend/<page>-page.ts` page object importing constants/locators.
5. Add fixture wiring in `test-automation/fixtures/ui-fixtures.ts` if a new fixture is needed.
6. Create `test-automation/specs/frontend-integration-test/<page>-page.spec.ts`.

## API helpers

- `ApiHelper.getRequest(path)` fetches from `BASE_URL + path`.
- `API_PATHS` in `test-automation/constants/index.ts` lists known backend endpoints.
