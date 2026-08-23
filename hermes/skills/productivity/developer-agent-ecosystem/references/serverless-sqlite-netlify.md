# Serverless SQLite + Next.js + Netlify Functions

Recipe: make a read-only bundled SQLite file writable on Netlify Functions (and similar serverless runtimes) by copying it to `/tmp` and adjusting permissions.

## Why

Netlify Functions mount the deployment package directory as read-only. If your Prisma `DATABASE_URL` points at `prisma/dev.db` inside the package, writes (INSERT/UPDATE/UPSERT) fail with `SQLITE_READONLY` or a generic 500. The runtime does allow writes under `/tmp`.

## Minimal pattern (src/lib/prisma.ts)

```ts
import { PrismaClient, Prisma } from "@prisma/client";
import path from "path";
import fs from "fs";

const databaseUrl = process.env.DATABASE_URL;
const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
const isServerless = databaseUrl?.startsWith("file:") && !isDev;

const prismaOptions: Prisma.PrismaClientOptions = {};

if (isServerless) {
  const originalPath = path.resolve(databaseUrl!.replace("file:", ""));
  const tempDbPath = path.join("/tmp", "dev.db");

  try {
    if (fs.existsSync(originalPath)) {
      fs.copyFileSync(originalPath, tempDbPath);
      fs.chmodSync(tempDbPath, 0o644); // REQUIRED — copied file inherits read-only perms
      prismaOptions.datasources = { db: { url: `file:${tempDbPath}` } };
      console.log(`Copied SQLite DB to ${tempDbPath}`);
    }
  } catch (error) {
    console.error("Failed to copy SQLite DB to /tmp:", error);
  }
}

export const prisma = globalThis.__prisma ?? new PrismaClient(prismaOptions);
if (process.env.NODE_ENV !== "production") globalThis.__prisma = prisma;

export default prisma;
```

## Critical details

1. **Copy is not enough.** `fs.copyFileSync` preserves the source file mode. The bundled DB is often read-only in the function package, so the copy is also read-only. Add `fs.chmodSync(tempDbPath, 0o644)` or writes still fail.
2. **Use `/tmp/dev.db`.** Netlify Functions preserve `/tmp` across warm invocations in the same instance, so writes persist for subsequent requests.
3. **Only outside dev/test.** In local development and tests, write directly to `prisma/dev.db` (or `prisma/test.db`) as usual.
4. **One PrismaClient instance.** Reuse the client across invocations with a global fallback; cold starts are expensive.
5. **Log failures.** If the copy fails, the original read-only path is still used and writes will 500 — log loudly so you know.

## When this doesn't apply

- PostgreSQL/MySQL (no local file to copy).
- Static/read-only SQLite (no writes).
- Vercel has a similar `/tmp` rule but different env vars; test there separately.

## Testing

After deploying, hit a write endpoint (e.g., POST /api/newsletter) and verify HTTP 201. If it still returns 500, check function logs for `SQLITE_READONLY` or permission errors — the usual fix is the `chmod` line above.
