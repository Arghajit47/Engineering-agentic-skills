# SWR Hydration Guard for Presentational Components with `data`/`isLoading` Props

## Problem

A presentational client component is refactored to self-fetch with SWR, but it keeps `data?` and `isLoading?` props so existing tests and parent pages can still drive it explicitly. The SWR hook uses a key that is `null` during SSR:

```ts
export function useFeaturedProperties() {
  return useSWR<FeaturedProperty[]>(
    typeof window !== "undefined" ? "/api/properties/featured" : null,
    rawArrayFetcher,
  );
}
```

Server render: key is `null` → SWR returns `{ data: undefined, error: undefined, isLoading: false }`. Component renders the **empty** state.

First client paint: key is active → SWR returns `{ data: undefined, error: undefined, isLoading: true }`. Component renders the **loading skeleton**.

React hydration error #418: the server HTML and the first client HTML do not match.

## Fix (component-level guard)

1. Extract a shared `useMounted` hook using `useSyncExternalStore`:

```ts
// src/lib/use-mounted.ts
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useMounted() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

2. Inside the self-fetching component, compute loading state so the server and the initial client paint both render the skeleton:

```tsx
export function FeaturedProperties({
  data,
  isLoading: isLoadingProp,
  ...
}: FeaturedPropertiesProps) {
  const mounted = useMounted();
  const { data: fetchedData, isLoading: isFetching, error, mutate } = useFeaturedProperties();
  const properties = useMemo(() => data ?? fetchedData ?? [], [data, fetchedData]);
  const isLoading = isLoadingProp ?? (mounted ? isFetching : true);

  // render skeleton when isLoading, empty/error otherwise
}
```

Why this works:
- During SSR `mounted` is `false` → `isLoading` becomes `true` → skeleton rendered.
- During first client paint `mounted` is still `false` (server snapshot) → same skeleton.
- After hydration `mounted` flips to `true` → SWR's real `isFetching` drives the UI.
- When a parent passes `isLoading={false}` and `data={[...]}`, the prop still wins.

## Test implications

- Unit tests that pass `data` + `isLoading` explicitly are unaffected.
- Tests that rely on the SWR mock returning loaded data immediately may briefly see the skeleton. Use `waitFor` to assert the loaded content, or set the mock before first render and let `useSyncExternalStore` hydrate in the same tick (it usually does in jsdom).

## Verification

Always verify the fix with Playwright against a **local build**, not the deployed URL:

```bash
cd test-automation
BASE_URL=http://localhost:3000 npx playwright test specs/frontend-integration-test/home-page.spec.ts --reporter=line
```

The deployed production URL lags behind the branch and will still show the old hydration error.

## Origin

This pattern was refined fixing KAN-82 in the Estatein repo after the KAN-52 integration refactor made `FeaturedProperties` and `Testimonials` self-fetching.
