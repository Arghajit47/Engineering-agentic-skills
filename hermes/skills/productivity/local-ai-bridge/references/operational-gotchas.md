# Local AI Bridge operational gotchas and fixes

Real fixes and workflow rules. Updated for the **2026-08-13 rebuild** (Figma-MCP read parity + streamed sync). Items marked ⚠️ CHANGED describe behaviour that differs from the pre-rebuild bridge.

## 1. Port is 47291

Hardcoded in `server.ts` and in `manifest.json` (`networkAccess.allowedDomains`) — the plugin physically cannot reach any other port.

- `3000` is reserved for the Next.js dev server.
- `3001` was an old incorrect value, never actually used. If you see `localhost:3001` anywhere, it is a bug — fix it.

```bash
curl -s http://localhost:47291/ | python3 -m json.tool
```

`GET /` returns a live endpoint catalogue (`mcpParity` + `extras`). Trust it over any doc.

## 2. Plugin compiles — Figma runs code.js, not code.ts

After any edit to `code.ts`:

```bash
cd "$LOCAL_AI_BRIDGE_HOME" && npm run build
```

Then **fully close and re-open the plugin** (Plugins > Development > Local AI Bridge). Reopening just the UI panel is not enough.

We lost half a day once because an `EXPORT_NODE` handler was added to `code.ts` and never compiled.

### ⚠️ CHANGED — verify the loaded build before debugging

`code.ts` has a `BUILD` constant; the panel logs it on connect:

```
🔌 plugin build 2026-08-13.4 (initial)
```

**Check this line first, every time.** A stale stamp (or no stamp) means Figma cached the old bundle — quit and reopen the Figma Desktop app. Two separate debugging sessions were wasted diagnosing "bugs" that were only stale builds. Bump `BUILD` on every `code.ts` edit.

## 3. Plugin window must stay open for on-demand requests

Anything needing live document access goes through a job queue:

- Server enqueues the job (`/api/job/next`).
- `ui.html` polls every 2s, forwards to `code.js`, which runs the Figma API call.
- `ui.html` posts the result to `/api/job/complete`; the server resolves the waiting HTTP request.

⚠️ CHANGED: the endpoints are now `/api/job/next` and `/api/job/complete` (were `/api/export/next` / `/api/export/complete`), jobs are keyed by `jobId` (the old `nodeId:format` key could collide), and the timeout is **60s** (was 30s).

If the plugin is closed, polling stops and requests fail with `Timed out — is the Local AI Bridge plugin still open in Figma?`. Queues live in the Node process and survive a plugin restart — reopening resumes them.

## 4. Fetch sequentially

The queue processes **one job at a time**. Firing 85 parallel requests makes the later ones time out.

```python
for node_id in node_ids:
    r = requests.get(f"http://localhost:47291/api/node/{node_id}/svg", timeout=65)
    time.sleep(0.1)
```

Duplicate requests for the same node+format piggyback on one job; different nodes queue.

⚠️ CHANGED: for bulk asset work use `POST /api/node/:id/assets` — it exports every asset descendant in **one** job and returns a manifest of written files. Prefer it over per-node loops.

## 5. Node ID format

- Tree returns **colon** format: `5:26176`
- Use **colon** format in URLs: `GET /api/node/5:26176/svg`
- Filenames on disk use **dash** format: `5-26176.svg`
- Figma *share URLs* use dashes (`node-id=1-130`) — convert with `GET /api/resolve?url=…`, which returns the colon form.

## 6. ⚠️ CHANGED — the tree now contains real style data

The old serializer emitted only `id/name/type/x/y/width/height/text`. **Never write CSS from that.** Nodes now carry `css` (Figma's own Inspect output), `layout` (auto-layout → flexbox), `sizing`, fills/strokes/effects, full type metrics, `tokens`, `inferredTokens`, `styles`, and `component` identity.

Use `/api/node/:id/context` for structured truth and `/api/node/:id/css?format=text` for a paste-ready stylesheet.

## 7. ⚠️ CHANGED — deep mode vs light mode

`getCSSAsync` and `getMainComponentAsync` cost one round-trip **per node**, so full-page sync only runs them at ≤ **1500** nodes (`deepMode: true`). Above that it runs light: all structured fields, no per-node `css`, no `mainComponent`.

Check `meta.deepMode` on `/api/document`. In light mode fetch CSS per node — `/api/node/:id/context?fresh=1`, or `/api/node/:id/css` which auto-falls back to a live fetch. **Do not report "no CSS available" in light mode.**

## 8. ⚠️ CHANGED — why sync is streamed

Marshalling a whole-page nested payload through `figma.ui.postMessage` **aborts the plugin VM** (`Aborted()` with repeated `deepUnwrap` frames — an OOM inside QuickJS). An 18k-node page hit this reliably, and screenshots sent as `number[]` made it far worse.

Sync now streams flat batches of **250** nodes carrying `parentId` + `order`, and the server rebuilds the hierarchy on commit. Screenshots go one per message as **base64**. The UI acks each batch after its POST lands, so the plugin can't queue thousands of unsent messages.

If you touch the sync path, keep every message bounded. Do not reintroduce a single whole-page payload.

## 9. Start the server

```bash
cd "$LOCAL_AI_BRIDGE_HOME/server" && npm start      # ts-node
cd "$LOCAL_AI_BRIDGE_HOME/server" && npm run serve  # compiled dist/server.js
```

Fallback if conda intercepts `npx`: `./node_modules/.bin/ts-node server.ts`.

⚠️ CHANGED: a compiled build now exists (`dist/server.js`, via `npm run build`) and `package.json` `main` points at it. The stale pre-queue `server/server.js` was deleted — do not resurrect it. Cache dirs are resolved dist-aware, so running either entrypoint uses the same `screenshots/`, `svgs/`, `assets/`, `state/`.

## 10. ⚠️ CHANGED — snapshot persists across restarts

State is written to `server/state/document.json` and restored on boot, so a server restart no longer 503s until the next sync. Still a point-in-time snapshot — re-sync after design edits, and pass `?fresh=1` for live data.

`/api/document` returns 503 only when there is no sync **and** no persisted snapshot. Do not bypass the bridge with `figma-extractor` or `api.figma.com`; ask the user to run the plugin.

## 11. Output directories

- `server/screenshots/` — synced frame PNGs (2x) and on-demand PNG exports
- `server/svgs/` — on-demand SVG exports
- `server/assets/` — bulk asset exports and image-fill bytes
- `server/state/` — persisted snapshot and the Code Connect map

⚠️ CHANGED: frame PNGs export at **2x**, not 1x. Filenames are unsuffixed at 2x; other scales get `@Nx`. Pass `?scale=1` if a comparison needs 1x pixel dimensions.

## 12. Tree lists the node but export returns 404

⚠️ CHANGED and much less common. Node lookup now tries a document-wide `getNodeByIdAsync` before falling back to a current-page scan, so same-page nodes resolve reliably even deep in the tree.

If it still 404s, the node is on a page that is not loaded. Either:
1. `GET /api/page/:id` to deep-sync that page, or
2. switch pages in Figma Desktop and hit **Re-sync page** in the plugin panel.

**A 404 on one node is not a bridge failure and does not block a ticket.** Extract everything else, flag that node ID as a known gap in `instructions.txt`, and continue. Do not post a JIRA blocker or halt work because one decorative asset failed. Only a full outage justifies stopping.

## 13. Sync appears to hang

Should now be impossible to misread:

- Failures post `SYNC_FAILED` — shown in red in the panel with the message, stack head, and the node count reached — plus a `figma.notify` toast.
- Progress ticks throughout: `N nodes to sync` → `Streaming nodes… 250/N` → `Exporting frames…` → `✓ committed`.
- The server logs `[sync] begin` and `[sync] commit`.

A bare "Syncing…"/"Re-syncing…" with no ticks means **you are on a stale build** (see §2).

Historical cause worth knowing: a `pageList()` helper read `page.children` on unloaded pages, which throws under `documentAccess: "dynamic-page"`. It sat inside the final `postMessage` argument, so the whole sync completed and then died silently. Under dynamic-page access, **never touch another page's `children` without `await page.loadAsync()`**.

## 14. Verification checklist

- [ ] `npm run build` passes in `~/Local AI Bridge/`
- [ ] `npm run build` passes in `~/Local AI Bridge/server/`
- [ ] `curl -s http://localhost:47291/` returns `status: "running"`
- [ ] Plugin panel shows the **current** build stamp
- [ ] Panel reached `✓ committed`; server logged `[sync] commit`
- [ ] `GET /api/document` returns the tree; note `meta.deepMode`
- [ ] `GET /api/node/:id/context` returns `css` (or light mode is understood)
- [ ] `GET /api/variables` returns the token collections
- [ ] Ticket node IDs export via `/svg` and `/screenshot`
- [ ] Plugin window left open
- [ ] Bulk assets fetched via `POST /api/node/:id/assets`, or sequentially with a delay
