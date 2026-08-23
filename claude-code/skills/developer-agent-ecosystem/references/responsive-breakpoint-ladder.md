# Responsive Breakpoint Ladders — the `laptop:`-leak defect family

Distilled from BC-155 → BC-188 on `{{PROJECT_NAME}}` (34 tickets). **Roughly 8 of those
tickets, plus an entire 70-utility audit, were the same single defect wearing different
clothes.** Read this before writing or reviewing any responsive Tailwind class string.

Companion: `qa/references/responsive-breakpoint-custom-tailwind.md` (how to *declare*
custom breakpoints). This file is about how to *populate* them without leaking.

---

## 1. The root cause, stated once

Tailwind variants are **min-width** media queries. They apply at their width **and every
width above it**, until a higher variant overrides the same property.

In this repo (`src/app/globals.css` → `@theme inline`):

| Prefix | min-width | Figma frame |
|---|---|---|
| `md:` | 768px (Tailwind default) | **none** |
| `lg:` | 1024px (Tailwind default) | **none** |
| `laptop:` | `90rem` = **1440px** | Laptop |
| `desktop:` | `120rem` = **1920px** | Desktop |

Therefore:

> **A `laptop:` utility with no `desktop:` counterpart for the same property silently
> renders the 1440 value at 1920.**

That is the whole bug. It is invisible in the source (the class string looks complete and
intentional), invisible to type-checking and lint, and invisible to unit tests that assert
on class strings rather than resolved values. It only appears if you measure at 1920.

The mirror-image failure is just as common: **a value bound at `md:` (768) that was read
off the 1440 or 1920 frame.** `md:-ml-[260px]` — the 1920 hero offset applied from 768
upward — occluded the hero image 100% across the entire 768–1439 band on three pages
(BC-186). Nothing in Figma specifies 768, so the value had no business being bound there.

---

## 2. The ladder idiom — use this shape

```
base            = the 390 (mobile) value       — no prefix
md:  / laptop:  = the 1440 (laptop) value
desktop:        = the 1920 (desktop) value
```

```tsx
// complete ladder — every tier a real Figma frame, nothing leaks
className="text-[28px] md:text-[38px] desktop:text-[48px]"
className="px-4 laptop:px-20 desktop:px-[162px]"
```

Rules:

1. **Build tiers only from real Figma frames.** Never invent an intermediate tier because
   a width "looked wrong" in the browser. If Figma is silent at that width, the fluid
   result is the specification.
2. **`desktop:` is mandatory whenever `laptop:` sets a property** — unless the 1440 and
   1920 frames genuinely carry the same value, in which case say so in a comment so the
   next reader doesn't "fix" it.
3. **Never bind a laptop/desktop value to `md:` or `lg:`.** Those bands have no frame.
   Use them only to carry the *laptop* value down to 768 when the design intends the
   laptop layout to start there — and only when you can point at why.
4. **Same property, same ladder.** A partial ladder (`laptop:px-20 desktop:px-[162px]`
   for x but only `laptop:pt-[50px]` for y) is the defect, half-shipped.

---

## 3. Auditing for it — grep is not enough

The dangerous case is **invisible to grep**: `CareersHeroSection.tsx` (BC-187) had **no
`laptop:` tier at all**, so every search for `laptop:` missed it while it rendered the
mobile tier at 1440. Searching for the symptom finds only components that already have
the symptom's syntax.

**Audit by enumeration, not by pattern match:**

1. List every component that renders on the pages in scope.
2. For each, extract every responsive utility and group by **property**, not by prefix.
3. For each property group, ask: does it have a value for each of 390 / 1440 / 1920?
   A group with `laptop:` and no `desktop:` is a hit. A group with **no** tier at all,
   on an element the design changes across frames, is also a hit — and the one grep loses.
4. Confirm each hit by measuring the resolved value at 1920 (and 1440) in a real browser.

The BC-175→BC-180 audit covered 70 utilities this way and closed with **zero
unverifiable items** — that outcome is the bar.

---

## 4. Deriving values from Figma without getting burned

All values come from the Local AI Bridge (`http://localhost:47291`) — see
`project_local_ai_bridge` memory and the `local-ai-bridge` skill. Specific traps paid for
in this project:

- **Fetch `/api/document` ONCE to a file and parse locally with python3.** Per-node
  fan-out (~36 sequential calls) stalled dispatched agents repeatedly. One 38 MB snapshot
  parsed locally is faster and cannot time out.
- **Cite the frame width with every value.** A brief that says "navbar is 95px tall"
  is unusable; "navbar `5:27272` @1920 = 95px, pill 100×51" is checkable. I shipped a
  wrong BC-158 ticket by comparing the 1920 implementation against the **laptop** frame.
- **Zero-height nodes consume no space in the flow.** Figma `LINE` dividers have
  `height: 0`, so a container's `itemSpacing` lands **fully on both sides** of them. I
  briefed 20/25px from the visual gap; the correct derived values were **40/50** (BC-180).
  Check `type` and `absoluteBoundingBox` before converting `itemSpacing` into a gap.
- **Read `itemSpacing` sign and layout mode together.** `VERTICAL` + `itemSpacing: -41`
  means the *next* child overlaps the previous one upward by 41px — that is a stacking
  order and an overlap, not a margin. Verify order by absolute coordinates, never by
  child index alone.
- **A half-pixel gutter in the design will not reproduce exactly.** The Figma 390 frame
  placed a container at x=17 width=357 — a 17px left and 16px right gutter. A symmetric
  `px-4` yields a 1px width difference forever. Document it; do not chase it, and do not
  raise a ticket for it.

---

## 5. Prescribed fixes are hypotheses, not instructions

Twice in this project the senior-dev brief prescribed a fix that would not have worked,
and the implementing agent was right to deviate:

- **BC-155 dividers.** I attributed missing dividers to `laptop:border-0` overriding
  `divide-x` and prescribed narrowing it. In Tailwind v4 `divide-x` emits
  `:where(.divide-x > :not(:last-child)) { border-inline-end-width: 1px }` — a **right**
  border at **zero specificity**. The prescribed fix would have produced no
  `borderLeftWidth` at all while looking correct in the diff.
- **BC-186 hero.** Removing `md:-ml-[260px]` alone left the image **0px wide** from
  768–890: a sibling ticket's `md:w-full` on a `shrink-0` card consumed the whole row,
  starving the `flex-1` (basis-0) image wrapper. `md:min-w-[260px] md:shrink` was needed.

**Therefore:**

- Verify any prescribed selector/specificity claim against **compiled CSS**, not intuition.
- A deviation is welcome when it arrives with evidence: a **before/after table across
  several widths**, including the widths that must *not* change. BC-186's agent produced
  exactly that (0 → 260px at four widths; 1440/1920 byte-identical), which is why the
  deviation was approved without a second round.
- Fixing one Tailwind utility can starve a sibling. After any flex/width change, re-measure
  the **siblings**, not just the element named in the ticket.

---

## 5b. Name the ELEMENT, not just the value — two briefing errors that cost three QA rounds

BC-189 needed three QA passes. **Two of the three failures were errors in the senior-dev
brief, not the implementation.** Both were the same mistake: naming a value correctly while
naming the wrong element.

- **I wrote "`desktop:text-[22px]` matches no Figma frame".** It does — nodes `41:130`/`41:141`
  are 22/400 at 1920. My frame-wide *text* scan had matched a different node, and I had also
  labelled the line as a tab when it was a card heading. Two further rows were transposed
  (tab 14/14/18 vs footer link 14/16/18) for the same reason.
- **I wrote "footer root gap: fix `Footer.tsx:144`".** Line 144 was the footer's *child 0*.
  The root container was `display: block` with no gap at all — its four inter-block gaps came
  from two `<hr className="my-[50px]">`. The developer implemented my instruction exactly, so
  the root gap never moved, and child 0 picked up 30 where Figma specifies 24.

**Rules that follow:**

1. **A frame-wide text search is not node identification.** Searching for a string finds *a*
   node with that string, not the node you mean. Resolve the element first (by testid, by
   position in the tree), then read its metrics — never the reverse.
2. **Confirm the mechanism before prescribing the fix.** Ask *what actually produces this
   spacing today* — a flex `gap`, per-child margins, an `hr`'s `my-`, padding? Grep the
   element you are about to name and read the surrounding lines. A gap ladder prescribed onto
   an element with no gap is a no-op that looks like a fix.
3. **A parent and its first child are different specs.** Footer root was 30/40/50 while child 0
   was 24/40/50. Collapsing them produced a second failure on the same ticket.
4. **Tell the sub-agent the brief is a hypothesis, and mark your own uncertain rows.** The rows
   I flagged as needing per-node confirmation were the ones that turned out wrong; the developer
   caught them because the brief invited it.

**Related trap — absolute positioning escapes the padding box.** BC-189's 1920 hero→products
gap read 100.77 against a declared 150 because one child was `position: absolute` *only at
1920*, escaping the wrapper's padding and leaving a 25.77px tail instead of 75. At 1440 the same
element was in flow and the boundary measured exactly as declared. Three separate diagnoses of
this were wrong before one measured it. When a declared spacing does not materialise, check
whether the trailing child is still in flow at that width.

**Zero-height nodes and the `hr` idiom.** Figma `LINE` nodes have `height: 0`, so a container's
`itemSpacing` lands fully on *both* sides of them. The DOM equivalent is a symmetric `my-` on
the rule — and it only works because Tailwind Preflight gives `hr` a 1px `border-top`, which
stops it collapsing its own margins through itself. Verify by measuring **every** gap
independently, never by extrapolating from one.

## 6. Class-change tickets must update their tests in the same PR

Every design-fidelity ticket changes class strings, and this repo's unit tests assert on
them. Seven consecutive merges landed with a red pipeline because stale `*.test.tsx`
assertions were left behind, and the Netlify deploy runs `vitest` *before* deploying — so
the live site sat seven merges behind while tickets were marked merged.

**A PR that changes a class string or copy and touches no test file is incomplete.**

---

## 7. Checklist before opening the PR

- [ ] Every property touched has a value for each Figma frame it differs at, and no more.
- [ ] No `laptop:` without `desktop:` for the same property (or a comment saying why).
- [ ] No 1440/1920 value bound to `md:` or `lg:`.
- [ ] Measured — in a real browser, on the resolved value — at **390, 1440, 1920**, plus
      the boundary widths of any band the ticket claims to fix.
- [ ] Siblings of any changed flex/width element re-measured.
- [ ] Component tests updated in the same commit.
- [ ] Removed classes verified **absent** (`grep -c` returns 0), not merely replaced.
