# New Route Exists but Nav / Seed / Tests Still Point to the Old Path

Session: KAN-20 (`/about` vs `/about-us`).

## Problem

A Frontend ticket correctly delivers a new page route (`/about-us`), but users clicking the Navbar "About Us" link see a blank page because the global navigation fallback and the seeded DB navigation links still point to the old path (`/about`). Several tests also assert the old path.

The real page renders fine at its canonical URL, but every entry point that users actually use is broken.

## Root cause

New-route work often stops at `src/app/{slug}/page.tsx`. The route itself is correct, but the surrounding ecosystem — nav fallbacks, DB seed, hardcoded CTAs, and tests — still references the previous path (or a path the BA/designer used casually in Figma, e.g., `/about` instead of `/about-us`).

## Checklist after creating a genuinely new route

1. **Global nav fallback arrays**
   - `src/components/layout/Navbar.tsx`
   - `src/components/layout/Footer.tsx` (if it has footer links)
   - Any other layout component with hardcoded links

2. **DB seed data**
   - `prisma/seed.ts` navigation links
   - Footer links, CTA hrefs, banner CTA hrefs
   - Any other seeded link/href data

3. **Hardcoded links in pages/components**
   - `src/app/page.tsx` hero CTAs
   - `src/components/sections/*.tsx`
   - Test-harness pages

4. **Tests that assert the old path**
   - Navbar tests
   - Navigation API tests
   - Footer tests
   - Any E2E page-object route constants

5. **Safety net: add a Next.js redirect**
   In `next.config.ts`, redirect the old path to the new canonical path so external bookmarks, search-indexed URLs, and user-typed URLs still work:

   ```ts
   redirects: async () => [
     {
       source: "/about",
       destination: "/about-us",
       permanent: true,
     },
   ],
   ```

   Do this even if you updated all internal links — it fixes URLs outside your control.

## Decision rule: redirect vs. changing canonical references

- Always update the canonical references (nav, seed, tests) to the real route.
- Always add the redirect as a safety net.
- Do not rely on only one of these; they serve different purposes.

## Verification

1. `npm run build` succeeds and the new route appears in the static route list.
2. `npm test -- --run` passes for Navbar, navigation API, footer, and new page tests.
3. Manually verify: clicking the Navbar "About Us" link at desktop and mobile widths navigates to `/about-us` and renders content.
4. Manually verify: visiting `/about` redirects to `/about-us` (use local `next start` after build, or deploy preview).
5. For Netlify deployments, confirm the redirect works on the live site — Netlify's Next.js runtime generally honors `next.config.ts` `redirects`, but test it once on the deploy preview.

## Related pitfall

See also `figma-page-vs-section-scope-check.md` for deciding whether a Frontend ticket is actually a new page route in the first place.
