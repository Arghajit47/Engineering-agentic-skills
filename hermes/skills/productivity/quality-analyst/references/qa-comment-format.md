# QA Results Comment Format

## Why
The user corrected that manual QA testing comments must use a simple markdown pipe-table, NOT HTML tables. JIRA renders both, but the user wants the raw comment text to be readable as plain markdown — no `<table>`, `<tr>`, `<td>` tags.

## Format (all three manual QA sub-agents)

```
| Test Case ID | Title | Status | Evidence | Severity |
|--------------|-------|--------|----------|----------|
| TC-001 | {title} | PASS | {brief evidence} | — |
| TC-002 | {title} | FAIL | {ref to failure block} | High |
| TC-003 | {title} | PASS | {brief evidence} | — |

## Failure Details

1. TC-002: {failure summary} — Severity: High
   Steps to reproduce: {steps}
   Expected: {expected}
   Actual: {actual}
   Evidence: {screenshot path / cURL output / HAR file / console log}
```

## Rules
- PASS rows: brief evidence inline (screenshot path, HTTP status, "npm test N/M passed", etc.). Severity = "—" (em dash).
- FAIL rows: evidence column references the numbered failure detail block below the table. Severity = Critical/High/Medium/Low.
- Failure Details block: numbered, in severity order (Critical > High > Medium > Low).
- No HTML tags anywhere in the comment — pipe-separated markdown only.
- Automation SDET is exempt — it posts trace/screenshot/root-cause analysis, not a tabular summary.

## Sub-agent-specific evidence columns
- Frontend QA: screenshot paths, Lighthouse scores, console error counts, **Figma side-by-side comparison screenshot paths**, **computed-style measurements** (borderRadius, color, backgroundColor, contrast ratio), **SVG shape match notes**.
- Backend QA: cURL command refs, HTTP status codes, response times, npm test suite results, npm audit summary
- Integration QA: screenshot paths, HAR file refs, console log refs, data contract mismatch details

## Scope-attribution rule for console errors

When a console error row appears on the live page, the QA agent must first attribute it. See `references/console-error-scope-attribution.md` for the triage recipe. Summarize the result in the evidence column:

- In-scope error → FAIL TC-007 with severity High.
- Out-of-scope error (e.g., RSC prefetch 404 from a global Navbar link to a missing page) → PASS TC-007 with a note naming the originating component/ticket and the failing URLs. Do not fail the section ticket for a missing page it does not own.


