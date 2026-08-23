# SWR + Client Component Hydration Mismatch Fix

## Problem

A client component that fetches with SWR often uses a key that is `null` during SSR and only becomes active in the browser:

```tsx
const { data, error, isLoading } = useSWR(
  typeof window !== "undefined" ? "/api/about-us" : null,
  fetcher,
);
```

During SSR, SWR sees `null` and returns `{ data: undefined, error: undefined, isLoading: false }`. The component therefore renders the **empty** state server-side.

During the first client paint, the key is `"/api/about-us"`, so SWR returns `{ data: undefined, error: undefined, isLoading: true }`. The component wants to render the **loading** skeleton.

The two trees differ, so React reports a hydration mismatch. In development, Next.js prints a diff showing the empty-state wrapper replaced by the loading-state wrapper. The mismatch can also prevent the UI from ever updating to the loaded data.

## Wrong fix

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => {
  setMounted(true);
}, []);
```

This avoids the hydration mismatch by rendering the same fallback until after mount, but it triggers ESLint rule `react-hooks/set-state-in-effect` and is the anti-pattern the rule exists to catch.

## Correct minimal fix

Use `useSyncExternalStore`. It returns the same snapshot during SSR and the first client paint (`false`), then `true` after hydration. No effect, no setState-in-effect lint error.

```tsx
"use client";

import { useSyncExternalStore } from "react";
import { useAboutUs } from "@/lib/api";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function AboutUsPage() {
  const isClient = useIsClient();
  const { data, error, isLoading, mutate } = useAboutUs();

  // Show the loading skeleton on both server and first client paint.
  // After hydration, SWR drives the real loading/error/data states.
  if (!isClient || isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorUi message={error.message} onRetry={() => void mutate()} />;
  }

  if (!data) {
    return <EmptyUi />;
  }

  return <Sections data={data} />;
}
```

## Why this works

React calls the server snapshot during SSR and on the first client render, so both sides emit identical HTML. After hydration, the client snapshot (`true`) is used and SWR can revalidate normally.

## Unit test update

Tests that mock `useSWR` and immediately assert the loaded UI will now see the loading skeleton first because `useSyncExternalStore` returns `false` until the test advances past hydration.

Flush the store with Vitest fake timers:

```tsx
import { vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderAndHydrate(ui: React.ReactElement) {
  render(ui);
  vi.advanceTimersByTime(0); // flush useSyncExternalStore hydration
}

it("renders sections from fetched data", () => {
  mockUseSWR.mockReturnValue({
    data: mockData,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  });
  renderAndHydrate(<AboutUsPage />);
  expect(screen.getByTestId("about-us-page")).toBeInTheDocument();
});
```

## E2E test implication

Page-object assertions that count elements must wait for the loaded content to replace the skeleton. Use Playwright auto-waiting locators:

```ts
async assertContentCounts() {
  const page = this.initializationPage.page;
  await expect(page.locator(ABOUT_US_LOCATORS.aboutUsPage)).toBeVisible({ timeout: 10000 });
  await expect(page.locator(ABOUT_US_LOCATORS.journeyStat)).toHaveCount(ABOUT_US_COUNTS.JOURNEY_STATS);
  await expect(page.locator(ABOUT_US_LOCATORS.valuesCard)).toHaveCount(ABOUT_US_COUNTS.VALUE_CARDS);
  await expect(page.locator(ABOUT_US_LOCATORS.achievementsCard)).toHaveCount(ABOUT_US_COUNTS.ACHIEVEMENT_CARDS);
}
```

## References

- React docs: `useSyncExternalStore`
- ESLint plugin `react-hooks`: `set-state-in-effect` rule
- This pattern was verified on KAN-22 (About Us Our Story integration) in the Estatein repo.
