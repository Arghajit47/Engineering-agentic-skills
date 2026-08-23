# Test DB Seeding Before Full-Suite Runs

Some tests in this repo are not self-seeding; they assume `prisma/dev.db` already contains the seed data produced by `npm run seed`. Running the full test suite on a freshly reset or empty DB will fail tests that query the dev database through `@/lib/prisma` (e.g. pricing API tests, property detail integration tests that hit `/api/properties/[slug]/pricing`).

## When to re-seed

Re-seed the dev DB before running the full test suite in these situations:
- After `prisma.property.deleteMany()` or any test that clears tables.
- After switching branches that touch `prisma/seed.ts`.
- Before a final verification run that includes `src/app/api/properties/[slug]/pricing/route.test.ts` or similar DB-dependent API tests.
- When the previous test run ended with table-cleanup side effects.

## Command

```bash
npm run seed
```

Then run the suite:

```bash
npx tsc --noEmit
npm test
npx eslint <changed-files>
npm run build
```

## Why not seed inside tests?

Pricing tests and other DB-dependent tests use `@/lib/prisma` with `DATABASE_URL=prisma/dev.db`. They do not create their own fixtures. This is a known test-isolation trade-off in the current codebase; the parent agent must ensure the dev DB is seeded before final verification.

## Check seed slugs match test expectations

If tests expect slugs like `modern-villa-in-sunset-hills`, verify those slugs exist after seeding:

```bash
sqlite3 prisma/dev.db "SELECT slug FROM Property LIMIT 5;"
```

If the seed script changes and slugs drift, update the test expectations or the seed data accordingly.
