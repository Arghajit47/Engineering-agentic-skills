# Integration tickets: backend route contract may not match frontend component props

## Problem

An Integration ticket's Frontend and Backend siblings can both be marked `Done` and still present a data-shape mismatch. The Backend ticket typically delivers a Prisma model and a route that return the smallest DB row sufficient for its own scope. The Frontend ticket delivers components typed against a richer mock shape (e.g., `PropertyDetailedInfo` with `longDescription`, `amenities`, `agentName`, nested `PropertyImage[]`, etc.).

If the Integration sub-agent blindly wires `page.tsx` to the backend route, the page will not compile or the components will receive the wrong shape.

## Detection

Before writing `instructions.txt`, compare the two shapes:
1. Read the Backend route handler's GET response envelope and the Prisma model it queries.
2. Read the Frontend components' prop interfaces and the mock data shape in `src/mocks/`.
3. If the route returns a flat DB row while components expect a richer shape, you have a contract mismatch.

## Resolution (pick the smallest path that passes tests and build)

### Option A: Transform in the route (keep Prisma model unchanged)
Keep the existing Prisma model and extend the route handler to transform the DB row into the full component shape before returning it.

- Pros: no schema migration, no seed rewrite, fast.
- Cons: defaults live in the route; less reusable if another consumer needs the same enrichment.
- Best when: the extra fields are presentation-only defaults (e.g., `address = location`, `status = "For Sale"`, `amenities` derived from `propertyType`).

### Option B: Extend the Prisma model and seed
Add the missing columns to the Prisma model, regenerate the client, push schema, and update `prisma/seed.ts` to populate them.

- Pros: single source of truth in the DB, no hardcoded defaults in the route.
- Cons: changes a "Done" backend ticket's schema; may require route tests to be updated.
- Best when: the extra fields are real data that belongs in the database (e.g., `agentEmail`, `longDescription`, `status`).

Both options are valid. The Integration sub-agent should choose the smallest one and document the choice in a code comment.

## Instruction template for `instructions.txt`

```
BACKEND-FRONTEND SHAPE MISMATCH
- Backend route returns: <flat shape list>
- Frontend components expect: <rich shape list>
- Required: transform the route response (Option A) OR extend the Prisma model (Option B) so the API returns the exact shape the components consume.
- Add shared Zod schema and inferred TypeScript types in src/lib/schemas.ts; import from there on both sides. Never import from src/app/api/* route files into client components.
```

## Example from KAN-34

KAN-34 `[Integration] Property Details Gallery & Details` depended on KAN-32 (Frontend, Done) and KAN-33 (Backend, Done). The backend `/api/properties/[slug]` returned a flat `Property` row with `galleryUrls` and `features` as JSON arrays. The frontend components expected `PropertyDetailedInfo` with `longDescription`, `address`, `status`, `amenities`, `agentName`, etc. The integration needed either a route-side transformation into the richer shape or a Prisma model extension + seed update.

## Pitfalls

- Do not tell the Integration sub-agent to "just consume whatever the API returns." It will break the frontend components.
- Do not add new API routes to solve the mismatch; modify the existing route.
- Do not import the route's types/schemas from `src/app/api/*` into client components. Put the shared contract in `src/lib/schemas.ts`.
- If you choose Option B, remember to run `npx prisma db push --accept-data-loss --skip-generate` (or `migrate deploy` if migrations exist) and `npx prisma generate` before tests.
