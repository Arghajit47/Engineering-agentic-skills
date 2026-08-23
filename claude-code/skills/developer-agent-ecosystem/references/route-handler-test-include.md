# Next.js Route Handler Tests: Placement and Include Pattern

## Problem
Next.js App Router route-handler tests placed next to their routes (e.g. `src/app/api/about-us/route.test.ts`) are invisible to Vitest unless `vitest.config.ts` explicitly includes them. The default `include` pattern in this repo covers:

- `src/__tests__/**/*.test.ts`
- `src/components/**/__tests__/*.test.tsx`
- `src/app/**/__tests__/*.test.tsx`

It does NOT match `src/app/**/route.test.ts`. `npm test` then passes without running the new API tests.

## Fix

Update `vitest.config.ts`:

```ts
include: [
  "src/__tests__/**/*.test.ts",
  "src/components/**/__tests__/*.test.tsx",
  "src/app/**/__tests__/*.test.tsx",
  "src/app/**/route.test.ts",
],
```

## Verification

After adding a route test and updating the config, run:

```bash
npm test
```

Confirm the route test file appears in the Vitest output, e.g.:

```
✓ src/app/api/about-us/route.test.ts (2 tests)
```

## Pattern for route tests

Call the exported handler directly; no HTTP server required:

```ts
import { GET } from "@/app/api/about-us/route";

const res = await GET();
expect(res.status).toBe(200);
const body = await res.json();
expect(body.success).toBe(true);
```

Use `beforeEach` to clean the specific table(s) under test, and `afterAll` to call `prisma.$disconnect()`.
