# Case Study: KAN-22 / KAN-72 About Us Our Story Integration QA

A real integration QA run that demonstrates how a single React hydration error can block a "console/hydration errors" acceptance criterion even when all other tests pass.

## Context

- Parent ticket: **KAN-22** — [Integration] About Us Our Story
- QA subtask: **KAN-72** — QA Testing for KAN-22
- Scope: wire existing `about-us` page components to the new `GET /api/about-us` endpoint.
- Stack: Next.js 16.2.11, React 19.2.4, SWR, Tailwind, Prisma/SQLite, Playwright.

## What passed

1. `npm run build` — clean production build, 21 routes generated.
2. `npm test` — 168 unit tests passed, including `src/app/api/about-us/route.test.ts`.
3. Local `GET /api/about-us` returned the expected shape:
   - `success: true`
   - `data: { journey, values, achievements }`
   - counts: 3 journey stats, 4 value cards, 3 achievement cards.
4. Local `/about-us` returned HTTP 200.
5. Journey image URL (`images.unsplash.com`) returned HTTP 200.

## What failed

Playwright frontend integration tests (`test-automation/specs/frontend-integration-test/about-us-page.spec.ts`) against the configured `BASE_URL` failed two checks:

- **About Us page content counts** — count mismatch in the visible DOM.
- **About Us page console error and image error handling** — caught a React hydration error:

```
pageerror: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]=
```

## Root cause analysis

`src/app/about-us/page.tsx` is a `"use client"` page that uses `useSyncExternalStore` to avoid rendering client-only content during SSR:

```tsx
function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
```

The parent returns a loading skeleton when `isClient === false`. That guard prevents the parent itself from mismatching, but child components (`OurJourney`, `OurValues`, `OurAchievements`) can still render content that differs between the server HTML and the hydrated client. React #418 is the "An error occurred during hydration" warning, which in this case was triggered by a text-content mismatch (`args[]=HTML`).

## Takeaways for future integration QA

1. **Hydration guard only covers the component that uses it.** Child components need their own guards or deterministic SSR output.
2. **When "no console/hydration errors" is an AC, a #418 is a FAIL**, even if the page visually looks correct and all data flows work.
3. **Transition the parent back to In Progress** and file the bug against the developer; keep the QA subtask open for re-verification.
4. **To reproduce locally:**
   - `npm run build && npm start`
   - `cd test-automation && npx playwright test --project=frontend-integration-test about-us-page.spec.ts`
   - Or run a headful browser with DevTools open on `/about-us` and watch Console for `pageerror`.

## Evidence log (real commands)

```bash
# Verify build
npm run build

# Run unit tests
npm test

# Start production server and probe
npm start
curl -s http://localhost:3000/api/about-us
curl -s http://localhost:3000/about-us

# Run Playwright integration suite against the correct baseURL
cd test-automation
npx playwright test --project=frontend-integration-test about-us-page.spec.ts
```

## JIRA state to apply

Because of the FAIL on TC-010:

- **KAN-22** → transition to **In Progress**, assign to the Developer.
- **KAN-72** → stays open; comment with the markdown results table and Failure #1 details.
