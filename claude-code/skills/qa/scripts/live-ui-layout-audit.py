#!/usr/bin/env python3
"""Live UI Layout Audit — capture measurable layout data from a running Next.js dev server.

Usage:
    python3 live-ui-layout-audit.py http://localhost:3000

Outputs /tmp/live_layout_audit.json with:
- heading/subheading positions, font sizes, colors, alignment
- card positions and dimensions per breakpoint
- arrow positions and disabled states
- button inventory and price-label presence
- broken image count

Use this to compare UI against the Figma design inventory numerically.
No vision required — the values are machine-readable.
"""
import json
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
BREAKPOINTS = [1920, 1440, 1024, 768, 375]
OUT_PATH = "/tmp/live_layout_audit.json"

JS_SNAPSHOT = """
() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      text: el.textContent.trim().substring(0, 80),
      color: s.color, bg: s.backgroundColor,
      fontSize: s.fontSize, fontWeight: s.fontWeight,
      textAlign: s.textAlign
    };
  };
  const all = (sel) => Array.from(document.querySelectorAll(sel)).map((el, i) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      index: i,
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      text: el.textContent.trim().substring(0, 60),
      color: s.color, bg: s.backgroundColor,
      fontSize: s.fontSize, fontWeight: s.fontWeight
    };
  });
  return {
    viewport: window.innerWidth,
    fpHeading: box('[data-testid="featured-properties-heading"]'),
    fpSubheading: box('[data-testid="featured-properties-subheading"]'),
    tmHeading: box('[data-testid="testimonials-heading"]'),
    tmSubheading: box('[data-testid="testimonials-subheading"]'),
    fpCards: all('[data-testid="property-card"]'),
    tmCards: all('[data-testid="review-card"]'),
    fpPrev: box('[data-testid="prev-arrow"]'),
    fpNext: box('[data-testid="next-arrow"]'),
    tmPrev: box('[data-testid="testimonials-prev-arrow"]'),
    tmNext: box('[data-testid="testimonials-next-arrow"]'),
    buttons: all('button').map(b => ({ text: b.textContent.trim().substring(0, 40), disabled: b.disabled })),
    viewDetailsCount: document.querySelectorAll('[data-testid*="view-details-"]').length,
    priceLabelCount: document.querySelectorAll('[data-testid*="price-label-"]').length,
    brokenImages: Array.from(document.querySelectorAll('img')).filter(i => i.naturalWidth === 0).length
  };
}
"""


def main():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(URL, wait_until="networkidle", timeout=15000)
        time.sleep(1.5)
        for w in BREAKPOINTS:
            page.set_viewport_size({"width": w, "height": 1080})
            time.sleep(0.8)
            results[w] = page.evaluate(JS_SNAPSHOT)
        browser.close()
    with open(OUT_PATH, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
