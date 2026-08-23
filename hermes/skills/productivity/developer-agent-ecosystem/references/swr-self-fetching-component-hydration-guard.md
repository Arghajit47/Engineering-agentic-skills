# SWR Self-Fetching Component: Hydration Guard

## Problem

A reusable client component that fetches its own data with SWR is mounted by a parent page. The SWR key is guarded with `typeof window !== "undefined"` so it is `null` during SSR and a real URL during the first client paint:

```tsx
// src/lib/api.ts
export function useFeaturedProperties() {
  return useSWR<FeaturedProperty[]>(isBrowser ? "/api/properties/featured" : null, rawArrayFetcher);
}

// src/components/home/FeaturedProperties.tsx
export function FeaturedProperties({ data, isLoading: isLoadingProp, heading, subheading }) {
  const { data: fetchedData, isLoading: isFetching } = useFeaturedProperties();
  const properties = data ?? fetchedData ?? [];
  const isLoading = isLoadingProp ?? isFetching; // ❌ hydration mismatch
  // ... renders skeleton when isLoading, else cards or empty state
}
```

Server render:
- SWR key is `null`
- `isLoading = false`
- Component renders **empty state** if no `data` prop is passed.

First client paint:
- SWR key is the real URL
- `isLoading = true`
- Component renders **loading skeleton**.

React hydration error #418: the server HTML (empty state) does not match the client HTML (skeleton).

## Correct minimal fix

Use a shared `useMounted` hook based on `useSyncExternalStore`. During SSR and the first client render it returns `false`; after hydration it returns `true`.

```tsx
// src/lib/use-mounted.ts
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useMounted() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

In the self-fetching component, treat the unmounted state as loading so server and first client paint match:

```tsx
// src/components/home/FeaturedProperties.tsx
import { useMounted } from "@/lib/use-mounted";

export function FeaturedProperties({ data, isLoading: isLoadingProp, heading, subheading }) {
  const mounted = useMounted();
  const { data: fetchedData, isLoading: isFetching } = useFeaturedProperties();
  const properties = useMemo(() => data ?? fetchedData ?? [], [data, fetchedData]);
  const isLoading = isLoadingProp ?? (mounted ? isFetching : true); // ✅ hydration safe
  // ...
}
```

Why it works:
- Server: `mounted = false` → `isLoading = true` → skeleton.
- First client paint: `mounted = false` → `isLoading = true` → skeleton (same as server).
- After hydration: `mounted = true` → SWR's real `isFetching` drives the state.

If the parent passes an explicit `isLoading` or `data` prop, the prop takes precedence so tests and SSR reuse still work.

## When to extract a shared hook

If the same `useSyncExternalStore` pattern already exists in a page component (e.g. `src/app/page.tsx`), extract it into `src/lib/use-mounted.ts` rather than duplicating it. This keeps the hydration guard DRY and makes it available to any self-fetching section component.

## Pitfall: setState-in-effect

Do NOT use `useState(false)` + `useEffect(() => setMounted(true), [])` for this guard. It triggers ESLint `react-hooks/set-state-in-effect` and is the anti-pattern that rule exists to catch.

## Verification

Run Playwright or open DevTools and confirm no React #418 `pageerror` after a hard refresh. The component's console-error test should pass.

## Real case

KAN-82 in the Estatein repo: `FeaturedProperties` and `Testimonials` self-fetched via SWR, produced hydration #418 on the home page, and failed `assertNoConsoleErrors` in `test-automation/specs/frontend-integration-test/home-page.spec.ts`. The shared `useMounted` guard fixed it.
