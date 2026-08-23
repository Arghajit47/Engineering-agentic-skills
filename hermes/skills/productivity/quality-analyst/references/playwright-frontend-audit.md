# Multi-Breakpoint Playwright Frontend Audit

A fast, headless, no-vision-required way to verify a frontend ticket across all required
breakpoints in one run. Use this when `browser_navigate` + `browser_vision` per breakpoint
is too slow or when the active model has no vision.

## When to use

- Frontend scope ticket with multiple breakpoints (1920/1440/1024/768/375).
- Need to verify text content, CTA presence, image loading (`naturalWidth > 0`), and
  console/page errors at every breakpoint.
- Want to avoid the 600s sub-agent timeout that can happen with repeated browser-tool calls.

## Script

Save as `scripts/kan-frontend-audit.py` or copy inline per ticket. Replace `URL`,
`BREAKPOINTS`, and the selectors/content checks for the ticket at hand.

```python
#!/usr/bin/env python3
import json
import time
from playwright.sync_api import sync_playwright

URL = "{{DEPLOYED_URL}}"
BREAKPOINTS = [1920, 1440, 1024, 768, 375]
OUT_PATH = "/tmp/frontend_audit.json"

JS_SNAPSHOT = """
() => {
  const text = (el) => (el ? (el.textContent || '').trim() : '');
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      text: text(el).substring(0, 120),
      color: s.color, bg: s.backgroundColor,
      fontSize: s.fontSize, fontWeight: s.fontWeight,
      textAlign: s.textAlign
    };
  };
  const findByText = (sel, t) => Array.from(document.querySelectorAll(sel))
    .find(el => text(el).includes(t));

  const ctas = ['Browse Properties', 'Learn More'].map(label => {
    const el = findByText('a, button', label);
    return el ? { label, tag: el.tagName, ...box(el), href: el.href || null }
                : { label, found: false };
  });

  const featureCards = ['Find Your Dream Home', 'Unlock Property Value'].map(label => {
    const el = findByText('a, div, article', label);
    return el ? { label, ...box(el) } : { label, found: false };
  });

  const imgs = Array.from(document.querySelectorAll('img')).map(img => ({
    alt: img.alt,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    broken: img.naturalWidth === 0,
    src: img.currentSrc.substring(0, 120)
  }));

  return {
    viewport: window.innerWidth,
    heading: box(document.querySelector('h1')),
    ctas,
    featureCards,
    images: imgs,
    brokenImageCount: imgs.filter(i => i.broken).length,
  };
}
"""

def main():
    results = {}
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        for w in BREAKPOINTS:
            page.set_viewport_size({"width": w, "height": 1080 if w >= 768 else 812})
            page.goto(URL, wait_until="load", timeout=15000)
            time.sleep(2.5)  # let hydration + images settle
            results[w] = page.evaluate(JS_SNAPSHOT)
            page.screenshot(path=f"/tmp/frontend_audit_{w}.png", full_page=False)
        browser.close()
    results["pageErrors"] = errors
    with open(OUT_PATH, "w") as f:
        json.dump(results, f, indent=2)
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
```

## Key checks it replaces

- **TC-004 / TC-008 image loading:** `brokenImageCount` + per-image `naturalWidth`.
- **TC-001 heading/subheading:** `heading.text` at every breakpoint.
- **TC-002 CTAs:** `ctas` array verifies labels + bounding box.
- **TC-005 feature cards:** `featureCards` array verifies labels + visibility.
- **TC-012 console errors:** `page.on("pageerror")` catches React hydration errors
  and unhandled exceptions. Use in addition to (or instead of) `browser_console()`.

## Running it

```bash
python3 /tmp/kan-frontend-audit.py
# or, if the script lives in a skill references/scripts dir:
python3 $HOME/.claude/skills/qa/scripts/kan-frontend-audit.py
```

## Reading the output

`/tmp/frontend_audit.json` contains one entry per breakpoint plus `pageErrors`.
Use it to build the markdown results table for the JIRA QA subtask comment.

## Console-error gotcha

`browser_console()` can report a generic `{"message": "", "source": "exception"}` entry
without detail. Playwright's `page.on("pageerror")` gives the full error message and
stack context, which is essential for diagnosing React hydration mismatches.

## Timeout notes

- Use `wait_until="load"` + `time.sleep(2.5)` instead of `wait_until="networkidle"`.
  External images and analytics can keep networkidle from firing within 30s.
- If a page has a long `useEffect` timer before content appears, increase the sleep
  or poll for a specific element via `page.waitForSelector('[data-testid="..."]')`.
