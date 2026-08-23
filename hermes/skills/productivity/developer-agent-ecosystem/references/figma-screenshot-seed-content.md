# Extracting Seed Content from Figma Screenshots for Backend Tickets

Backend tickets often require seed data that matches the Figma design: navigation labels, CTA copy, placeholder text, copyright/legal text, footer body copy, etc. The BA workflow may not attach `figma-spec-*.json` files to a Backend ticket, and the ticket description may claim screenshots are attached when they are not (or only `backend-structure-source.txt` is present).

## When to use this reference

- Backend ticket needs realistic seed strings (navigation labels, footer CTA body, newsletter placeholder, copyright text).
- No `figma-spec-*.json` files are attached to the Backend ticket.
- Figma node URLs are present in the ticket description.
- The corresponding Frontend ticket (if any) already has rendered screenshots or extracted text.

## Workflow

1. **Check the sibling Frontend ticket first.** If the Frontend ticket for the same component/page already has Figma screenshots attached or rendered in `/tmp/`, read the text content from there rather than re-fetching.
2. **If no screenshots exist, render them yourself.** Use the Figma REST API `GET /v1/images/{FILE_KEY}?ids={NODE_IDS}&format=png`. See `references/figma-screenshot-render-fallback.md` for the curl recipe and JIRA upload steps.
3. **Extract text strings.** Either:
   - Run a vision-capable model on the PNG and ask for exact text strings, layout, and responsive behavior; or
   - Use OCR (`tesseract`, `pytesseract`, or `vision_analyze`) to read the text directly.
4. **Use the extracted strings as seed values** in `prisma/seed.ts` or the backend API response defaults.

## Typical Backend seed content to extract

For Navigation:
- Top banner text and CTA label/href
- Nav link labels and order
- Active/highlighted link state label
- Contact / external link label

For Footer:
- CTA section title and body paragraph
- CTA button text and href
- Newsletter input placeholder
- Copyright line
- Legal link text (e.g., "Terms & Conditions")
- Social platform names or icon hints (if backend is meant to store them)

## Example seed structure

```ts
const navigationLinks = [
  { label: "Home", href: "/", order: 1, isExternal: false },
  { label: "About Us", href: "/about", order: 2, isExternal: false },
  { label: "Properties", href: "/properties", order: 3, isExternal: false },
  { label: "Services", href: "/services", order: 4, isExternal: false },
];

const footerSections = [
  {
    key: "cta",
    title: "Start Your Real Estate Journey Today",
    body: "Your dream property is just a click away. Whether you're looking for a new home, a strategic investment, or expert real estate advice, Estatein is here to assist you every step of the way. Take the first step towards your real estate goals and explore our available properties or get in touch with our team for personalized assistance.",
    ctaText: "Explore Properties",
    ctaHref: "/properties",
  },
  { key: "newsletter", placeholder: "Enter Your Email" },
  { key: "bottom", copyright: "©2024 Estatein. All Rights Reserved.", legalText: "Terms & Conditions" },
];
```

## Pitfall: screenshots claimed but not attached

JIRA descriptions sometimes say "screenshots for all 5 resolutions are attached" while `jira_get_attachments` returns only the backend plan. Do not halt solely because of this claim — verify the actual attachment list. If screenshots are missing but Figma node URLs are present, render them via the Figma API and proceed.

## Pitfall: over-seeding

Backend seed data should be the minimum needed to satisfy the API contract and integration tests. Do not invent extra social links, addresses, or legal pages unless the Figma design or AC explicitly includes them.
