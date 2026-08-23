# Figma Page vs. Section Scope Check

Session: KAN-17 rework.

## Problem

The JIRA ticket title was `[Frontend] Home Page Services Preview`. The description said "responsive UI components, no API calls, no backend logic." The natural reading was: build a `Services` section and drop it on the home page. The first implementation did exactly that.

The BA/QA feedback was that:

1. The deliverable is actually a new **page route** (`/services`), not a home-page section.
2. The page contains **more sections** than the title suggested: page intro hero, 4 service quick-link cards, three full service sections (Property Selling, Property Management, Investment Advisory), and a bottom page CTA.

## Root cause

The title and ACs used vague wording (`Preview`, `components`) and did not explicitly state "new page route /services." The only reliable source of full scope was the **attached Figma screenshot PNG** and the **Figma JSON text extraction**, which showed a full page layout with a footer at the bottom and multiple sections.

## Lesson / check to apply

Before writing `instructions.txt` for any Frontend ticket whose title contains words like `Preview`, `Section`, `Component`, `Widget`, or `Card`:

1. Look at the **largest-resolution Figma screenshot PNG** first. Ask:
   - Is there a global Navbar and Footer visible? → likely a full page.
   - Is the content framed inside an existing page with other unrelated content? → likely a section.
   - Are there multiple independent sections stacked vertically with their own headings/CTAs? → likely a full page.
2. Read the **Figma JSON `text_content_raw_best_effort`** for the 1920px file. Extract every heading and count sections. If the count is >1 and each has its own CTA, treat it as a composite page.
3. Check the ticket description for explicit route names (`/services`, `/about`). If absent but the screenshot shows a full page, default to creating a new Next.js page route at the obvious slug (e.g., title says `Services Preview` → slug `/services`).
4. Update the instructions accordingly:
   - Full page: create `src/app/{slug}/page.tsx`, register route in test-automation constants, do NOT render in `src/app/page.tsx`.
   - Section only: create component in `src/components/sections/`, render in appropriate parent page.
5. If ambiguity remains after screenshot + JSON analysis, halt and ask the BA manager to confirm "page route vs. section" before dispatch, because this decision changes file structure, tests, and QA coverage.

## Verification

After building, open the live route in a browser at 1920px and scroll the full page. The rendered page should contain all headings visible in the Figma screenshot PNG, in the same top-to-bottom order.
