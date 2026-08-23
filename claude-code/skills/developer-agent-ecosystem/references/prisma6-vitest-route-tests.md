# Prisma 6 `prisma.config.ts` and Vitest Route-Test Projects

## Prisma 6+ auto-generates `prisma.config.ts`

`npx prisma init` in Prisma 6+ creates `prisma.config.ts` alongside `prisma/schema.prisma`. This config file takes precedence over the deprecated `package.json#prisma` block. You will see warnings like:

```
The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7.
Loaded Prisma config from prisma.config.ts.
```

### What to do

1. Do not rely on `package.json#prisma.seed`. Either:
   - Keep a direct npm script: `"db:seed": "tsx prisma/seed.ts"`
   - Or configure seeding inside `prisma.config.ts` using Prisma's early-access config API.

2. Move the database URL resolution into `prisma.config.ts` so `tsc --noEmit` passes even when `DATABASE_URL` is absent at type-check time. Use a helper that supplies a DEV fallback:

```ts
// prisma.config.ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

const url =
  process.env["DATABASE_URL"] ??
  (process.env["NODE_ENV"] === "production"
    ? undefined
    : "file:./prisma/dev.db");

if (!url) {
  throw new Error(
    "Missing DATABASE_URL environment variable. Set it in your Netlify project settings."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
```

3. Add `/prisma/dev.db`, `/prisma/dev.db-journal`, and `*.db` to `.gitignore`.

## Vitest + Storybook plugin: route tests need a separate project

Storybook's `@storybook/addon-vitest/vitest-plugin` overrides `test.include` in its own project. If you add `src/app/**/route.test.ts` to a top-level `include` array while the Storybook plugin is active, the route tests may be silently ignored or run under the browser provider (which cannot resolve Next.js server-only modules).

### Working config

```ts
// vitest.config.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@/": path.join(dirname, "src/"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        plugins: [storybookTest({ configDir: path.join(dirname, ".storybook") })],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "src/__tests__/**/*.test.ts",
            "src/__tests__/**/*.test.tsx",
            "src/components/**/__tests__/*.test.tsx",
            "src/app/**/__tests__/*.test.tsx",
            "src/app/**/route.test.ts",
          ],
        },
      },
    ],
  },
});
```

### Key points

- The `resolve.alias` block is mandatory for `@/lib/prisma` imports to work in route tests.
- Keep Storybook tests in one project and plain unit/route tests in another.
- Call route handlers directly — no HTTP server is needed.

```ts
import { GET } from "@/app/api/health/route";

const res = await GET();
expect(res.status).toBe(200);
```

## Verification

Run the full verification sequence for a backend change:

```bash
npx prisma generate
npm run db:push
npm run db:seed
npm run test
npm run build
npx eslint <changed-files>
npx tsc --noEmit
```
