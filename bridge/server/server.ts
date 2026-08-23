import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Local AI Bridge — server side.
//
// Read-side parity with the official Figma MCP server, over plain HTTP:
//
//   MCP tool                  →  endpoint here
//   ────────────────────────────────────────────────────────────────────────
//   get_design_context        →  GET  /api/node/:id/context
//   get_screenshot            →  GET  /api/node/:id/screenshot
//   get_metadata              →  GET  /api/node/:id/metadata
//   get_variable_defs         →  GET  /api/variables
//   download_assets           →  POST /api/node/:id/assets
//   search_design_system      →  GET  /api/components
//   get_code_connect_map      →  GET  /api/code-connect
//   add_code_connect_map      →  POST /api/code-connect
//
// Plus: /api/styles, /api/text, /api/annotations, /api/pages, /api/search,
// /api/node/:id/css, /api/image/:hash, /api/resolve.
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json({ limit: "500mb" }));

const PORT = 47291;
const ORIGIN = `http://localhost:${PORT}`;

// When run from dist/, resolve data dirs against the server dir, not dist —
// otherwise the compiled build silently uses a separate, empty cache.
const BASE_DIR = path.basename(__dirname) === "dist" ? path.join(__dirname, "..") : __dirname;

const SCREENSHOTS_DIR = path.join(BASE_DIR, "screenshots");
const SVGS_DIR = path.join(BASE_DIR, "svgs");
const ASSETS_DIR = path.join(BASE_DIR, "assets");
const STATE_DIR = path.join(BASE_DIR, "state");
for (const dir of [SCREENSHOTS_DIR, SVGS_DIR, ASSETS_DIR, STATE_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const STATE_FILE = path.join(STATE_DIR, "document.json");
const CODE_CONNECT_FILE = path.join(STATE_DIR, "code-connect.json");

// ── State (persisted, so a restart doesn't 503 until the next sync) ───────────

interface BridgeState {
  tree: SerializedNode | null;
  variables: unknown[];
  styles: unknown;
  pages: unknown[];
  meta: Record<string, unknown>;
  syncedAt: string | null;
}

interface SerializedNode {
  id: string;
  name: string;
  type: string;
  css?: Record<string, string>;
  children?: SerializedNode[];
  [key: string]: unknown;
}

let state: BridgeState = {
  tree: null,
  variables: [],
  styles: null,
  pages: [],
  meta: {},
  syncedAt: null,
};

function loadState(): void {
  try {
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as BridgeState;
      console.log(`[state] restored snapshot from ${state.syncedAt}`);
    }
  } catch (err) {
    console.error("[state] could not restore snapshot:", err);
  }
}

function saveState(): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (err) {
    // A corrupt (self-multiplied) tree blows past V8's max string length here
    // with "RangeError: Invalid string length". The old message was
    // indistinguishable from a disk problem, which sent me looking in the wrong
    // place — name the likely cause instead.
    const hint =
      err instanceof RangeError
        ? " — the tree is almost certainly corrupt (a node linked more than once);" +
          " re-sync from a freshly reloaded plugin"
        : "";
    console.error(`[state] could not persist snapshot:${hint}`, err);
  }
}

function readCodeConnect(): Record<string, unknown> {
  try {
    if (fs.existsSync(CODE_CONNECT_FILE)) {
      return JSON.parse(fs.readFileSync(CODE_CONNECT_FILE, "utf8")) as Record<string, unknown>;
    }
  } catch (err) {
    console.error("[code-connect] could not read map:", err);
  }
  return {};
}

// ── Job queue (server → plugin) ──────────────────────────────────────────────
// The server can't call into Figma, so requests that need live document access
// are parked here; the plugin UI polls /api/job/next and posts results back.

type JobKind =
  | "PNG" | "JPG" | "SVG" | "PDF"
  | "CONTEXT" | "METADATA" | "ASSETS" | "PAGE"
  | "VARIABLES" | "STYLE_LIST" | "PAGES" | "COMPONENTS" | "ANNOTATIONS" | "TEXT" | "IMAGE"
  | "MOTION" | "SHADERS" | "SHADER" | "LIBRARIES" | "WHOAMI" | "MUTATE";

interface JobParams {
  scale?: number;
  depth?: number;
  format?: string;
  hash?: string;
  shaderId?: string;
  variables?: boolean;
  ops?: unknown[];
  dryRun?: boolean;
}

interface Job {
  jobId: string;
  kind: JobKind;
  nodeId?: string;
  params?: JobParams;
  resolve: (r: { bytes?: Buffer; json?: unknown }) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const JOB_TIMEOUT_MS = 60_000;
const queue: Job[] = [];
const inFlight = new Map<string, Job>();
let jobCounter = 0;

function enqueue(kind: JobKind, nodeId?: string, params?: JobParams): Promise<{ bytes?: Buffer; json?: unknown }> {
  return new Promise((resolve, reject) => {
    jobCounter++;
    const jobId = `j${jobCounter}`;

    const timer = setTimeout(() => {
      inFlight.delete(jobId);
      const qi = queue.findIndex((j) => j.jobId === jobId);
      if (qi >= 0) queue.splice(qi, 1);
      reject(new Error("Timed out — is the Local AI Bridge plugin still open in Figma?"));
    }, JOB_TIMEOUT_MS);

    const job: Job = { jobId, kind, nodeId, params, resolve, reject, timer };
    queue.push(job);
    inFlight.set(jobId, job);
  });
}

// The plugin UI polls this on a short interval whenever it is open. That poll is
// the ONLY real liveness signal the server has — it cannot call into Figma — so
// record it and report it on `GET /`. Previously `pluginConnected` was derived
// from queue depth, which reported "unknown (idle)" for both a healthy idle
// plugin and a closed one. Callers (including the /ba skill) read that as
// "closed" and dropped to degraded mode while the plugin was serving fine.
let lastPollAt = 0;
const PLUGIN_LIVE_WINDOW_MS = 6_000;

function pluginLiveness(): { connected: boolean | "unknown"; lastPollMsAgo: number | null } {
  if (!lastPollAt) return { connected: "unknown", lastPollMsAgo: null };
  const ago = Date.now() - lastPollAt;
  return { connected: ago <= PLUGIN_LIVE_WINDOW_MS, lastPollMsAgo: ago };
}

app.get("/api/job/next", (_req: Request, res: Response) => {
  lastPollAt = Date.now();
  const job = queue.shift();
  if (!job) {
    res.json(null);
    return;
  }
  res.json({ jobId: job.jobId, kind: job.kind, nodeId: job.nodeId, params: job.params || {} });
});

app.post("/api/job/complete", (req: Request, res: Response) => {
  const { jobId, bytes, json, error } = req.body as {
    jobId: string;
    bytes: number[] | null;
    json: unknown;
    error: string | null;
  };

  const job = inFlight.get(jobId);
  if (!job) {
    res.json({ ok: true, note: "job already settled or unknown" });
    return;
  }

  inFlight.delete(jobId);
  clearTimeout(job.timer);

  if (error) {
    job.reject(new Error(error));
  } else if (bytes) {
    job.resolve({ bytes: Buffer.from(bytes) });
  } else {
    job.resolve({ json });
  }

  res.json({ ok: true });
});

// ── Tree helpers ─────────────────────────────────────────────────────────────

function findInTree(root: SerializedNode | null, id: string): SerializedNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  if (root.children) {
    for (const child of root.children) {
      const hit = findInTree(child, id);
      if (hit) return hit;
    }
  }
  return null;
}

function walkTree(root: SerializedNode | null, visit: (n: SerializedNode, depth: number) => void, depth = 0): void {
  if (!root) return;
  visit(root, depth);
  if (root.children) {
    for (const child of root.children) walkTree(child, visit, depth + 1);
  }
}

function pruneDepth(node: SerializedNode, depth: number): SerializedNode {
  const copy: SerializedNode = { ...node };
  if (depth <= 0) {
    delete copy.children;
    if (node.children) copy.childCount = node.children.length;
  } else if (node.children) {
    copy.children = node.children.map((c) => pruneDepth(c, depth - 1));
  }
  return copy;
}

function safeId(nodeId: string): string {
  return nodeId.replace(/[:/\\]/g, "-");
}

function slugify(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "node"
  );
}

function intParam(raw: unknown, fallback: number): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

// ── Sync (plugin → server) ───────────────────────────────────────────────────

app.post("/api/sync", (req: Request, res: Response) => {
  const { tree, screenshots, variables, styles, pages, meta } = req.body as {
    tree: SerializedNode;
    screenshots: { id: string; name: string; bytes: number[] }[];
    variables?: unknown[];
    styles?: unknown;
    pages?: unknown[];
    meta?: Record<string, unknown>;
  };

  state = {
    tree,
    variables: variables || [],
    styles: styles || null,
    pages: pages || [],
    meta: meta || {},
    syncedAt: new Date().toISOString(),
  };

  let saved = 0;
  for (const s of screenshots || []) {
    try {
      fs.writeFileSync(path.join(SCREENSHOTS_DIR, `${safeId(s.id)}.png`), Buffer.from(s.bytes));
      saved++;
    } catch (err) {
      console.error(`Failed to save screenshot for ${s.id}:`, err);
    }
  }

  saveState();

  let nodeCount = 0;
  let cssCount = 0;
  walkTree(state.tree, (n) => {
    nodeCount++;
    if (n.css) cssCount++;
  });
  const varCount = state.variables.reduce<number>(
    (n, c) => n + ((c as { variables?: unknown[] }).variables || []).length,
    0
  );

  console.log(
    `[sync] ${state.syncedAt} — ${nodeCount} nodes (${cssCount} with CSS), ` +
      `${varCount} variables, ${saved}/${(screenshots || []).length} PNGs`
  );

  res.json({
    status: "success",
    syncedAt: state.syncedAt,
    nodes: nodeCount,
    nodesWithCss: cssCount,
    variables: varCount,
    screenshotsSaved: saved,
  });
});

// ── Streaming sync (plugin → server, chunked) ────────────────────────────────
// A whole-page nested payload aborts the Figma plugin VM, so nodes arrive flat
// in batches carrying parentId + order and the hierarchy is rebuilt on commit.

interface FlatNode extends SerializedNode {
  parentId?: string | null;
  order?: number;
}

interface Staging {
  nodes: FlatNode[];
  // Reloading the plugin mid-sync leaves the previous instance's in-flight
  // batches still arriving; /api/sync/begin resets staging, so those late
  // batches land in the NEW staging and duplicate ids that already arrived.
  // rebuildTree then pushed the same node object into its parent once per
  // duplicate, and because the object is shared by reference its whole subtree
  // multiplied with it — 15,854 received nodes counted as 2,654,490 and the
  // snapshot grew past the JSON.stringify string-length ceiling.
  seen: Set<string>;
  duplicatesDropped: number;
  variables: unknown[];
  styles: unknown;
  pages: unknown[];
  meta: Record<string, unknown>;
  startedAt: string;
  screenshots: number;
}

let staging: Staging | null = null;

app.post("/api/sync/begin", (req: Request, res: Response) => {
  const { variables, styles, pages, meta } = req.body as {
    variables?: unknown[];
    styles?: unknown;
    pages?: unknown[];
    meta?: Record<string, unknown>;
  };

  staging = {
    nodes: [],
    seen: new Set<string>(),
    duplicatesDropped: 0,
    variables: variables || [],
    styles: styles || null,
    pages: pages || [],
    meta: meta || {},
    startedAt: new Date().toISOString(),
    screenshots: 0,
  };

  console.log(
    `[sync] begin — ${(meta && meta.nodeCount) || "?"} nodes, ` +
      `${meta && meta.deepMode ? "deep" : "light"} mode, page "${(meta && meta.pageName) || "?"}"`
  );
  res.json({ ok: true });
});

app.post("/api/sync/nodes", (req: Request, res: Response) => {
  if (!staging) {
    res.status(409).json({ error: "No sync in progress — POST /api/sync/begin first." });
    return;
  }
  const { batch } = req.body as { batch: FlatNode[] };
  if (!Array.isArray(batch)) {
    res.status(400).json({ error: "Body must be { batch: [...] }" });
    return;
  }
  // First guard: never stage the same id twice. A duplicate is always a stale
  // batch from a superseded sync, never new information.
  let dropped = 0;
  for (const node of batch) {
    if (staging.seen.has(node.id)) {
      dropped++;
      continue;
    }
    staging.seen.add(node.id);
    staging.nodes.push(node);
  }
  staging.duplicatesDropped += dropped;
  res.json({
    ok: true,
    received: batch.length,
    staged: batch.length - dropped,
    duplicatesDropped: dropped,
    total: staging.nodes.length,
  });
});

app.post("/api/sync/shot", (req: Request, res: Response) => {
  const { id, scale, base64 } = req.body as { id: string; name?: string; scale?: number; base64: string };
  if (!id || !base64) {
    res.status(400).json({ error: "Body must be { id, base64 }" });
    return;
  }
  try {
    const suffix = !scale || scale === 2 ? "" : `@${scale}x`;
    fs.writeFileSync(path.join(SCREENSHOTS_DIR, `${safeId(id)}${suffix}.png`), Buffer.from(base64, "base64"));
    if (staging) staging.screenshots++;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Rebuild the hierarchy from parentId/order and commit.
function rebuildTree(flat: FlatNode[]): SerializedNode | null {
  const byId = new Map<string, FlatNode>();
  for (const node of flat) {
    const copy: FlatNode = { ...node };
    delete copy.children;
    byId.set(node.id, copy);
  }

  // Second guard: link parents by iterating the DEDUPED map, not the raw array.
  // Iterating `flat` pushed one copy per duplicate entry, and since the pushed
  // object is shared by reference, every duplicated node multiplied its entire
  // subtree. `byId` has exactly one entry per id, so each node can be attached
  // at most once no matter what arrived on the wire.
  let root: FlatNode | null = null;
  for (const self of byId.values()) {
    if (self.parentId === null || self.parentId === undefined) {
      if (!root) root = self;
      continue;
    }
    const parent = byId.get(self.parentId);
    if (!parent) continue; // Orphan (parent never arrived) — drop rather than guess.
    if (!parent.children) parent.children = [];
    parent.children.push(self);
  }

  // Two passes, and the order matters: stripping `order` in the same loop that
  // sorts would clear it on children whose parent hasn't sorted yet.
  for (const node of byId.values()) {
    if (node.children) {
      (node.children as FlatNode[]).sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  }
  for (const node of byId.values()) {
    delete node.parentId;
    delete node.order;
  }

  return root;
}

app.post("/api/sync/end", (req: Request, res: Response) => {
  if (!staging) {
    res.status(409).json({ error: "No sync in progress." });
    return;
  }

  const { deepMode, cssSkipped } = req.body as { deepMode?: boolean; cssSkipped?: number };
  const tree = rebuildTree(staging.nodes);

  if (!tree) {
    const count = staging.nodes.length;
    staging = null;
    res.status(400).json({ error: `Could not find a root node among ${count} received nodes.` });
    return;
  }

  state = {
    tree,
    variables: staging.variables,
    styles: staging.styles,
    pages: staging.pages,
    meta: { ...staging.meta, deepMode, cssSkipped },
    syncedAt: new Date().toISOString(),
  };

  const received = staging.nodes.length;
  const shots = staging.screenshots;
  const dupes = staging.duplicatesDropped;
  staging = null;
  saveState();

  let nodeCount = 0;
  let cssCount = 0;
  walkTree(state.tree, (n) => {
    nodeCount++;
    if (n.css) cssCount++;
  });

  console.log(
    `[sync] commit — ${nodeCount}/${received} nodes attached (${cssCount} with CSS), ${shots} PNGs` +
      (dupes ? `, ${dupes} duplicate node(s) dropped` : "")
  );

  // attached must never exceed received. If it does, something re-attached a
  // node and the tree is corrupt — say so loudly rather than serving it.
  if (nodeCount > received) {
    console.error(
      `[sync] CORRUPT TREE — attached ${nodeCount} > received ${received}. ` +
        `A node was linked more than once; /api/document is not trustworthy until the next clean sync.`
    );
  }

  res.json({
    status: "success",
    syncedAt: state.syncedAt,
    nodes: nodeCount,
    received,
    nodesWithCss: cssCount,
    screenshots: shots,
    deepMode: !!deepMode,
  });
});

// ── Document / structure ─────────────────────────────────────────────────────

app.get("/api/document", (req: Request, res: Response) => {
  if (!state.tree) {
    res.status(503).json({ error: "No design synced yet. Open the Local AI Bridge plugin in Figma." });
    return;
  }
  const depth = req.query.depth === undefined ? undefined : intParam(req.query.depth, 99);
  const tree = depth === undefined ? state.tree : pruneDepth(state.tree, depth);
  res.json({ syncedAt: state.syncedAt, meta: state.meta, tree });
});

app.get("/api/pages", (_req: Request, res: Response) => {
  res.json({ syncedAt: state.syncedAt, current: state.meta.pageId, pages: state.pages });
});

// Deep-serialise a page that isn't the currently synced one.
app.get("/api/page/:id", async (req: Request, res: Response) => {
  try {
    const { json } = await enqueue("PAGE", req.params.id);
    res.json({ pageId: req.params.id, tree: json });
  } catch (err) {
    res.status(504).json({ error: (err as Error).message });
  }
});

// get_design_context parity — the node's full style truth.
const contextHandler = async (req: Request, res: Response): Promise<void> => {
  const nodeId = req.params.id;
  const depth = req.query.depth === undefined ? undefined : intParam(req.query.depth, 99);
  const fresh = req.query.fresh === "1" || req.query.fresh === "true";

  if (!fresh) {
    const hit = findInTree(state.tree, nodeId);
    if (hit) {
      res.json({
        source: "snapshot",
        syncedAt: state.syncedAt,
        node: depth === undefined ? hit : pruneDepth(hit, depth),
      });
      return;
    }
  }

  try {
    const { json } = await enqueue("CONTEXT", nodeId, { depth });
    res.json({ source: "live", node: json });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
};

app.get("/api/node/:id/context", contextHandler);
app.get("/api/node/:id/styles", contextHandler); // alias

// get_metadata parity — lightweight structure map.
app.get("/api/node/:id/metadata", async (req: Request, res: Response) => {
  const depth = intParam(req.query.depth, 4);
  try {
    const { json } = await enqueue("METADATA", req.params.id, { depth });
    res.json({ node: json });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// Flattened CSS for a subtree — paste-ready, one entry per node.
app.get("/api/node/:id/css", async (req: Request, res: Response) => {
  let node = findInTree(state.tree, req.params.id);

  // A light-mode sync carries no per-node CSS, so fetch this subtree live.
  const snapshotHasCss = (() => {
    if (!node) return false;
    let found = false;
    walkTree(node, (n) => {
      if (n.css && Object.keys(n.css).length) found = true;
    });
    return found;
  })();

  if (!node || !snapshotHasCss) {
    try {
      const { json } = await enqueue("CONTEXT", req.params.id, { depth: intParam(req.query.depth, 99) });
      node = json as SerializedNode;
    } catch (err) {
      res.status(404).json({
        error: `${(err as Error).message} (node not in snapshot with CSS, and a live fetch failed)`,
      });
      return;
    }
  }

  const rules: unknown[] = [];
  walkTree(node, (n, depth) => {
    if (!n.css || !Object.keys(n.css).length) return;
    rules.push({
      nodeId: n.id,
      name: n.name,
      type: n.type,
      depth,
      selector: `.${slugify(n.name)}`,
      css: n.css,
      tokens: n.tokens,
      styles: n.styles,
    });
  });

  if (req.query.format === "text") {
    const sheet = rules
      .map((r) => {
        const rule = r as { selector: string; name: string; nodeId: string; css: Record<string, string> };
        const body = Object.keys(rule.css)
          .map((k) => `  ${k}: ${rule.css[k]};`)
          .join("\n");
        return `/* ${rule.name} — ${rule.nodeId} */\n${rule.selector} {\n${body}\n}`;
      })
      .join("\n\n");
    res.type("text/css").send(sheet);
    return;
  }

  res.json({ nodeId: req.params.id, count: rules.length, rules });
});

// Node search across the synced snapshot.
app.get("/api/search", (req: Request, res: Response) => {
  const q = String(req.query.q || "").toLowerCase();
  const type = req.query.type ? String(req.query.type).toUpperCase() : null;
  const limit = intParam(req.query.limit, 100);

  if (!state.tree) {
    res.status(503).json({ error: "No design synced yet." });
    return;
  }

  const hits: unknown[] = [];
  walkTree(state.tree, (n) => {
    if (hits.length >= limit) return;
    if (type && n.type !== type) return;
    const text = n.text as { characters?: string } | undefined;
    const haystack = `${n.name} ${text && text.characters ? text.characters : ""}`.toLowerCase();
    if (q && haystack.indexOf(q) === -1) return;
    hits.push({
      nodeId: n.id,
      name: n.name,
      type: n.type,
      contextUrl: `${ORIGIN}/api/node/${n.id}/context`,
      screenshotUrl: `${ORIGIN}/api/node/${n.id}/screenshot`,
    });
  });

  res.json({ query: q, type, count: hits.length, results: hits });
});

// ── Screenshots & exports ────────────────────────────────────────────────────

app.get("/api/node/:id/screenshot", async (req: Request, res: Response) => {
  const nodeId = req.params.id;
  const scale = intParam(req.query.scale, 2);
  const fresh = req.query.fresh === "1" || req.query.fresh === "true";
  const suffix = scale === 2 ? "" : `@${scale}x`;
  const cached = path.join(SCREENSHOTS_DIR, `${safeId(nodeId)}${suffix}.png`);

  if (!fresh && fs.existsSync(cached)) {
    res.sendFile(cached);
    return;
  }

  try {
    const { bytes } = await enqueue("PNG", nodeId, { scale });
    if (!bytes) throw new Error("Empty export");
    fs.writeFileSync(cached, bytes);
    res.type("image/png").send(bytes);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

app.get("/api/node/:id/svg", async (req: Request, res: Response) => {
  const nodeId = req.params.id;
  const fresh = req.query.fresh === "1" || req.query.fresh === "true";
  const cached = path.join(SVGS_DIR, `${safeId(nodeId)}.svg`);

  if (!fresh && fs.existsSync(cached)) {
    res.type("image/svg+xml").sendFile(cached);
    return;
  }

  try {
    const { bytes } = await enqueue("SVG", nodeId);
    if (!bytes) throw new Error("Empty export");
    fs.writeFileSync(cached, bytes);
    res.type("image/svg+xml").send(bytes);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// Arbitrary format/scale export.
app.get("/api/node/:id/export", async (req: Request, res: Response) => {
  const raw = String(req.query.format || "PNG").toUpperCase();
  const format = (["PNG", "JPG", "SVG", "PDF"].indexOf(raw) >= 0 ? raw : "PNG") as JobKind;
  const scale = intParam(req.query.scale, 2);

  try {
    const { bytes } = await enqueue(format, req.params.id, { scale });
    if (!bytes) throw new Error("Empty export");
    const mime =
      format === "SVG" ? "image/svg+xml" : format === "PDF" ? "application/pdf" : format === "JPG" ? "image/jpeg" : "image/png";
    res.type(mime).send(bytes);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

app.get("/api/screenshots", (_req: Request, res: Response) => {
  const files = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith(".png"));
  const list = files.map((f) => {
    const nodeId = f.replace(/\.png$/, "").replace(/@\dx$/, "").replace(/-/g, ":");
    return {
      nodeId,
      file: path.join(SCREENSHOTS_DIR, f),
      screenshotUrl: `${ORIGIN}/api/node/${nodeId}/screenshot`,
      svgUrl: `${ORIGIN}/api/node/${nodeId}/svg`,
      contextUrl: `${ORIGIN}/api/node/${nodeId}/context`,
    };
  });
  res.json({ count: list.length, screenshots: list });
});

// download_assets parity — export every asset-like descendant to disk in one pass.
const assetsHandler = async (req: Request, res: Response): Promise<void> => {
  const nodeId = req.params.id;
  const body = (req.body || {}) as { dir?: string; format?: string; scale?: number };
  const format = String(body.format || req.query.format || "SVG").toUpperCase() === "PNG" ? "PNG" : "SVG";
  const scale = body.scale || intParam(req.query.scale, 2);
  const targetDir = body.dir || String(req.query.dir || path.join(ASSETS_DIR, safeId(nodeId)));

  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (err) {
    res.status(400).json({ error: `Cannot write to ${targetDir}: ${(err as Error).message}` });
    return;
  }

  try {
    const { json } = await enqueue("ASSETS", nodeId, { format, scale });
    const assets = (json || []) as {
      nodeId: string;
      name: string;
      type: string;
      format: string;
      width: number;
      height: number;
      bytes?: number[];
      error?: string;
    }[];

    const written: unknown[] = [];
    const used = new Set<string>();

    for (const a of assets) {
      if (a.error || !a.bytes) {
        written.push({ nodeId: a.nodeId, name: a.name, error: a.error || "no bytes" });
        continue;
      }
      let base = slugify(a.name);
      let file = `${base}.${a.format.toLowerCase()}`;
      let n = 2;
      while (used.has(file)) {
        file = `${base}-${n}.${a.format.toLowerCase()}`;
        n++;
      }
      used.add(file);

      const full = path.join(targetDir, file);
      fs.writeFileSync(full, Buffer.from(a.bytes));
      written.push({
        nodeId: a.nodeId,
        name: a.name,
        type: a.type,
        format: a.format,
        width: a.width,
        height: a.height,
        file: full,
      });
    }

    console.log(`[assets] ${written.length} assets → ${targetDir}`);
    res.json({ nodeId, dir: targetDir, count: written.length, assets: written });
  } catch (err) {
    res.status(504).json({ error: (err as Error).message });
  }
};

app.post("/api/node/:id/assets", assetsHandler);
app.get("/api/node/:id/assets", assetsHandler);

// Raw bytes of an image fill (imageHash comes from a node's fills).
app.get("/api/image/:hash", async (req: Request, res: Response) => {
  const hash = req.params.hash;
  const cached = path.join(ASSETS_DIR, `image-${safeId(hash)}.png`);

  if (fs.existsSync(cached)) {
    res.sendFile(cached);
    return;
  }

  try {
    const { bytes } = await enqueue("IMAGE", undefined, { hash });
    if (!bytes) throw new Error("Empty image");
    fs.writeFileSync(cached, bytes);
    res.type("image/png").send(bytes);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// ── Design tokens & styles ───────────────────────────────────────────────────

// get_variable_defs parity. ?format=css emits a :root custom-property block.
app.get("/api/variables", async (req: Request, res: Response) => {
  const fresh = req.query.fresh === "1" || req.query.fresh === "true";
  let collections = state.variables;

  if (fresh || !collections.length) {
    try {
      const { json } = await enqueue("VARIABLES");
      collections = (json || []) as unknown[];
      state.variables = collections;
      saveState();
    } catch (err) {
      if (!collections.length) {
        res.status(504).json({ error: (err as Error).message });
        return;
      }
    }
  }

  if (req.query.format === "css") {
    const lines: string[] = [];
    for (const c of collections) {
      const coll = c as {
        name: string;
        modes: string[];
        variables: { name: string; type?: string; values: Record<string, unknown> }[];
      };
      const mode = coll.modes && coll.modes.length ? coll.modes[0] : null;
      lines.push(`  /* ${coll.name}${mode ? ` — mode: ${mode}` : ""} */`);
      for (const v of coll.variables || []) {
        const value = mode ? v.values[mode] : Object.values(v.values)[0];
        // FLOAT variables are px in every Figma context that matters here
        // (spacing, radius, size) — unitless would be invalid CSS.
        const needsPx = v.type === "FLOAT" && typeof value === "number";
        lines.push(`  --${slugify(v.name)}: ${needsPx ? `${String(value)}px` : String(value)};`);
      }
    }
    res.type("text/css").send(`:root {\n${lines.join("\n")}\n}\n`);
    return;
  }

  res.json({ syncedAt: state.syncedAt, count: collections.length, collections });
});

app.get("/api/styles", async (req: Request, res: Response) => {
  const fresh = req.query.fresh === "1" || req.query.fresh === "true";
  if (fresh || !state.styles) {
    try {
      const { json } = await enqueue("STYLE_LIST");
      state.styles = json;
      saveState();
    } catch (err) {
      if (!state.styles) {
        res.status(504).json({ error: (err as Error).message });
        return;
      }
    }
  }
  res.json({ syncedAt: state.syncedAt, styles: state.styles });
});

// search_design_system parity — component inventory with variant definitions.
app.get("/api/components", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").toLowerCase();
  try {
    const { json } = await enqueue("COMPONENTS");
    let components = (json || []) as { name: string; description?: string }[];
    if (q) {
      components = components.filter(
        (c) =>
          c.name.toLowerCase().indexOf(q) >= 0 ||
          (c.description || "").toLowerCase().indexOf(q) >= 0
      );
    }
    res.json({ query: q || null, count: components.length, components });
  } catch (err) {
    res.status(504).json({ error: (err as Error).message });
  }
});

// ── Dev annotations & copy ───────────────────────────────────────────────────

app.get("/api/annotations", async (_req: Request, res: Response) => {
  try {
    const { json } = await enqueue("ANNOTATIONS");
    res.json(json);
  } catch (err) {
    res.status(504).json({ error: (err as Error).message });
  }
});

app.get("/api/text", async (req: Request, res: Response) => {
  const fresh = req.query.fresh === "1" || req.query.fresh === "true";

  if (!fresh && state.tree) {
    const items: unknown[] = [];
    walkTree(state.tree, (n) => {
      if (n.type !== "TEXT") return;
      const t = n.text as Record<string, unknown> | undefined;
      items.push({
        nodeId: n.id,
        name: n.name,
        characters: t ? t.characters : undefined,
        fontFamily: t ? t.fontFamily : undefined,
        fontSize: t ? t.fontSize : undefined,
        fontWeight: t ? t.fontWeight : undefined,
        lineHeight: t ? t.lineHeight : undefined,
        letterSpacing: t ? t.letterSpacing : undefined,
      });
    });
    res.json({ source: "snapshot", syncedAt: state.syncedAt, count: items.length, text: items });
    return;
  }

  try {
    const { json } = await enqueue("TEXT");
    const items = (json || []) as unknown[];
    res.json({ source: "live", count: items.length, text: items });
  } catch (err) {
    res.status(504).json({ error: (err as Error).message });
  }
});

// ── Code Connect ─────────────────────────────────────────────────────────────

app.get("/api/code-connect", (req: Request, res: Response) => {
  const map = readCodeConnect();
  const nodeId = req.query.nodeId ? String(req.query.nodeId) : null;
  if (nodeId) {
    res.json({ nodeId, mapping: map[nodeId] || null });
    return;
  }
  res.json({ count: Object.keys(map).length, map });
});

app.post("/api/code-connect", (req: Request, res: Response) => {
  const incoming = req.body as Record<string, { codeConnectSrc?: string; codeConnectName?: string }>;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    res.status(400).json({ error: "Body must be an object of { nodeId: { codeConnectSrc, codeConnectName } }" });
    return;
  }

  const map = readCodeConnect();
  let added = 0;
  for (const nodeId of Object.keys(incoming)) {
    map[nodeId] = incoming[nodeId];
    added++;
  }

  try {
    fs.writeFileSync(CODE_CONNECT_FILE, JSON.stringify(map, null, 2));
  } catch (err) {
    res.status(500).json({ error: `Could not persist map: ${(err as Error).message}` });
    return;
  }

  console.log(`[code-connect] ${added} mapping(s) written, ${Object.keys(map).length} total`);
  res.json({ ok: true, added, total: Object.keys(map).length });
});

// ── Figma URL → ids ──────────────────────────────────────────────────────────

app.get("/api/resolve", (req: Request, res: Response) => {
  const url = String(req.query.url || "");
  if (!url) {
    res.status(400).json({ error: "Pass ?url=<figma url>" });
    return;
  }

  const fileMatch = url.match(/figma\.com\/(?:file|design|proto|board|slides)\/([A-Za-z0-9]+)/);
  const nodeMatch = url.match(/[?&]node-id=([^&]+)/);
  // Figma URLs hyphenate node ids (1-234); the plugin API uses colons (1:234).
  const nodeId = nodeMatch ? decodeURIComponent(nodeMatch[1]).replace(/-/g, ":") : null;

  res.json({
    fileKey: fileMatch ? fileMatch[1] : null,
    nodeId,
    isCurrentFile: fileMatch ? fileMatch[1] === state.meta.fileKey : null,
    contextUrl: nodeId ? `${ORIGIN}/api/node/${nodeId}/context` : null,
    screenshotUrl: nodeId ? `${ORIGIN}/api/node/${nodeId}/screenshot` : null,
  });
});

// ── Motion / prototyping (get_motion_context) ────────────────────────────────
// Animation specs live on `reactions`, which the sync emits raw. This normalises
// trigger / action / transition and derives the CSS timing function where one
// genuinely exists — springs report their physical parameters and css: null
// rather than a fabricated cubic-bezier.

app.get("/api/node/:id/motion", async (req: Request, res: Response) => {
  try {
    const depth = intParam(req.query.depth, 99);
    const { json } = await enqueue("MOTION", req.params.id, { depth });
    res.json(json);
  } catch (err) {
    res.status(504).json({ error: String(err) });
  }
});

// ── Shaders (list_shader_fills / list_shader_effects / get_shader_*) ─────────

app.get("/api/shaders", async (_req: Request, res: Response) => {
  try {
    const { json } = await enqueue("SHADERS");
    res.json(json);
  } catch (err) {
    res.status(504).json({ error: String(err) });
  }
});

// Importing is what makes a shader's propertyDefinitions readable, and it is
// idempotent for an already-imported shader — same shape as loadFontAsync.
app.get("/api/shader/:id", async (req: Request, res: Response) => {
  try {
    const { json } = await enqueue("SHADER", undefined, { shaderId: req.params.id });
    res.json(json);
  } catch (err) {
    res.status(504).json({ error: String(err) });
  }
});

// ── Libraries (get_libraries) ────────────────────────────────────────────────

app.get("/api/libraries", async (req: Request, res: Response) => {
  try {
    const { json } = await enqueue("LIBRARIES", undefined, {
      variables: req.query.variables !== "0",
    });
    res.json(json);
  } catch (err) {
    res.status(504).json({ error: String(err) });
  }
});

// ── Identity (whoami) ────────────────────────────────────────────────────────

app.get("/api/whoami", async (_req: Request, res: Response) => {
  try {
    const { json } = await enqueue("WHOAMI");
    res.json(json);
  } catch (err) {
    res.status(504).json({ error: String(err) });
  }
});

// ── Mutation (the use_figma equivalent) ──────────────────────────────────────
// GET returns the op vocabulary so an agent can discover it; POST executes.

const MUTATE_VOCABULARY = {
  contract:
    "Ops execute in order. Any op may declare \"as\": \"name\", and later ops reference it as \"$name\". \"$page\" and \"$root\" are always available. Plain node ids also work as references.",
  whyNotArbitraryJs:
    "Figma's own use_figma accepts plain JavaScript because their MCP is first-party desktop-app code. The plugin sandbox is a custom JS VM with no eval/new Function, so a third-party plugin cannot offer that. This op vocabulary is the equivalent.",
  atomicity:
    "On failure, properties written to pre-existing nodes are restored and every node the batch created is removed. Deleting a pre-existing node is refused unless you pass \"force\": true, because it cannot be rolled back.",
  dryRun: "POST { ops, dryRun: true } validates refs, property names and fonts without writing.",
  ops: {
    createFrame: '{ op, as? } — also createRectangle, createEllipse, createText, createLine, createComponent, createPage',
    clone: '{ op, target, as? }',
    createInstance: '{ op, componentKey? | componentId?, as? }',
    set: '{ op, target, props: { …figma node properties } } — unknown property names are rejected, and text props load fonts first',
    resize: '{ op, target, width, height }',
    append: '{ op, parent, child, index? }',
    remove: '{ op, target, force? }',
    bindVariable: '{ op, target, field, variableId }',
    loadFont: '{ op, family, style? }',
    createImage: '{ op, bytesBase64? | url?, as? } — the ref resolves to an image hash, returned under imageRefs',
    importShader: '{ op, shaderId }',
    setCurrentPage: '{ op, target }',
    notify: '{ op, message }',
  },
  example: {
    ops: [
      { op: "createFrame", as: "card" },
      { op: "set", target: "$card", props: { name: "Card", layoutMode: "VERTICAL", itemSpacing: 14 } },
      { op: "resize", target: "$card", width: 329, height: 200 },
      { op: "append", parent: "$page", child: "$card" },
    ],
  },
  notPossibleFromAPlugin: {
    create_new_file: "The Plugin API has no create-file call, and neither does the REST API.",
    export_video: "exportAsync has no video format.",
    generate_figma_design:
      "The generation itself is Figma-server AI. The mechanical half — building the nodes — is this op list.",
  },
};

app.get("/api/mutate", (_req: Request, res: Response) => {
  res.json(MUTATE_VOCABULARY);
});

app.post("/api/mutate", async (req: Request, res: Response) => {
  const body = (req.body || {}) as { ops?: unknown; dryRun?: boolean };
  if (!Array.isArray(body.ops) || body.ops.length === 0) {
    res.status(400).json({
      error: "POST a non-empty { ops: [...] } array. GET /api/mutate lists the vocabulary.",
    });
    return;
  }
  try {
    const { json } = await enqueue("MUTATE", undefined, {
      ops: body.ops,
      dryRun: body.dryRun === true,
    });
    res.json(json);
  } catch (err) {
    // applyOps throws a JSON string carrying the rollback report — pass it
    // through parsed so the caller sees what was undone, not just a message.
    // The payload picks up an "Error: " prefix at each hop (plugin throw →
    // runJob's String(err) → here), so strip all of them, not just one.
    const raw = String(err).replace(/^(Error:\s*)+/, "");
    try {
      res.status(422).json(JSON.parse(raw));
    } catch {
      res.status(504).json({ error: raw });
    }
  }
});

// ── Health / catalogue ───────────────────────────────────────────────────────

app.get("/", (_req: Request, res: Response) => {
  let nodeCount = 0;
  let cssCount = 0;
  walkTree(state.tree, (n) => {
    nodeCount++;
    if (n.css) cssCount++;
  });

  res.json({
    status: "running",
    // Real liveness, from the plugin's own poll — not inferred from queue depth.
    pluginConnected: pluginLiveness().connected,
    pluginLastPollMsAgo: pluginLiveness().lastPollMsAgo,
    pluginLivenessNote:
      "true = the plugin polled within the last 6s and live endpoints will work. " +
      "false = it has stopped polling; the window is almost certainly closed. " +
      '"unknown" = it has not polled since this server started. Never infer liveness from queue depth.',
    queueBusy: queue.length > 0 || inFlight.size > 0,
    syncedAt: state.syncedAt,
    file: state.meta.fileName || null,
    page: state.meta.pageName || null,
    nodes: nodeCount,
    nodesWithCss: cssCount,
    variableCollections: state.variables.length,
    queuedJobs: queue.length,
    inFlightJobs: inFlight.size,
    mcpParity: {
      get_design_context: "GET /api/node/:id/context[?depth=&fresh=1]",
      get_screenshot: "GET /api/node/:id/screenshot[?scale=&fresh=1]",
      get_metadata: "GET /api/node/:id/metadata[?depth=]",
      get_variable_defs: "GET /api/variables[?format=css&fresh=1]",
      download_assets: "POST /api/node/:id/assets  { dir, format, scale }",
      search_design_system: "GET /api/components[?q=]",
      get_code_connect_map: "GET /api/code-connect[?nodeId=]",
      add_code_connect_map: "POST /api/code-connect  { nodeId: {codeConnectSrc, codeConnectName} }",
      get_motion_context: "GET /api/node/:id/motion[?depth=]",
      get_libraries: "GET /api/libraries[?variables=0]",
      list_shader_fills: "GET /api/shaders  → .fills",
      list_shader_effects: "GET /api/shaders  → .effects",
      get_shader_fill: "GET /api/shader/:id",
      get_shader_effect: "GET /api/shader/:id",
      whoami: "GET /api/whoami",
      use_figma:
        "POST /api/mutate { ops, dryRun? }  ·  GET /api/mutate for the vocabulary — an op list, not arbitrary JS (the plugin sandbox has no eval)",
      upload_assets: "POST /api/mutate  op createImage { bytesBase64 | url }",
      generate_figma_design:
        "partial — POST /api/mutate builds the nodes; the AI generation half is Figma-server-side",
      generate_diagram:
        "partial — same as generate_figma_design; compose the diagram as an op list",
    },
    notPossible: {
      create_new_file: "No create-file call exists in the Plugin API or the REST API.",
      export_video: "exportAsync has no video format.",
      get_figjam:
        "manifest editorType is [\"figma\"]; add \"figjam\" and reload the plugin to read FigJam boards.",
      arbitraryJsUseFigma:
        "The plugin sandbox is a custom JS VM with no eval/new Function. Figma's own use_figma runs plain JS only because their MCP is first-party desktop-app code.",
    },
    extras: {
      flattenedCss: "GET /api/node/:id/css[?format=text]",
      localStyles: "GET /api/styles[?fresh=1]",
      copyInventory: "GET /api/text[?fresh=1]",
      devAnnotations: "GET /api/annotations",
      nodeSearch: "GET /api/search?q=&type=&limit=",
      pages: "GET /api/pages  ·  GET /api/page/:id",
      imageFill: "GET /api/image/:hash",
      anyFormat: "GET /api/node/:id/export?format=PNG|JPG|SVG|PDF&scale=",
      urlResolve: "GET /api/resolve?url=<figma url>",
      document: "GET /api/document[?depth=]",
      screenshotIndex: "GET /api/screenshots",
    },
    internal: {
      jobPoll: "GET /api/job/next",
      jobComplete: "POST /api/job/complete",
      sync: "POST /api/sync",
    },
  });
});

loadState();
app.listen(PORT, () => {
  console.log(`Local AI Bridge server running at ${ORIGIN}`);
  console.log(`Data dirs: ${BASE_DIR}`);
  if (!state.tree) console.log("No snapshot yet — open the plugin in Figma to sync.");
});
