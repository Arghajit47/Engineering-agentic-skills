# Canonical QA Subtask Description Format

Compact, plain-text, one test case per line. Survives JIRA's plain-text renderer and is easy for sub-agents to parse.

```
## Test Cases — KAN-XX

TC|Description|Expected|Priority
TC-001|Hero heading and subheading render at all breakpoints|Text matches Figma exactly, heading is h1|Critical
TC-002|Primary/secondary CTAs render with hover/focus states|Both buttons visible, hover/focus states present|Critical
TC-003|Stats row renders with correct labels|All three stats visible|Critical
TC-004|Hero image loads successfully|Image naturalWidth > 0 and naturalHeight > 0, HTTP 200|Critical
TC-005|Feature cards render|4 cards visible with correct titles and icons|Critical
TC-006|Responsive layout matches Figma at 5 breakpoints|Correct grid/flex layout and card count per breakpoint|Critical
TC-007|Interactive elements have hover/active/focus states|Buttons and cards show hover/focus indicators|High
TC-008|All images on the page load successfully|No broken images (naturalWidth === 0)|High
TC-009|Dark theme background colors match design tokens|Body/section/card backgrounds near black/dark grey|High
TC-010|Accessibility: semantic headings, ARIA labels, keyboard focus|h1 present, region labels, focus rings visible|High
TC-011|Lighthouse accessibility score > 90 on production build|Accessibility score >= 90|Medium
TC-012|No console errors after navigation|Console has zero errors/warnings|High
```

## Rules

- Header line is exactly `TC|Description|Expected|Priority`.
- One data line per test case: `TC-NNN|<one-line description>|<one-line expected>|<Priority>`.
- Pipe separators only. No `||` wiki-table syntax, no markdown table formatting, no HTML.
- Keep every cell to one line. Wrap at ~120 chars only if unavoidable.
- Generate TCs from the ticket's acceptance criteria — one per AC, plus edge cases.
- For frontend/integration scope, always include a broken-images TC.
- Banned: verbose Objective/Preconditions/Steps/Expected blocks.

## When to apply

Use this format for every QA subtask description created by the `quality-analyst` skill, regardless of scope (Frontend, Backend, Integration).

## Cross-scope findings on page-level test cases

A page-level test case (e.g., "No console errors after navigation", "All images load successfully") may fail because of code outside the ticket's own scope. Example: KAN-15 (Hero & CTA) failed TC-012 because of a hydration mismatch in `Navbar.tsx`, which belongs to KAN-14 (Navigation & Footer).

Judgment rules:

1. **Determine the actual source of the failure.** Use dev-mode console diff, source maps, and `chrome_javascript` DOM extraction to identify which component/endpoint caused the error.
2. **If the failure source is inside the ticket's scope** → mark the TC FAIL, transition the ticket back to In Progress, and dispatch a fix sub-agent.
3. **If the failure source is outside the ticket's scope but the AC is page-level** (e.g., "No console errors on the home page"):
   - Mark the TC FAIL against the current ticket because the acceptance criterion is not met on that page.
   - Document the out-of-scope root cause explicitly.
   - Transition the current ticket back to In Progress and dispatch a fix sub-agent. The fix will touch the out-of-scope component, but it is required to satisfy the current ticket's AC.
   - Also update the owning sibling ticket (if one exists) with a comment referencing the finding, but do NOT transition the sibling unless it has independently passed/failed its own QA.
4. **If the console error is an RSC prefetch 404 for a route linked by the global Navbar/Footer** (e.g. `/about`, `/services`, `/contact`) and the current ticket does not own the navigation component or those pages, treat it as out-of-scope per `references/console-error-scope-attribution.md`. PASS the page-level TC with a note, do NOT transition the current ticket back to In Progress.
5. **If the failure is transient or cannot be reproduced** on re-test across all breakpoints, downgrade it from FAIL to an observation and re-run the full suite before finalizing.

Always report the *actual* root cause, not just the symptom, in the failure details.