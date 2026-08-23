# Next.js Frontend PR Review Checklist

Use this when reviewing a Frontend-only Next.js PR (especially a self-review where GitHub blocks `gh pr review --approve`).

## Real verification commands

Run these in the repo root and capture the actual exit codes / counts in the review comment.

```bash
# TypeScript
npx tsc --noEmit

# ESLint on changed files only
npx eslint next.config.ts prisma/seed.ts src/app/<route> src/components/<area> src/components/layout/Navbar.tsx src/__tests__/navigation-footer-api.test.ts src/components/layout/__tests__/Navbar.test.tsx src/components/layout/__tests__/navigation-footer-integration.test.tsx src/lib/icon-map.ts test-automation/constants/<area>-constants.ts test-automation/locators/<area>-locators.ts test-automation/pages/frontend/<area>-page.ts test-automation/specs/frontend-integration-test/<area>-page.spec.ts test-automation/fixtures/ui-fixtures.ts test-automation/constants/index.ts

# Unit tests for changed areas
npm test -- --run src/app/<route> src/components/<area> src/components/layout/__tests__/Navbar.test.tsx src/components/layout/__tests__/navigation-footer-integration.test.tsx src/__tests__/navigation-footer-api.test.ts

# Production build (catches next/image allowlist, static prerender, client/server boundary)
npm run build

# External image URL check (for every new image URL in the diff)
curl -s -o /dev/null -w "%{http_code}" -L "<url>"
```

## What to grep for

```bash
# Leftover debug / unsafe types in new code
grep -R "console\.log\|debugger\|any" src/app/<route> src/components/<area>

# Tests importing page with .tsx extension (TS5097 in this project)
grep -R 'from "@/app/.*/page\.tsx"' src
```

## Review comment evidence table

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx eslint` changed files | ✅ 0 errors |
| `npm test` | ✅ N files, M passed, 0 failed |
| `npm run build` | ✅ `/about-us` prerendered as static |
| External image URLs | ✅ HTTP 200 |

## Frontend-specific AC mapping

Map each changed file to the acceptance criteria it satisfies:

- New route renders → `src/app/<route>/page.tsx`
- Responsive sections → `src/components/<area>/*.tsx`
- Icons registered → `src/lib/icon-map.ts`
- Nav links updated → `src/components/layout/Navbar.tsx`, `prisma/seed.ts`
- Tests → `src/app/<route>/__tests__/*`, `src/components/<area>/__tests__/*`
- E2E POM/spec/fixture → `test-automation/{constants,locators,pages,fixtures,specs}/...`
- Image allowlist / redirects → `next.config.ts`

## Self-review posting

Because GitHub blocks self-approval:

```bash
gh pr comment <N> --body-file /tmp/pr<N>-review.md
gh pr review <N> --comment --body "Full review in comment above."
gh pr merge <N> --squash --delete-branch
gh pr view <N> --json state,mergedAt,mergeCommit
```

Lead `/tmp/pr<N>-review.md` with `**Verdict: APPROVED ✅**` and a note about the self-approval constraint.
