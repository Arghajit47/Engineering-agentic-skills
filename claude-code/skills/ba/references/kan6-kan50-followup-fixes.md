# KAN-6 / KAN-50 Follow-Up Design Fidelity Fixes

Real-world fixes that closed remaining Figma-to-UI discrepancies after the initial KAN-50 bug fix.

## Original remaining gaps (post-KAN-50 first pass)

After KAN-50 fixed 14 design fidelity violations, the user still found these issues:

1. **Property cards had variable heights** — should be static/deterministic per breakpoint.
2. **"View property details" button was full-width below the price** — Figma shows it beside the price, right-aligned.
3. **Subheaders were paraphrased placeholder text** — Figma text must be copied exactly from the source of truth.
4. **Font and icon colors were slightly off** — headings/subheaders/specs/icons must match Figma hex values strictly.

## Exact fixes applied

### 1. Static card heights

Property cards now use explicit heights per breakpoint:

```tsx
<article className="flex h-[480px] flex-col md:h-[520px] lg:h-[580px] xl:h-[620px]">
```

Skeletons use the same heights so loading state matches layout.

### 2. Button beside price, right-aligned

```tsx
<div className="mt-4 flex items-end justify-between">
  <div>
    <p className="text-xs text-[#666666]">Price</p>
    <p className="text-xl font-bold text-white">{price}</p>
  </div>
  <button className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white">
    View property details
  </button>
</div>
```

### 3. Exact Figma subheaders

Source of truth was the original KAN-6 ticket description, which contained the exact strings:

- **Featured Properties:** "Explore our handpicked selection of featured properties. Each listing offers a glimpse into exceptional homes and investments available through Estatein."
- **Testimonials:** "Read the success stories and heartfelt testimonials from our valued clients. Discover why they chose Estatein for their real estate needs."

Lesson: when the user says "exact text from Figma", the BA must embed the literal string in the ticket, and the developer must paste it verbatim. No paraphrasing.

### 4. Strict color values

| Element | Tailwind class | Figma-ish hex |
|---------|---------------|---------------|
| Heading | `text-white` | #FFFFFF |
| Subheading / description / specs | `text-[#999999]` | #999999 |
| Price label | `text-[#666666]` | #666666 |
| Price value | `text-white` | #FFFFFF |
| Star rating filled | `fill-[#703BF7]` / `text-[#703BF7]` | #703BF7 |
| Specs icons | `text-[#999999]` | #999999 |

Always use explicit hex when Tailwind's default palette cannot match Figma precisely.

## Verification script

See `references/live-ui-layout-audit.py` for a Playwright script that captures exact bounding boxes, font sizes, colors, and positions from the running dev server at each breakpoint.

## Lesson for BA skill

- Text inventory must include exact strings, and the ticket must cite the source (e.g., "from KAN-6 description" or "from Figma node X").
- Card layout inventory must specify static vs fluid height and the exact position of every button relative to other fields.
- Color inventory must list explicit hex values for every text/icon element, not just Tailwind approximations.
