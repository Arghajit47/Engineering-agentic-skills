---
name: quality-analyst
description: "Quality Analyst (/quality-analyst): Senior QA SDET running /behavior claude-opus-5 orchestrates scope-specific testing — Frontend QA, Backend QA, Integration QA, and (Integration scope only, sequentially after a clean manual pass) Automation SDET — via /custom-agent Explore, /custom-agent Plan, /custom-agent worker, and /custom-agent teammate for parallel coordination. Validates against X_RAY test cases, posts results to JIRA subtask. Pass = transition to Done. Fail = back to In Progress with bug report. Enforces hard delegation: main agent must not perform sub-agent verification."
version: 1.11.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [qa, testing, frontend, backend, integration, automation, jira, xray, workflow]
    related_skills: [developer-agent-ecosystem, business-analyst-workflow, mr-code-review, jira, behavior, custom-agent, claude-opus-5, Explore, Plan, worker, teammate]
---

# Quality Analyst (/quality-analyst)

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

**Start from this skill's own template — do not compose ADF by hand:**

| Template | Use for |
|---|---|
| `templates/adf/comment.adf.json` | any other comment on a ticket |
| `templates/adf/qa-results.adf.json` | X-Ray test-case results on the QA subtask |

Each is valid ADF v3 with `{{PLACEHOLDER}}` tokens. Load it, substitute, post the
object as the body — `commentBody` for Rovo MCP, `{"body": …}` or
`{"fields": {"description": …}}` for REST v3. Delete any row or section the ticket
genuinely does not need; never leave a `{{PLACEHOLDER}}` in a posted body.

```bash
python3 ~/.claude/skills/scripts/adf.py --validate <filled>.adf.json   # before posting
```

**Never** send Jira wiki markup (`h2.`, `||header||`, `{code}`), HTML (`<table>`), or raw
Markdown (`## heading`, `| a | b |`, `**bold**`). All three render as broken literal text
in the modern issue view.

Templates are generated from `templates/adf/_src/qa/*.adf.md` by
`templates/adf/build.sh` — edit the source and rebuild, never the JSON. Full node spec:
`rules/ADF.md`. Which template a skill uses at which gate, for the whole
pipeline: `templates/TEMPLATES.md` (generated — do not edit by hand).

## Figma read path — bridge or Figma MCP

Read **`FIGMA_READ_PATH`** from `project-config.local.md` and use it. **Never ask the
user which path to take** — the decision was recorded at install.

| Value | Use |
|---|---|
| `bridge` | Local AI Bridge on `http://localhost:47291` (port mandatory) |
| `figma-mcp` | the official `plugin:figma` MCP server |

Same facts, different transport:

| Need | `bridge` | `figma-mcp` |
|---|---|---|
| Tokens / variables | `GET /api/variables` | `get_variable_defs` |
| Frame list, structure | `GET /api/frames`, `/api/document` | `get_metadata` |
| Per-node CSS, layout, fills | `GET /api/node/:id/context`, `/css` | `get_design_context` |
| Vector export | `GET /api/node/:id/svg` | `download_assets` |
| Rendered image | bridge screenshot endpoints | `get_screenshot` |

**Key missing?** Probe once — `curl -s --max-time 2 http://localhost:47291/api/whoami`
— use `bridge` if it answers, `figma-mcp` if not. State which you picked and offer to
record it. Do not interrogate the user.

**`bridge` selected but unreachable, or its plugin closed?** Say so, fall back to
`figma-mcp` for this run if it is available, and suggest they either start the bridge or
set `FIGMA_READ_PATH: figma-mcp`. Do not silently switch every run.

**Neither available?** **Halt and say so.** Never estimate a design value — that is
invariant 13. Degraded bridge (plugin closed) still gives geometry, layout, and text, but
**not** CSS, tokens, or SVG export; label anything you cannot verify as UNAVAILABLE.


**Behavior/agent wiring:** Main agent runs `/behavior claude-opus-5`. Sub-agents load `/behavior claude-opus-5` then `/custom-agent Explore` for code/test discovery, `/custom-agent Plan` for test planning, or `/custom-agent worker` for autonomous verification. Parallel QA scopes coordinate via `/custom-agent teammate`.

A four-sub-agent QA testing pipeline triggered by a senior QA SDET. The main agent analyzes the JIRA ticket scope (frontend/backend/integration), validates prerequisites, dispatches the appropriate QA sub-agents, and posts X_RAY test-case results to a dedicated QA subtask.

**Trigger Command:** `/quality-analyst <JIRA_TICKET_ID>`

**Related Skills:** `developer-agent-ecosystem`, `business-analyst-workflow`, `mr-code-review`, `jira`

## Pipeline position and gates

```
/developer → /pr-review-and-merge → /release → **/quality-analyst** → /sre → /docs
                                                        ↑
                                              /perf-budget (sub-gate)
```

Full map: `PIPELINE.md` in the Skills bundle.

**Three changes to this skill's contract:**

1. **`/release` owns pre-flight gate 0b now.** The "prove the deploy carries the commit"
   check is performed by `/release` *before* QA is invoked at all, and `/release` will
   not invoke QA if the deploy is stale. The gate stays written below because QA must
   still refuse to grade an unproven build if invoked directly by a human — but in the
   normal flow it will already be satisfied, and QA should read `/release`'s evidence
   table from the ticket rather than re-deriving it.
2. **`/perf-budget` is a sub-gate**, run after the manual/visual pass and before the
   verdict (new step 9.5). It measures what layout QA does not: Core Web Vitals, bundle
   size, image weight — on the deployed URL, at the design's real frame widths.
3. **On pass, hand to `/sre` and `/docs`.** Done is no longer the end of the pipeline.

**Shared enumerations — these three skills must agree or a ticket becomes ungradeable:**
the design's frame widths are read once from the Local AI Bridge and used identically by
`/design-system` (breakpoint tokens), `/test-strategy` (visual baseline widths), and this
skill (grading widths).

## 1. Main Agent: Senior QA SDET

- **Role:** Senior QA SDET with 8+ years of experience in manual and automated testing.
- **Primary Responsibility:** Analyze the ticket scope, decide which QA sub-agent(s) to dispatch, gather evidence, and post structured results.

### Execution Flow

0. **Pre-flight gates — all three, before anything else.**
   a. **Deployed URL only.** QA evidence comes from the deployed build, never `localhost`. No `npm run dev`/`npm start` as a test subject. This is an absolute user-stated gate. (The Local AI Bridge on `localhost:47291` is a *Figma data source*, not the subject under test — using it is required and correct.)
   b. **Prove the deploy carries the commit.** A green 200 is not proof the fix is live. Confirm the deploy run for the merge commit succeeded (`gh run list --branch main --limit 1`), then grep the *served HTML* for one class the diff **added** and one it **removed** — the added token must be present, the removed token must return 0. If either fails, STOP and report; never substitute a local build.
   c. **Enumerate the design's frames.** Parse the Local AI Bridge snapshot once and list every top-level frame width. **That list is the complete set of widths anything may be graded against.** Full rules: `references/grading-scope-and-termination.md`.
1. **Load the JIRA ticket** (`mcp_jira_jira_get_issue`) and confirm its status.
2. **Find or create a QA subtask.** Search for an existing subtask named like "QA Testing for {JIRA_KEY}". If one exists and was previously marked Done for a superseded implementation, reopen it (transition to "To Do"), update its description with the new test cases, and reuse it. Do not create duplicate QA subtasks for the same parent ticket.
3. **Load the QA subtask** (`mcp_jira_jira_get_issue` on the subtask key) and read its description. The compact `TC|Description|Expected|Priority` lines are the authoritative checklist. Convert them into a TODO list so each TC has a tracked status before starting verification.
4. **Verify the parent ticket is in "In Testing".** If not, transition it to "In Testing" and assign the developer before dispatching QA.
5. **Determine scope** from the ticket title/description/labels:
   - `[Frontend]` or UI-only scope → dispatch Frontend QA.
   - `[Backend]` or API-only scope → dispatch Backend QA.
   - `[Integration]` or UI+API wiring scope → dispatch Integration QA first; **upon Integration QA passing, dispatching the Automation SDET is MANDATORY and non-negotiable — see step 7b.**
6. **Ensure the QA subtask description uses the compact one-line-per-TC format.** Example:
   ```
   TC|Description|Expected|Priority
   TC-001|/services page loads and returns HTTP 200|Live Netlify /services returns 200 at all 5 breakpoints|High
   ```
7. **Dispatch the appropriate sub-agent(s).** Parallel where possible; Automation SDET must only run after Integration QA passes.

   **7b. ⛔ INTEGRATION SCOPE HARD GATE — Automation SDET is NEVER optional.**
   When the scope is Integration, the pipeline has two mandatory sequential stages:
   - Stage 1: Dispatch Integration QA sub-agent and wait for results.
   - Stage 2: If Integration QA **passes** → **immediately dispatch the Automation SDET sub-agent without asking, without skipping, without deferring.** This dispatch is not conditional on time, complexity, ticket size, or any other factor. It is unconditional.
   - The ticket cannot advance to Done until **both** stages are complete and the Automation SDET has opened a PR.
   - If the main agent transitions the parent ticket to Done before the Automation SDET PR exists, that is a workflow violation — revert the ticket to In Testing and the QA subtask to In Progress immediately.

8. **Collect results from sub-agents.** The main agent must wait for sub-agent results. It is a workflow violation to "run verification directly" because a sub-agent timed out or appeared slow.
9. **Post results** to the QA subtask in a structured table format.
9.5 **Performance budget sub-gate (before the verdict).** Invoke
   `Skill(skill="perf-budget", args="{JIRA_KEY}")`. It measures LCP / CLS / TBT
   (Lighthouse, median of 3), first-load JS per route, largest image, and total page
   weight — on the **deployed URL**, at the design's frame widths only.

   - **PASS** → continue to the verdict.
   - **FAIL** → this is a real defect, not a non-blocking observation. Treat it exactly
     as any other QA failure: parent back to "In Progress", Dev account assigned, bug
     report posted, `/developer` invoked. A budget breach is a *measured* deviation,
     which is precisely the class of finding this skill already refuses to downplay.
   - Its table is appended to the QA subtask comment, not filed as a separate artifact.

   The regression rule applies alongside the absolute budgets: any metric more than 10%
   worse than the recorded baseline fails even if it is still inside budget.

10. **Transition parent + QA subtask:**
   - Frontend/Backend Pass → "Done", assign reviewer, then **auto-invoke the
     post-Done stages without asking**: `Skill(skill="sre-watch", args="{JIRA_KEY}")`
     for the post-deploy soak, and `Skill(skill="tech-writer", args="{JIRA_KEY}")` for
     the changelog/ADR/README pass. `/docs` never blocks; `/sre` escalates to
     `/release --rollback` if the soak finds a live defect.
   - Integration Pass → do NOT transition to Done yet; dispatch Automation SDET (step 7b). Only transition to Done after the Automation SDET PR is open.
   - Fail → parent back to "In Progress" with bug report; QA subtask stays open.

### HARD DELEGATION RULE

**The main agent is forbidden from executing work assigned to a QA sub-agent.**

- Frontend QA, Backend QA, Integration QA, and Automation SDET are defined as sub-agent roles. If `delegate_task` is available, the main agent MUST dispatch these roles via `delegate_task`. Performing the verification directly is a workflow violation, even if the sub-agent is slow, returns partial output, or the main agent believes it can verify faster.
- If a sub-agent fails or times out, the main agent has two valid choices: (1) re-dispatch with a clearer, narrower prompt, or (2) escalate to the user with the failure details and block the ticket. "Running verification directly" is not a valid fallback.
- The main agent's job is: ticket analysis, scope determination, subtask hygiene, dispatch orchestration, result aggregation, and JIRA status/assignee transitions. It must not open a browser, run Playwright, call APIs, or inspect code itself to produce QA evidence.
- The only exception is when the runtime literally lacks `delegate_task` or the required behavior/custom-agent infrastructure. That exception must be documented in the QA subtask comment before any manual verification occurs.

### Creating / Reusing QA Subtasks

- If a QA subtask does not exist, create one named "QA Testing for {JIRA_KEY}". Use `issue_type="Task"` (not Story/Sub-task) when the project's Story type does not accept child issues; link it "Relates" to the parent.
- If a QA subtask exists but was Done for an earlier/wrong implementation, reopen it (transition to "To Do"), update its description, and reuse it. This keeps evidence in one place (see KAN-68 reuse during KAN-17 rework).
- Attempting to create a child issue under a Story may fail with `Please select valid parent issue.` — fall back to a Task with a Relates link and document the fallback in a JIRA comment.

### Status & Assignee Rules

- "In Testing" → assign to Developer.
- "Done" → assign to Reviewer.
- Update assignee immediately after every transition.

### QA Subtask Hygiene

- Always update the QA subtask description to the canonical compact format before posting results. This keeps the checklist readable and lets future sub-agents parse it programmatically:
  ```
  TC|Description|Expected|Priority
  TC-001|...|...|High
  ```
- Reuse an existing subtask named "QA Testing for {JIRA_KEY}" instead of creating duplicates.

### When /quality-analyst is invoked from the dev pipeline

The developer-agent-ecosystem skill transitions the parent ticket to "In Testing" and loads the QA skill directly via `Skill(skill="quality-analyst", args="{JIRA_KEY}")`. In this flow the main QA agent must:

1. Treat the parent ticket as already in "In Testing"; do not re-transition it.
2. Create (or reuse) the QA subtask **as a Task, not a Story subtask**, because this Jira project's Story issue type does not accept child issues. Use `issue_type="Task"` and link it to the parent with a "Relates" issue link.
3. Assign the parent to the Developer while it remains in "In Testing".
4. On pass, transition both the QA subtask and the parent to "Done", then assign both to the Reviewer.

### Cross-scope failure attribution during full-suite runs

When a broad test command (e.g., `npm test` or Playwright full run) fails on code outside the ticket's scope, do not let that failure alone block the current ticket. Attribute the failure before deciding:

1. Identify the failing file/spec and the component/endpoint it actually exercises.
2. If it is owned by a sibling ticket (e.g., property-details form failure while testing services page integration), document it in the QA results comment and link the owning ticket.
3. Pass the current ticket's relevant TCs if the failure does not exercise the current scope. Do not transition the current ticket back to In Progress for an unrelated failure.
4. If the failing suite is part of the repo's `test-automation/` package and the current Integration ticket requires Automation SDET coverage, ensure the failure is not in the spec you are adding/extending before marking the Automation SDET step complete.
5. If a dedicated bug ticket already exists for that unrelated failure area, cross-post the failure details, sample error, root-cause note, and repro command to that ticket (e.g., KAN-82 for property-pricing/slug route test failures). Do not let the evidence live only in the current QA subtask.

## 2. Sub-Agent: Frontend QA

- **Role:** QA Engineer focused on UI/UX, visual fidelity, and responsive behavior.
- **Trigger:** Frontend scope.
- **Input Context:** Ticket ACs, Figma node links, live deployment URL, list of affected pages, JIRA QA subtask key.

### Checks

1. **HTTP / Reachability:** All in-scope pages return 200 at all breakpoints.
2. **Content Presence:** Headings, CTAs, cards, and text match the ticket/Figma.
3. **Responsive Layout:** measure at **every width the design has a frame for** (for `{{PROJECT_NAME}}`: 390 / 1440 / 1920) and grade those against Figma. Also measure the boundary widths of any band the ticket itself claims to fix, and grade those against **the ticket's acceptance criterion**, labelling them `unspecified in Figma`. Prefer measured values (`gridTemplateColumns`, `getBoundingClientRect`) via `browser_console(expression=...)` or the `scripts/multi-breakpoint-frontend-audit.py` harness; fall back to `browser_vision` only when pixel-level inspection is genuinely needed. See `references/grading-scope-and-termination.md` §1.
4. **Visual Theme:** Dark/violet tokens, card backgrounds, icon rings.
5. **Images:** No broken images; Next.js image optimizer returns 200.
6. **Console Errors:** No React hydration errors (#418) or unexpected 404s.
7. **Interaction states — measure every one.** default, hover, focus-visible, active, selected, disabled, loading. Drive them with Playwright (`hover()`, `focus()`) and record computed `background`/`color`/`border`/`outline` per state. Also: **touch targets ≥ 44×44px** on every button/link/icon-button at the mobile frame, **keyboard order** recorded as an actual `activeElement` sequence and compared to visual order, and a **visible focus indicator** on every focusable element. See `references/design-qa-checklist.md`.
8. **Content states.** Real (longest) content fits; truncation behaves as specified; empty, error and loading states render as designed. A state you cannot reach on the deployed build is **UNVERIFIED (state not reachable)** — never a pass.
9. **Accessibility.** Contrast ≥ 4.5:1 computed against the *actually painted* background, not a transparent section's declared colour. ARIA roles/labels/state complete (incomplete ARIA is worse than none). Focus management on open/close. `prefers-reduced-motion` respected — re-run with `emulateMedia({reducedMotion:'reduce'})`. Screen-reader output beyond `page.accessibility.snapshot()` is **UNVERIFIED (needs a manual pass)** — never claim it. Lighthouse accessibility > 90.
10. **Cross-platform — do not overclaim.** Playwright ships chromium, firefox and webkit. If only chromium ran, say "chromium verified; firefox/webkit UNVERIFIED". Emulate real devices via `playwright.devices[...]` for true DPR, and check `deviceScaleFactor: 2` serves the 2x asset.
11. **Occlusion / visibility — presence is not visibility.** An element can report a correct computed width and be entirely covered. Test three independent ways and report all three: real pixel geometry (`getBoundingClientRect`), rect containment against the overlapping sibling, and a `document.elementFromPoint` hit-test at the element's centre. The hit-test is the one that cannot be argued with. `getComputedStyle` alone once passed a hero image that was 100% occluded.
12. **Verify removals, not just additions.** When the fix removes a class, assert its absence in both `src/` and the served HTML (`grep -c` → 0). An override layered over a surviving offender is a different fix with different behaviour.
13. **Prove pre-existence before calling it a regression.** `git log -S'<string>'` / `git blame` before attributing a finding to the PR under test.
14. **Dual render branches.** Components here render a skeleton and a loaded branch reusing the same `data-testid`. Wait for the real element, scope selectors through its section, and **assert the match count is 1** — report it. Confirm any class fix landed in **both** branches (`grep -c` → 2, not 1). See `references/swr-skeleton-testid-collision.md`.
15. **Confirm every `data-testid` in your own brief exists** (`grep -o 'data-testid="[^"]*"'`) before dispatching. A wrong testid in the brief surfaces as a phantom code defect.
16. **Figma Visual Fidelity (mandatory for every Frontend QA pass):**
   - **Load the canonical bridge skill first.** If you need to fetch the Figma ground-truth asset programmatically (screenshot or SVG) for this comparison, call `skill_view('local-ai-bridge')` before any Figma fetch and follow **all** instructions in that skill for server startup, health checks, endpoint usage, and sequential SVG fetching. The inline notes here are a summary; the loaded skill is the source of truth.
   - **If the bridge is not running or not synced, stop.** Tell the user to start/sync the Local AI Bridge. Do **not** approximate Figma ground truth from memory, prior screenshots, or any other source.
   - **MANDATORY — numeric CSS diff, not just eyeballing.** The bridge returns Figma's own Inspect-panel CSS per node, so design fidelity is a measurable diff rather than a judgement call:
     ```bash
     curl -s "http://localhost:47291/api/node/{NODE_ID}/css" > /tmp/figma-css.json     # per-node CSS
     curl -s "http://localhost:47291/api/node/{NODE_ID}/context" > /tmp/figma-ctx.json # layout/tokens/type
     curl -s "http://localhost:47291/api/variables?format=css" > /tmp/tokens.css       # token values
     ```
     Compare against `getComputedStyle` from the running app property-by-property — `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing`, `color`, `background`, `padding`, `gap`, `border-radius`, `border`, `box-shadow`. See `references/design-fidelity-audit.md` § "Figma-vs-DOM numeric CSS diff" for the runnable recipe and tolerances. **A mismatch outside tolerance is a FAIL, quoted with both values** (`gap: Figma 24px vs DOM 16px`), not a "non-blocking observation".
     If `/api/document` reports `meta.deepMode: false` (large page), per-node CSS is still available — `/api/node/:id/css` falls back to a live fetch. Never report "Figma CSS unavailable" without trying it.
   - Open the Figma file/node side-by-side with the running branch (local or deployed).
   - Logo/brand icons: the rendered SVG path count and shape must match the Figma asset. Counting paths is not enough; the shape must be the same.
   - Text on dark/accent backgrounds: measure computed `color` and `backgroundColor` and assert WCAG AA contrast ≥ 4.5:1 for normal text.
   - Interactive states: active nav link, hover, focus, mobile-open hamburger, and CTA pills must match the Figma state visually and by computed style (`backgroundColor`, `borderRadius`, `color`, `padding`).
   - Placeholder copy: run a codebase search for banned placeholder strings and assert zero results.
   - Images/hero: at 390px, 768px, 1440px, 1920px verify no horizontal overflow, `max-w-full`, and `overflow-hidden` containment.
   - Social/brand icons: the rendered icon must match the Figma asset (e.g., Twitter bird vs. X logo); library substitutions are FAIL.

### Evidence Format

Post results to the QA subtask as a markdown table with columns:

```
| TC ID | Title | Status | Evidence | Severity |
|-------|-------|--------|----------|----------|
| TC-001 | ... | PASS | ... | — |
| TC-002 | ... | FAIL | see Failure #1 | High |
```

Rules:
- PASS rows: brief evidence inline; Severity = "—" (em dash).
- FAIL rows: evidence column references a numbered **Failure Details** block below the table; Severity = Critical/High/Medium/Low.
- Failure Details block: numbered, sorted by severity (Critical > High > Medium > Low).
- No HTML tags in the comment — pipe-separated markdown only.
- **Frontend QA must attach or reference a side-by-side Figma comparison screenshot for the component.** No comparison evidence = the pass is not credible.
- **Every Frontend TC that claims visual match must cite a measured value, not an opinion.** Examples: `borderRadius: 10px`, `contrast ratio: 7.2:1`, `path count: 5, fill: rgb(202,255,51)`, `no overflow at 768px`.

See `references/design-qa-checklist.md` for the category-by-category sweep — Visual Accuracy, Layout, Interaction, Content, Accessibility, Cross-Platform — including the three reconciliations where generic QA advice conflicts with this project's rules (never auto-file; check whether a placeholder came from the *design* before calling it a defect; numeric evidence replaces the absent second pair of eyes).

See `references/qa-comment-format.md` for the standard markdown template.

See `references/integration-form-db-assert.md` for a Playwright form-submit + DB read recipe.

## 3. Sub-Agent: Backend QA

- **Role:** QA Engineer focused on API contracts, status codes, and data integrity.
- **Trigger:** Backend scope.
- **Input Context:** Ticket ACs, endpoint URL(s), expected response shape, seed data expectations.

### Checks

1. **Endpoint returns 200** with correct envelope.
2. **Response shape** matches contract.
3. **Content matches Figma/frontend** (headings, counts, hrefs, icons).
4. **Fallback defaults** work when DB is empty.
5. **No existing endpoints broken** (regression smoke test).
6. **Seed script** populates expected rows.
7. **Build / tests / lint** pass.
8. **No phantom POST/PUT/Zod/rate-limiting** added to read-only routes.

## 4. Sub-Agent: Integration QA

- **Role:** QA Engineer focused on end-to-end data flow.
- **Trigger:** Integration scope.
- **Input Context:** Frontend page, backend endpoint, data mapping, JIRA QA subtask key.

### Checks

1. **Frontend fetches from correct API endpoint** on mount.
2. **Loading skeleton/spinner** displayed during fetch.
3. **Error state** with retry button when API fails.
4. **Empty state** when no data returned.
5. **Data renders correctly** after load (no formatting errors).
6. **No console errors** (especially hydration #418).
7. **SWR caching** behaves correctly.
8. **Automation coverage** — the `test-automation/` suite has a spec that exercises the new data flow end-to-end (e.g. live API call + rendered value assertion). If not, the Integration QA pass is incomplete and the Automation SDET step must add it.

## 5. Sub-Agent: Automation SDET (Integration scope only)

- **Role:** SDET adding Playwright automation for the integration.
- **Trigger:** Integration QA passed cleanly.
- **Input Context:** Existing test-automation structure, affected pages, API contract.

### Pre-dispatch checks

1. **Confirm the repo actually has an automation package.** A text search for `test-automation` can miss the directory; run a filesystem listing such as `find . -type d -name test-automation` before deciding the suite does not exist. If it exists, Automation SDET must run after the clean manual pass; do not skip it.
2. **Read the local automation constitution.** If `test-automation/INSTRUCTIONS.md` exists, read it before creating any file. It overrides generic POM guidance; follow its exact layering, naming, and import rules.
3. **Find the correct QA subtask key** and use it for the automation branch. The branch name must be `Automation/{QA_SUBTASK_KEY}/{RELATED_FEATURE_NAME}` (e.g., `Automation/KAN-84/property-details-inquiry`). This is a hard gate — verify the key before typing `git checkout -b`.
4. **Inspect the existing automation package skeleton.** A directory named `test-automation/` may already contain `base/`, `constants/index.ts`, `fixtures/`, `locators/`, `pages/backend/`, `playwright.config.ts`, and `tsconfig.json`. Run a filesystem listing (e.g., `find test-automation -type f | sort`) and read the existing base classes before writing new page objects or fixtures. Reuse the established `InitializationPage` and `ApiHelper` base classes and the existing path aliases (`@base/*`, `@pages/*`, `@locators/*`, `@constants/*`, `@fixtures/*`). Do not invent a parallel structure or ignore pre-existing files.
5. **Check the current project's domain in `constants/index.ts` and `constants/api-constants.ts`.** Automation skeletons may carry real-estate/property/review/service schemas from a template or previous project. Delete irrelevant endpoints and Zod schemas, keep only constants/schemas for the current project's API, and set `BASE_URL` to the current project's live deployment URL. Verify `/api/*` returns the expected payload with `curl` before declaring the BASE_URL correct.
- **Check root `tsconfig.json` and `eslint.config.*` coverage.** If the root Next.js config includes `test-automation/**/*.ts` with `@/*` path aliases, `tsc` and `eslint` from the root will fail to resolve the sub-package aliases (`@base/*`, `@pages/*`, etc.). Exclude `test-automation/**` from the root configs and type-check/lint the sub-package only inside `test-automation/` using its own `tsconfig.json`. See `references/bc6-automation-skeleton-reuse.md` for the exact root/sub-package split used in this repo.
7. **ABSOLUTE RULE: never push automation changes directly to `main`.** Create the branch, implement, verify locally, push the branch, open a PR, and then HALT. Ask the user to review and approve or decline before merging. Approval wording: "Please review MR ... reply with 'approve' or 'decline' (plus edits)."

### Rules

- **Never push automation changes to `main`.** Create `Automation/{QA_SUBTASK_KEY}/{feature}` branch, open a PR, and halt for user approval/decline.
- **Always read `test-automation/INSTRUCTIONS.md` first.** When an automation package exists, read its local constitution before creating files. It overrides generic POM guidance; follow its exact layering, naming, and import rules.
- **Inspect the existing automation package skeleton.** A directory named `test-automation/` may already contain `base/`, `constants/index.ts`, `fixtures/`, `locators/`, `pages/backend/`, `playwright.config.ts`, and `tsconfig.json`. Run a filesystem listing (e.g., `find test-automation -type f | sort`) and read the existing base classes before writing new page objects or fixtures. Reuse the established `InitializationPage` and `ApiHelper` base classes and the existing path aliases (`@base/*`, `@pages/*`, `@locators/*`, `@constants/*`, `@fixtures/*`). Do not invent a parallel structure or ignore pre-existing files.
- **Branch naming for automation must use the QA subtask key.** The branch must be `Automation/{QA_SUBTASK_KEY}/{RELATED_FEATURE_NAME}` (e.g., `Automation/BC-68/navbar-auth-integration`), not the parent implementation key. This distinguishes the automation MR from the implementation MR. **Double-check the QA subtask key before creating the branch — using the parent key (e.g., `Automation/BC-6/...`) is a workflow violation.**
- **Specs must contain zero logic and zero literals.** If a value appears in a spec, it belongs in `constants/`.
- **Use `page.waitForResponse` for form submissions** to prove the UI triggered a real network call, then assert status/body. Standalone `ApiHelper` checks alone do not prove the form is wired.
- Store all static values in the constants layer (slug, route, payload text, DB path). Never hardcode literals in specs or page objects.
- **Verify before halting:** run `npx tsc --noEmit` and the relevant Playwright project(s) locally. If any test fails, fix it before asking for review. **If the repo has a separate test-automation package with its own `tsconfig.json` (e.g. `test-automation/tsconfig.json`), run `npx tsc --noEmit` inside that package as well as at the root. The root `tsconfig.json` may exclude the sub-package or use different path aliases, so `tsc` at the root can hide errors that only appear inside `test-automation/`. Also ensure the root `tsconfig.json` excludes `test-automation/` if it lacks the sub-package's path aliases, otherwise VS Code / root `tsc` will report `Cannot find module '@pages/...'` and other module-resolution errors.**

## X_RAY Test Case Format

Use the compact one-line-per-TC format in QA subtask descriptions and comments:

```
TC|Description|Expected|Priority
TC-001|/services page loads and returns HTTP 200|Live Netlify /services returns 200 at all 5 breakpoints|High
TC-002|Page intro section renders|Heading "..." visible|High
```

Results are posted as markdown tables with columns: `TC ID`, `Title`, `Status`, `Evidence`.

## Pitfalls

- **Auto-closing sibling scope tickets.** A Frontend QA pass does not verify Backend or Integration code. Each scope ticket must go through its own code review + QA.
- **Duplicate QA subtasks.** Reopen and reuse existing QA subtasks when re-testing a corrected implementation.
- **Silent escalation.** When escalating to the user, @-mention the ticket reporter and explicitly state the pipeline is blocked.
- **Out-of-scope page diffs in visual regression.** Never accept baseline updates for pages not touched by the ticket.
- **Partial backend seed in tests.** Backend tests should seed the full expected content set (e.g., 4 quick links, 3 services, 4 categories each) so QA and integration tests have reliable counts.
- **Do not downplay responsive/Figma mismatches as "non-blocking" or as an "observation."** The user explicitly rejected this framing: any deviation from specified breakpoint dimensions, colors, spacing, typography, or behavior is a real defect, not a footnote. Move the parent ticket back to In Progress, fix with the smallest correct diff, re-verify at the exact target viewports, and re-run QA before marking Done.
- **Reconcile these two rules, do not let them fight.** *A deviation from a value the design **specifies** is a real defect* — never a footnote, never "non-blocking" (the rule directly above). *A measurement at a width the design **never specifies** has no specification to deviate from* — report the number as data, labelled `unspecified in Figma`, and grade it only against the ticket's own acceptance criterion if it has one. The first rule protects fidelity; the second stops QA inventing expectations. Both are the user's stated position.
- **QA is not a ticket generator — findings are reported, never auto-filed.** A QA pass that files a ticket for every measured difference has no termination condition, and this is empirical: on `{{PROJECT_NAME}}` each fix round shifted values at unspecified widths, which the next round measured and ticketed, 34 tickets deep, until the user stopped it ("why this endless loop is going on?"). A measurement is not a defect; a defect needs a contradicted expectation. Observations outside the tickets under test go in a section titled **"Informational only — no action"**, phrased as observations — no *bug*, *defect*, *FAIL*, *should*, or *recommend*. When told a set of tickets is the last, that is binding: fold in-scope discoveries into an open ticket and say so, rather than opening one more. And when the remaining findings are all sub-pixel, fluid-band, or half-gutter artifacts, **volunteer** that the effort is done. See `references/grading-scope-and-termination.md` §2.
- **Say UNVERIFIED rather than guessing.** If something could not be verified, write UNVERIFIED and why. Never fill a gap with a plausible value, and never report a command's result you did not run.
- **Mark all TCs honestly.** If a TC does not pass, mark it FAIL with severity and move the ticket back to In Progress. Do not label a failed TC PASS with a footnote, do not downgrade severity, and do not pass a ticket where the logo shape, text contrast, interactive states, or brand icons are wrong.
- **Logo/icon shape must be verified, not just path count.** A "5 paths, lime fill" assertion allowed a diamond to pass as a pinwheel. QA must compare the rendered SVG to the Figma asset side-by-side and cite shape evidence.
- **Text contrast is a first-class TC.** Any text on a dark or accent background must be measured with `getComputedStyle` and the ratio calculated. Below 4.5:1 is a FAIL, not an observation.
- **Interactive states are not optional.** Active nav pill, hover, focus, mobile hamburger pill, and CTA states must be visible and measured. "Slightly bolder" is not an active state.
- **Brand icon fidelity matters.** A social icon from a library (e.g., X logo) when the design specifies a Figma asset (e.g., Twitter bird) is a brand defect, not a style choice.
- **Placeholder copy is a FAIL.** Any remaining banned placeholder string found in the running page or codebase fails the ticket immediately.
- **Hero/image overflow is a FAIL at any breakpoint.** Spilling outside the container at 768px or any specified breakpoint fails the ticket.
- **Console errors from another scope can still block the ticket.** If the page-level "no console errors" AC fails because of a different component, document the originating component/ticket per `references/console-error-scope-attribution.md`, but transition the parent back to In Progress until the blocker is resolved.
- **The pre-merge local-server recipe is not an exception to this gate.** `/pr-review-and-merge` verifies an *unmerged branch* against a local build, because the branch is not deployed yet — see `../pr-review-and-merge/references/playwright-local-base-url.md`. That stage ends at merge. Every gate from `/release` onward, this skill included, is **deployed URL only**. A local run is never QA evidence.
- **Browser automation tools should only use production url for local testing.** `browser_navigate` and similar tools often block `localhost`, `127.0.0.1`, or intranet addresses. For verification, use `curl`/`wget`, run Playwright against the production `baseURL`, or invoke a small Node/Playwright script.
- **Figma-exact breakpoints need custom Tailwind v4 breakpoints.** Default `sm/md/lg/xl/2xl` rarely align with design-system breakpoints like 390/1440/1920px. A mismatch at one design width is a real defect, not a "non-blocking observation". Add named breakpoints in `@theme inline` (e.g., `--breakpoint-laptop: 1440px; --breakpoint-desktop: 1920px;`) and verify with Playwright at the exact widths. See `references/responsive-breakpoint-custom-tailwind.md`.
- **SWR cache leaks across integration tests.** Pages that fetch via SWR (this repo's standard data-loading pattern) share a global cache across test renders unless wrapped in `SWRConfig` with a fresh provider. When integration tests fail with duplicate text, stale data, or unexpected `fetcher` call counts, wrap the component in `<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>`. See `references/swr-test-isolation.md`.
- **Chrome MCP may be unreachable.** Before relying on `mcp__chrome_mcp__*` for UI inspection, confirm the server is connected with a lightweight call (e.g., `mcp__chrome_mcp__get_windows_and_tabs`). If it fails, fall back to terminal-based HTTP checks and the repo's Playwright suite.
- **Playwright constants should point to production.** Always inspect `test-automation/constants/index.ts` (or the repo's equivalent) for `BASE_URL` before running integration tests. A local QA run against `https://...netlify.app` will test the deployed site, not the branch under review. If the suite hardcodes `BASE_URL` and `ApiHelper` / `BaseAPI` use it directly, patch both to read `process.env.BASE_URL || BASE_URL` so **DO NOT USE** `BASE_URL=http://localhost:3000 npx playwright test ...` works without editing constants. Revert or leave the env-override in place only if it does not break production CI. See `references/qa-constant-drift-base-url-override.md`.
- **Pre-existing console/hydration errors are not automatic blockers.** A page-level "no console errors" assertion may fail because of a React hydration mismatch (#418), an image 404, or a script from a different scope. If the failure is outside the current ticket's components/endpoints, document it, link the owning ticket (create one if none exists), and mark the current ticket's relevant TCs PASS. Do not transition the parent back to In Progress solely for an unrelated console error. See `references/console-error-scope-attribution.md`.
- **QA must verify against Figma, not just against the ticket's ACs.** If the ACs are under-specified (no logo shape, no contrast values, no interactive states, no overflow check), QA is responsible for catching and failing those gaps, not rubber-stamping. When Figma ground truth is needed programmatically, load the `local-ai-bridge` skill first; if the bridge is unavailable, stop and tell the user to start/sync it. Never approximate Figma ground truth from memory or prior screenshots.
- **Deployed site can lag behind merge by 1–2 minutes.** Netlify and similar hosts may still serve the previous build immediately after `gh pr merge` reports MERGED. If a visual QA check fails right after merge (e.g. border-radius still 6px after a 10px fix), **DO NOT** verify against a local `npm run build && npm start` on `http://localhost:3000` before calling the fix a failure. Try refreshing until you get your fixes there in production site.
- **Tailwind utility-class conflicts are real Figma defects.** A base class like `rounded-md` combined with a conditional `rounded-[10px]` can render the base value (6px) even though the conditional class is present. During visual QA, measure `getComputedStyle(el).borderRadius` at the target breakpoint; do not assume the later class wins. If the measured value mismatches Figma, treat it as a FAIL and fix the class expression to avoid the conflict.
- **UI text / constants can drift after a frontend rebuild.** If the Playwright spec fails on a heading text mismatch, check whether the constant in `test-automation/constants/` is stale before assuming the UI is wrong. Update the constant to match the Figma-aligned UI text. See `references/qa-constant-drift-base-url-override.md`.
- **MR review must be posted before QA starts.** The user corrected an attempt to transition the ticket to "In Testing" and hand off to QA before the MR review comment was actually posted. QA must verify review evidence exists; if it doesn't, run `pr-review-and-merge` first.
- **Hardcoded content counts drift from seed data.** Prefer live API-driven assertions (call the endpoint, then assert the UI matches the response) over constants that assume a fixed seed. If you must use constants, validate them against the current seed in the same session.
- **Automation SDET must not be skipped and parent ticket must not be marked Done prematurely.** The Integration QA pass has two sequential stages: (1) manual verification, (2) Automation SDET adds Playwright coverage and opens a PR. If the parent ticket was accidentally moved to Done before the Automation PR is open, immediately transition it back to In Testing and the QA subtask back to In Progress. Do not merge the implementation branch into main and mark Done while the Automation PR is still pending — this violates the workflow the user enforced.
- **Existing `test-automation/` packages may carry irrelevant domain constants from a template or previous project.** When adding coverage, do not copy real-estate/property/review schemas into a banking (or other) project. Inspect `constants/index.ts` and `constants/api-constants.ts`, delete unrelated endpoints and Zod schemas, and set `BASE_URL` to the current project's deployment URL (e.g., `{{DEPLOYED_URL}}`). Verify the production `/api/*` endpoints return the expected payload with `curl` before declaring the BASE_URL correct.
- **Resolving reviewer comments at scale.** When a PR has 20+ inline comments, use the GitHub REST API, not the browser UI. Fetch both endpoints and merge by `created_at`:
  - Conversation comments: `GET /repos/{owner}/{repo}/issues/{pr}/comments`
  - Code review comments: `GET /repos/{owner}/{repo}/pulls/{pr}/comments`
  Reply to each code-review comment with `POST /repos/{owner}/{repo}/pulls/{pr}/comments` using `{"in_reply_to": <comment_id>, "body": "..."}`. Then resolve every thread via GraphQL (`resolveReviewThread`); see `pr-review-and-merge/references/resolve-review-threads-graphql.md`. A reply alone does **not** mark a thread resolved.
- See `references/bc6-automation-skeleton-reuse.md` for a concrete case where the repo already had a `test-automation/` skeleton and the Automation SDET had to reuse its base classes, path aliases, and fixture patterns.
- **Next.js image `src` is rewritten by the optimizer.** Assert the original image URL is contained in the `/_next/image?url=...` value, or verify the image network response, rather than expecting the raw API URL as the `src` attribute.
- **Test specs for integration pages must cover states, not just happy path.** Loading, empty, error, responsive, and live-API validation are the minimum bar for an integration page spec; simple render + count tests are not enough.
- See `references/bc9-footer-automation-refactor.md` for a concrete BC-9 example of refactoring a raw Playwright footer spec into strict POM + fixtures architecture.
- **When reviewer comments override the form-submission evidence recipe.** The QA skill recommends `page.waitForResponse` + DB read to prove a form POST. If the reviewer / repo convention prefers page-object-only assertions and no direct response/DB checks, resolve the comments by moving test data to constants, using modular page-object helpers, and asserting the success UI. Post a note in the QA subtask that the automation was shaped by review feedback and may not independently prove the POST landed in the DB. Do not leave the MR unmerged over a recipe-vs-convention conflict if the parent ticket's ACs are otherwise met and the reviewer has approved. See `references/contact-form-qa-reviewer-override.md`.
- **Integration QA → Automation SDET ordering.** See `references/kan40-integration-automation-flow.md` for the corrected end-to-end flow and why the parent should not be marked Done before the Automation SDET step completes.
- See `references/bc6-automation-skeleton-reuse.md` for a concrete case where the repo already had a `test-automation/` skeleton and the Automation SDET had to reuse its base classes, path aliases, and fixture patterns.
- **Main agent doing QA sub-agent work.** The most direct route to a rubber-stamp pass. Frontend/Backend/Integration QA and Automation SDET must be dispatched via `delegate_task`. If a sub-agent is slow, re-dispatch or escalate; do not "just verify it myself".
- **SWR loading skeletons share `data-testid` with real content, breaking Playwright text assertions.** When a component renders a skeleton placeholder with the same `data-testid` as the real element (e.g., both `<div data-testid="cta-heading" aria-hidden="true">` and `<h2 data-testid="cta-heading">`), Playwright's `expectTextContains` will read the skeleton's empty text before SWR resolves. Fix: add `page.waitForSelector('[data-testid="..."]:not([aria-hidden="true"])')` before text assertions to wait for the real element. The skeleton must use `aria-hidden="true"` for this selector to work. See `references/swr-skeleton-testid-collision.md`.
- **Missing binary assets = production-only blank image.** If the implementation PR never staged `public/assets/<file>`, the asset exists on the developer's machine (untracked) but is absent from the deployed build. **DO NOT** QA on localhost, it will pass; QA on the live Netlify/Vercel URL will show a blank image. Always verify image/SVG visibility only on the deployed URL. Use `page.goto(BASE_URL + ROUTE)` in Playwright specs and assert the `<img>` `src` resolves to HTTP 200 via `page.waitForResponse(r => r.url().includes('hero_image') && r.status() === 200)`.
- **z-index visual stacking verification.** When a hero section has both a decorative background illustration and a foreground image, verify the foreground image is actually on top in the browser — not just rendered in the DOM. Use `page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="<image-wrapper>"]')).zIndex)` and assert it is higher than the background element's z-index. A z-index miss makes the hero image invisible on production while passing DOM-only checks.
- **Asset origin must match ticket's Figma node.** If a ticket specifies "Figma node 659:2 — careers abstract design", the rendered SVG must come from that node, not a visually similar asset reused from another page. Verify via the `src` attribute: `expect(await page.getAttribute('[data-testid="careers-hero-abstract-design"]', 'src')).toContain('careers_abstract')`. A wrong-node asset is a design regression even if it renders without error.

## Reference files

Every file in `references/` is listed here. Generated by
`scripts/refindex.py` — descriptions you write by hand are preserved.

- `references/backend-qa-vitest-reseed.md` — **vitest mutates the DB** — re-seed before manual Backend QA validation or you grade a suite's leftovers.
- `references/bc6-automation-skeleton-reuse.md` — BC-6 Automation Lesson — Reusing a Pre-existing `test-automation/` Skeleton.
- `references/bc9-footer-automation-refactor.md` — BC-9 Footer Integration — Automation refactor recipe.
- `references/browser-tool-frontend-audit.md` — running a Frontend QA audit with standalone browser tools — measurement snippets for contrast, computed styles, and interactive states.
- `references/console-error-scope-attribution.md` — Console Error Scope Attribution.
- `references/contact-form-qa-reviewer-override.md` — Contact Form QA: Reviewer-Convention Override of `waitForResponse` + DB Evidence.
- `references/design-fidelity-audit.md` — Design Fidelity Audit — Chrome JavaScript Snippets.
- `references/design-qa-checklist.md` — Design QA Checklist — systematic sweep.
- `references/frontend-qa-browser-workarounds.md` — Frontend QA: Browser Tool Fallbacks & Measurement Techniques.
- `references/grading-scope-and-termination.md` — What QA may grade, and when QA must stop generating tickets.
- `references/integration-form-db-assert.md` — Integration Form Submit + DB Assertion Recipe.
- `references/integration-qa-hydration.md` — the hydration check specific to Integration QA, run before grading rendered data.
- `references/kan22-qa-case-study.md` — KAN-22 / KAN-72 case study — About Us / Our Story Integration QA.
- `references/kan34-automation-sdet-case-study.md` — KAN-34 case study — correcting the constants layer when an automation skeleton carries another project's domain.
- `references/kan40-integration-automation-flow.md` — Case Study: KAN-40 Integration QA / Automation SDET Flow.
- `references/kan8-qa-case-study.md` — KAN-8 case study — Integration QA pitfalls found the hard way.
- `references/optional-onsubmit-form-pitfall.md` — a form component with an optional `onSubmit` can render and pass a smoke test while submitting nothing. Assert the network call.
- `references/playwright-frontend-audit.md` — Multi-Breakpoint Playwright Frontend Audit.
- `references/playwright-sqlite-pitfalls.md` — Playwright + SQLite pitfalls: DB locking, seed timing, and why a suite that passes alone fails in parallel.
- `references/pom-fixture-architecture.md` — **the POM + fixture architecture the Automation SDET must follow** — layering, naming, path aliases, and the zero-logic-in-specs rule. Required reading before writing any page object.
- `references/qa-comment-format.md` — QA Results Comment Format.
- `references/qa-constant-drift-base-url-override.md` — QA Pitfall: UI Text / Constant Drift + BASE_URL Override.
- `references/qa-description-format-example.md` — the canonical QA subtask description format, including the compact one-line-per-TC X-Ray table. Start here rather than inventing a layout.
- `references/react-hydration-mismatch.md` — detecting and fixing React/Next.js hydration mismatches (#418) during QA, and when the error belongs to another scope.
- `references/responsive-breakpoint-custom-tailwind.md` — Responsive Custom Breakpoints for Fidelity — Tailwind v4.
- `references/serverless-sqlite-netlify.md` — serverless SQLite writes on Netlify Functions — why a write that works locally fails on the deployed build.
- `references/swr-skeleton-testid-collision.md` — SWR Skeleton TestID Collision.
- `references/swr-test-isolation.md` — SWR Test Isolation for Integration QA.
- `references/test-automation-root-config-collision.md` — the root `tsconfig`/`eslint` vs `test-automation/` path-alias collision, and the exact exclude split that fixes it.

## Remember

```
Senior QA SDET analyzes scope and dispatches
Frontend/Backend/Integration QA are sub-agent roles
⛔ INTEGRATION SCOPE: Automation SDET is ALWAYS dispatched after Integration QA passes — no exceptions, no skipping, never optional
Automation SDET must run BEFORE the ticket can be marked Done
Wait for sub-agent results — never run verification directly
Post structured evidence tables with measured values, not opinions
Deployed URL only — never localhost; prove the deploy carries the commit before measuring
Enumerate the design's frames first — only those widths can be graded against Figma; elsewhere report data, not verdicts
Findings are reported, never auto-filed — a measurement is not a defect; observations go under "Informational only — no action"
Presence is not visibility — hit-test occlusion; verify removals are absent; prove pre-existence before calling it a regression
PASS requires side-by-side Figma comparison for Frontend
Integration PASS does NOT mean Done — dispatch Automation SDET first
FAIL = move ticket back to In Progress with bug report
/perf-budget is a MANDATORY sub-gate before the verdict — a budget breach is a defect, not an observation
/release already proved the deploy carries the commit — read its evidence table, do not re-derive it
Done is NOT the end — auto-invoke /sre (soak) and /docs (changelog) on pass
HARD DELEGATION: main agent never performs QA sub-agent verification
```