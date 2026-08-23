# BC-74 Quality Failure Case Study

Session: 2026-08-09
Project: {{PROJECT_NAME}} / YourBank
Trigger: JIRA ticket BC-74 — comprehensive quality blast from the user after a Navbar/Footer delivery reached staging with multiple visual/brand failures.

## What shipped and why it failed

| Failure | Root cause | What the BA ticket should have prevented |
|--------|-----------|------------------------------------------|
| Logo was a lime diamond instead of the Figma 5-armed pinwheel | Inline placeholder SVG substituted for the real Figma asset. The ticket asset table listed a node ID but did not include the exact SVG path data, so the developer free-formed a rotated square. | Asset table must name the exact logo node ID **and** include verbatim exported `<path>` data. A node ID alone is insufficient. |
| Footer nav, contact, and copyright text invisible | `text-gray-500` (#6B7280) on `#1A1A1A` footer. Real design used lighter grey tokens. | Design theme section must list exact text-color tokens per element and state WCAG AA contrast status. |
| Mobile hamburger was a bare rectangle | Missing mobile-open state and radius spec in the design inventory. Developer shipped `border-radius: 2px` instead of `rounded-full`/`10px`. | Questionnaire must ask for every interactive state at every breakpoint; active/hover/focus/mobile-open styling is not optional. |
| Active nav link pill did not match Figma | Only font-weight change; missing `bg-[#CAFF33]`, `rounded-full`, `px-4 py-1` pill. | Active/selected state must be documented with exact background, radius, padding, and color. |
| Placeholder text wrong color and size | Inputs used near-white placeholder on white background. | Design theme must specify placeholder color and size; AC must require pre-PR search for placeholder defects. |
| Twitter icon was the X rebrand logo | Developer used an icon library instead of the Figma `asset-4.svg` Twitter bird. | Asset table must lock every social/brand icon node ID and include its SVG path data; no icon-library substitutions. |
| Hero image overflowed at 768px | No `overflow-hidden` on wrapper, no `max-w-full` on image. | ACs must require overflow/width verification at 390/768/1440/1920px. |

## User's minimum standard going forward

Developer:
1. Open the live preview and actually look at it.
2. Resize to 390px mobile. Check the hamburger.
3. Scroll to the footer and verify text is readable.
4. Open Figma side-by-side and compare every element.
5. Search the codebase for banned placeholder strings before every push: "Banking Company", "starter", "template", "YourBank" defaults, "Skillbridge", lorem ipsum.

Reviewer:
1. Pull the branch, run it locally, do not review from diff alone.
2. Test at 390px, 768px, 1440px, and 1920px.
3. Reject invisible text, wrong logo shape, missing mobile states, and placeholder copy.
4. Approval is personal accountability.

QA:
1. Test desktop 1920px, laptop 1440px, tablet 768px, mobile 390px — no exceptions.
2. Footer legibility, contrast, and visual comparison against Figma are test cases.
3. A ticket does not pass because the page loads; it passes when it matches the design at all breakpoints.
4. Logo shape must match the Figma asset; path count alone is not evidence.

## How to encode this in future BA tickets

For every Frontend/Integration ticket, add these AC bullets when the component contains nav/footer/brand/hero elements:

- No placeholder text remains in the component; all copy matches the Figma text layer exactly.
- All text colors on dark backgrounds are verified for contrast (WCAG AA ≥ 4.5:1) and match the Figma color token exactly.
- All logo/icon assets are exported from the Figma node IDs listed in the `Logos & Icons` section; the rendered SVG `<path>` data must byte-for-byte match the exported asset. No inline SVG substitutions.
- Mobile, tablet, laptop, and desktop breakpoints are tested; interactive elements (hamburger, active nav, CTAs) match the Figma state at each breakpoint.
- Placeholder text color and size match Figma; empty fields are distinguishable from filled fields.
- Social/brand icons match the Figma asset exactly; no third-party icon library substitutions.
- Every image, hero, and full-bleed section has `overflow-hidden` + `max-w-full` containment and is verified at 390/768/1440/1920px.
- Codebase search for banned placeholder strings returns zero results before PR is opened.

## Related references

- `references/kan6-kan50-design-fidelity-case-study.md` — prior design-fidelity failures.
- `references/figma-design-inventory.md` — the 8-category extraction questionnaire.
- `references/qa-comment-format.md` — how QA must evidence visual checks.
