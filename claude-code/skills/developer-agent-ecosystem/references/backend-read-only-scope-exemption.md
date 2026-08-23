# Backend Read-Only Scope: Zod / Rate-Limit Exemption Pattern

Session-proven pattern for backend tickets whose ACs generically demand "Zod validation for all POST/PUT requests" and "rate limiting on form submission endpoints" but whose actual scope is read-only (no writes, no forms).

## When this applies

- Ticket scope is Backend.
- The component/section only needs a GET endpoint to feed a Frontend/Integration ticket.
- There are no POST/PUT/PATCH/DELETE handlers, no user input beyond URL/query params, and no form submission.
- The generic ACs were written by the BA workflow before scope was finalized and do not reflect the read-only reality.

## What NOT to do

- Do not add a phantom POST endpoint just to satisfy an AC checkbox.
- Do not add unused Zod schemas that are never invoked in production code.
- Do not add rate-limit middleware to a GET route unless the AC explicitly requires it.
- Do not import heavy validation libraries for a route that has no request body.

## What to do

1. Build the read-only GET endpoint using the existing project patterns (e.g. `src/app/api/hero/route.ts`).
2. Include a concise code comment in the route file explaining the exemption:
   ```ts
   // KAN-47 is read-only for the Hero/CTA scope; no POST/PUT here.
   // Rate limiting + Zod POST validation examples live in /api/newsletter.
   ```
3. In the backend-execution-plan.txt and in any review/QA evidence, list the exemption note as satisfying the AC by reference to the existing pattern endpoint.
4. Verify the real endpoint works:
   - `npx prisma generate`
   - `npx prisma db push --accept-data-loss --skip-generate` (or `migrate deploy` if migrations exist)
   - `npm run seed`
   - `npx tsc --noEmit`
   - `npx vitest run src/__tests__/{feature}-api.test.ts`
   - `npm run build`
   - smoke test: `curl -s http://localhost:{port}/api/{endpoint}`

## How to defend it in code review / QA

Map the generic ACs to evidence rather than phantom code:

| AC | Evidence |
|---|---|
| "Input validation using Zod for all POST/PUT" | No POST/PUT in scope; existing `/api/newsletter` demonstrates the project's Zod POST pattern. Exemption documented in route comment. |
| "Rate limiting on form submission endpoints" | No form submission in scope; existing `/api/newsletter` implements 5/min/IP rate limiting. Exemption documented in route comment. |
| "Proper JSON responses / status codes" | GET returns `{ success, data }` / `{ success, false, error, data: null }`. Tests verify 200/500. |

## Template route comment

```ts
// {TICKET} is read-only for the {SECTION} scope; no POST/PUT here.
// {requirement} examples live in {existing-post-endpoint}.
```

Example from KAN-47:
```ts
// KAN-47 is read-only for the Hero/CTA scope; no POST/PUT here.
// Rate limiting + Zod POST examples live in /api/newsletter.
```
