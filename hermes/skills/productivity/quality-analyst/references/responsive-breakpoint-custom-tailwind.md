# Responsive Custom Breakpoints for Fidelity — Tailwind v4

When a ticket gives exact breakpoint dimensions (e.g., Figma: 390px mobile, 1440px laptop, 1920px desktop) and Tailwind's default `sm/md/lg/xl/2xl` do not align with those targets, **add custom breakpoints** rather than pretending the default buckets are "close enough".

This reference captures the pattern used in BC-1 to make a Navbar match Figma exactly.

## Default Tailwind v4 breakpoints vs. Figma targets

| Tailwind prefix | Default min-width | Figma target |
|---|---|---|
| `md` | 768px | — |
| `lg` | 1024px | often overlaps with "laptop" but not always |
| `xl` | 1280px | usually overlaps with "desktop" but starts too early |
| `2xl` | 1536px | too late for 1440px |

For BC-1 the default breakpoints caused the 1440px "laptop" viewport to inherit the 95px desktop height instead of the required 73px.

## Fix: declare named breakpoints in `@theme inline`

In Tailwind v4 CSS-first config (`src/app/globals.css`):

```css
@import "tailwindcss";

@theme inline {
  /* ...colors/fonts... */
  --breakpoint-laptop: 1440px;
  --breakpoint-desktop: 1920px;
}
```

Tailwind v4 auto-generates `laptop:` and `desktop:` prefixes from these CSS variables.

## Usage in component

```tsx
<nav className="h-[68px] px-4 laptop:h-[73px] laptop:px-20 desktop:h-[95px] desktop:px-[162px]">
```

## QA verification recipe

Run the production build and measure actual heights with Playwright at the exact target viewports:

```python
import asyncio, json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        results = {}
        for name, w in [('mobile',390),('laptop',1440),('desktop',1920)]:
            page = await browser.new_page(viewport={'width': w, 'height': 800})
            await page.goto('http://localhost:3000/')
            await page.wait_for_timeout(500)
            h = await page.evaluate('document.querySelector("header nav").clientHeight')
            results[name] = h
            await page.close()
        await browser.close()
        print(json.dumps(results, indent=2))

asyncio.run(main())
```

Expected output should be exact: `mobile 68`, `laptop 73`, `desktop 95`.

## Lessons

- A responsive mismatch that only shows up at one specific design breakpoint is a real defect, not a "non-blocking observation".
- The first attempt to fix BC-1 using `lg:` and `xl:` failed because those breakpoints do not map to the ticket's 1440px/1920px targets.
- Always verify at the exact viewport widths listed in the ticket, not just the nearest Tailwind default.
