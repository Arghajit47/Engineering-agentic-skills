# Testing Debounced Fetch with React + Vitest + happy-dom

## Problem

When a component debounces an API fetch (e.g. 300ms `setTimeout` before `fetch`), the loading state may not flip to `true` until the debounced callback fires — which means `waitFor(() => !loading)` resolves immediately against stale data because the skeleton never appeared in the first place.

## Symptoms

Tests for filter/search/pagination pass the initial-load test but fail on subsequent interactions:
- "expected 6 to be 2" (stale data, filter didn't take effect)
- "Unable to find [data-testid=no-properties]" (empty state never rendered)
- The `waitFor` timeout fires before the debounce+fetch cycle completes

## Fix

Set `isLoading = true` synchronously in the event handler, BEFORE the debounce timer fires:

```tsx
const handleSearch = useCallback((query: string, type: string) => {
  setSearchQuery(query);
  setPropertyType(type);
  setCurrentPage(1);
  setIsLoading(true);  // ← THIS LINE — sync, before the setTimeout

  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => {
    fetchProperties(query, type, 1);
  }, DEBOUNCE_MS);
}, [fetchProperties]);
```

Same pattern for pagination — set `isLoading(true)` before calling `fetchProperties`, not just inside `fetchProperties`:

```tsx
const handlePageChange = useCallback((page: number) => {
  setCurrentPage(page);
  setIsLoading(true);  // ← sync, before fetch
  fetchProperties(searchQuery, propertyType, page);
}, [fetchProperties, searchQuery, propertyType]);
```

## Why

`fetchProperties` sets `isLoading(true)` at the top, but with debounced search the function doesn't execute until 300ms later. The test's `waitFor` sees the component still in its non-loading state (from the previous successful fetch) and returns immediately — the skeleton never shows, and the assertion runs against the old data. Setting `isLoading(true)` synchronously in the handler ensures the skeleton renders immediately, giving `waitFor` something to detect.

## Test Pattern

Mock `global.fetch` with `vi.stubGlobal` in `beforeEach`. Build a helper that parses URL search params from the fetch URL and returns filtered/paginated mock data matching the real API's response shape (`{ items, total, page, limit }`). Use `waitFor` with a generous timeout (2000ms) to account for the debounce delay.

```ts
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const u = new URL(url, "http://localhost");
    const search = u.searchParams.get("search") ?? "";
    // ... parse params, return mock response
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ items, total, page, limit }) } as Response);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });
```