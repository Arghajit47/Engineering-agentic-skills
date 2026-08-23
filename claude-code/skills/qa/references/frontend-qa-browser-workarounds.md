# Frontend QA: Browser Tool Fallbacks & Measurement Techniques

Session-proven techniques for when the default `browser_navigate` + `browser_vision` path
doesn't work. These recur on this user's setup and are the authoritative fallbacks —
not "tools are broken" claims, but known constraints with working alternatives.

## 1. browser_navigate blocks localhost / private addresses

`browser_navigate` refuses `http://localhost:3000` and other private/loopback URLs by
security policy: *"Blocked: URL targets a private or internal address"*.

**Fallback — Chrome MCP tools (when a real Chrome is connected via the Chrome MCP extension):**
- `mcp__chrome_mcp__chrome_navigate` — opens/activates a tab at the URL (works for localhost).
- `mcp__chrome_mcp__chrome_javascript` — `Runtime.evaluate` with `awaitPromise`. Use this for
  all DOM extraction: `document.querySelectorAll('[data-testid=...]').length`, textContent,
  computed styles, etc. Return a JSON object from the expression; it's serialized back.
- `mcp__chrome_mcp__chrome_screenshot` — viewport or full-page PNG. `fullPage=true` can time
  out on very tall pages; use `fullPage=false` for a viewport-only capture when the full-page
  call times out.
- `mcp__chrome_mcp__chrome_console` — `mode="buffer"`, `onlyErrors=true` for the no-errors check.
- `mcp__chrome_mcp__chrome_computer` with `action="resize_page"` — set viewport width/height
  for breakpoint testing. Follow with a short `action="wait"` (500ms) for React re-render.

**Fallback — Playwright headless via terminal (when both browser_navigate AND Chrome MCP are unavailable):**
```js
// Use when browser_navigate blocks localhost AND Chrome MCP reports "Failed to connect".
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:3000/properties', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000); // allow mock data / images to settle
  // DOM extraction: textContent, computed styles, image load status (naturalWidth > 0)
  const result = await page.evaluate(() => ({ ... }));
  console.log(JSON.stringify(result));
  await browser.close();
})();
```
Exercises the real DOM, network calls, console errors, image loading, and responsive behavior.
Sufficient for all Frontend and Integration scope checks.

**Common pagination gotcha:** Mock data items 7–9 (e.g. Whispering Pines Mansion, Lakeside Stone
Cottage, Vineyard Valley Estate on a 6-items-per-page grid) are NOT visible on page 1 load. To check
them, click the Next button via `[data-testid="next-page-btn"]` locator first, then assert.

**Ponytail note:** Don't run both `browser_navigate` and `chrome_navigate` — pick the Chrome
MCP path once and stick with it for the whole session if the target is localhost.

## 2. No vision model → responsive/layout TCs via computed gridTemplateColumns

When the active model lacks vision, `browser_vision` and `vision_analyze` return
*"this model does not support image input"*. The Figma-vs-build visual comparison can't
be done pixel-wise. But responsive layout TCs (column counts at each breakpoint) have an
**authoritative ground truth** that doesn't need vision: the computed `gridTemplateColumns`.

**Recipe — breakpoint verification via CDP:**
```js
// After chrome_computer resize_page to the target width + 500ms wait:
const cs = (el) => window.getComputedStyle(el);
const fpGrid = document.querySelector('[data-testid="featured-properties-section"] .grid');
const tmGrid = document.querySelector('[data-testid="testimonials-section"] .grid');
return {
  vp: { w: window.innerWidth, h: window.innerHeight },
  fp: { cols: cs(fpGrid).gridTemplateColumns,
         colCount: cs(fpGrid).gridTemplateColumns.split(' ').filter(Boolean).length },
  tm: { cols: cs(tmGrid).gridTemplateColumns,
         colCount: cs(tmGrid).gridTemplateColumns.split(' ').filter(Boolean).length },
};
```
`colCount` is the actual rendered column count at that viewport — it accounts for Tailwind's
`sm:`/`lg:`/`xl:` breakpoints without you having to reason about which prefix applies at which
width. Run this at 1920, 1440, 1024, 768, 375 (or whichever the ticket specifies). Compare
`colCount` to the expected value from the TC.

**For non-layout visual TCs** (image present, text content, alt attributes, aria-labels,
data-testid presence): a single `chrome_javascript` DOM extraction pass post-load gives all
of it in one call. Example return shape:
```js
{
  allTestIds: [...].map(e => e.getAttribute('data-testid')),
  allTitles: [...].map(h => h.textContent.trim()),
  allPrices: [...].map(s => s.textContent.trim()),   // verify Intl.NumberFormat formatting
  starAriaLabels: [...].map(s => s.getAttribute('aria-label')),
  starRoles: [...].map(s => s.getAttribute('role')),
  // ...etc
}
```

**What you still can't do without vision:** pixel-level Figma color/spacing/typography
comparison. Document this as a measurement caveat in the results comment — don't fake it.
The DOM structure + computed columns matching the Figma screenshots is strong evidence the
layout is correct; full pixel-diff requires a vision-capable model or a Playwright
screenshot-diff harness.

## 3. Lighthouse: next dev vs next build

Lighthouse run against `next dev` scores significantly lower on Performance than the same
app built for production — dev bundles are unminified, include HMR runtime and source maps,
and lack production optimizations. A score of 50–60 against `next dev` is common even for
well-built apps; the same app via `next build && next start` typically scores 90+.

**Rule:** Before reporting a Lighthouse Performance failure against the ">90" DOD gate,
re-run against a production build:
```bash
npm run build && npm run start   # or: next build && next start
npx lighthouse http://localhost:3000 --output=html --output-path=/tmp/lh.html --quiet \
  --chrome-flags="--headless=new --no-sandbox"
```
If the prod score is still <90, THEN it's a real failure — document the opportunities
(largest-contentful-paint, unused JS, image format, no next/image, no preconnect).
If prod passes, note the dev-score artifact in the report but don't fail the ticket on it.

**Observed scores (KAN-6, Next.js 16.2.10, Unsplash images via raw `<img>`):**
- `next dev` on port 3000: Performance 53, A11y 95, BP 100, SEO 100
- `next start` on port 3001 (same code): Performance 80, A11y 95, BP 100, SEO 100
- After fix (w=600 images, width/height attrs): Performance 94, A11y 100, BP 100, SEO 100
The 80→94 jump came from reducing Unsplash image sizes from w=1200 to w=600 and adding
width/height attributes to prevent CLS. The remaining gap (94 vs 100) is LCP from
external Unsplash images without next/image optimization.

**Extracting scores from the HTML report** (the JSON blob parse can fail on large reports):
```bash
grep -oE '"(performance|accessibility|best-practices|seo)"[^}]*"score":[0-9.]+' /tmp/lh.html
```
gives `"performance","score":0.53` etc. Multiply by 100, round.

## 4. Transient useEffect-timer render states (loading skeletons)

TCs for loading-skeleton states (e.g. "6 skeleton cards visible when isLoading=true") can't
be captured by post-navigation JS polling when the loading gate is a `useEffect` `setTimeout`.
Reason: by the time `chrome_javascript` can execute, the page has already reached
"interactive" — which is after the timer (e.g. 800ms) has fired and `loading` flipped to
false. The first DOM sample shows content, not skeletons.

**Fallback — source review is authoritative here:**
1. Read the component source. Confirm `loading` (or `isLoading`) starts `true` in state.
2. Confirm the `useEffect` that flips it false (e.g. `setTimeout(..., 800)`).
3. Confirm the render branch: `loading ? <SkeletonGrid/> : <ContentGrid/>`.
4. Confirm the skeleton count matches the TC (e.g. `Array.from({length: 6}).map(...)`).
5. Cite the source lines (e.g. "FeaturedProperties.tsx L101-106") as evidence.

For visual proof (optional, if a Playwright harness is available):
```js
await page.goto('http://localhost:3000');
const skeletons = await page.locator('.animate-pulse').count();
// capture within the timer window — no waitForLoadState, race the timer
```
A Playwright `page.goto` + immediate `locator.count()` with no `waitForLoadState` can
catch the skeleton before the timer fires. Not worth spinning up if the source review is
unambiguous — record the measurement caveat and move on.

## 5. Multi-breakpoint Playwright audit for repeated browser-tool timeouts

Frontend QA sub-agents can hit the ~600s / ~50-call iteration limit when each breakpoint
requires a separate `browser_navigate` + `browser_vision` + `browser_console` cycle.
A single Playwright script that iterates breakpoints and extracts all DOM evidence in one
go is far more efficient and gives machine-readable JSON output for the results table.

See `references/playwright-frontend-audit.md` for a reusable template and the `page.on("pageerror")`
recipe for catching React hydration errors.

## 6. Cross-scope console errors can block a ticket's AC

A Frontend ticket's "No console errors" AC can fail because of a bug in another scope's
component that happens to render on the same page. Example: KAN-15 (Home Page Hero & CTA)
failed TC-012 because `Navbar.tsx` (KAN-14, Navigation & Footer Integration) had a React
hydration mismatch. The Hero/CTA scope itself was clean, but the console error still violated
the Frontend ticket's acceptance criterion.

**Handling:**
1. Run the ticket's own scope checks first and record them as PASS/FAIL independently.
2. Capture the full console/page error with Playwright `page.on("pageerror")` or Chrome
   DevTools to identify the originating component and root cause.
3. In the QA comment, clearly separate:
   - "This ticket's scope: PASS"
   - "Cross-scope blocker: FAIL in `<Component>` (linked to `<other ticket>`)"
4. Transition the parent ticket back to In Progress and dispatch the fix sub-agent for the
   ticket whose AC is blocked. The fix PR should target the actual buggy component; the
   branch/comment should explain the cross-scope relationship.
5. Do not silently pass the ticket just because the error is "not in scope" — the AC is
   page-level. Do not silently fail the whole ticket without documenting which component
   is actually broken.

## 7. Attaching large files to JIRA via base64

`jira_add_attachment` takes `content_base64`. For files >~500KB the base64 string is large
and may get truncated in transit (observed: a 664KB HTML report attached as only 1.5KB —
the base64 was truncated by the tool layer). **Mitigation:** for large reports, extract the
key numbers into a small `.txt` summary and attach that instead. Reference the full file's
local path in the comment body. Alternatively, chunk the base64 and attach in parts — but
the summary-file approach is simpler and carries the actionable data.

## 8. Next.js remote `<Image>` fails in production with HTTP 400

**Symptom:** A Next.js `<Image>` tag is present on the page (`img.complete === true`), but
`img.naturalWidth === 0` and `img.naturalHeight === 0`. The `src` is a local
`/_next/image?url=https%3A%2F%2Fimages.unsplash.com%2F...` URL. Curling that URL returns
HTTP 400. Local `next dev` renders the same image fine. The right side of the hero section
appears as a blank/black area in a screenshot.

**Root cause:** `next.config.ts` does not list `images.unsplash.com` (or the relevant remote
host) in `images.remotePatterns` / `images.domains`. Next.js refuses to optimize remote
images from unconfigured hosts in production builds.

**Detection recipe:**
```js
Array.from(document.querySelectorAll('img')).map(img => ({
  alt: img.alt,
  src: img.src,
  naturalWidth: img.naturalWidth,
  naturalHeight: img.naturalHeight,
  broken: img.naturalWidth === 0
}));
```
Then curl the failing `/_next/image?url=...` URL:
```bash
curl -s -o /dev/null -w "%{http_code}" "https://<site>/_next/image?url=<encoded-url>&w=3840&q=75"
# expect 400 when host is not allowed
```

**Fix:**
```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // add other external image hosts here as needed
    ],
  },
};

export default nextConfig;
```

**QA note:** Always verify remote `<Image>` elements against the *live deployment*, not just
`next dev`. Dev mode is permissive and will hide the 400. Include a dedicated TC:
"All remote images load successfully on live deployment" and check `naturalWidth > 0`.
