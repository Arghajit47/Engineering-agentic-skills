# Local AI Bridge

A Figma plugin + local Express server that gives an AI agent the same design
context the official Figma MCP server provides — without its rate limits.

- **Plugin** — `code.ts` (sandbox, has the `figma` API) + `ui.html` (iframe, does
  the HTTP). Build with `npm run build`.
- **Server** — `server/server.ts`, Express on **port 47291** (non-negotiable:
  3000 is Next.js, 3001 was the old port and must never be used).
  Start with `cd server && ./node_modules/.bin/ts-node server.ts`.

`GET /` returns a live catalogue of every endpoint plus the parity map below.

## Why this exists

The official Figma MCP server is capped at roughly **6 tool calls per month** on
Starter/View/Collab seats, and its write tools are remote-server-only and moving
to paid. On a free seat it is unusable for real work. This bridge is not a
stopgap — for that seat tier it is the better tool.

## Two hard constraints

1. **The plugin must stay open in Figma.** The server cannot call into Figma, so
   live requests park in a job queue that `ui.html` polls. Close the plugin and
   every on-demand endpoint hangs until it times out at 60s. Snapshot endpoints
   (`/api/document`, `/api/screenshots`) keep working — snapshots persist to
   `server/state/document.json`.

   `GET /` reports **real liveness**: `pluginConnected` is `true` when the plugin
   polled within the last 6s, `false` once it stops, `"unknown"` if it has not
   polled since the server started, with `pluginLastPollMsAgo` showing staleness.
   Queue depth is reported separately as `queueBusy`. **Never infer liveness from
   queue depth** — the old field derived it that way and returned the identical
   `"unknown (idle)"` for a healthy idle plugin and a closed one, which made
   callers declare CSS/tokens/SVG unavailable while the plugin was serving fine.
   `GET /api/whoami` is a cheap live round-trip if you want positive proof.
2. **After changing `code.ts` you must rebuild AND reload the plugin in Figma.**
   `npm run build` regenerates `code.js`, but the running plugin instance still
   holds the old bundle. Re-run it from *Plugins → Development → Local AI Bridge*.

## Parity with the official MCP

| Official tool | Bridge |
|---|---|
| `get_design_context` | `GET /api/node/:id/context[?depth=&fresh=1]` |
| `get_screenshot` | `GET /api/node/:id/screenshot[?scale=&fresh=1]` (2x by default) |
| `get_metadata` | `GET /api/node/:id/metadata[?depth=]` |
| `get_variable_defs` | `GET /api/variables[?format=css&fresh=1]` |
| `download_assets` | `POST /api/node/:id/assets { dir, format, scale }` |
| `search_design_system` | `GET /api/components[?q=]` |
| `get_code_connect_map` | `GET /api/code-connect[?nodeId=]` |
| `add_code_connect_map` | `POST /api/code-connect` |
| `get_motion_context` | `GET /api/node/:id/motion[?depth=]` |
| `get_libraries` | `GET /api/libraries[?variables=0]` |
| `list_shader_fills` / `list_shader_effects` | `GET /api/shaders` → `.fills` / `.effects` |
| `get_shader_fill` / `get_shader_effect` | `GET /api/shader/:id` |
| `whoami` | `GET /api/whoami` |
| `use_figma` | `POST /api/mutate { ops, dryRun? }` — an op list, **not** arbitrary JS |
| `upload_assets` | `POST /api/mutate` with op `createImage { bytesBase64 \| url }` |
| `generate_figma_design` / `generate_diagram` | partial — `/api/mutate` builds the nodes; the AI generation half is Figma-server-side |

### Beyond the official surface

`GET /api/node/:id/css[?format=text]` (flattened Inspect-panel CSS) ·
`/api/styles` · `/api/text` (copy inventory) · `/api/annotations` ·
`/api/search?q=&type=` · `/api/pages`, `/api/page/:id` · `/api/image/:hash` ·
`/api/node/:id/export?format=PNG|JPG|SVG|PDF` · `/api/resolve?url=` ·
`/api/document[?depth=]` · `/api/screenshots`

### Not possible from a third-party plugin

| Tool | Why |
|---|---|
| `create_new_file` | No create-file call exists in the Plugin API *or* the REST API. |
| `export_video` | `exportAsync` has no video format. |
| `get_figjam` | `manifest.json` sets `editorType: ["figma"]`. Add `"figjam"` and reload to read boards. |
| arbitrary-JS `use_figma` | See below. |

## Why `/api/mutate` is an op list, not JavaScript

Figma's `use_figma` accepts plain JavaScript and runs it against the Plugin API.
That is **first-party desktop-app privilege**, not something a plugin can copy:
the plugin sandbox is a custom JS VM compiled to WASM with **no `eval` and no
`new Function`**. The split is structural — `code.ts` has the `figma` API and no
`eval`; `ui.html` has `eval` and no `figma` API.

So `/api/mutate` takes a declared op vocabulary instead. `GET /api/mutate`
returns it, so an agent can discover the contract at runtime.

```jsonc
POST /api/mutate
{
  "ops": [
    { "op": "createFrame", "as": "card" },
    { "op": "set", "target": "$card",
      "props": { "name": "Card", "layoutMode": "VERTICAL", "itemSpacing": 14 } },
    { "op": "resize", "target": "$card", "width": 329, "height": 200 },
    { "op": "append", "parent": "$page", "child": "$card" }
  ]
}
```

- Ops run in order. Any op may declare `"as": "name"`; later ops reference it as
  `"$name"`. `"$page"` and `"$root"` are always available, and a plain node id
  works anywhere a reference is expected.
- **19 ops:** `createFrame` `createRectangle` `createEllipse` `createText`
  `createLine` `createComponent` `createPage` `clone` `createInstance` `set`
  `resize` `append` `remove` `bindVariable` `loadFont` `createImage`
  `importShader` `setCurrentPage` `notify`.
- **`set` rejects unknown property names** rather than silently assigning a
  property Figma ignores, and loads fonts before any text mutation (including
  every segment's font on a mixed-font node).
- **`dryRun: true`** validates refs, property names and fonts without writing.
- **Atomicity:** on failure, properties written to pre-existing nodes are
  restored from a captured `before` value and every node the batch created is
  removed. Deleting a pre-existing node is *refused* unless you pass
  `"force": true`, because it cannot be rolled back. A restore that itself fails
  is reported in the response log, not swallowed. A 422 carries the rollback
  report; it is not a database transaction and does not claim to be.

## Fidelity notes

The paint and effect serializers previously modelled only solid/image/gradient
fills and the two shadow kinds plus blur. Everything else — `SHADER`, `VIDEO`,
`PATTERN` fills and `NOISE`, `TEXTURE`, `GLASS`, `SHADER` effects — collapsed to
a bare `{ type, visible }`, so a design using any of them read as having *no*
fill or *no* effect. All are now modelled, and anything still unmodelled is
flagged `unmodelled: true` rather than returned as a plausible-looking stub.

`/api/node/:id/motion` normalises `reactions` into trigger / action / transition
with a derived CSS timing function. Springs report their physical parameters
(`mass`, `stiffness`, `damping`, `initialVelocity`) with `css: null` — there is
no CSS equivalent, and inventing a cubic-bezier for one would be a lie.

## Housekeeping

**This directory is deliberately not a git repository.** Do not run `git init`.

Type-check and lint both halves:

```bash
npx tsc -p tsconfig.json      # plugin → regenerates code.js
npx eslint code.ts
cd server && npx tsc --noEmit
```

`eslint.config.js` enables `parserOptions.projectService` because the
`@figma/figma-plugins` rules need type information — without it ESLint
*hard-errors* the first time one of those rules meets a matching node, which
masks every other violation in the file.
