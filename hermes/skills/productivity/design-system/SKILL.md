---
name: design-system
description: "Design System Engineer (/design-system): extracts Figma variables and frame widths through the Local AI Bridge into a single token layer (Tailwind v4 @theme inline) so every ticket consumes named tokens instead of re-deriving hex/px by hand. Owns custom breakpoints matching the design's real frames, the icon/logo asset pipeline, and token drift audits. Converts the recurring breakpoint/colour defect family into a one-time fix."
version: 1.0.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design-system, tokens, figma, tailwind, breakpoints, assets, drift, workflow]
    related_skills: [business-analyst-workflow, developer-agent-ecosystem, quality-analyst, architect, perf-budget, behavior, custom-agent, claude-opus-5, Explore, visualize]
---

# Design System Engineer (/design-system)

> **Setup values.** This skill contains no account ids, site hosts, project keys, or
> deployed URLs — they appear as `{{PLACEHOLDER}}`. Resolve them from
> `project-config.local.md` in the skills directory. If that file is missing, or the
> value you need is absent or still `{{...}}`, **stop and ask the user for it** (batch
> the asks if you need several), then offer to save it so you never ask again. Never
> guess one, never carry one over from another project, and never invent a
> plausible-looking account id — a wrong id silently misassigns tickets and a wrong URL
> silently grades the wrong site. Full table and asking rules: `PROJECT-CONFIG.md`.


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


**Behavior/agent wiring:** Main agent runs `/behavior claude-opus-5`. Figma extraction via `/custom-agent visualize`; codebase drift survey via `/custom-agent Explore`.

**Trigger Commands:** `/design-system --init` (build the token layer), `/design-system --audit` (drift report), `/design-system --sync` (refresh tokens from Figma)

**Position:** cross-cutting. Feeds `/ba` (token names in ACs), `/developer` (classes to use), `/quality-analyst` (what to grade against).

## Why this skill exists

Every ticket currently re-derives Figma values by hand. That is exactly why the same
defect family keeps recurring: Tailwind's default `sm/md/lg/xl/2xl` do not align with
the design's real frames, so a page graded at 1440 passes and the same page at 1920 is
wrong — the `laptop:`-leak family, repeatedly. A hex sampled per-ticket drifts the same
way.

A token layer converts that recurring per-ticket defect into a **one-time fix**. This
skill owns that layer.

## Hard rules

1. **Figma is the source; the Local AI Bridge is the transport.** Read variables and
   frames from `http://localhost:47291` — port 47291 is mandatory, never 3000/3001, and
   the plugin must be open. Never sample pixels for a value the bridge exposes as data.
2. **The design's frames define the breakpoints.** Not Tailwind's defaults, not round
   numbers. For `{{PROJECT_NAME}}` the design has exactly three frames — 390 / 1440 /
   1920 — so the ladder has exactly three rungs: base, `laptop:`, `desktop:`.
3. **A token has one definition.** If a hex appears in two token names, one of them is
   wrong. Resolve it in Figma, not in CSS.
4. **Never invent a value the design does not specify.** A gap in the design is a BA
   question, not an interpolation. Label it `unspecified in Figma` and escalate.
5. **Token changes ship as their own PR.** Never bundled into a feature ticket — a
   token diff touches every page and needs its own review and its own QA sweep.

## Workflow — `--init` / `--sync`

### 1. Pull the variable set

```bash
curl -s http://localhost:47291/api/variables | jq .
curl -s http://localhost:47291/api/frames    | jq '[.[] | {name, width}]'
```

The frames call is load-bearing: its output **is** the breakpoint list, and it is the
same enumeration `/quality-analyst` uses to decide which widths anything may be graded
at. Both skills must read the same list or they will disagree.

### 2. Generate the token layer

Tailwind v4 — tokens live in `@theme inline` in the global stylesheet, not in
`tailwind.config.js`.

```css
/* src/app/globals.css */
@import "tailwindcss";

@theme inline {
  /* --- Breakpoints: one rung per Figma frame, no others --- */
  --breakpoint-laptop: 1440px;
  --breakpoint-desktop: 1920px;

  /* --- Colour: names from Figma variables, verbatim --- */
  --color-brand-primary: #0a2540;
  --color-brand-accent:  #635bff;
  --color-surface-base:  #ffffff;
  --color-text-muted:    #4a5568;

  /* --- Type --- */
  --font-sans: "Urbanist", ui-sans-serif, system-ui, sans-serif;
  --text-h1: 3.5rem;
  --text-body: 1rem;

  /* --- Spacing scale, from the design's real spacing values --- */
  --spacing-section: 6rem;
  --radius-card: 0.75rem;
}
```

Note the site-wide font: Estatein is Urbanist everywhere — that belongs in the token
layer, not repeated per component.

### 3. The breakpoint ladder

Document it next to the tokens, because this is the rule people get wrong:

```
Tailwind min-width variants LEAK UPWARD.
`laptop:grid-cols-3` applies at 1440 AND at 1920.
To make 1920 differ you must ALSO write `desktop:grid-cols-4`.

Correct ladder (base → laptop → desktop):
  class="grid-cols-1 laptop:grid-cols-3 desktop:grid-cols-4"

Wrong (1920 silently inherits laptop):
  class="grid-cols-1 laptop:grid-cols-3"
```

Full failure analysis lives in
`developer-agent-ecosystem/references/responsive-breakpoint-ladder.md` — this skill
owns the *tokens*; that reference owns the *idiom*.

### 4. Asset pipeline

Logos and icons come out of the bridge as vectors, not screenshots:

```bash
curl -s "http://localhost:47291/api/node/<NODE_ID>/svg" -o public/icons/<name>.svg
curl -s "http://localhost:47291/api/node/<NODE_ID>/css" | jq .
```

Shipping a PNG where a vector exists is both a fidelity defect and a `/perf` budget
defect. `/ba` already requires a Logos & Icons table on Frontend and Integration
tickets — this skill produces the export script that table references.

## Workflow — `--audit` (drift)

Run periodically, and mandatorily before any Figma resync.

```bash
# Raw hex in components — every hit is drift
grep -rnE '#[0-9a-fA-F]{6}\b' src/ --include=*.tsx --include=*.ts | grep -v globals.css

# Default Tailwind breakpoints on a project with custom frames
grep -rnE '\b(sm|md|lg|xl|2xl):' src/ --include=*.tsx | head -50

# Arbitrary-value escapes that should be tokens
grep -rnE '\[[0-9]+px\]' src/ --include=*.tsx

# Font families declared outside the token layer
grep -rn 'font-family' src/ --include=*.css --include=*.tsx | grep -v globals.css
```

Report:

```markdown
## Design System Drift Audit — <repo> · <date>

| Category | Hits | Worst offender |
|---|---|---|
| Raw hex in components | 14 | `src/components/Hero.tsx:22` `#0a2540` → `--color-brand-primary` |
| Default TW breakpoints | 31 | `src/app/services/page.tsx:8` `lg:` → `laptop:` |
| Arbitrary px values | 6 | `src/components/Card.tsx:15` `p-[24px]` → `p-6` |

**Assessment:** <one paragraph — is this drift accumulating or stable?>
**Recommended:** one token-migration PR covering categories 1 and 2. Not filed.
```

Per the standing rule this audit **never auto-files**. It is a measurement handed to
the user, who decides whether it becomes work.

## Interaction with other skills

- **`/architect`** — an ADR references token *names*; it never defines hex values.
- **`/ba`** — acceptance criteria cite token names (`--color-brand-accent`) and named
  breakpoints (`laptop:`), not raw values. This makes ACs survive a design refresh.
- **`/developer`** — sub-agents consume tokens. A sub-agent writing a raw hex or a
  default `lg:` breakpoint on a project with custom frames is producing a known defect.
- **`/quality-analyst`** — grades computed values against the token layer *and* against
  Figma. When they disagree, the token layer is stale: run `--sync`.
- **`/perf-budget`** — the vector-vs-raster rule is shared; both skills flag it.

## Pitfalls

- **Adding a breakpoint the design has no frame for.** It creates a width nobody
  specified and nobody can grade. Three frames means three rungs.
- **Syncing tokens inside a feature PR.** The blast radius is every page; it needs its
  own review and its own QA pass.
- **Naming tokens after their value** (`--color-blue-500`) rather than their role
  (`--color-brand-primary`). Value-named tokens drift back into raw hex within a sprint.
- **Trusting a screenshot for a colour.** The bridge returns exact fills as data via
  `/api/node/:id/context`. Pixel sampling is a last resort for flattened rasters only.
- **Running `--sync` with the Figma plugin closed.** The bridge returns stale or empty
  data and you will silently write yesterday's tokens.
