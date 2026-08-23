# Scope-Split Ticket Pattern

## When to Use

When breaking down a Figma design component into JIRA tickets for a team where different developers work in parallel on frontend, backend, and integration.

## Pattern

For each design component, create 3 separate JIRA tickets:

### 1. [Frontend] — UI Components Only

**Purpose**: Build responsive UI components with mock/static data. No API calls.

**Typical story points**: 8 (max)

**Description sections** (KAN-6 emoji format — see SKILL.md "Story Description Format"):
- 📬 User Story: `*   frontend developer` / `*   build the responsive X UI components` / `*   users can interact with X across all devices`
- 🔆 Scope: `— responsive UI components, no API calls, no backend logic. Data will be mocked/static...`
- 🎨 Figma Design References — per-resolution child node URL tables, one h2. per section
- 🌈 Design Theme — MANDATORY table: page bg RGB, section bg RGB, card bg RGB, text colors (heading/body/muted), accent colors (buttons/price), ring/border. Without this, the developer sub-agent (no vision) defaults to light theme and mismatches the design.
- 📷 Figma Screenshots (Attached)
- ✅ Acceptance Criteria — numbered list (`#` prefix) covering rendering, responsive grid, loading/empty states, **all mock image URLs return HTTP 200**, **visual design matches Design Theme section**
- 💻 Technical Notes — component paths, tech stack, mock data location, responsive breakpoints
- 📊 Story Points: N

**Example**:
```
Title: [Frontend] Home Page — Featured Properties & Testimonials UI
Labels: frontend, home-page, featured-properties, testimonials
Story Points: 8
```

### 2. [Backend] — API Endpoints Only

**Purpose**: Build API route handlers, Prisma queries, Zod validation. No frontend.

**Typical story points**: 5

**Description sections** (KAN-6 emoji format):
- 📬 User Story: `*   backend developer` / `*   build the API endpoints for X` / `*   the frontend can fetch and display data for X`
- 🔆 Scope: `— API route handlers, Prisma queries, Zod validation, seed data. No frontend components...`
- 🎨 Figma Design References — with note: "These Figma nodes show what data fields the UI expects."
- 📷 Figma Screenshots (Attached)
- ✅ Acceptance Criteria — endpoint behavior, query params, response shape, validation, error codes
- 💻 Technical Notes — API path, JSON helpers, search behavior, error handling, Zod schema, Prisma query pseudocode
- 📊 Story Points: N

**Example**:
```
Title: [Backend] Home Page — Featured Properties & Testimonials API
Labels: backend, home-page, api
Story Points: 5
```

### 3. [Integration] — Wiring Frontend to Backend

**Purpose**: Connect frontend components to backend API. Replace mock data with real calls.

**Typical story points**: 3

**Dependencies**: Frontend ticket AND Backend ticket must be completed first.

**Description sections** (KAN-6 emoji format):
- 📬 User Story: `*   full-stack developer` / `*   wire the frontend components to backend API endpoints for X` / `*   X displays live data from the API`
- 🔆 Scope: `— API-UI integration, connecting frontend components to backend endpoints. No new UI components or API endpoints.`
- 🎨 Figma Design References (1-2 reference URLs, same table format)
- 📷 Figma Screenshots (Attached)
- ✅ Acceptance Criteria — fetch behavior, debouncing, error handling, loading/empty states from API
- 💻 Technical Notes — fetch pattern, debounce, type safety, URL state, integration points table
- 📊 Story Points: N

**Example**:
```
Title: [Integration] Home Page — Featured Properties & Testimonials Wiring
Labels: integration, home-page, wiring
Story Points: 3
```

## Worked Example: Estatein Real Estate Website

### Component 1: Home Page (Featured Properties + Testimonials)

| Ticket | Scope | Points | Key |
|--------|-------|--------|-----|
| [Frontend] Home Page — Featured Properties & Testimonials UI | UI, mock data, responsive grid | 8 | KAN-6 |
| [Backend] Home Page — Featured Properties & Testimonials API | GET /api/properties?featured=true, GET /api/reviews | 5 | KAN-7 |
| [Integration] Home Page — Featured Properties & Testimonials Wiring | Replace mock data with API calls | 3 | KAN-8 |

### Component 2: Properties Page (Search/Filter + Browse Listings)

| Ticket | Scope | Points | Key |
|--------|-------|--------|-----|
| [Frontend] Properties Page — Search/Filter & Browse Listings UI | Search bar, filter dropdown, listings grid, pagination | 8 | KAN-9 |
| [Backend] Properties Page — Search/Filter & Browse Listings API | GET /api/properties?search=&type=&page=&limit= | 5 | KAN-10 |
| [Integration] Properties Page — Search/Filter & Browse Listings Wiring | Wire search/filter/pagination to API | 3 | KAN-11 |

## Screenshots

Each ticket gets screenshots attached via curl multipart upload:
- Frontend tickets: all screenshots for the component (both sections, all resolutions)
- Backend tickets: same screenshots as design reference
- Integration tickets: same screenshots as design reference

## Story Points

Story points must be BOTH set in the JIRA `{{STORY_POINT_FIELD}}` field AND embedded in the description as `h2. 📊 Story Points\n\n{N}`. The batch creation POST call sets both in a single request. If the JIRA board uses issue-count estimation instead of field-based points, the description text serves as fallback.