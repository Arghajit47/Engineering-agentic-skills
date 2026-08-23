# Extracting Multi-Section Frontend Content from Figma JSON/PNGs

A Frontend ticket titled for one section (e.g. "Home Page Services Preview") may actually contain several independent sub-sections (Property Selling Service, Property Management Service, etc.). The Figma JSON `text_content_raw_best_effort` is noisy, truncated, and interleaved, so the main agent must extract the exact copy for every sub-section before dispatching the Frontend Developer.

## Extraction template

For each sub-section, capture:

1. **Section heading** — the large heading above the category cards.
2. **Section subheading / body** — the paragraph below the heading.
3. **Category cards** — for each card:
   - Title (icon name is chosen by the developer; sample one that semantically fits)
   - Description sentence
4. **Bottom CTA banner** — banner heading, banner body, button text, button href.

## Where to extract from

- Prefer the **largest-resolution JSON** (usually 1920px `figma-spec-1920-*.json`) because it has the most complete `text_content_raw_best_effort`.
- Cross-check with the 1440px and 1024px JSON files if the 1920px text is truncated.
- If the JSON text is still garbled, download the PNG screenshot and use `vision_analyze` or `@mainDevAgentVision` to read the exact strings.
- For sections lower on the page that may be cut off in the 1920px JSON (e.g. the Investment Advisory section at the bottom of a tall `/services` page), crop the relevant portion of the largest PNG screenshot and use `vision_analyze` to extract the missing text rather than relying on a truncated JSON string.
- **When Figma JSON is a `figma-pdf-export-best-effort` artifact**, it contains only pixel-sampled colors and `text_content_raw_best_effort` that is frequently truncated and out of order. In this case the largest-resolution PNG screenshot is the authoritative source for exact copy. Use `vision_analyze` on the 1920px (or largest available) screenshot to extract the verbatim headings, body text, card titles, card descriptions, and stats; cross-check against lower-resolution screenshots only if the 1920px text is unreadable.

## What to pass to the sub-agent

Include a verbatim "SECTION CONTENT" block in `instructions.txt` and the `delegate_task` context. Example for KAN-17:

```
## SECTION CONTENT — SERVICES PREVIEW

### 1. Property Selling Service
- Heading: "Unlock Property Value"
- Subheading: "Selling your property should be a rewarding experience, and at Estatein, we make sure it is. Our Property Selling Service is designed to maximize the value of your property, ensuring you get the best deal possible. Explore the categories below to see how we can help you at every step of your selling journey."
- Category cards:
  - Valuation Mastery — "Discover the true worth of your property with our expert valuation services."
  - Strategic Marketing — "Selling a property requires more than just a listing; it demands a strategic marketing approach."
  - Negotiation Wizardry — "Negotiating the best deal is an art, and our negotiation experts are masters of it."
  - Closing Success — "A successful sale is not complete until the closing. We guide you through the intricate closing process."
- CTA banner:
  - Heading: "Unlock the Value of Your Property Today"
  - Body: "Ready to unlock the true value of your property? Explore our Property Selling Service categories and let us help you achieve the best deal possible for your valuable asset."
  - Button: "Learn More" → href="#services/property-selling"

### 2. Property Management Service
...
```

## Common pitfall

The Frontend Developer sub-agent may build only the first sub-section (Property Selling Service) and consider the ticket complete. The main agent must explicitly instruct the sub-agent to build **one composite section component covering every sub-section listed above**, with each sub-section rendered in order on the page.

## Verification

After the sub-agent returns, verify that every sub-section heading and every category card title from this extraction appears in the rendered component tests or the live page snapshot.
