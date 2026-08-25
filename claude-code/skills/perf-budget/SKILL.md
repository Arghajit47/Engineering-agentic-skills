---
name: perf-budget
description: "Performance Budget (/perf): a measured gate inside /quality-analyst covering what layout QA does not — Core Web Vitals, bundle size, image weight, and render cost, all measured on the DEPLOYED URL at the design's real frame widths. Enforces declared budgets with numeric evidence; a regression against the recorded baseline is a defect, not an observation. Never auto-files."
version: 1.0.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [performance, core-web-vitals, lighthouse, bundle-size, budget, qa, workflow]
    related_skills: [quality-analyst, developer-agent-ecosystem, release-engineer, sre-watch, design-system, behavior, custom-agent, claude-opus-5, worker]
---

# Performance Budget (/perf)

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
| `templates/adf/perf-budget.adf.json` | the budget sub-gate table, appended to the QA comment |

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

Templates are generated from `templates/adf/_src/perf-budget/*.adf.md` by
`templates/adf/build.sh` — edit the source and rebuild, never the JSON. Full node spec:
`rules/ADF.md`.

## Why this skill exists

QA measures `gridTemplateColumns` and `getBoundingClientRect` — it grades **where things
are**. Nothing graded **how fast they arrive**. On a design-led marketing site that is
the failure mode users actually notice: a pixel-perfect page that ships 4MB of hero
imagery. This skill adds the numeric axis QA was missing, using the same evidence
standard: measured, on the deployed URL, at the design's real widths.

## Hard rules

1. **Deployed URL only.** Same absolute gate as QA. A local build has no CDN, no
   compression settings, and different bundling. It is not evidence.
2. **Measured, never estimated.** No "this looks heavy". Every claim carries a number
   and the command that produced it.
3. **Budgets are declared, not inferred.** The budget table below is the contract. A
   number outside it is a defect; a number inside it is a pass even if it feels slow.
4. **Never auto-file.** A budget breach on the ticket under test is fixed on that
   ticket. A breach elsewhere is reported to the user, not turned into a new ticket.
5. **Three runs, report the median.** A single Lighthouse run is noise.

## The budget

Defaults for a Next.js marketing/product site. Override per repo in
`perf-budget.json` at the repo root; if that file exists it wins.

| Metric | Budget | Measured how |
|---|---|---|
| LCP | ≤ 2.5s | Lighthouse, mobile preset, median of 3 |
| CLS | ≤ 0.10 | Lighthouse, median of 3 |
| TBT | ≤ 200ms | Lighthouse, median of 3 |
| Lighthouse Performance | ≥ 85 | mobile preset |
| Lighthouse Accessibility | ≥ 90 | already enforced by `/quality-analyst` — do not re-grade, just carry the number |
| First-load JS (route) | ≤ 200 KB gzip | `next build` output |
| Largest single image | ≤ 300 KB | network sweep |
| Total page weight | ≤ 1.5 MB | network sweep |
| Fonts | ≤ 2 families, ≤ 4 weights | network sweep + CSS |

**Regression rule:** any metric more than **10% worse** than the recorded baseline is a
defect even if it is still inside budget. Budgets stop things being bad; the regression
rule stops them getting worse one ticket at a time.

## Workflow

### 1. Load the baseline

```bash
cat perf-baseline.json 2>/dev/null || echo "no baseline — this run establishes it"
```

The baseline lives in the repo and is updated only by `/perf --baseline`, deliberately,
never as a side effect of a failing gate. Rebaselining to make a red gate green is the
one thing this skill must never do silently.

### 2. Measure Core Web Vitals

```bash
URL="<deployed production url>"
for i in 1 2 3; do
  npx -y lighthouse "$URL" --only-categories=performance,accessibility \
    --preset=desktop --output=json --output-path="/tmp/lh-desktop-$i.json" \
    --chrome-flags="--headless=new" --quiet
done
```

Repeat with the mobile preset (the default). Extract and take the median:

```bash
for f in /tmp/lh-desktop-*.json; do
  node -e "const r=require('$f').audits;console.log(
    r['largest-contentful-paint'].numericValue,
    r['cumulative-layout-shift'].numericValue,
    r['total-blocking-time'].numericValue)"
done
```

### 3. Network sweep at every design width

Dispatch `/custom-agent worker` with Playwright against the deployed URL, at **every
width the design has a frame for** (for `{{PROJECT_NAME}}`: 390 / 1440 / 1920). Same
frame-enumeration rule QA uses — the design's frame list is the complete set of widths
anything is graded at.

```js
const sizes = [];
page.on('response', async r => {
  const h = r.headers();
  sizes.push({ url: r.url(), type: h['content-type'], bytes: +(h['content-length']||0) });
});
// after load: total bytes, largest image, font families, request count
```

Flag specifically:
- An image served at natural size far above its rendered box (the classic hero defect).
- A raster where the Figma node was vector — the Local AI Bridge exposes per-node SVG
  (`/api/node/:id/svg`); shipping a PNG of a vector logo is a budget defect with a
  one-line fix.
- Render-blocking font loads with no `display: swap`.

### 4. Bundle check

```bash
npm run build 2>&1 | tee /tmp/build.txt
grep -A40 'Route (app)' /tmp/build.txt
```

Read First Load JS per route. Compare against the baseline per route, not in aggregate —
an aggregate hides a single route doubling.

### 5. Verdict and report

Post into the QA subtask comment (this is a QA sub-gate, not a separate JIRA artifact):

```markdown
### Performance Budget — <TICKET>

**Verdict: PASS | FAIL**

| Metric | Budget | Baseline | Measured | Δ | Result |
|---|---|---|---|---|---|
| LCP (mobile) | ≤ 2.5s | 1.9s | 2.1s | +10.5% | FAIL (regression rule) |
| CLS | ≤ 0.10 | 0.02 | 0.02 | 0 | PASS |
| First-load JS `/services` | ≤ 200KB | 148KB | 151KB | +2% | PASS |
| Largest image | ≤ 300KB | 210KB | 980KB | +366% | FAIL |

**Commands:** `lighthouse … --preset=mobile` ×3 (median), Playwright network sweep at 390/1440/1920, `npm run build`.

**Defects**
1. `public/hero-services.png` — 980KB, rendered at 1440×420 but 2880×840 natural.
   Fix: export at 2× the rendered box, or use `next/image` with `sizes`.
```

FAIL → `/quality-analyst` fails the ticket, back to **In Progress**, Dev account
assigned, `/developer` invoked with the fix. Same path as any other QA defect; per the
standing rule this is a real defect, not a non-blocking observation.

### 6. Baseline maintenance

`/perf --baseline` writes `perf-baseline.json` through a PR (never a direct `main`
push). Rebaseline only when a deliberate change makes the old numbers meaningless —
a new hero video, a framework upgrade — and say so in the PR body.

## Pitfalls

- **Measuring the preview deploy.** Different CDN behaviour and often uncompressed
  assets. Production alias only.
- **One Lighthouse run.** TBT in particular swings ±40% run to run. Median of three.
- **Aggregating bundle size across routes.** Per-route or it hides the regression.
- **Blaming the framework.** On this stack the cause is almost always an unoptimised
  image, a raster that should be an SVG, or a client component that should be a server
  component. Check those three before writing anything longer.
- **Rebaselining to clear a red gate.** If you do this the skill has no value. The
  baseline changes only by explicit intent, in its own PR.
