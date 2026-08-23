# Next.js + Prisma + Vitest Backend: Pitfalls & Patterns

Session-proven reference for backend sub-agents scaffolding Next.js App Router APIs with Prisma + Vitest.

## Version Compatibility Traps (Node 20.12)

### Prisma 7 → requires Node 20.19+
Prisma 7's engine check rejects Node < 20.19. The `postinstall` script fails, and `npx prisma generate` crashes with `ERR_REQUIRE_ESM` (zeptomatch ESM incompatibility).

**Fix:** Install Prisma 5 explicitly:
```bash
npm install prisma@5 @prisma/client@5 --ignore-scripts
npx prisma --version  # confirm 5.x
```
`--ignore-scripts` skips the postinstall engine gate. `prisma generate` then works on Node 20.12.

### Vitest 4 → rolldown native binding failure
Vitest 4 ships with rolldown, which requires platform-specific native bindings (`@rolldown/binding-darwin-arm64`). On Node < 20.19, npm's optional dependency bug (npm/cli#4828) fails to install the binding, and `vitest run` crashes with `Cannot find native binding`.

**Fix:** Install Vitest 3 (uses Vite, not rolldown):
```bash
npm install -D vitest@^3 @vitest/coverage-v8@^3 --ignore-scripts
```

### General pattern: `--ignore-scripts`
When a package's `postinstall` fails due to engine version checks, use `npm install <pkg> --ignore-scripts` to skip the gate, then run the binary manually. The package works fine at runtime — only its install-time guard rejects the Node version.

## Scaffolding

### create-next-app `--no-import-alias` is unreliable
As of create-next-app@latest (Next.js 16), `--no-import-alias` does NOT prevent the `@/*` path alias from being added to `tsconfig.json`. The `paths: { "@/*": ["./src/*"] }` entry is always set. Use `@/` imports — they work in both Next.js and Vitest (with config).

### Full scaffold command (greenfield repo)
```bash
npx --yes create-next-app@latest . --typescript --app --tailwind --eslint --use-npm --src-dir --no-import-alias --yes
```
This produces Next.js 16, TS strict, Tailwind 4, ESLint 9, src-dir layout.

## Testing Next.js Route Handlers with Vitest

### vitest.config.ts — path alias is mandatory
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: { environment: "node", include: ["src/__tests__/**/*.test.ts"] },
});
```
Without the alias, imports like `@/lib/prisma` resolve in Next.js but fail in Vitest.

### Import handlers directly — no HTTP server needed
Next.js Route Handlers export `GET`, `POST`, etc. Call them directly:
```ts
import { GET as getFeaturedProperties } from "@/app/api/properties/featured/route";

it("returns 200 with array", async () => {
  const res = await getFeaturedProperties();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
});
```
No `Request` object needed for parameterless GET handlers. The handler returns a `NextResponse` (which extends `Response`), so `.status` and `.json()` work natively.

### Test isolation pattern with Prisma
Use `beforeEach` to wipe + re-seed the specific tables under test. This prevents cross-test contamination without re-seeding the entire DB:
```ts
beforeEach(async () => {
  await prisma.property.deleteMany();
  await prisma.review.deleteMany();
  await prisma.siteSetting.deleteMany();
  // re-create test fixtures
});
```
Call `prisma.$disconnect()` in `afterAll` to release the DB connection.

## Prisma SQLite Specifics

### Non-interactive migrations in agent sessions
`npx prisma migrate dev` is an interactive command and fails in non-interactive agent terminals with:
```
Error: Prisma Migrate has detected that the environment is non-interactive, which is not supported.
```
**Fix:**
- If the repo has no existing `prisma/migrations/` directory, use `npx prisma db push --accept-data-loss --skip-generate` to apply schema changes, then `npx prisma generate` to regenerate the client.
- If a migrations directory already exists, use `npx prisma migrate deploy` to apply pending migrations, then `npx prisma generate`.
Do NOT keep retrying `prisma migrate dev` with `/dev/null` stdin — the command is fundamentally interactive.

### DB file location
`DATABASE_URL="file:./dev.db"` in `.env` creates `prisma/dev.db` (relative to the prisma/ directory, not project root). Add `*.db` and `prisma/*.db` to `.gitignore` — never commit the SQLite file.

### JSON text columns
SQLite has no native JSON type. Store arrays as JSON text (`String`), parse on read:
```ts
// schema.prisma
galleryUrls String   // JSON text — string[]
features    String   // JSON text — string[]

// lib/json-helpers.ts
export function parseJsonArray(str: string | null | undefined): string[] {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}
```
Seed with `JSON.stringify(["item1", "item2"])`, read with `parseJsonArray(row.galleryUrls)`.

### Prisma client singleton (dev hot-reload)
```ts
const prisma = global.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") global.prisma = prisma;
```
Add a `src/types/global.d.ts`:
```ts
declare global {
  var prisma: import("@prisma/client").PrismaClient | undefined;
}
```
Without the global declaration, TS strict mode errors on `global.prisma` (no index signature on `typeof globalThis`).

## Seed Script

### package.json config
```json
{
  "scripts": { "seed": "tsx prisma/seed.ts" },
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```
`tsx` runs TypeScript directly without compilation. Install as devDep: `npm install -D tsx`.

### Seed script pattern
```ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.property.deleteMany();  // clean slate
  // create records...
  console.log("Seed complete: N records");
}

main().catch((e) => { console.error(e); process.exit(1); })
      .finally(async () => { await prisma.$disconnect(); });
```

## Post-Test Re-Seed
Vitest tests that `deleteMany()` in `beforeEach` leave the DB empty after the suite finishes. Run `npm run seed` after tests to restore data for manual/visual testing against the dev server.