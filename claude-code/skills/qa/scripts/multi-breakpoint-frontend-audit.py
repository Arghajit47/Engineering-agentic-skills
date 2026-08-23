#!/usr/bin/env python3
"""Multi-breakpoint frontend audit for a live deployment.

Usage:
    python3 multi-breakpoint-frontend-audit.py <URL> [OUT_DIR]

Default breakpoints: 1920, 1440, 1024, 768, 375.
Outputs:
- OUT_DIR/about-us-<w>.png full-page screenshots
- OUT_DIR/audit.json with DOM evidence per breakpoint

Use this when the standalone browser tool is too slow for per-breakpoint checks
or when precise gridTemplateColumns / content / image evidence is required.
"""
import json
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DEPLOYED_URL", "")
if not URL:
    sys.exit("error: pass the deployed URL as argv[1] or set DEPLOYED_URL. "
             "QA evidence comes from the deployed production URL only — never localhost, "
             "never a preview alias. Ask the user for it and save it to project-config.local.md.")
OUT_DIR = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("/tmp/frontend-audit")
BREAKPOINTS = [
    ("1920", 1920, 1080),
    ("1440", 1440, 900),
    ("1024", 1024, 768),
    ("768", 768, 1024),
    ("375", 375, 667),
]

JS_SNAPSHOT = """
() => {
  const text = document.body.innerText;
  const imgs = Array.from(document.querySelectorAll('img')).map(img => ({
    alt: img.alt,
    src: img.src,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    broken: img.naturalWidth === 0
  }));
  const closestGrid = (id) => {
    const s = document.querySelector(`h2#${id}`)?.closest('section');
    const g = s?.querySelector('[class*="grid"]');
    return g ? {
      class: g.className,
      columns: getComputedStyle(g).gridTemplateColumns,
      columnCount: getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length,
      gap: getComputedStyle(g).gap,
      children: g.children.length
    } : null;
  };
  const card = document.querySelector('[class*="bg-[#1a1a1a]"]');
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    hasOurJourney: text.includes('Our Journey'),
    hasContinuousGrowth: text.includes('continuous growth and evolution'),
    statsOk: [
      text.includes('200+') && text.includes('Happy Customers'),
      text.includes('10k+') && text.includes('Properties For Clients'),
      text.includes('16+') && text.includes('Years of Experience')
    ],
    valuesOk: ['Trust', 'Excellence', 'Client-Centric', 'Our Commitment'].map(v => text.includes(v)),
    achievementsOk: ['Our Achievements', '3+ Years of Excellence', 'Happy Clients', 'Industry Recognition'].map(v => text.includes(v)),
    valuesGrid: closestGrid('our-values-heading'),
    achGrid: closestGrid('our-achievements-heading'),
    statsGrid: closestGrid('our-journey-heading'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    cardBg: card ? getComputedStyle(card).backgroundColor : null,
    imgCount: imgs.length,
    brokenImages: imgs.filter(i => i.broken).length,
    images: imgs
  };
}
"""


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        for name, w, h in BREAKPOINTS:
            page.set_viewport_size({"width": w, "height": h})
            page.goto(URL, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(3000)
            page.screenshot(path=str(OUT_DIR / f"about-us-{name}.png"), full_page=True)
            info = page.evaluate(JS_SNAPSHOT)
            results.append({"breakpoint": name, "info": info})
        browser.close()

    payload = {"url": URL, "errors": errors, "results": results}
    with open(OUT_DIR / "audit.json", "w") as f:
        json.dump(payload, f, indent=2)
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
