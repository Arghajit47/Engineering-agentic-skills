# Figma PNG Bug Direct Fix — KAN-90 Pattern

For bug tickets that report "Figma vs UI" differences using attached PNG screenshots only (no `figma-spec-*.json`), where the fix requires small UI restyling plus a minimal backend data-shape change.

## When to use the senior-dev direct fix instead of sub-agent dispatch

- Ticket is a bug/visual delta, not greenfield.
- Figma source = attached PNG screenshots; main agent can inspect via `vision_analyze` / PIL.
- Backend surface area is ≤1 Prisma column + 1 API field + seed update.
- No separate Frontend/Backend Done tickets exist to satisfy the Integration gate.
- Main agent has read the affected components and knows the exact change.

## Workflow (still branch + PR)

1. Transition JIRA to "In Progress", assign developer.
2. Post a JIRA comment with:
   - Visual findings from the PNGs.
   - File list to change.
   - DESIGN THEME extracted via PIL pixel sampling.
3. Create feature branch `<JIRA_KEY>-<PAGE>-<SECTION>-Frontend` off latest `main`.
4. Implement UI changes and backend data changes together.
5. Update `test-automation/` locators, constants, page-objects, and API schemas if the visible data shape changed.
6. Verify:
   - `npx prisma generate && npx prisma db push --accept-data-loss --skip-generate`
   - `npm run seed`
   - `npx tsc --noEmit`
   - `npx vitest run <affected-files>`
   - `npx eslint <changed-files>`
   - `npm run build`
   - `npm start` then Playwright against `BASE_URL=http://localhost:3000`
7. Commit, push, create MR via `gh pr create --reviewer {{GITHUB_REVIEWER_ACCOUNT}}`.
8. Transition to "Code Review", assign reviewer.
9. If `Skill(skill="pr-review-and-merge", ...)` is unavailable, load `mr-code-review` skill directly.

## KAN-90 concrete changes

- `src/components/home/FeaturedProperties.tsx`
  - Header CTA changed from bottom "Explore Properties" to top-right "View All Properties".
  - Navigation arrows moved from flanking the grid to centered below it.
  - Cards wrapped in subtle `border border-zinc-800/60 rounded-xl`.
- `src/components/home/Testimonials.tsx`
  - Card order changed to: 5 yellow stars → `reviewTitle` → `reviewText` → avatar + `clientName` + `clientLocation`.
  - Stars changed from purple to `fill-amber-400 text-amber-400`.
  - Added `.review-card-name` class for Playwright locator stability.
- Backend data
  - `prisma/schema.prisma`: added `reviewTitle String?` to `Review`.
  - `src/app/api/reviews/featured/route.ts`: included `reviewTitle` in response.
  - `src/lib/api-types.ts`: added `reviewTitle?: string` to `FeaturedReview`.
  - `prisma/seed.ts`: populated `reviewTitle`, updated `clientLocation` format.
- Tests / automation
  - Updated unit tests in `src/components/home/__tests__/{FeaturedProperties,Testimonials}.test.tsx`.
  - Updated `src/mocks/testimonials.ts`.
  - Updated `src/app/api/reviews/featured/route.test.ts`.
  - Updated `test-automation/locators/homepage-locators.ts`, `test-automation/constants/{api-constants,homepage-constants,index}.ts`, `test-automation/pages/frontend/home-page.ts` to match new card content.

## Pitfall: UI change without automation update

If the visible card text changes (e.g. title now shows `reviewTitle` instead of `clientName`), the Playwright page object that matches live API data against the DOM will fail. Update the matcher and the API `Review` interface together.

## Pitfall: stale production build during Playwright

`npm start` serves the prior `npm run build` output. After changing components, run `npm run build` again before starting the server, or Playwright will test the old UI.

## Pitfall: seeded DB mismatch

After changing `prisma/seed.ts`, re-run `npm run seed` before starting the local server; otherwise the API returns old data and the live-API validation test fails on content it does not expect.
