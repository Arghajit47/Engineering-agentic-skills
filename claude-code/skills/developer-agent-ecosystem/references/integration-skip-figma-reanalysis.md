# Integration tickets: skip Figma re-analysis when the Frontend sibling is Done

## Problem

Integration tickets often arrive with the same Figma node URLs and screenshot claims as their Frontend sibling. The developer-agent-ecosystem skill requires heavy Frontend pre-flight analysis: download every `figma-spec-{RESOLUTION}-{section-slug}.json`, read them, build a per-resolution mapping table, PIL-sample screenshots, etc. For an Integration ticket whose Frontend ticket is already Done, this is wasted work and a source of invented values.

The Frontend components already encode the Figma-approved design. The Integration sub-agent's only visual responsibility is to preserve that markup exactly while swapping hardcoded content for API data.

## When this applies

- Ticket scope is `[Integration]`.
- The linked Frontend ticket (via `mcp_jira_jira_get_issue_links` or unambiguously identified siblings) is status `Done`.
- The Frontend components already exist and already render the Figma design correctly.
- The Integration ticket's own attachments contain **no** `figma-spec-*.json` files and **no** per-resolution PNG screenshots.

If any of these is false, do the full Frontend-style analysis as normal.

## What to do instead

1. Read the existing Frontend components (the ones the Integration ticket will wire). Treat them as the visual source of truth.
2. In `instructions.txt`, tell the Integration sub-agent:
   - "Preserve all existing markup, Tailwind classes, breakpoints, colors, spacing, and test IDs exactly."
   - "Only replace hardcoded text, image URLs, and icon names with values from the API response."
3. Skip the Figma JSON spec table and PIL pixel sampling sections unless a specific visual ambiguity remains (e.g., what should a loading skeleton look like when no Figma asset exists).
4. If the Integration ticket has generic form-related ACs but the page is read-only, explicitly exclude them per the existing "Integration instructions for read-only pages" pitfall.

## Why this matters

Re-analyzing Figma for an Integration ticket risks:
- Re-inventing spacing/color values that the Frontend ticket already settled.
- Adding conflicting instructions that cause the Integration sub-agent to restyle components and break visual regression.
- Wasting tool calls and context budget on analysis the Frontend sub-agent already performed.

## But the Frontend components are not always the API contract

Skipping Figma analysis does **not** mean skipping backend/frontend contract validation. The Frontend components encode the *visual* truth, but their prop interfaces often expect a richer shape than the Backend route returns. See `references/integration-backend-frontend-shape-mismatch.md` for how to detect and resolve this.

## Example from KAN-22

KAN-22 `[Integration] About Us Our Story` depended on KAN-20 (Frontend, Done). The existing `OurJourney.tsx`, `OurValues.tsx`, and `OurAchievements.tsx` already matched the Figma screenshots built under KAN-20. The correct instruction was: convert them to accept typed props and wire them to `/api/about-us`. No new Figma analysis was required.
