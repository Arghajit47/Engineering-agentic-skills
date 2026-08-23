# Design QA Checklist — systematic sweep

A category-by-category sweep for verifying an implementation against its design spec.
Use alongside the numbered **Checks** in the skill body, not instead of them: the Checks
carry this project's hard-won gates (deployed-URL only, frame-inventory grading, dual render
branches, occlusion hit-tests). This file covers the categories those Checks under-serve —
**Interaction, Content, Accessibility, Cross-Platform** — which is where most of the gaps are.

Every item is either measured, or reported **UNVERIFIED with the reason**. Never "looks fine".

---

## Three reconciliations — read before using this list

**1. Findings are reported, never auto-filed.** Generic QA advice says "file bugs with
screenshots". Here, a QA pass **does not open tickets** — it reports, and the human decides
what becomes work. Anything outside the ticket's stated ACs goes under
**"Informational only — no action"**, phrased as an observation. See
`grading-scope-and-termination.md`; this rule exists because auto-filing ran 34 tickets deep
before the user stopped it.

**2. "No placeholder copy" needs a source check first.** The generic rule is "no lorem ipsum in
production". On `{{PROJECT_NAME}}` the **Figma design itself** contains
`Lorem ipsum dolor sit amet consectetur…` in the CTA body and `hello@skillbridge.com` in the
footer. An implementation reproducing those **matches its spec** — that is a design defect, not
an implementation defect. Always ask: did the *design* specify this placeholder, or did the
*implementation* invent it? Report the former as a design observation; only the latter is an
implementation finding.

**3. There is no separate designer pass.** The generic process assumes developer self-review
then designer visual QA. Here one agent does both, so the discipline that replaces a second
pair of eyes is **numeric evidence**: cite a measured value and the width and page it came
from, never an impression.

---

## Visual Accuracy

Mostly covered by the skill's Figma-vs-DOM numeric diff. Additions:

- [ ] **Colours match design tokens, not just hex.** Quote the token name from
      `/api/variables` where one exists; a raw hex that happens to match today drifts silently
      when the token changes.
- [ ] **Border radius, shadows, opacity** compared per property. Watch for **opacity on the
      node vs opacity on the fill** — a Figma node at `opacity: 1` can carry a
      `GRADIENT_RADIAL` fill at `0.3`. Reporting the node value nearly produced a false
      failure on BC-189.
- [ ] **Icons: correct size *and* correct shape.** Path count is not identity — a library icon
      with the same count is still the wrong asset. Compare against the exported node.
- [ ] **Images: aspect ratio and intrinsic size.** A rendered box matching the Figma node does
      not mean the asset is right; check `naturalWidth`/`naturalHeight` too. On BC-189 the
      use-cases decorations rendered at the correct 118×112 while the SVG's intrinsic aspect
      (213×224) showed it had been exported from a different frame.

## Layout

- [ ] Grid alignment and column counts measured via `gridTemplateColumns`, per frame.
- [ ] **Responsive behaviour at every width the design has a frame for** — and only graded
      there. Elsewhere, report as data.
- [ ] Content reflows without overlap; **no unexpected overflow or clipping**. Check
      document-level `scrollWidth - clientWidth`, and separately note elements extending past
      the viewport *inside* an `overflow-x: auto` container — those are not page overflow.
- [ ] Min/max widths respected; `max-w-*` containers actually bounded at the largest frame.
- [ ] **Declared spacing vs materialised spacing.** When a gap does not appear despite being
      declared, check whether the trailing child is still **in flow** at that width. An
      element that is `position: absolute` at one breakpoint escapes the parent's padding box
      and silently swallows the gap — this cost BC-189 three wrong diagnoses.

## Interaction

The weakest area in prior passes — none of these were checked before this file existed.

- [ ] **Every state rendered and measured:** default, hover, focus, focus-visible, active,
      selected, disabled, loading. Drive them with Playwright (`hover()`, `focus()`,
      `:disabled`), and record computed `background`, `color`, `border`, `outline` for each.
- [ ] **Transitions and animations match spec.** Pull the real values from
      `/api/node/:id/motion` — duration in ms and the derived CSS timing function. A spring
      has **no** CSS equivalent; if the design specifies one, the implementation cannot match
      it with a cubic-bezier and that is worth saying.
- [ ] **Touch targets ≥ 44×44px.** Measure `getBoundingClientRect()` on every button, link and
      icon-button at the mobile frame. Padding counts toward the target; a 24px icon inside a
      44px pill passes.
- [ ] **Keyboard order matches visual order.** Tab through and record the sequence of
      `document.activeElement` testids; compare against DOM/visual order rather than assuming.
- [ ] **Focus indicator visible on every focusable element** — measure `outline` /
      `box-shadow` under `:focus-visible` and confirm it is not `none` and has contrast
      against its background.

## Content

- [ ] **Real content fits.** Test with the longest actual string, not the design's sample.
- [ ] **Truncation behaves as specified** — ellipsis vs wrap vs clamp, and at which line.
- [ ] **Empty, error and loading states** render as designed. These are usually unreachable
      from the deployed happy path; if you cannot reach one, mark it **UNVERIFIED (state not
      reachable on the deployed build)** rather than passing it.
- [ ] **Skeleton and loaded branches both correct.** They share `data-testid` values here, so
      a fix applied to one leaves first paint defective. Assert the match count.
- [ ] **Placeholder copy** — apply reconciliation 2 above before calling it a finding.

## Accessibility

- [ ] **Colour contrast ≥ 4.5:1** for normal text, 3:1 for large text and UI boundaries.
      Compute it from the measured foreground and the *actual* painted background — not the
      section's declared colour, which may be transparent over something else.
- [ ] **ARIA roles, labels and state** correct: `role`, `aria-label`, `aria-selected`,
      `aria-expanded`, `aria-controls`. Incomplete ARIA is worse than none — a `role="tab"`
      with no `aria-controls`, no tabpanel and no roving focus is a regression, not progress.
- [ ] **Focus management** on open/close of menus, modals and accordions: focus moves in, is
      trapped where appropriate, and returns to the trigger.
- [ ] **`prefers-reduced-motion` respected.** Re-run with
      `page.emulateMedia({ reducedMotion: 'reduce' })` and confirm animation is suppressed.
- [ ] **Screen reader output** — cannot be fully automated. Verify the accessible tree instead
      (`page.accessibility.snapshot()`) and report anything beyond that as **UNVERIFIED (needs
      a manual screen-reader pass)**. Do not claim a screen-reader pass you did not perform.
- [ ] Lighthouse accessibility > 90.

## Cross-Platform

Be honest about coverage here — this is the easiest place to overclaim.

- [ ] **Browsers.** Playwright ships chromium, firefox and webkit. If only chromium was run,
      say so: "verified in chromium; firefox/webkit **UNVERIFIED**". Installing the others
      (`npx playwright install webkit firefox`) is cheap when the ticket involves layout
      primitives with known engine differences (flex gap, `:has()`, subgrid, backdrop-filter).
- [ ] **Devices** — emulate with `playwright.devices[...]` for real DPR and viewport combos,
      not just a resized desktop window.
- [ ] **OS text-size scaling.** Re-measure with a raised root font size; layouts pinned in
      `px` will not respond, which may or may not be intended.
- [ ] **Screen density** — check `deviceScaleFactor: 2` renders the 2x asset, not an upscaled 1x.

---

## Process

1. Verify against the **design spec fetched now**, never against memory or a previous pass's
   numbers. Two BC-189 passes each repeated a wrong figure for the same boundary because
   neither re-measured the mechanism.
2. Test with real content and data from the deployed build.
3. Check edge cases, not just the happy path — the longest string, the empty list, the
   narrowest and widest graded frame.
4. Use dev-tools-equivalent measurement (`getComputedStyle` **plus**
   `getBoundingClientRect`) for exact values. Computed style alone misses occlusion; geometry
   alone misses inherited colour.
5. Report findings with the measured value, the width, and the page. Screenshots support a
   finding; they do not substitute for a number.
6. **Record recurring issues for prevention.** When the same root cause appears a third time,
   the fix belongs in a skill or reference file, not just in the ticket. BC-189 hit
   "value bound at the wrong tier" four times.
