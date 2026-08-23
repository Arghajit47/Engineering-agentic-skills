# Local AI Bridge — install

Source only: the Figma Desktop plugin (`code.ts`, `ui.html`, `manifest.json`) and the
Express server (`server/server.ts`) that together expose an open Figma file as a REST API
on **port 47291**. Four skills depend on it — `ba`, `qa`, `developer-agent-ecosystem`,
`design-system`.

`../install.sh --with-bridge` does steps 1 and 3 for you. Steps 2 and 4 are manual
because Figma requires a human to import and run a development plugin.

## 0. Prerequisites — check these first

| Need | Why | Check |
|---|---|---|
| **Figma Desktop app** | A development plugin can only be imported from the desktop app. The browser version **cannot** load it and cannot reach `localhost`. | `open -a Figma` (macOS) |
| **A Figma account** | Free plan is fine — that is the point of this bridge. | log in to the desktop app |
| **The design file open in Figma** | The plugin reads **the file that is currently open**, not a file key. Nothing works with no file open. | open your design |
| **Node.js 18+ and npm** | Builds the plugin and runs the server. | `node --version` |
| **Port 47291 free** | Mandatory port; every skill hardcodes it. | `lsof -i :47291` (silent = free) |

Download Figma Desktop: <https://www.figma.com/downloads/>

**No Figma Desktop means no bridge, and no bridge means `ba`, `qa`, `developer`, and
`design-system` halt on any design extraction** rather than guessing a value. The other
fourteen skills work normally. The official `plugin:figma` MCP server is the alternative
read path if you would rather not run the bridge.

## 1. Copy and build

```bash
BRIDGE="$HOME/Local AI Bridge"          # or wherever you want it
mkdir -p "$BRIDGE" && cp -R ./ "$BRIDGE/"
cd "$BRIDGE"        && npm install && npm run build    # compiles code.ts -> code.js
cd "$BRIDGE/server" && npm install
```

`code.js` is gitignored and **must be built** — Figma loads it, not the TypeScript.
Rebuild after every `code.ts` change or the plugin silently runs the old bundle.

## 2. Load the plugin in Figma Desktop  ⟨manual — Figma requires it⟩

1. Open the **Figma Desktop app** (not figma.com in a browser).
2. Open the design file you want to read.
3. Menu → **Plugins → Development → Import plugin from manifest…**
4. Select `$BRIDGE/manifest.json`.

This registers the plugin once per machine. It then appears under
**Plugins → Development → Local AI Bridge** in every file.

## 3. Run the server

```bash
cd "$BRIDGE/server" && npm start        # ts-node
curl -s http://localhost:47291/api/whoami | jq .
```

## 4. Open the plugin and keep it open  ⟨manual, and once per file⟩

With your design file open: **Plugins → Development → Local AI Bridge → Run**.

The plugin reads **whichever file is currently open**. Switching to a different design
means running it again there — it is not a global service.

**The plugin must stay open.** Closing it drops the connection: the server still answers,
but returns stale or empty data. Check liveness with `pluginConnected` from
`/api/whoami` — never infer it from queue depth or `nodesWithCss`.

## Port

`47291` is mandatory. Never 3000 or 3001 — those collide with the Next.js dev server, and
every skill hardcodes 47291.

## Verify

```bash
curl -s http://localhost:47291/api/whoami  | jq '.pluginConnected'   # true
curl -s http://localhost:47291/api/frames  | jq '[.[] | {name,width}]'
```

That frame list is the complete set of widths anything may be graded against — it is what
`design-system`, `qa`, `perf-budget`, and `test-strategy` all read.

## Troubleshooting the first run

| Symptom | Cause |
|---|---|
| `curl: (7) Failed to connect to localhost:47291` | Server not running — `cd "$BRIDGE/server" && npm start` |
| `pluginConnected: false` | Server is up but the plugin is closed, or no Figma file is open |
| Plugin missing from the Plugins menu | Manifest never imported, or you are in the browser rather than Figma Desktop |
| Plugin runs but behaves like an old version | `code.js` is stale — `npm run build` again |
| Empty `/api/frames` | Plugin open on the wrong file, or the file has no top-level frames |
| Port already in use | Something else holds 47291. Free it; do **not** change the port — every skill hardcodes it |

## Not included

`server/screenshots/`, `server/svgs/`, and `server/state/` are runtime caches holding
extracted design data. They are deliberately excluded — they would carry the bundle
author's client work. They regenerate on first sync.

## Degraded mode

Plugin closed, or bridge not installed: geometry, layout, and text may still be
available, but **CSS, tokens, and SVG export are not**. Skills must say so and halt —
never estimate a design value. See the `local-ai-bridge` skill for the full contract.
