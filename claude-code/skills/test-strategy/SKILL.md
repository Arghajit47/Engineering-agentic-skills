---
name: test-strategy
description: "Test Engineer / Shift-Left (/test-strategy): defines the test contract BEFORE implementation and enforces RED-before-GREEN evidence, so tests are designed rather than retrofitted. Owns the visual-regression baseline that pixel-perfect Figma work needs, the test-pyramid shape, and coverage of the states QA grades (loading/empty/error/responsive). Runs inside /developer, ahead of the code."
version: 1.0.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [testing, tdd, visual-regression, playwright, vitest, coverage, shift-left, workflow]
    related_skills: [developer-agent-ecosystem, quality-analyst, pr-review-and-merge, design-system, architect, behavior, custom-agent, claude-opus-5, Plan, worker]
---

# Test Engineer / Shift-Left (/test-strategy)

> **Setup values.** This skill contains no account ids, site hosts, project keys, or
> deployed URLs — they appear as `{{PLACEHOLDER}}`. Resolve them from
> `project-config.local.md` in the skills directory. If that file is missing, or the
> value you need is absent or still `{{...}}`, **stop and ask the user for it** (batch
> the asks if you need several), then offer to save it so you never ask again. Never
> guess one, never carry one over from another project, and never invent a
> plausible-looking account id — a wrong id silently misassigns tickets and a wrong URL
> silently grades the wrong site. Full table and asking rules: `PROJECT-CONFIG.md`.


## JIRA content format — ADF only, no exceptions

**Every** JIRA description, comment, reply, and subtask body this skill writes is
Atlassian Document Format (ADF) v3 JSON. There is no "quick comment" exemption.

**Never** send Jira wiki markup (`h2.`, `||header||`, `{code}`), HTML (`<table>`), or raw
Markdown (`## heading`, `| a | b |`, `**bold**`) in any field. All three render as broken
literal text in the modern issue view.

Templates in this file are written in Markdown **for human readability**. They define the
sections, their order, and their content — they are **not** the wire format. Convert
before posting:

```bash
python3 ~/.claude/skills/scripts/adf.py --in body.md --out body.adf.json
python3 ~/.claude/skills/scripts/adf.py --validate body.adf.json   # must pass before posting
```

Then send the JSON object as the body — `commentBody` for Rovo MCP,
`{"body": …}` or `{"fields": {"description": …}}` for REST v3.

Open any verdict with a panel so the outcome is visible without reading:
`:::success` PASS · `:::error` FAIL/BLOCK · `:::info` PASS WITH NOTES · `:::note` advisory.

Full spec, node rules, and the per-artifact structure table: `rules/ADF.md`.


**Behavior/agent wiring:** Main agent runs `/behavior claude-opus-5`. Test design via `/custom-agent Plan`; RED/GREEN runs via `/custom-agent worker`.

**Trigger Commands:** `/test-strategy <TICKET>` (design the contract), `/test-strategy --red` (prove RED), `/test-strategy --visual-baseline`

**Position:** inside `/developer`, **before** implementation. Not a replacement for `/quality-analyst`, which grades the shipped build.

## Why this skill exists

Tests were written by the implementer and judged after the fact by QA, and the SDET
only engaged on Integration scope. Two consequences followed:

- Tests were shaped to fit the code that already existed, so they asserted the
  implementation rather than the requirement.
- Nothing held a **visual baseline**, on a project whose entire premise is pixel-perfect
  Figma parity. Every visual regression had to be caught by a human eye at review time.

This skill moves test design ahead of the code and owns the baseline.

## Hard rules

1. **RED before GREEN, with evidence.** A test that has never failed has never been
   verified to test anything. Capture the failing output before implementing.
2. **The test contract comes from the ticket's ACs and the ADR contract, not from the
   code.** If it cannot be written before the code exists, it is asserting the
   implementation.
3. **Frontend and Backend Developer sub-agents must never touch `test-automation/`.**
   That package belongs to the SDET. This skill writes unit/integration specs beside the
   source; the Playwright package is out of bounds for dev sub-agents. (Standing rule.)
4. **Five states minimum for any data-backed view:** loading, empty, error, populated,
   responsive. A render-and-count test is not coverage.
5. **Never edit a test to make an implementation pass** without saying so explicitly and
   justifying why the original assertion was wrong.

## Workflow — `/test-strategy <TICKET>` (design)

### 1. Derive the contract

Read the ticket ACs and, if the epic has one, the ADR's Frozen contracts block. Produce
the test contract **before any implementation exists**:

```markdown
## Test Contract — <TICKET>

### Unit (vitest, beside source)
| # | Assertion | From |
|---|---|---|
| U1 | `formatRate(0.0525)` -> `"5.25%"` | AC-2 |
| U2 | `formatRate(null)` -> `"—"` | AC-2 error case |

### Component (vitest + RTL)
| # | State | Assertion | From |
|---|---|---|---|
| C1 | loading | skeleton has `data-testid="rates-skeleton"` | AC-1 |
| C2 | empty | renders "No rates available" | AC-1 |
| C3 | error | renders retry affordance, no crash | AC-4 |
| C4 | populated | 3 rows, values formatted per U1 | AC-2 |

### Route handler (vitest)
| # | Assertion | From |
|---|---|---|
| R1 | `GET /api/rates` -> 200, body matches `Rate[]` | ADR-0004 contract |
| R2 | DB unavailable -> 500, `{error:string}`, no stack leak | ADR-0004 error model |

### Visual (Playwright, test-automation/ — SDET only)
| # | Route | Widths | Baseline |
|---|---|---|---|
| V1 | `/rates` | 390 / 1440 / 1920 | new — capture on first green |

### Explicitly NOT tested
<Name them. An unstated gap looks like an oversight in review.>
```

Widths come from the design's real frames — the same enumeration `/design-system` and
`/quality-analyst` use. Never a width the design has no frame for.

### 2. Configuration preconditions

Check these before writing a spec; each has silently swallowed tests here before:

```bash
# Route-handler tests are actually collected
grep -n 'include' vitest.config.ts   # needs src/app/**/route.test.ts

# The Playwright package type-checks separately — root tsconfig excludes it
npx tsc --noEmit && npx tsc --noEmit -p test-automation

# No root/test-automation config collision
ls test-automation/vitest.config.* test-automation/playwright.config.* 2>/dev/null
```

A spec in a directory the config does not include is worse than no spec: it reports
green forever.

### 3. Write the specs and prove RED

```bash
npm test -- --project unit 2>&1 | tee /tmp/red.txt
grep -E 'failed|✕' /tmp/red.txt
```

Every row in the contract must appear as a **named failing test**. A test that errors
on a missing import is not RED — it has not run. Fix it until it fails *for the right
reason*: the assertion, not the wiring.

Record the RED evidence in the ticket:

```markdown
### RED evidence — <TICKET>
`npm test -- --project unit` -> 7 failed, 214 passed
Failing: U1, U2, C1, C2, C3, C4, R1 — each on its assertion, not on import/wiring.
```

### 4. Hand to implementation

`/developer` implements against the contract. GREEN is: every contract row passes, and
**no contract row was edited** to get there.

```bash
npm test 2>&1 | tail -20
git diff --stat -- '*.test.*'   # only ADDITIONS from step 3; no rewrites
```

Compare like with like on counts — `--project unit` and full-suite are different
figures, and quoting one against the other reads as a regression that is not there.

## Workflow — `--visual-baseline`

The gap that matters most on a pixel-perfect project.

```ts
// test-automation/visual/pages.spec.ts   (SDET-owned)
import { test, expect } from '@playwright/test';

const WIDTHS = [390, 1440, 1920];  // the design's frames — no others
const ROUTES = ['/', '/services', '/rates'];

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    test(`${route} @ ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1080 });
      await page.goto(process.env.BASE_URL + route);   // deployed URL
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot(`${route.replace(/\//g,'_')}-${width}.png`, {
        maxDiffPixelRatio: 0.01,
        animations: 'disabled',
      });
    });
  }
}
```

Baseline rules:

- **Capture against the deployed URL**, never localhost — same absolute gate as QA, and
  local renders differ in font loading and image optimisation.
- **A baseline is only updated deliberately**, in its own PR, with the reason stated.
  `--update-snapshots` inside a feature PR silently accepts the regression it was
  supposed to catch. Treat that the same way `/perf-budget` treats rebaselining.
- **Disable animations and mask genuinely dynamic regions** (timestamps, carousels) —
  a flaky baseline gets ignored, which is worse than no baseline.

## Interaction with other skills

- **`/developer`** — invokes this before implementing; sub-agents implement to the
  contract and never edit it.
- **`/quality-analyst`** — grades the deployed build against Figma and the ACs. This
  skill does not duplicate that; it makes sure the regression is caught in CI first.
- **`/pr-review-and-merge`** — a class/copy diff with no corresponding test touched is
  incomplete, not a clean small diff. That rule is enforced there; the contract from
  this skill is what makes it checkable.
- **`/release`** — CI runs vitest before deploy, so a spec left RED blocks the deploy
  entirely. Never merge with a knowingly-red contract row.

## Pitfalls

- **Writing the test after the code and calling it TDD.** The tell is a test that
  asserts an internal function name rather than an AC.
- **A spec file in a directory `vitest.config.ts` does not include.** Green forever,
  tests nothing. Check the include pattern first, every time.
- **Only the happy path on an integration view.** Loading, empty, error, and responsive
  are the minimum bar; those are exactly the states QA fails tickets on.
- **`--update-snapshots` in a feature PR.** It converts your regression detector into a
  regression recorder.
- **Baselining at a width the design has no frame for.** You will maintain a baseline
  nobody can grade against.
- **A dev sub-agent writing in `test-automation/`.** That package is SDET-owned; a dev
  sub-agent touching it is a hard rule violation regardless of how convenient it is.
