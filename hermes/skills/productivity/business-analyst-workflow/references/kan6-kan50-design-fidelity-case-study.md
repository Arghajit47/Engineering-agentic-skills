# KAN-6 → KAN-50 Design Fidelity Case Study

Real-world example of what happens when the Complete Figma Design Inventory is skipped, and how to recover.

## What Failed (KAN-6)

KAN-6 `[Frontend] Home Page Featured Properties & Testimonials` was developed and marked Done. The BA skill produced ACs without extracting the actual Figma design inventory. The developer sub-agent had no vision and could not see screenshots. QA rubber-stamped 35/35 pass without comparing the UI to Figma.

The result: **14 CRITICAL/HIGH design fidelity violations** reached production:

| # | Violation | Figma (correct) | UI (wrong) |
|---|-----------|---------------|------------|
| 1 | Heading alignment | Left-aligned | Center-aligned |
| 2 | Subheading text | Exact Figma copy | Paraphrased, wrong text |
| 3 | Pagination arrows | Left + right arrows present | Missing entirely |
| 4 | Desktop card count | 3 visible cards + arrows | 6 cards in static grid |
| 5 | Laptop card count | 3 visible + arrows | 6 cards |
| 6 | Tablet HD card count | 2 visible + arrows | 2 cards, no arrows |
| 7 | Tablet normal | 1 card full-width, arrows right-aligned | Not implemented |
| 8 | Mobile card count | 1 card, arrows right-aligned | Not implemented |
| 9 | Card description | Short description text | Missing |
| 10 | Card border style | Blended with bg (no border/ring/shadow) | ring-1 visible border |
| 11 | Specs row | Bedrooms / Bathrooms / Property Type | Bedrooms / Bathrooms / area sqft |
| 12 | Extra field | N/A — area size not in Figma | area sqft added |
| 13 | Price label | "Price" label above value | Missing label |
| 14 | CTA button | "View property details" button per card | Missing entirely |

Root cause: ACs were fabricated from assumptions, not extracted from Figma. The developer had no vision. QA only checked against the wrong ACs.

## How It Was Fixed (KAN-50)

A bug ticket KAN-50 was created. The design inventory was extracted offline because the Figma API was rate-limited for 30+ minutes.

### Extraction sources used
1. **.fig file extraction** — `meta.json` gave background color `rgb(30,30,30)`; `images/` folder had 50 embedded images (property photos, avatars, icons).
2. **PIL pixel analysis** on existing Figma screenshots at `/tmp/kan-6-screenshots/` — confirmed dark bg `rgb(20,20,20)`, left-aligned header text (starts at x=44), 3 cards at 1920px, arrows on both sides.
3. **User observations** — supplied exact field order, text strings, arrow alignment per breakpoint.

### Corrected design inventory

**Card count per breakpoint (VISIBLE with arrow navigation):**
- 1920px / 1440px: 3 property cards, 3 testimonial cards, arrows center-aligned
- 1024px: 2 property cards, 2 testimonial cards, arrows center-aligned
- 768px: 1 property card full-width, 1 testimonial card, arrows right-aligned
- 375px: 1 property card, 1 testimonial card, arrows right-aligned

**Property card field order (top-to-bottom):**
1. Property image
2. Property title
3. Property description
4. Specs row: bedrooms (icon + count), bathrooms (icon + count), property type (icon + text)
5. "Price" label
6. Price value (formatted USD)
7. "View property details" button

**Card style:** no border, no shadow, no ring — blended with section background.

## Implementation Changes

- Rewrote `FeaturedProperties.tsx` as a carousel with left/right arrows.
- Rewrote `Testimonials.tsx` as a carousel.
- Updated mock data: added `description`, changed `areaSqft` to `propertyType`.
- Removed card ring/border classes.
- Added "Price" label and "View property details" button.
- Updated tests from 35 to 51, all passing.

## Verification

- 51/51 Vitest tests pass
- `npx tsc --noEmit` clean
- Lighthouse prod build: Performance 93, Accessibility 95, Best Practices 100, SEO 100
- Chrome MCP / Playwright layout audit: 3 cards at 1920px, left-aligned headings, arrows present and correctly enabled/disabled, 0 broken images, 0 light-theme classes.

## Lessons

- Never write ACs from memory. Extract the 8-category inventory first.
- If Figma API is unavailable, use `.fig` extraction + pixel analysis + user observations — do not stop.
- QA must compare the running UI to Figma numerically, not just check against ACs.
- Sub-agents cannot see screenshots. Encode design as measurable data: RGB, positions, counts, alignment, exact text.