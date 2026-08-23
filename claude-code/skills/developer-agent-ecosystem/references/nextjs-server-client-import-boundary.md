# Next.js Server–Client Import Boundary

A Next.js App Router client component (`"use client"`) that imports from a server-only module will silently pull that server's entire dependency graph into the client bundle. The build then fails with `Module not found: Can't resolve 'fs'` (or `path`, `crypto`, `child_process`, etc.), because those Node.js modules do not exist in the browser.

## How it happens

A common pattern during integration work:

1. Backend route defines a Zod schema: `src/app/api/newsletter/route.ts` exports `newsletterSchema`.
2. That route also imports `prisma.ts`, which uses `fs`/`path` to copy the SQLite DB to `/tmp`.
3. Frontend or integration code imports the schema from the route file:
   ```ts
   import { newsletterSchema } from "@/app/api/newsletter/route";
   ```
4. Next.js traces imports statically. The client bundle now includes `route.ts` → `prisma.ts` → `fs`, and the build explodes.

The error message points at `src/lib/prisma.ts:3:1` (`import fs from "fs"`) even though the component never used `fs` directly. This makes the root cause look like a Prisma issue, but it is actually an import-boundary violation.

## Rule

**Never import from an API route file (or any server-only module) into a client component.** API routes are server-only entry points. Anything they export that needs to be shared with the client must live in a server/client-safe file.

## Fix

Move the shared schema/type/utility into a file that has no server-only imports:

```ts
// src/lib/schemas.ts
import { z } from "zod";

export const newsletterSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;
```

Then import it from both sides:

```ts
// server
import { newsletterSchema } from "@/lib/schemas";
// client
import { newsletterSchema } from "@/lib/schemas";
```

Keep server-only code (Prisma, fs, rate limiters, secrets) in files like `src/lib/prisma.ts`, `src/lib/rate-limit.ts`, `src/lib/server-utils.ts`, and never re-export them from files imported by client components.

## Verification

If a client component starts importing from `src/app/api/...`, stop and extract the shared parts. After moving the schema, run:

```bash
npx tsc --noEmit
npm run build
```

The `fs`/`path` errors should disappear.

## When it is safe

Server components (no `"use client"`) can import server-only modules. Client components can only import code that is itself client-safe all the way down the import tree. Shared files should be limited to: Zod schemas, plain types/interfaces, pure utility functions, and constants.
