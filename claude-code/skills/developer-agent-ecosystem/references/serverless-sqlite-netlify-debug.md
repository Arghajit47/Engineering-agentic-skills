# Debugging Serverless SQLite Path Issues on Netlify Functions

Use this when POST/UPSERT endpoints return HTTP 500 after the basic `/tmp` copy fix from `serverless-sqlite-netlify.md` has already been applied.

## Symptom

- Local dev/tests pass.
- `npm run build` passes.
- Live `POST /api/...` returns `{"success":false,"error":"Internal server error"}`.
- Netlify function logs show `SQLITE_READONLY`, `ENOENT`, or Prisma cannot find the database file.

## Root causes beyond the basic fix

1. **Runtime `DATABASE_URL` is unset.** GitHub Actions may set it only for the deploy command, but the Netlify build/runtime does not inherit it. Prisma then falls back to a default path that doesn't exist or isn't bundled.
2. **`process.cwd()` is not the repo root inside a function.** Next.js on Netlify can run functions from `.next/server/...`, so `path.resolve(process.cwd(), "prisma/dev.db")` may point to a directory that doesn't contain the bundled DB.
3. **Bundled file not at the resolved path.** `netlify.toml` includes `prisma/dev.db`, but the function bundle layout places it elsewhere (e.g., under `/var/task` or inside a chunk directory).

## Diagnostic endpoint

Create a temporary `GET /api/debug` route that returns runtime path information:

```ts
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
  const relativePath = databaseUrl.replace("file:", "");
  const candidates = [
    path.isAbsolute(relativePath) ? relativePath : path.resolve(process.cwd(), relativePath),
    path.resolve("/var/task", relativePath),
    path.resolve("/var/task", "prisma/dev.db"),
    path.resolve(__dirname, "../../..", "prisma/dev.db"),
  ];
  return NextResponse.json({
    cwd: process.cwd(),
    __dirname,
    databaseUrl,
    checked: candidates.map((p) => ({ path: p, exists: fs.existsSync(p) })),
  });
}
```

Deploy it, curl the endpoint, and use the `exists: true` path in the fix.

## Robust copy fix

Replace the single-path copy in `src/lib/prisma.ts` with a candidate search:

```ts
const databaseUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
const isDev = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";

const needsServerlessCopy =
  !isDev && !isTest && databaseUrl.startsWith("file:");

function findBundledDb(relativePath: string): string | null {
  const candidates = [
    path.isAbsolute(relativePath) ? relativePath : path.resolve(process.cwd(), relativePath),
    path.resolve("/var/task", relativePath),
    path.resolve("/var/task", "prisma/dev.db"),
    path.resolve(__dirname, "../../..", "prisma/dev.db"),
    path.resolve(__dirname, "../../../../prisma/dev.db"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  console.warn("Bundled SQLite DB not found in:", candidates);
  return null;
}

if (needsServerlessCopy) {
  const originalPath = findBundledDb(databaseUrl.replace("file:", ""));
  const tempDbPath = "/tmp/dev.db";
  if (originalPath) {
    fs.copyFileSync(originalPath, tempDbPath);
    fs.chmodSync(tempDbPath, 0o644);
    prismaOptions.datasources = { db: { url: `file:${tempDbPath}` } };
  }
}
```

## Verification

1. Merge the fix to `main`.
2. Wait for `.github/workflows/deploy.yml` (or manual `npx netlify deploy --prod --build`) to finish.
3. `curl -X POST https://<site>/api/newsletter -H "Content-Type: application/json" -d '{"email":"x@y.com"}'` → expect HTTP 201.
4. Delete the temporary `src/app/api/debug/route.ts` endpoint in a follow-up PR.

## Remember

- Always default `DATABASE_URL` to `file:./prisma/dev.db` when it may be unset in the serverless runtime.
- `fs.chmodSync(tempDbPath, 0o644)` is required — the copied file inherits the bundled file's read-only mode.
- Remove any debug endpoints before closing the ticket.
