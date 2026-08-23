# SWR Skeleton TestID Collision

## Problem

When a component renders both a loading skeleton and real content with the same `data-testid`, Playwright text assertions fail because they read the skeleton's empty text before SWR resolves.

## Root Cause

The skeleton placeholder and the real element share a `data-testid`:

```tsx
// Skeleton (rendered during loading)
<div data-testid="cta-heading" aria-hidden="true" className="animate-pulse ..." />

// Real content (rendered after SWR resolves)
<h2 data-testid="cta-heading">Start your financial journey with YourBank today!</h2>
```

Playwright's `locator(selector)` returns the first match. If the skeleton renders first and SWR hasn't resolved, `getTextContents()` returns `""` and `expectTextContains` fails.

## Fix

Add `waitForSelector` with `:not([aria-hidden="true"])` before text assertions:

```typescript
const page = this.initializationPage.page;
await page.waitForSelector(
  `${HOMEPAGE_LOCATORS.ctaHeading}:not([aria-hidden="true"])`,
  { timeout: 10000 }
);
```

This waits for the skeleton to be replaced by the real element. The skeleton must use `aria-hidden="true"` for this selector to work.

## Concrete Example (BC-12 / BC-77)

- **Component:** `CTASection.tsx` — renders skeleton with `data-testid="cta-heading"` and `aria-hidden="true"` during SWR loading
- **Test:** `home-page.spec.ts` → `assertCtaSection()` — failed with `Expected substring: "Start your financial journey with " Received string: ""`
- **Fix:** Added `waitForSelector('[data-testid="cta-heading"]:not([aria-hidden="true"])')` and `waitForSelector('[data-testid="cta-button"]:not([aria-hidden="true"])')` before text assertions in `home-page.ts`
- **Result:** All 6 Playwright tests pass
