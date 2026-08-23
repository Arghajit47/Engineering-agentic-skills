#!/usr/bin/env python3
"""
Live UI Layout Audit — Playwright script
Extracts precise layout measurements from a running dev server at multiple breakpoints.
Use this to compare the implemented UI against a Figma design inventory numerically.

Outputs JSON with:
- Heading positions, sizes, font sizes, colors, alignment
- Card positions, sizes, counts per breakpoint
- Navigation arrow positions and disabled states
- Button counts, price label counts, broken image counts

Usage:
  python3 live_ui_layout_audit.py http://localhost:3000
"""

import sys
import json
import time
from playwright.sync_api import sync_playwright

DEFAULT_URL = "http://localhost:3000"
BREAKPOINTS = [1920, 1440, 1024, 768, 375]


def audit_page(url: str) -> dict:
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until="networkidle", timeout=15000)
        # Wait for any client-side loading timeout (e.g. 800ms skeleton)
        time.sleep(1.5)

        for width in BREAKPOINTS:
            page.set_viewport_size({"width": width, "height": 1080})
            time.sleep(0.8)

            data = page.evaluate(
                """
                () => {
                    const box = (sel) => {
                        const el = document.querySelector(sel);
                        if (!el) return null;
                        const rect = el.getBoundingClientRect();
                        const cs = getComputedStyle(el);
                        return {
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            w: Math.round(rect.width),
                            h: Math.round(rect.height),
                            text: el.textContent.trim().substring(0, 60),
                            bg: cs.backgroundColor,
                            color: cs.color,
                            fontSize: cs.fontSize,
                            fontWeight: cs.fontWeight,
                            textAlign: cs.textAlign
                        };
                    };
                    const all = (sel) => Array.from(document.querySelectorAll(sel)).map((el, i) => {
                        const rect = el.getBoundingClientRect();
                        const cs = getComputedStyle(el);
                        return {
                            index: i,
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            w: Math.round(rect.width),
                            h: Math.round(rect.height),
                            text: el.textContent.trim().substring(0, 40),
                            bg: cs.backgroundColor,
                            color: cs.color,
                            fontSize: cs.fontSize,
                            fontWeight: cs.fontWeight
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
                        viewDetails: document.querySelectorAll('[data-testid*="view-details-"]').length,
                        priceLabels: document.querySelectorAll('[data-testid*="price-label-"]').length,
                        brokenImages: Array.from(document.querySelectorAll('img')).filter(i => i.naturalWidth === 0).length
                    };
                }
                """
            )
            results[width] = data

        browser.close()
    return results


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    results = audit_page(url)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
