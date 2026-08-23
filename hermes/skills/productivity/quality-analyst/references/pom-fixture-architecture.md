# POM-Fixture Automation Architecture

## Rules

1. **Isolated test-automation package.** `test-automation/` has its own `package.json`, `tsconfig.json`, `node_modules/`, `.gitignore`. Root `package.json` never has `@playwright/test`. Root `eslint.config.mjs` ignores `test-automation/**`. Root `tsconfig.json` excludes `test-automation`.
2. **Spec files named by functionality, not ticket ID.** `featured-properties.spec.ts`, not `kan-7.spec.ts`.
3. **Specs contain zero logic — STRICTLY.** Only fixture injection + page function calls + BaseAPI assertions. No inline curls, no inline DB queries, no inline schema validation, no execSync, no readFileSync, no npm audit parsing. If a spec has more than 3 lines per test, logic is leaking. User feedback: "file pathetically written, raw logics are there."
4. **Base class for common actions/assertions.** `base/api-base.ts` — BaseAPI: HTTP get, assertStatus, assertArray, assertObject, assertEmptyArray, assertEmptyObject, assertError500, assertMaxCount, assertSchemaEach, assertSchemaObject, DB helpers (reseed, clearTables, dbQuery, dbCount). Zod schemas are inlined here (add `zod` to test-automation deps) — do NOT import from the dev package.
5. **Page classes extend BaseAPI.** One per API/page. `pages/properties-api.ts`, `pages/reviews-api.ts`, `pages/settings-api.ts`, `pages/schema-api.ts` (cross-cutting). Page class holds endpoint path, typed response interface, and page-specific assertions. All common assertions delegate to BaseAPI static methods.
6. **Fixtures auto-init and auto-dispose page objects.** `fixtures/api-fixtures.ts` uses `test.extend()`. Specs inject via destructuring — no beforeEach/afterEach, no manual init/dispose.
7. **Split configs for API vs UI.** `playwright.api.config.ts` (workers=1, fullyParallel=false for SQLite). `playwright.ui.config.ts` (fullyParallel=true for DOM tests).
8. **Import paths use `@` aliases STRICTLY — no `../` in import statements.** User: "I don't want '../' in import statements, only '@' strictly." Configure `baseUrl` + `paths` in tsconfig. Runtime file paths (../prisma/dev.db) are NOT imports — those stay as `../`.
9. **Constants directory for ALL magic values.** `constants/test-constants.ts` holds every literal: BASE_URL, DB_PATH, SCHEMA_PATH, API_PATHS, PROPERTY_FIELDS, REVIEW_FIELDS, REQUIRED_SETTING_KEYS, SEED_COUNTS, MAX_FEATURED, TABLES, RATING_RANGE. Barrel at `constants/index.ts`. All other files import from `@constants/index` or `@constants/test-constants`. User: "why didn't you use constants files for respective files, why these small things are missed." No inline literals anywhere — not in base, not in pages, not in specs, not in configs.
10. **Follow `test-automation/INSTRUCTIONS.md` STRICTLY.** That file is the authoritative spec for the test architecture. Every rule in INSTRUCTIONS.md is enforced by code review.

## Directory Structure

```
project-root/
  package.json          ← dev deps only — NO @playwright/test
  tsconfig.json         ← excludes "test-automation"
  eslint.config.mjs     ← globalIgnores: "test-automation/**"
  src/                  ← app source
  test-automation/
    package.json        ← @playwright/test, @types/node, typescript, zod
    tsconfig.json       ← baseUrl + paths: @base/*, @pages/*, @fixtures/*, @constants/*, @src/*
    .gitignore          ← node_modules/, test-results/, playwright-report/
    INSTRUCTIONS.md     ← authoritative architecture spec (see rule 10)
    README.md           ← what the test dir does
    constants/
      test-constants.ts ← ALL magic values: URLs, paths, field lists, seed counts, table names, rating ranges
      index.ts          ← barrel re-export
    base/
      api-base.ts       ← BaseAPI class + Response interface + inlined zod schemas (imports from @constants)
    pages/
      properties-api.ts ← PropertiesAPI extends BaseAPI (imports from @constants)
      reviews-api.ts    ← ReviewsAPI extends BaseAPI (imports from @constants)
      settings-api.ts   ← SettingsAPI extends BaseAPI (imports from @constants)
      schema-api.ts     ← SchemaAPI extends BaseAPI (imports from @constants)
    fixtures/
      api-fixtures.ts   ← test.extend() — auto init/dispose ALL page objects
    specs/
      featured-properties.spec.ts
      featured-reviews.spec.ts
      site-settings.spec.ts
      security-and-seed.spec.ts
    playwright.api.config.ts   ← workers=1, fullyParallel=false (imports BASE_URL from @constants)
    playwright.ui.config.ts    ← fullyParallel=true (imports BASE_URL from @constants)
```

## tsconfig.json (test-automation)

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["esnext"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": {
      "@base/*": ["./base/*"],
      "@pages/*": ["./pages/*"],
      "@fixtures/*": ["./fixtures/*"],
      "@constants/*": ["./constants/*"],
      "@src/*": ["../src/*"]
    }
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules"]
}
```

Playwright 1.61+ resolves these `paths` when `baseUrl` is set. Use `@base/api-base`, `@pages/properties-api`, `@fixtures/api-fixtures`, `@constants/test-constants` in all imports.

## Constants Pattern

```typescript
// constants/test-constants.ts
export const BASE_URL = "http://localhost:3000";
export const DB_PATH = "../prisma/dev.db";
export const SCHEMA_PATH = "../prisma/schema.prisma";

export const API_PATHS = {
  PROPERTIES_FEATURED: "/api/properties/featured",
  REVIEWS_FEATURED: "/api/reviews/featured",
  SETTINGS: "/api/settings",
};

export const PROPERTY_FIELDS = ["id", "title", "price", "location", "bedrooms", "bathrooms", "areaSqft", "imageUrl"];
export const REVIEW_FIELDS = ["id", "clientName", "clientAvatarUrl", "rating", "reviewText", "propertyTitle"];
export const REQUIRED_SETTING_KEYS = ["site_name", "contact_email", "phone"];
export const SEED_COUNTS = { PROPERTIES: 6, FEATURED: 5, REVIEWS: 5, SETTINGS: 14, NULL_PROPERTY_TITLES: 1, MIN_RATING: 1, MAX_RATING: 5 };
export const MAX_FEATURED = 5;
export const TABLES = ["Property", "Review", "SiteSetting"];
export const RATING_RANGE = { MIN: 1, MAX: 5 };
```

```typescript
// constants/index.ts
export * from "./test-constants";
```

## BaseAPI Pattern (imports from @constants — no inline literals)

```typescript
import { request, expect, type APIRequestContext } from "@playwright/test";
import { execSync } from "node:child_process";
import { z } from "zod";
import { BASE_URL, DB_PATH, TABLES } from "@constants/test-constants";

// Inlined schemas — do NOT import from dev package
const propertySchema = z.object({ /* ... */ });
const reviewSchema = z.object({ /* ... */ });
const settingsSchema = z.record(z.string(), z.string());

export abstract class BaseAPI {
  protected ctx: APIRequestContext | null = null;
  async init() { this.ctx = await request.newContext({ baseURL: BASE_URL }); }
  async dispose() { await this.ctx?.dispose(); this.ctx = null; }
  protected async get(path: string): Promise<Response> { /* ... */ }
  // static assert methods...
  static reseed() { execSync("npm run seed", { cwd: "..", stdio: "ignore" }); }
  static clearTables(tables: string[]) { /* uses TABLES from @constants */ }
  static dbQuery(sql: string): string { /* uses DB_PATH from @constants */ }
  static dbCount(table: string): number { /* uses DB_PATH from @constants */ }
}
export interface Response { status: number; body: unknown; }
export { propertySchema, reviewSchema, settingsSchema };
```

## SchemaAPI Pattern (cross-cutting concerns)

```typescript
// pages/schema-api.ts
import { expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { BaseAPI } from "@base/api-base";
import { SCHEMA_PATH, SEED_COUNTS, TABLES, PROPERTY_FIELDS, REVIEW_FIELDS } from "@constants/test-constants";

export class SchemaAPI extends BaseAPI {
  assertNoHighCriticalVulns(): void {
    // npm audit parsing logic here — NOT in spec
  }
  assertSchemaModels(): void {
    // readFileSync(SCHEMA_PATH) + regex validation — NOT in spec
  }
  assertSeedCounts(): void {
    // dbCount + dbQuery validation using SEED_COUNTS — NOT in spec
  }
}
```

## Fixture Pattern (test.extend)

```typescript
// fixtures/api-fixtures.ts
import { test as base } from "@playwright/test";
import { PropertiesAPI } from "@pages/properties-api";
import { ReviewsAPI } from "@pages/reviews-api";
import { SettingsAPI } from "@pages/settings-api";
import { SchemaAPI } from "@pages/schema-api";
import { BaseAPI } from "@base/api-base";

type Fixtures = {
  propertiesApi: PropertiesAPI;
  reviewsApi: ReviewsAPI;
  settingsApi: SettingsAPI;
  schemaApi: SchemaAPI;
};

export const test = base.extend<Fixtures>({
  propertiesApi: async ({}, use) => {
    BaseAPI.reseed();
    const api = new PropertiesAPI();
    await api.init();
    await use(api);
    await api.dispose();
  },
  // ... same for reviewsApi, settingsApi, schemaApi
});

export { expect } from "@playwright/test";
// Do NOT re-export test — it's already exported by `export const test`
```

## Spec Pattern (zero logic, fixture injection)

```typescript
import { test, expect } from "@fixtures/api-fixtures";
import { BaseAPI, propertySchema } from "@base/api-base";

test.describe("Featured Properties API", () => {
  test("returns 200 with featured properties", async ({ propertiesApi }) => {
    const res = await propertiesApi.fetchFeatured();
    BaseAPI.assertStatus(res, 200);
    const props = propertiesApi.getProperties(res);
    expect(props.length).toBe(5);
  });
});

// Security & Seed spec — zero logic, all in SchemaAPI
import { test } from "@fixtures/api-fixtures";

test.describe("Security & Seed Validation", () => {
  test("npm audit — zero high/critical vulnerabilities", ({ schemaApi }) => {
    schemaApi.assertNoHighCriticalVulns();
  });
  test("Prisma schema correctness", ({ schemaApi }) => {
    schemaApi.assertSchemaModels();
  });
  test("seed data counts", ({ schemaApi }) => {
    schemaApi.assertSeedCounts();
  });
});
```

## Split Configs

```typescript
// playwright.api.config.ts — serialized for SQLite
import { defineConfig } from "@playwright/test";
import { BASE_URL } from "@constants/test-constants";

export default defineConfig({
  testDir: "./specs", workers: 1, fullyParallel: false,
  reporter: [["html", { outputFolder: "/tmp/playwright-report-api" }], ["list"]],
  use: { baseURL: BASE_URL, extraHTTPHeaders: { "Content-Type": "application/json" } },
});

// playwright.ui.config.ts — parallel for DOM tests
import { defineConfig } from "@playwright/test";
import { BASE_URL } from "@constants/test-constants";

export default defineConfig({
  testDir: "./specs", fullyParallel: true,
  reporter: [["html", { outputFolder: "/tmp/playwright-report-ui" }], ["list"]],
  use: { baseURL: BASE_URL },
});
```

## Cross-Package Runtime Paths (NOT imports)

These are filesystem paths, not import statements — they stay as `../`:
- `execSync("npm run seed", { cwd: "..", stdio: "ignore" })`
- `sqlite3 ../prisma/dev.db "..."`
- `readFileSync("../prisma/schema.prisma", "utf-8")`
- `execSync("npx vitest run ...", { cwd: ".." })`
- `execSync("npm audit ...", { cwd: ".." })`

These paths MUST be defined as constants in `constants/test-constants.ts` (DB_PATH, SCHEMA_PATH) and imported via `@constants/test-constants` — not inlined in the file that uses them.

## Key Principles

- **Reuse, don't reimplement.** Page classes call BaseAPI static methods for all common assertions.
- **Specs are readable by non-engineers.** A QA manager should understand what each test verifies without reading implementation.
- **Adding a new endpoint = 1 new page class + 1 new fixture entry + 1 new spec file.** BaseAPI doesn't change.
- **Cross-cutting concerns** (security scan, schema validation, seed correctness) go in SchemaAPI — never in specs.
- **Package isolation is forever.** The dev package and test package never share dependencies. Zod schemas are inlined, not imported from dev.
- **NEVER push automation code to main.** Always create a branch, push, open PR with --reviewer {{GITHUB_REVIEWER_ACCOUNT}}.
- **INSTRUCTIONS.md is authoritative.** The SDET must read and follow `test-automation/INSTRUCTIONS.md` strictly. Every rule there is enforced by code review.

## Pitfalls

### Duplicate `export { test }` in fixture files
`export const test = base.extend<Fixtures>({...})` already exports `test`. Adding `export { test }` at the bottom is a redeclaration error (TS2323/TS2484). Only re-export `expect`.

### tsc --noEmit catches what lint and Playwright miss
Run `npx tsc --noEmit` in BOTH packages before committing. Common fixes:
- `global.d.ts` needs `export {}` at the end for module augmentation
- Prisma route handlers: run `npx prisma generate` to resolve `findMany` return types
- Playwright resolves tsconfig `paths` when `baseUrl` is set — use `@base/*`, `@pages/*`, `@fixtures/*`

### Raw logic in specs — user called it "pathetically written"
ALL logic belongs in page objects, including cross-cutting concerns. Create SchemaAPI for security/schema/seed. Specs call page methods only. No execSync, no readFileSync, no npm audit parsing, no regex in specs.

### Import paths must use @ aliases, never ../
User: "I don't want '../' in import statements, only '@' strictly." Runtime file paths (../prisma/dev.db) are NOT imports — those stay as ../, but MUST be defined as constants in @constants and imported from there.

### Missing constants directory
User: "why didn't you use constants files for respective files, why these small things are missed." ALL magic values (URLs, file paths, field name arrays, seed counts, table names, rating ranges, max counts) must live in `constants/test-constants.ts` with a barrel `index.ts`. No inline literals in base, pages, specs, fixtures, or configs. Add `@constants/*` to tsconfig paths. This is rule 9 — code review rejects PRs with inline literals.

### Zod schemas inlined for full isolation
Do NOT import validators from the dev package. Inline zod schemas in api-base.ts, add zod to test-automation deps.

### Pushing to main instead of a branch
User: "why pushing from main branch?" Always create a feature branch, push, open PR. Never commit automation code directly to main.