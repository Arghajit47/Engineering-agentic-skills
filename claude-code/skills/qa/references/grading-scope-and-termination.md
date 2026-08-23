# What QA may grade, and when QA must stop generating tickets

Distilled from BC-155 → BC-188 on `{{PROJECT_NAME}}`. The first half of this file prevents
false failures; the second half prevents the failure mode the user finally called out:
*"Sorry but why this endless loop is going on?"*

---

## 1. The design's frame inventory bounds what QA may grade

Before grading anything, enumerate the frames that actually exist in the Figma file:

```bash
curl -s http://localhost:47291/api/document > /tmp/tree.json   # ONCE, then parse locally
python3 - <<'PY'
import json
d=json.load(open('/tmp/tree.json'))
# walk and print every top-level FRAME with its width
PY
```

For `{{PROJECT_NAME}}` the answer is **exactly three: 390, 1440, 1920.**

> **At a width where the design has no frame, there is no specification — so there is
> nothing to pass or fail.** Measure it, report the number as *data*, and label it
> "unspecified in Figma". Never write PASS or FAIL against an invented expectation.

This is not pedantry. Grading 768 and 1024 against interpolated guesses is what generated
roughly a third of the tickets in this effort, several of which were describing the fluid
result of a correct implementation.

**What you still grade at an unspecified width:** the ticket's own acceptance criterion, if
it states one that is independent of Figma. BC-186's criterion was *"the hero image is
visible and not occluded in the 768–1439 band"* — a correctness property, not a
measurement, so it was graded at six widths in a band Figma never mentions. Report it that
way explicitly: graded against the ticket, not against the design.

**Report the transition too, without grading it.** At 1439 the overlap was 0 and the image
516px; at 1440 the `laptop:` tier engaged and it became 174/716. Both endpoints match their
own frames; the step *is* the breakpoint. Stating that prevents the next reader from
"discovering" it as a bug.

---

## 2. Termination — QA is not a ticket generator

A QA pass that auto-files a ticket for every measured difference has **no termination
condition**, and this project proved it empirically: each round of fixes shifted values at
unspecified widths, which the next round measured and ticketed, which shifted more values.
34 tickets in, the user stopped it.

**Rules:**

1. **A measurement is not a defect.** A defect requires a stated expectation — a Figma
   frame value, or an explicit acceptance criterion — that the measurement contradicts.
2. **Never auto-file.** Report findings; let the human decide what becomes a ticket. If a
   pass produces observations outside the tickets under test, they go in a section titled
   **"Informational only — no action"**, phrased as observations. In that section do not
   use the words *bug*, *defect*, *FAIL*, *should*, or *recommend*.
3. **When told a set of tickets is the last, that is binding.** Fold any genuinely
   in-scope discovery into an existing open ticket rather than opening a new one, and say
   that you did. Opening "just one more" against an explicit instruction is a violation.
4. **Say when you are near the bottom.** If the remaining findings are all sub-pixel,
   fluid-band, or half-gutter artifacts, say so plainly and recommend stopping. Volunteer
   that judgement — do not wait to be asked.

---

## 3. Measure the right thing — three traps that produce false passes

**a. Presence is not visibility.** An element can have a correct computed width and be
completely covered. Test occlusion three independent ways and report all three:

```js
const r = el.getBoundingClientRect();                 // 1. real pixel geometry
const inside = r.left >= card.left && r.right <= card.right &&
               r.top >= card.top  && r.bottom <= card.bottom;   // 2. rect containment
const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);  // 3. hit-test
```

The hit-test is the one that cannot be argued with: if `elementFromPoint` at the element's
centre returns the element itself, it is genuinely visible. `getComputedStyle` alone would
have passed BC-186's original defect.

**b. Absence must be verified, not assumed.** When a fix *removes* a class, assert the
removal: `grep -c 'md:-ml-\[260px\]' src/**` must return **0**, and the deployed HTML must
not contain it either. A fix that adds an override while leaving the offender in place is a
different fix with different behaviour.

**c. Prove pre-existence before blaming a PR.** Before reporting something as a regression,
check `git log -S'<string>'` / `git blame`. Several "new" findings in this project predated
the branch under test.

---

## 4. The deployed build must be proven to contain the commit

QA runs against the deployed URL only — never localhost, absolutely
(`feedback_qa_deployed_url_only`). But "the deploy went green" is not proof the *fix* is
live. Netlify lag, a stale cache, or a red pipeline that blocked the deploy all present as
a healthy 200.

**Gate, before a single measurement:**

```bash
gh run list --branch main --limit 1     # deploy for the merge commit actually succeeded
curl -s https://<deployed-host>/<page> | grep -c 'flex-col-reverse'      # added class present
curl -s https://<deployed-host>/<page> | grep -c 'md:-ml-\[260px\]'      # removed class absent → 0
```

Grepping the served HTML for one added and one removed token from the diff is a two-second
check that catches a stale deploy before it costs you a full QA round. If it fails: STOP
and report. Do not substitute a local build.

---

## 5. Skeleton / loaded dual-branch discipline

Components in this repo render a skeleton branch and a loaded branch that **reuse the same
`data-testid`**. This cuts three ways:

- **Measurement:** a testid can match twice. Wait for the real element (`img.complete` with
  non-zero width, or `:not([aria-hidden="true"])`), scope selectors through the section
  containing it, and **assert the match count is 1** — report it (`nSections: 1`).
  See `swr-skeleton-testid-collision.md`.
- **Fixes:** a class fix applied to only one branch leaves first paint defective. BC-155
  had a second defective `<h2>` in the `!mounted || isLoading` branch that QA never
  reported. When verifying any class fix, confirm it landed in **both** branches
  (`grep -c` should return 2, not 1).
- **Your own briefs:** confirm the testid you are about to hand a sub-agent actually exists
  (`grep -o 'data-testid="[^"]*"'`). I dispatched a brief naming `values-heading` when the
  code said `values-section-heading` — my error, reported back as a code defect.

---

## 6. Evidence standard

Every claim cites a measured number and the width and page it was measured at. `PASS` with
no number is not evidence. Where the design is silent, say
`unspecified in Figma — reported as data`. Where you could not verify something, write
**UNVERIFIED** and say why; never fill the gap with a plausible value.
