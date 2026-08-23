# Integration SWR: when parent page stops fetching and components self-fetch

When an Integration ticket turns a page-level `Promise.all` fetch into per-component SWR hooks (so `FeaturedProperties`, `Testimonials`, etc. fetch their own data), the parent page and the component tests change in a few predictable ways. This note captures the pattern from KAN-52 so future Integration sub-agents (or parent agents finishing a checkpoint) don't repeat the discovery cost.

## Pattern

1. **Page simplifies.** Remove the manual `fetch` + `useState` for the data the component now owns. Keep only fetches the page still needs (e.g. `/api/settings` for heading overrides or the hero section). Pass only configuration props (`heading`, `subheading`, `onXxxClick`) to the component; do not pass `data` or `isLoading`.

2. **Component self-fetches with SWR.** Add `useFeaturedProperties()` / `useFeaturedReviews()` in `src/lib/api.ts` using a fetcher that returns the raw array directly when the backend route returns raw JSON (not `{ success, data }`). The component still accepts `data?` and `isLoading?` props for testability / SSR reuse, but defaults to the hook when props are absent.

3. **Mock files stay as type sources.** The existing `src/mocks/featured-properties.ts` / `src/mocks/testimonials.ts` can be updated to match the backend shape and used by tests as typed fixture data. The component no longer imports mock data as a default.

4. **Tests mock the hook, not `fetch`.** Use `vi.mock("@/lib/api", () => ({ useFeaturedProperties: () => mockReturnValue }))` with a mutable `vi.fn()` so each test can vary the returned `{ data, error, isLoading, mutate }` state. `vi.doMock` does not work reliably inside tests because the component is already imported; prefer a mutable mock object.

5. **Route-handler tests are required.** Add `src/app/api/<endpoint>/route.test.ts` next to the route, testing 200 response shape and 500 error handling. `vitest.config.ts` must include `src/app/**/route.test.ts`.

6. **Playwright automation constants stay aligned.** If the `test-automation/` suite asserts empty-state text (e.g. `No properties found`), update the constant in `test-automation/constants/homepage-constants.ts` to match the component's empty-state string.

## Verification gate

Run in this order before raising the MR:

```bash
cd <repo>
npm run seed
npx tsc --noEmit
npx vitest run <changed-tests>
npx eslint <changed-files>
npm run build
npm start -- --port 3000
curl -s http://localhost:3000/api/<endpoint> | head
```

## KAN-52 notes

- Backend routes `/api/properties/featured` and `/api/reviews/featured` returned raw arrays, while the codebase's shared fetcher expected `{ success, data }`. Created a dedicated `rawArrayFetcher` for those endpoints.
- Existing `page.tsx` had a `Promise.all` for both endpoints plus `/api/settings`; after refactor only `/api/settings` remained.
- **Hydration guard is required for self-fetching components.** Even though the SWR key is `null` during SSR, the client first paint activates the key and flips `isLoading` from `false` to `true`, producing React hydration error #418 (empty state server vs skeleton client). The fix is to extract a shared `useMounted` hook and treat unmounted state as loading: `const isLoading = isLoadingProp ?? (mounted ? isFetching : true)`. See `references/swr-self-fetching-component-hydration-guard.md`.
- The sub-agent exhausted its tool-call budget before commit/push/MR; the parent agent created the feature branch, added missing route/page tests, fixed `newsletterSchema` re-export type, ran the full gate, and raised MR #67.
