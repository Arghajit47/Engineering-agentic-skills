# Serverless SQLite Writes on Netlify Functions

Recipe for Prisma + SQLite backends deployed as Netlify Functions (or any read-only serverless runtime).

## Problem

- The function package directory is read-only at runtime.
- `prisma/dev.db` is bundled via `netlify.toml`:
  ```toml
  [functions]
    included_files = ["prisma/dev.db"]
  ```
- Prisma can **read** the bundled DB, but `INSERT`/`UPDATE` throws `EROFS: read-only file system`.
- Result: GET endpoints work, POST/PUT endpoints return 500.

## Fix

Copy the bundled DB to `/tmp` at startup and point Prisma there. `/tmp` is writable in Netlify Functions.

```ts
// src/lib/prisma.ts
import { PrismaClient, Prisma } from "@prisma/client";
import path from "path";
import fs from "fs";

const databaseUrl = process.env.DATABASE_URL;
const isDev = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";

const prismaOptions: Prisma.PrismaClientOptions = {
  log: isDev ? ["query", "error", "warn"] : ["error"],
};

const serverlessDbUrl =
  databaseUrl?.startsWith("file:") && !isDev && !isTest
    ? databaseUrl
    : null;

if (serverlessDbUrl) {
  const relativePath = serverlessDbUrl.replace("file:", "");
  const originalPath = path.isAbsolute(relativePath)
    ? relativePath
    : path.resolve(process.cwd(), relativePath);

  const tempDbPath = "/tmp/dev.db";
  try {
    if (fs.existsSync(originalPath)) {
      fs.copyFileSync(originalPath, tempDbPath);
      fs.chmodSync(tempDbPath, 0o644);          // ensure writable
      prismaOptions.datasources = {
        db: { url: `file:${tempDbPath}` },
      };
    } else {
      console.warn(`Original SQLite DB file not found at ${originalPath}`);
    }
  } catch (error) {
    console.error("Failed to copy SQLite database to /tmp:", error);
  }
}

const prisma = global.prisma ?? new PrismaClient(prismaOptions);
if (!isDev) global.prisma = prisma;

export default prisma;
```

## Why `chmodSync` matters

`copyFileSync` preserves the source file's mode. If the bundled `dev.db` is read-only in the package, the copy in `/tmp` is also read-only until `chmodSync` fixes it. This was the second failure mode on KAN-13.

## Verification

1. Build locally: `npm run build`
2. Deploy: `npx netlify deploy --prod --build`
3. Test the write endpoint on the live URL:
   ```bash
   curl -X POST -H "Content-Type: application/json" \
     -d '{"email":"test@example.com"}' \
     https://<site>.netlify.app/api/newsletter
   ```
   Expect 201, not 500.

## Caveats

- `/tmp` is ephemeral per function invocation but persists across warm invocations of the same function instance.
- Writes do not survive cold starts and are not shared across instances — this is acceptable for newsletter signups, contact forms, etc.
- If durable writes are needed, switch to PostgreSQL/Neon/PlanetScale instead of SQLite.
