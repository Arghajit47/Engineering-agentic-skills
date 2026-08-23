# Frontend QA with Standalone Browser Tools

Session-proven techniques for running Frontend QA regressions when only the built-in
`browser_*` tools are available (no Chrome MCP, no vision model). Covers breakpoint
checks, broken-image detection, console-error verification, and computed-style assertions.

## When to use this reference

- User asks: "Re-test KAN-X against the live deployment and local prod build."
- `browser_navigate` works for public URLs, but `mcp__chrome_mcp__chrome_*` is unreachable.
- `browser_vision` is available and should still be used for layout sanity checks, but the
  authoritative pass/fail evidence comes from DOM + computed-style extraction via
  `browser_console(expression=...)`.

## 1. Setup: read the Jira ticket matrix first

Use `jira_get_issue` / `jira_search_issues` to fetch:
- The QA subtask (e.g., `KAN-65`) with the numbered X_RAY test cases.
- The implementation ticket (e.g., `KAN-15`) for Figma breakpoints and acceptance criteria.

Extract into a TODO list so each TC has a status.

## 2. Two-pass structure

| Pass | Target | Purpose |
|------|--------|---------|
| 1. Live deployment | `https://<deployed-site>` | Real production behavior, remote images, CDN, console errors |
| 2. Local prod build | `http://localhost:3001` after `npm run build && npx next start -p 3001` | Lighthouse, build-time image optimization, prod-only config bugs |

Do **not** rely on `next dev` for Lighthouse or remote-image validation — dev mode is
permissive and will hide production image-host restrictions and performance issues.

## 3. DOM extraction via `browser_console(expression=...)`

The standalone `browser_console` tool supports an `expression` argument that evaluates in
the page context and returns JSON. This is the fallback when `browser_cdp` methods are not
available (this backend rejects `Emulation.setDeviceMetricsOverride` and `Runtime.evaluate`).

### H1 / heading check
```js
document.querySelector('h1')?.textContent.trim()
```

### Responsive text alignment
```js
(() => {
  const h1 = document.querySelector('h1');
  const style = h1 ? getComputedStyle(h1) : null;
  return { text: h1?.textContent.trim(), textAlign: style?.textAlign, color: style?.color };
})()
```

### Stats labels
```js
(() => {
  const full = document.body.innerText;
  return {
    happy: full.includes('Happy Customers'),
    propertiesForClients: full.includes('Properties For Clients'),
    years: full.includes('Years of Experience')
  };
})()
```

### Broken-image check (all images)
```js
Array.from(document.querySelectorAll('img')).map(img => ({
  alt: img.alt,
  naturalWidth: img.naturalWidth,
  naturalHeight: img.naturalHeight,
  broken: img.naturalWidth === 0
}))
```

### Feature card inventory
```js
(() => {
  const expected = ['Find Your Dream Home','Unlock Property Value','Effortless Property Management','Smart Investments. Informed Decisions'];
  const cards = Array.from(document.querySelectorAll('a')).filter(a => expected.includes(a.textContent.trim()));
  return cards.map(a => ({
    title: a.textContent.trim(),
    href: a.href,
    icon: a.querySelector('svg, img') ? 'yes' : 'no'
  }));
})()
```

### Semantic headings + ARIA regions
```js
(() => {
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({
    level: h.tagName,
    text: h.textContent.trim().slice(0, 80)
  }));
  const regions = Array.from(document.querySelectorAll('section, [role="region"]')).map(r => ({
    tag: r.tagName,
    ariaLabel: r.getAttribute('aria-label'),
    text: r.textContent.trim().slice(0, 40)
  }));
  return { headings, regions };
})()
```

### Computed theme colors
```js
(() => {
  const body = getComputedStyle(document.body).backgroundColor;
  const hero = document.querySelector('section');
  const heroBg = hero ? getComputedStyle(hero).backgroundColor : null;
  const h1 = document.querySelector('h1');
  const h1Text = h1 ? getComputedStyle(h1).color : null;
  const ctaPrimary = Array.from(document.querySelectorAll('a, button')).find(el => el.textContent.trim() === 'Browse Properties');
  const ctaSec = Array.from(document.querySelectorAll('a, button')).find(el => el.textContent.trim() === 'Learn More');
  return {
    body,
    heroBg,
    h1Text,
    ctaPrimaryBg: ctaPrimary ? getComputedStyle(ctaPrimary).backgroundColor : null,
    ctaSecBorder: ctaSec ? getComputedStyle(ctaSec).borderColor : null
  };
})()
```

## 4. Console-error check (TC-012 class)

1. `browser_console(clear=true)` immediately after `browser_navigate`.
2. Interact with CTA buttons / feature cards.
3. `browser_console()` after each interaction.

If all three calls return `js_errors: []`, TC-012 passes. Any non-empty array is a FAIL.
Capture the stack/component name and report which ticket's component it originates from
(see `frontend-qa-browser-workarounds.md` §6 on cross-scope console errors).

## 5. Responsive breakpoints

The standalone `browser_cdp` backend may not support `Emulation.setDeviceMetricsOverride`.
Two practical alternatives:

- **Preferred when available:** use `mcp__chrome_mcp__chrome_computer` with
  `action="resize_page"` and reload the page, then re-run the DOM extraction snippets.
- **When only standalone tools are available:** use `browser_vision` for approximate
  layout inspection and document the viewport caveat; run the breakpoint-specific checks
  from a Playwright script via `terminal` if precise column counts are required (see
  `design-fidelity-audit.md`).

Do not fail a TC purely because the backend can't resize — document the measurement method.

## 6. Local prod build + Lighthouse

```bash
cd <repo>
npm run build
npx next start -p 3001 &
npx lighthouse http://localhost:3001 --output=json --output-path=/tmp/lh.json \
  --quiet --chrome-flags="--headless=new --no-sandbox"
python3 -c "
import json
with open('/tmp/lh.json') as f: d=json.load(f)
c=d.get('categories',{})
for k in ['performance','accessibility','best-practices','seo']:
    print(f'{k}: {c.get(k,{}).get(\"score\",\"?\")}')
"
```

Note: `browser_navigate` may block `http://localhost` URLs on this backend. If so, rely on
the Lighthouse CLI + a Playwright script for local DOM assertions.

## 7. Jira results comment format

Post a single comment to the QA subtask (e.g., `KAN-65`) with:
- A status table: TC ID | Status | Evidence | Notes.
- Severities aligned with the original TC priorities.
- Any broken-image list, console errors, and Lighthouse scores.
- A clear PASS/FAIL verdict and recommended ticket transition.

See `references/qa-comment-format.md` for the standard markdown template.

## 8. Common findings to expect on this stack

- **Remote `<Image>` broken in prod:** Next.js requires `images.remotePatterns` for external
  hosts. Dev hides it; live deployment shows `/_next/image?url=...` 400s and
  `naturalWidth === 0`.
- **Console errors from another scope:** A different component on the same page can fail a
  ticket's "no console errors" AC. Identify the originating component, file the bug against
  that component's ticket, and note the cross-scope blocker.
- **H1 left-aligned vs center-left:** Check exact `textAlign` value; Figma may call it
  "center-left" while CSS renders `text-align: left` for the primary heading block.
