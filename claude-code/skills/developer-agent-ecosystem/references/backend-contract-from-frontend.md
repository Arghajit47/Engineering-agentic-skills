# Backend Contract Derivation When Frontend Is Already Built

Use this pattern when a `[Backend]` ticket is created for a page/section whose `[Frontend]` sibling was already implemented (KAN-18 pattern). The BA's backend plan is usually generic and does not list the exact content the frontend already renders. The backend contract must be reverse-engineered from the existing frontend code and the Figma screenshots/JSON specs attached to the Frontend ticket.

## When to apply

- Backend ticket is created after its Frontend sibling is already Done.
- The frontend currently uses hardcoded/mock content.
- The BA's `backend-structure-source.txt` (or legacy `backend plan.txt`) describes the stack and general tasks but does not enumerate headings, cards, CTAs, or hrefs.
- Goal: build a read-only `GET /api/{page}` endpoint whose response shape matches what the frontend already displays.

## Steps

1. **Locate the Frontend ticket and its assets**
   - Read the Frontend ticket description and comments.
   - Download all attached `figma-spec-*.json` files and PNG screenshots.
   - Read the implemented frontend component/page code (`src/app/{page}/page.tsx`, `src/components/sections/{Section}.tsx`).

2. **Extract the exact content contract**
   - From the frontend code: list every heading, subheading, card title, card description, CTA text, button label, href, and icon name.
   - From the Figma JSON specs: use `text_content_raw_best_effort` to verify exact strings the frontend might have shortened or altered.
   - From the screenshots: crop ambiguous sections and use vision analysis only if JSON text is truncated (e.g., multi-line CTA bodies).

3. **Design the Prisma model**
   - Prefer a simple key/value JSON store (`{section, slug @unique, value JSON string, order}`) when the content is a small, fixed set of blocks.
   - This mirrors the existing `HeroContent` model and keeps the schema migration minimal.
   - Only normalize into multiple related tables if the data is large, highly relational, or frequently queried independently.

4. **Write the API response shape into the Senior Developer instructions**
   - Include the full JSON payload example verbatim in `instructions.txt`.
   - The Backend sub-agent must not invent strings; every value must be traceable to the extracted contract.

5. **Seed data and fallback defaults**
   - Seed the exact same content in `prisma/seed.ts`.
   - Embed the same content as hardcoded fallback defaults in the route handler so the page never breaks if the seed has not run.

## Example: KAN-18 /services page contract

Prisma model added to `prisma/schema.prisma`:

```prisma
model ServicesContent {
  id        Int      @id @default(autoincrement())
  section   String
  slug      String   @unique
  value     String   // JSON string
  order     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Route: `GET /api/services`

Response envelope:

```json
{
  "success": true,
  "data": {
    "intro": {
      "heading": "Elevate Your Real Estate Experience",
      "subheading": "Welcome to Estatein, where your real estate aspirations meet expert guidance. Explore our comprehensive range of services, each designed to cater to your unique needs and dreams."
    },
    "quickLinks": [
      { "id": "find-home", "title": "Find Your Dream Home", "href": "/properties", "icon": "Home" },
      { "id": "unlock-value", "title": "Unlock Property Value", "href": "#property-selling", "icon": "TrendingUp" },
      { "id": "management", "title": "Effortless Property Management", "href": "#property-management", "icon": "Wrench" },
      { "id": "investments", "title": "Smart Investments, Informed Decisions", "href": "#investment-advisory", "icon": "BarChart3" }
    ],
    "services": [
      {
        "id": "property-selling",
        "title": "Unlock Property Value",
        "description": "Selling your property should be a rewarding experience, and at Estatein, we make sure it is. Our Property Selling Service is designed to maximize the value of your property, ensuring you get the best deal possible. Explore the categories below to see how we can help you at every step of your selling journey.",
        "cta": {
          "title": "Unlock the Value of Your Property Today",
          "body": "Ready to unlock the true value of your property? Explore our Property Selling Service categories and let us help you achieve the best deal possible for your valuable asset.",
          "buttonText": "Learn More",
          "href": "#property-selling"
        },
        "categories": [
          { "id": "valuation-mastery", "title": "Valuation Mastery", "description": "Discover the true worth of your property with our expert valuation services.", "icon": "TrendingUp" },
          { "id": "strategic-marketing", "title": "Strategic Marketing", "description": "Selling a property requires more than just a listing; it demands a strategic marketing approach.", "icon": "Megaphone" },
          { "id": "negotiation-wizardry", "title": "Negotiation Wizardry", "description": "Negotiating the best deal is an art, and our negotiation experts are masters of it.", "icon": "Handshake" },
          { "id": "closing-success", "title": "Closing Success", "description": "A successful sale is not complete until the closing. We guide you through the intricate closing process.", "icon": "CheckCircle" }
        ]
      },
      {
        "id": "property-management",
        "title": "Effortless Property Management",
        "description": "Owning a property should be a pleasure, not a hassle. Estatein's Property Management Service takes the stress out of property ownership, offering comprehensive solutions tailored to your needs. Explore the categories below to see how we can make property management effortless for you.",
        "cta": {
          "title": "Experience Effortless Property Management",
          "body": "Ready to experience hassle-free property management? Explore our Property Management Service categories and let us handle the complexities while you enjoy the benefits of property ownership.",
          "buttonText": "Learn More",
          "href": "#property-management"
        },
        "categories": [
          { "id": "tenant-harmony", "title": "Tenant Harmony", "description": "Our Tenant Management services ensure that your tenants have a smooth experience, reducing vacancies.", "icon": "Users" },
          { "id": "maintenance-ease", "title": "Maintenance Ease", "description": "Say goodbye to property maintenance headaches. We handle all aspects of property upkeep.", "icon": "Wrench" },
          { "id": "financial-peace", "title": "Financial Peace of Mind", "description": "Managing property finances can be complex. Our financial experts take care of rent collection and accounting.", "icon": "Wallet" },
          { "id": "legal-guardian", "title": "Legal Guardian", "description": "Stay compliant with property laws and regulations effortlessly.", "icon": "Scale" }
        ]
      },
      {
        "id": "investment-advisory",
        "title": "Smart Investments, Informed Decisions",
        "description": "Building a real estate portfolio requires a strategic approach. Estatein's Investment Advisory Service empowers you to make smart investments and informed decisions.",
        "cta": {
          "title": "Unlock Your Investment Potential",
          "body": "Explore our Property Management Service categories and let us handle the complexities while you enjoy the benefits of property ownership.",
          "buttonText": "Learn More",
          "href": "#investment-advisory"
        },
        "categories": [
          { "id": "market-insight", "title": "Market Insight", "description": "Stay ahead of market trends with our expert Market Analysis. We provide in-depth insights into real estate market conditions.", "icon": "BarChart3" },
          { "id": "roi-assessment", "title": "ROI Assessment", "description": "Make investment decisions with confidence. Our ROI Assessment services evaluate the potential returns on your investments.", "icon": "PieChart" },
          { "id": "customized-strategies", "title": "Customized Strategies", "description": "Every investor is unique, and so are their goals. We develop Customized Investment Strategies tailored to your specific needs.", "icon": "Target" },
          { "id": "diversification-mastery", "title": "Diversification Mastery", "description": "Diversify your real estate portfolio effectively. Our experts guide you in spreading your investments across various property types and locations.", "icon": "Globe" }
        ]
      }
    ],
    "bottomCta": {
      "heading": "Start Your Real Estate Journey Today",
      "body": "Your dream property is just a click away. Whether you're looking for a new home, a strategic investment, or expert real estate advice, Estatein is here to assist you every step of the way. Take the first step towards your real estate goals and explore our available properties or get in touch with our team for personalized assistance.",
      "buttonText": "Explore Properties",
      "href": "/properties"
    }
  }
}
```

## Shape flexibility and integration mapping

The backend response shape does not need to be a pixel-perfect match for the frontend's existing static props. The integration ticket's job is to map whatever the backend returns into the component's expected props. For example, KAN-18 returned:

```json
{
  "services": [
    {
      "heading": "Unlock Property Value",
      "subheading": "...",
      "categories": [...],
      "ctaHeading": "...",
      "ctaBody": "...",
      "ctaHref": "...",
      "ctaText": "..."
    }
  ]
}
```

while the original static frontend used `title`, `description`, and a nested `cta` object. The integration layer mapped `heading→title`, `subheading→description`, and flattened the CTA fields. Accept this during backend review as long as:

- All required content is present.
- The shape is consistent and typed.
- The integration ticket has enough information to map it.

## Common pitfalls

- **Assuming the BA's backend plan lists content.** It usually doesn't. The content lives in the Frontend ticket's screenshots/JSON and the already-built frontend code.
- **Inventing strings in the API contract.** Every string must be traceable to the frontend or Figma source. If the frontend shortened a description, use the Figma JSON/screenshot as the source of truth and update the frontend later if needed.
- **Using a different model pattern than the existing codebase.** Follow the simplest existing pattern (`HeroContent` key/value store in this repo) unless there's a clear reason to add relations.
- **Forgetting fallback defaults.** A read-only endpoint should still return a usable payload when the table is empty, matching the seeded content.
- **Backend tests that only seed partial content.** Seed the full content set in tests, not minimal stubs. QA and integration tests rely on the exact number of quick links, services, and categories (e.g., 4 quick links, 3 services, 4 categories each). Partial seed data gives false confidence.

## Verification checklist

- [ ] All Frontend ticket assets downloaded and inspected.
- [ ] Existing frontend code read.
- [ ] API response shape written verbatim into `instructions.txt`.
- [ ] Prisma schema follows existing simple pattern.
- [ ] Seed data matches frontend/Figma exactly.
- [ ] Route has hardcoded fallback defaults.
- [ ] Tests verify shape and fallback.
- [ ] No existing endpoints broken.
