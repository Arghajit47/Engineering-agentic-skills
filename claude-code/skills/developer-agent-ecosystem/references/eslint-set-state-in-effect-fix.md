# Fixing react-hooks/set-state-in-effect

## The Error

```
Error: Calling setState synchronously within an effect can trigger cascading renders
```

ESLint's `react-hooks/set-state-in-effect` rule flags any `useEffect` that
calls a function which synchronously calls `setState` before an `await`.

## Root Cause

A `useCallback`-wrapped fetch function calls `setIsLoading(true)` and
`setApiError(null)` synchronously at the top — before the `await fetch()`.
When `useEffect` calls that function, the linter traces the synchronous
`setState` calls back to the effect body.

```tsx
// BAD — fetchProperties calls setState synchronously
const fetchProperties = useCallback(async () => {
  setIsLoading(true);   // ← synchronous setState
  setApiError(null);    // ← synchronous setState
  const res = await fetch(...);
  // ...
}, []);

useEffect(() => {
  fetchProperties("", "All", 1);  // ← lint error here
}, [fetchProperties]);
```

## Why tsc + build Don't Catch It

- `tsc --noEmit` type-checks types, not React hooks rules
- `next build` runs TypeScript compilation, not ESLint
- Only `npx eslint` or the IDE catches this

## Fix: Inline the Initial Fetch

Move the fetch logic directly into the `useEffect` with a cancellation guard.
The initial state already has `isLoading: true` and `apiError: null` from
`useState`, so those synchronous sets are redundant for the initial load.
Move `setApiError(null)` to after the `await res.ok` check (clearing a
previous error on successful recovery).

```tsx
useEffect(() => {
  let cancelled = false;
  const params = new URLSearchParams({
    search: "",
    type: "All",
    page: "1",
    limit: String(ITEMS_PER_PAGE),
  });

  fetch(`/api/properties?${params.toString()}`)
    .then((res) => {
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json() as Promise<PropertiesApiResponse>;
    })
    .then((json) => {
      if (cancelled) return;
      setApiError(null);  // ← after await, not synchronous
      setProperties(json.items.map(toProperty));
      setTotalItems(json.total);
    })
    .catch((err) => {
      if (cancelled) return;
      console.error("[PropertiesPage] initial fetch error:", err);
      setApiError("Unable to load properties. Please try again later.");
    })
    .finally(() => {
      if (!cancelled) setIsLoading(false);
    });

  return () => { cancelled = true; };
}, []);
```

## Key Points

1. The `cancelled` flag prevents state updates after unmount
2. All `setState` calls are inside `.then()`/`.catch()`/`.finally()` — after `await`, not synchronous
3. The `fetchProperties` callback still exists for `handleSearch` and `handlePageChange` — those callers set `isLoading` themselves before calling it, so removing the synchronous sets from `fetchProperties` doesn't break them
4. `setApiError(null)` moves to the success path (after `res.ok`) so it clears on recovery, not before the fetch

## Verification

```bash
npx eslint src/app/properties/page.tsx  # must exit 0
npx tsc --noEmit                         # must exit 0
npx vitest run                           # must pass
npm run build                            # must exit 0
```