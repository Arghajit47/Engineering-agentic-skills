# Integration tickets: API response shape vs. global fetcher wrapper mismatch

## Problem

An Integration ticket wires existing Frontend components to existing Backend endpoints. The codebase usually provides a shared fetcher (e.g., `src/lib/api.ts`) that expects a uniform API envelope such as `{ success: boolean, data: T, error?: string }`. A Backend ticket may have been built before that convention existed, or the endpoint may return raw JSON by design. Reusing the global fetcher against an endpoint that returns raw JSON causes SWR/React Query to throw on every successful 200 response, leaving the UI in a permanent error state.

In KAN-37 (`[Integration] Property Details Pricing & Contact`), the existing global `fetcher` threw on `/api/properties/[slug]/pricing` because the route returned raw JSON:

```json
{
  "propertySlug": "modern-villa-in-sunset-hills",
  "breakdown": { ... },
  "totalPrice": 259000
}
```

while the fetcher expected `{ success: true, data: ... }`. The same page's other endpoint (`/api/properties/[slug]`) already used the wrapper, so the mismatch was not universal.

## Detection checklist

Before telling an Integration sub-agent to reuse the codebase's global fetcher/SWR hook:

1. Read the target backend route(s). Look at the `return NextResponse.json(...)` shape.
2. Read the shared fetcher/hook implementation (`src/lib/api.ts`, `src/lib/fetcher.ts`, etc.). Note whether it checks `payload.success` or `res.ok` only.
3. Compare the two. If the route does not return the wrapper the fetcher expects, they are incompatible.

## Allowed fixes (in ponytail order)

1. **Use a local, dedicated fetch for the mismatched endpoint** (preferred for integration-only tickets). Keep the global fetcher untouched and add a small local async helper that returns the raw JSON directly. Example:
   ```ts
   async function fetchPricing(slug: string): Promise<PricingBreakdownData> {
     const res = await fetch(`/api/properties/${encodeURIComponent(slug)}/pricing`);
     if (!res.ok) throw new Error("Failed to load pricing");
     return res.json();
   }
   ```
   Then pass `fetchPricing` as the SWR fetcher for that key, or call it inside a server component.

2. **Fix the backend route to match the codebase convention** only when the route is clearly an outlier and changing it does not break other consumers. Update the route tests to match. This is the right choice when the rest of the API is already consistent and the route is new or low-risk.

3. **Add a discriminating fetcher** in `src/lib/api.ts` that detects the wrapper and returns either `payload.data` or the raw payload. Only do this if multiple routes are mixed and you cannot change the backend. This adds a small amount of global complexity, so prefer (1) or (2).

## What to put in instructions.txt

When dispatching the Integration sub-agent, explicitly state which endpoint uses the global fetcher and which needs a dedicated fetch, e.g.:

```
- GET /api/properties/{slug} -> use the shared fetcher from @/lib/api (returns {success,data})
- GET /api/properties/{slug}/pricing -> use a LOCAL fetcher; endpoint returns raw JSON, not {success,data}
- POST /api/contact/property -> use plain fetch; endpoint returns {success, message, submissionId}
```

## Why this matters

A silent mismatch makes the integration look broken even though both the frontend component and the backend route are individually correct. The sub-agent can waste iterations debugging SWR error states instead of wiring data. Catching the mismatch in the Senior Developer's pre-dispatch analysis keeps the fix to one or two lines in the page file.
