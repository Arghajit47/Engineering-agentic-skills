---
name: local-ai-bridge
description: "Local AI Bridge: a local-first system that exposes an open Figma design file as a queryable REST API for AI agents via a Figma Desktop plugin + Express server on port 47291. Provides full read-side parity with the official Figma MCP — real per-node CSS, design tokens, component identity, assets and dev annotations. Use this skill for design extraction instead of figma-extractor or direct Figma REST API calls."
version: 3.0.0
author: Arghajit Singha
license: MIT
platforms: [macos, windows, linux]
metadata:
  hermes:
    tags: [figma, design-extraction, local-server, mcp, ai-bridge, css, design-tokens]
    related_skills: [business-analyst-workflow, quality-analyst, developer-agent-ecosystem, jira]
---

# Local AI Bridge

> **Setup values.** This skill contains no account ids, site hosts, project keys, or
> deployed URLs — they appear as `{{PLACEHOLDER}}`, and its install path as
> `$LOCAL_AI_BRIDGE_HOME`. Resolve them from `project-config.local.md` in the skills
> directory; if a value is missing, **stop and ask the user**, then offer to save it.
> Full table: `PROJECT-CONFIG.md`.
>
> ```bash
> export LOCAL_AI_BRIDGE_HOME="$HOME/Local AI Bridge"   # your path; asked at setup
> ```

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


## The bridge ships with the skills

The Local AI Bridge is a **separate application** — a Figma Desktop plugin plus an
Express server — and its **source is included** in the skills bundle under `bridge/`.
`./install.sh` copies it, runs `npm install`, and builds `code.js`; `--with-bridge`
skips the prompt. Three steps stay manual because Figma requires them: import the plugin
from its manifest, start the server, open the plugin and **keep it open**.

This skill is the operating manual: endpoint contracts, deep vs light mode, health
checks, and the sequential-fetch rule. `bridge/INSTALL.md` covers installation.

Only source ships. `server/screenshots/`, `server/svgs/`, and `server/state/` are runtime
caches of extracted design data — excluded from the bundle, and left untouched when the
installer upgrades an existing install.

**Requires Figma Desktop.** A development plugin can only be imported from the desktop
app; figma.com in a browser can neither load it nor reach `localhost`. You also need a
Figma account (free plan is fine) and **the design file open** — the plugin reads
whichever file is currently open, so switching files means running it again there.

**If the bridge is absent or its plugin is closed**, the dependent skills degrade rather
than fail:

| Skill | Without the bridge |
|---|---|
| `design-system` | `--init` / `--sync` cannot run; `--audit` still works (it only greps your code) |
| `ba` | Mode A cannot extract design facts — halt and tell the user, never estimate values |
| `developer-agent-ecosystem` | Frontend scope loses exact CSS/tokens — halt, do not guess |
| `qa` | Cannot enumerate the design's frames, so nothing is gradeable against Figma |
| everything else | unaffected — 12 of the 18 skills never touch Figma |

The official `plugin:figma` MCP server is the alternative read path. This bridge exists
because it gives full read parity while working within a Figma free-plan account.


Exposes any open Figma design file as a queryable REST API for AI agents. Zero rate limits, no cloud API key. Runs on **port 47291**.

**As of the 2026-08-13 rebuild this is a full read-side replacement for the official Figma MCP.** It returns Figma's own Inspect-panel CSS per node, plus auto-layout, design tokens, component identity and dev annotations. Design→code work should not need the Figma MCP.

## Why this matters

The pre-2026-08-13 bridge serialized only `id/name/type/x/y/width/height/text` — a **wireframe**. Everything that becomes CSS (colour, spacing, radius, type, shadow, auto-layout) had to be guessed off a screenshot, which is why implemented pages kept mismatching the design. If you are writing CSS from `x/y/width/height`, you are using the endpoint wrong — use `/api/node/:id/context` or `/api/node/:id/css`.

## Related files

- `references/operational-gotchas.md` — startup, port, build and troubleshooting fixes
- `references/coordinate-aware-cropping.md` — **legacy fallback only.** Per-node PNG/SVG export now works; only use cropping for raw pixel colour sampling.

## Architecture

- **Figma Desktop plugin** (`~/Local AI Bridge/code.ts` → `code.js`): serializes nodes with full style data, exports frame PNGs at 2x, and serves on-demand jobs.
- **`ui.html` bridge**: the only piece with network access. Streams sync chunks to the server and polls the job queue.
- **Express server** (`~/Local AI Bridge/server/server.ts`): port **47291**. Assembles synced data, persists it to disk, exposes REST endpoints, coordinates the job queue.

The server cannot call into Figma. Anything needing live document access is parked in a job queue that `ui.html` polls — which is why **the plugin must stay open**.

## Port

**Port 47291.** `3000` is the Next.js dev server. `3001` is an old wrong value — if you see `localhost:3001` anywhere, it is a bug; fix it. 47291 is the only host in the plugin manifest's `networkAccess` allowlist, so no other port can work.

## File locations

| File | Role |
|---|---|
| `~/Local AI Bridge/code.ts` | Plugin source |
| `~/Local AI Bridge/code.js` | **What Figma actually runs** (compiled) |
| `~/Local AI Bridge/ui.html` | UI + network bridge |
| `~/Local AI Bridge/manifest.json` | Plugin manifest |
| `~/Local AI Bridge/server/server.ts` | Server source |
| `~/Local AI Bridge/server/dist/server.js` | Compiled server |
| `~/Local AI Bridge/server/state/document.json` | Persisted snapshot |
| `~/Local AI Bridge/server/screenshots/`, `svgs/`, `assets/` | Cached exports |

**This directory is not a git repo, and the user does not want `git init` run in it.**

## Plugin compilation rule

`manifest.json` says `"main": "code.js"` — **Figma runs code.js, not code.ts.** After editing `code.ts`:

```bash
cd "$LOCAL_AI_BRIDGE_HOME" && npm run build
```

Then **fully close and re-open the plugin** (Plugins > Development > Local AI Bridge). Reopening only the UI panel is not enough; Figma keeps the old `code.js` context alive.

### Verify which build is loaded

`code.ts` carries a `BUILD` constant and the plugin panel logs it on connect:

```
🔌 plugin build 2026-08-13.4 (initial)
```

**Always check this line before debugging plugin behaviour.** If it is absent or shows an older stamp, Figma is running a cached build — quit and reopen the Figma Desktop app. Bump `BUILD` whenever you edit `code.ts`.

## Start the server

```bash
cd "$LOCAL_AI_BRIDGE_HOME/server" && npm start        # ts-node (primary)
cd "$LOCAL_AI_BRIDGE_HOME/server" && npm run serve    # compiled dist/server.js
```

Fallback if conda intercepts `npx`: `./node_modules/.bin/ts-node server.ts`.

## Health check

```bash
curl -s http://localhost:47291/ | python3 -m json.tool
```

Returns `status`, `syncedAt`, `file`, `page`, `nodes`, `nodesWithCss`, `variableCollections`, `queuedJobs`, `inFlightJobs`, plus a live `mcpParity` / `extras` endpoint catalogue. **`GET /` is self-documenting — read it rather than trusting a stale table.**

## Deep mode vs light mode

`getCSSAsync` and `getMainComponentAsync` are **one round-trip per node**, so a full-page sync cannot run them across a large page (an 18k-node page previously aborted the plugin VM outright).

| | Node count | Per-node `css` in snapshot | Component `mainComponent` |
|---|---|---|---|
| **Deep** | ≤ 1500 | Yes | Yes |
| **Light** | > 1500 | No | No (kind/variants still present) |

Light mode still captures **every structured style field** for every node — auto-layout, fills, strokes, radii, effects, type metrics, tokens. Only the two round-trip fields are deferred.

`meta.deepMode` on `/api/document` tells you which ran. **In light mode, get CSS per node on demand** — `/api/node/:id/context?fresh=1` and `/api/node/:id/css` always return full CSS (the latter auto-falls back to a live fetch). This is how the Figma MCP works too: you ask about one node, not 18,000.

## Endpoints

### Design context — use these for implementation

| Endpoint | Purpose |
|---|---|
| `GET /api/node/:id/context[?depth=&fresh=1]` | **Primary.** Full style truth for a node + subtree. MCP `get_design_context`. Alias: `/styles` |
| `GET /api/node/:id/css[?format=text&depth=]` | Flattened paste-ready CSS per node. `format=text` emits a stylesheet |
| `GET /api/node/:id/metadata[?depth=]` | Lightweight structure map. MCP `get_metadata` |
| `GET /api/document[?depth=]` | Whole synced page `{ syncedAt, meta, tree }` |
| `GET /api/search?q=&type=&limit=` | Find nodes by name/text/type |
| `GET /api/pages` · `GET /api/page/:id` | Page list · deep-sync another page |

### Tokens and design system

| Endpoint | Purpose |
|---|---|
| `GET /api/variables[?format=css&fresh=1]` | Variable collections. MCP `get_variable_defs`. `format=css` emits a `:root{--token:value}` block |
| `GET /api/styles[?fresh=1]` | Local paint/text/effect/grid styles |
| `GET /api/components[?q=]` | Component inventory + variant definitions. MCP `search_design_system` |
| `GET`/`POST /api/code-connect` | Node ID ↔ code component map. MCP `get_/add_code_connect_map` |

### Assets

| Endpoint | Purpose |
|---|---|
| `GET /api/node/:id/screenshot[?scale=&fresh=1]` | PNG, **2x by default**. Pass `?scale=1` for 1x |
| `GET /api/node/:id/svg[?fresh=1]` | SVG, cached after first fetch |
| `GET /api/node/:id/export?format=PNG\|JPG\|SVG\|PDF&scale=` | Any format |
| `POST /api/node/:id/assets` `{dir,format,scale}` | Bulk-export every asset descendant to disk. MCP `download_assets` |
| `GET /api/image/:hash` | Raw bytes of an image fill |
| `GET /api/screenshots` | Cached screenshot inventory |

### Content and spec notes

| Endpoint | Purpose |
|---|---|
| `GET /api/text[?fresh=1]` | Every text node — copy inventory with type metrics |
| `GET /api/annotations` | Dev-mode annotations + dev resources |
| `GET /api/resolve?url=<figma url>` | Figma URL → `{fileKey, nodeId}` (converts `1-130` → `1:130`) |

### Internal (plugin only — do not call)

`POST /api/sync/begin` · `/nodes` · `/shot` · `/end` (streamed sync) · `POST /api/sync` (legacy) · `GET /api/job/next` · `POST /api/job/complete`

## Node shape

`/api/node/:id/context` returns, where applicable:

- **Identity** — `id`, `name`, `type`, `visible`, `locked`, `isAsset`, `isMask`
- **Geometry** — `x`/`y` (parent-relative), `width`, `height`, `absolute{x,y,width,height}`, `rotation`
- **`css`** — Figma's own Inspect-panel CSS. **Authoritative for gradients, shadows and type.**
- **`layout`** — `mode`, `wrap`, `itemSpacing`, `counterAxisSpacing`, `padding{top,right,bottom,left}`, `primaryAxisAlign`, `counterAxisAlign`, `primaryAxisSizing`, `counterAxisSizing` → maps ~1:1 onto flexbox
- **`sizing`** — `layoutSizingHorizontal/Vertical` (FIXED/HUG/FILL), `layoutGrow`, `layoutPositioning`, `constraints`, min/max, `aspectRatio`
- **Paint** — `fills`/`strokes` (hex or rgba, gradient stops, image hashes), `strokeWeight`, `strokeAlign`, `strokeCap`, `strokeJoin`, `strokeSides`, `dashPattern`
- **Shape** — `cornerRadius` (number or per-corner), `cornerSmoothing`, `clipsContent`, `opacity`, `blendMode`, `layoutGrids`, `vectorPaths`
- **`effects`** — each with a pre-flattened `css` string (`box-shadow` / `blur()`)
- **`text`** — `characters`, `fontFamily`, `fontStyle`, `fontWeight`, `fontSize`, `lineHeight`, `letterSpacing` (with units), `textCase`, `textDecoration`, alignment, `textTruncation`, `maxLines`, plus `segments[]` when styling is mixed
- **`tokens`** — bound variables resolved to names (e.g. `{fills: ["color/purple/60"]}`)
- **`inferredTokens`** — variables Figma thinks *should* apply to a hardcoded value. Use to catch un-tokenised design values
- **`styles`** — bound style names (e.g. `{text: "Heading/H2"}`)
- **`component`** — `kind`, `mainComponent` (namespaced `Set/Variant`), `key`, `variantProperties`, `propertyDefinitions`, `overrides`
- **`annotations`**, **`reactions`** — designer spec notes and prototype interactions
- **`children`** — nested subtree

Mixed values serialize as the string `"MIXED"`; check for it before using a value.

## Recommended workflows

### Implement a component from Figma

```bash
# 1. URL → node id
curl -s "http://localhost:47291/api/resolve?url=<figma-url>"

# 2. Paste-ready CSS for the whole subtree
curl -s "http://localhost:47291/api/node/1:130/css?format=text"

# 3. Full structured truth (auto-layout, tokens, component identity)
curl -s "http://localhost:47291/api/node/1:130/context" > /tmp/node-context.json

# 4. Token definitions as custom properties
curl -s "http://localhost:47291/api/variables?format=css"

# 5. Reference screenshot at 2x
curl -s "http://localhost:47291/api/node/1:130/screenshot" -o /tmp/ref.png
```

Prefer `tokens`/`styles` names over raw hex — write `var(--color-purple-60)`, not `#703BF7`. Use `inferredTokens` to flag values the designer left un-tokenised.

### Export all assets for a section

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"dir":"public/assets/icons","format":"SVG","scale":2}' \
  "http://localhost:47291/api/node/1:130/assets" | python3 -m json.tool
```

Returns a manifest of written files. One round-trip — **prefer this over looping per node.**

## Sequential fetching rule

The job queue processes **one job at a time** (poll → export → post back → poll). Parallel requests all sit in the queue and can hit the **60-second** timeout.

**Fetch sequentially with a small delay (~0.1s).** For 85 assets, a sequential loop with `time.sleep(0.1)` succeeded 85/85; parallel batches timed out. Duplicate requests for the same node+format piggyback on one job, but different nodes queue.

For bulk work, `POST /api/node/:id/assets` is a single job and sidesteps this entirely.

```python
import time, requests

for node_id in node_ids:
    r = requests.get(f"http://localhost:47291/api/node/{node_id}/svg", timeout=65)
    if r.ok:
        open(f"/tmp/{node_id.replace(':','-')}.svg", "wb").write(r.content)
    else:
        print(f"failed {node_id}: {r.status_code} {r.text}")
    time.sleep(0.1)
```

## Run a sync from Figma

1. Start the server; verify health on 47291.
2. Open the target file in Figma Desktop, on the page you want.
3. **Plugins > Development > Local AI Bridge**.
4. Confirm the build stamp line, then watch progress: `N nodes to sync` → `Streaming nodes… 250/N` → `Exporting frames…` → `✓ committed`.
5. **Leave the plugin open.**

Large pages take a while — the panel reports progress throughout, so a slow sync is distinguishable from a hung one. Use the **Re-sync page** button after changing pages or editing the design.

## Persistence

The snapshot is written to `server/state/document.json` and **restored on boot**, so restarting the server no longer 503s until the next sync. It is still a point-in-time snapshot: re-sync after design changes, and use `?fresh=1` when you need live data.

## Rules for BA / dev / QA workflows

1. **The bridge is the only approved Figma extraction path.** No `figma-extractor`, no `api.figma.com`, no Chrome screenshot fallback unless the bridge is confirmed down and the user approves.
2. **Never write CSS from `x/y/width/height`.** Use `/context` or `/css`. Positions are for layout structure, not styling.
3. **Ticket specs must carry real values** — token names, `font-family`/`size`/`weight`/`line-height`/`letter-spacing`, padding/gap from `layout`, radii, shadows. A ticket with only a screenshot and dimensions is incomplete.
4. **Screenshots are required for every Frontend and Integration ticket**, from `/api/node/{id}/screenshot` (2x).
5. **Prefer SVG for icons/logos/vectors** over cropping screenshots.
6. **Note `meta.deepMode`.** In light mode, per-node CSS must be fetched on demand — do not report "no CSS available".
7. **Tooling tickets (the bridge itself) need no Figma screenshots.**

## Troubleshooting

See `references/operational-gotchas.md` for the canonical list.

**Request times out after 60s** — the plugin window is closed. Reopen it; queued jobs resume.

**`/api/document` returns 503** — nothing synced and no persisted snapshot. Run the plugin.

**`/api/node/:id/*` returns 404** — node ID wrong, or it lives on a page that is not loaded. Node lookup tries a document-wide `getNodeByIdAsync` first and falls back to a current-page scan, so same-page nodes resolve reliably; for another page call `GET /api/page/:id` first, or switch pages in Figma and re-sync.

A 404 on one asset is **not** a bridge failure. Extract everything else, flag the specific node as a gap, and continue. Do not post a JIRA blocker or halt a ticket because one decorative SVG failed. Only a full outage (health check fails, or 503 with no snapshot) justifies stopping.

**Plugin changes not taking effect** — check the build stamp. `npm run build` → fully close → reopen → confirm the stamp changed.

**Port in use** — `lsof -i :47291 | grep LISTEN | awk '{print $2}' | xargs kill -15`

**Sync silently stalls** — should be impossible now: failures post `SYNC_FAILED` and show in red in the panel with the error and node count. If you see a bare "Syncing…" with no progress ticks, you are on a stale build.

## Reference files

Every file in `references/` is listed here. Generated by
`scripts/refindex.py` — descriptions you write by hand are preserved.

- `references/coordinate-aware-cropping.md` — Local AI Bridge: Coordinate-Aware Screenshot Cropping.
- `references/operational-gotchas.md` — Local AI Bridge operational gotchas and fixes.

