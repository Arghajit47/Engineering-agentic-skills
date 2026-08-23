// Bump on every change to code.ts — the UI logs it, so which build is actually
// loaded in Figma is never a guess.
const BUILD = "2026-08-13.4";

// Full-page sync streams flat batches instead of one nested payload: marshalling
// a ~18k-node tree through figma.ui.postMessage aborts the plugin VM outright
// (deepUnwrap OOM). Every message is now bounded regardless of file size.
const NODE_BATCH_SIZE = 250;

// Above this many nodes, full-page sync runs "light": no getCSSAsync and no
// getMainComponentAsync, both of which are one round-trip *per node*. All
// structured style fields are still captured. Deep data stays available per
// node via /api/node/:id/context, which is how it's actually consumed.
const DEEP_SYNC_NODE_LIMIT = 1500;

figma.showUI(__html__, { visible: true, width: 360, height: 260 });

// ─────────────────────────────────────────────────────────────────────────────
// Local AI Bridge — plugin side.
//
// Goal: full read-side parity with the official Figma MCP server, so agents can
// get real CSS, design tokens, component identity, assets and dev annotations
// without ever guessing values off a screenshot.
//
// Job protocol (server ⇄ ui.html ⇄ here):
//   server enqueues { jobId, kind, nodeId?, params }
//   we reply  { jobId, bytes? | json?, error? }
// ─────────────────────────────────────────────────────────────────────────────

type Mixed = "MIXED";

type SerializedPaint = {
  type: string;
  visible: boolean;
  opacity?: number;
  color?: string;
  scaleMode?: string;
  imageHash?: string | null;
  stops?: { color: string; position: number }[];
  gradientTransform?: readonly (readonly number[])[];
  blendMode?: string;
  // SHADER
  shaderId?: string;
  properties?: { [defId: string]: unknown };
  // VIDEO
  videoHash?: string | null;
  scalingFactor?: number;
  rotation?: number;
  filters?: unknown;
  // PATTERN
  sourceNodeId?: string;
  tileType?: string;
  spacing?: { x: number; y: number };
  horizontalAlignment?: string;
  // set when a paint type carries data this serializer does not model
  unmodelled?: boolean;
};

type SerializedEffect = {
  type: string;
  visible: boolean;
  css?: string;
  color?: string;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  blendMode?: string;
  // SHADER
  shaderId?: string;
  properties?: { [defId: string]: unknown };
  // NOISE / TEXTURE
  noiseSize?: number;
  noiseType?: string;
  density?: number;
  clipToShape?: boolean;
  // GLASS
  refraction?: number;
  depth?: number;
  dispersion?: number;
  unmodelled?: boolean;
};

type SerializedLayout = {
  mode: string;
  wrap?: string;
  itemSpacing?: number;
  counterAxisSpacing?: number | null;
  padding?: { top: number; right: number; bottom: number; left: number };
  primaryAxisAlign?: string;
  counterAxisAlign?: string;
  primaryAxisSizing?: string;
  counterAxisSizing?: string;
  itemReverseZIndex?: boolean;
};

type SerializedText = {
  characters: string;
  fontFamily?: string | Mixed;
  fontStyle?: string | Mixed;
  fontWeight?: number | Mixed;
  fontSize?: number | Mixed;
  lineHeight?: string | Mixed;
  letterSpacing?: string | Mixed;
  textCase?: string | Mixed;
  textDecoration?: string | Mixed;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  textAutoResize?: string;
  textTruncation?: string;
  maxLines?: number | null;
  paragraphSpacing?: number | Mixed;
  paragraphIndent?: number | Mixed;
  hyperlink?: unknown;
  segments?: unknown[];
};

type SerializedNode = {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  absolute?: { x: number; y: number; width: number; height: number };
  rotation?: number;
  opacity?: number;
  blendMode?: string;
  css?: { [key: string]: string };
  layout?: SerializedLayout;
  sizing?: {
    layoutSizingHorizontal?: string;
    layoutSizingVertical?: string;
    layoutAlign?: string;
    layoutGrow?: number;
    layoutPositioning?: string;
    constraints?: { horizontal: string; vertical: string };
    minWidth?: number | null;
    maxWidth?: number | null;
    minHeight?: number | null;
    maxHeight?: number | null;
    aspectRatio?: number | null;
  };
  fills?: SerializedPaint[] | Mixed;
  strokes?: SerializedPaint[];
  strokeWeight?: number | Mixed;
  strokeAlign?: string;
  strokeCap?: string | Mixed;
  strokeJoin?: string | Mixed;
  strokeSides?: { top: number; right: number; bottom: number; left: number };
  dashPattern?: readonly number[];
  cornerRadius?: number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
  cornerSmoothing?: number;
  effects?: SerializedEffect[];
  clipsContent?: boolean;
  isAsset?: boolean;
  isMask?: boolean;
  layoutGrids?: unknown[];
  exportSettings?: unknown[];
  styles?: {
    fill?: string;
    stroke?: string;
    text?: string;
    effect?: string;
    grid?: string;
  };
  text?: SerializedText;
  vectorPaths?: { windingRule: string; data: string }[];
  component?: {
    kind: string;
    mainComponent?: string | null;
    mainComponentId?: string | null;
    key?: string;
    properties?: unknown;
    variantProperties?: unknown;
    propertyDefinitions?: unknown;
    description?: string;
    overrides?: unknown;
  };
  tokens?: { [field: string]: string | string[] };
  inferredTokens?: { [field: string]: string[] };
  annotations?: unknown[];
  reactions?: unknown[];
  children?: SerializedNode[];
  // Set only on streamed full-page syncs; the server rebuilds the hierarchy.
  parentId?: string | null;
  order?: number;
};

// ── Colour / paint / effect helpers ───────────────────────────────────────────

function hex2(v: number): string {
  return Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function colorToCss(c: RGB | RGBA, extraOpacity?: number): string {
  const baseAlpha = "a" in c ? (c as RGBA).a : 1;
  const a = baseAlpha * (extraOpacity === undefined ? 1 : extraOpacity);
  if (a >= 0.999) {
    return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`.toUpperCase();
  }
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

function serializePaint(p: Paint): SerializedPaint {
  const out: SerializedPaint = {
    type: p.type,
    visible: p.visible !== false,
    opacity: p.opacity === undefined ? 1 : p.opacity,
  };

  if (p.type === "SOLID") {
    out.color = colorToCss((p as SolidPaint).color, p.opacity);
    return out;
  }

  if (p.type === "IMAGE") {
    const img = p as ImagePaint;
    out.scaleMode = img.scaleMode;
    out.imageHash = img.imageHash;
    return out;
  }

  // A shader fill carries no colour at all — only an id and a property map. Left
  // unmodelled it reported as a bare {type:"SHADER"}, so a design using one looked
  // like an element with no fill. Emit the id and properties; resolve the
  // definitions via GET /api/shader/:id.
  if (p.type === "SHADER") {
    const sh = p as ShaderPaint;
    out.shaderId = sh.id;
    out.blendMode = sh.blendMode;
    if (sh.properties) out.properties = sh.properties as { [k: string]: unknown };
    return out;
  }

  if (p.type === "VIDEO") {
    const v = p as VideoPaint;
    out.scaleMode = v.scaleMode;
    out.videoHash = v.videoHash;
    out.scalingFactor = v.scalingFactor;
    out.rotation = v.rotation;
    out.blendMode = v.blendMode;
    if (v.filters) out.filters = v.filters;
    return out;
  }

  // A pattern fill tiles another node. The tile is a real node, so the consumer
  // can fetch it by sourceNodeId to see what is actually being repeated.
  if (p.type === "PATTERN") {
    const pt = p as PatternPaint;
    out.sourceNodeId = pt.sourceNodeId;
    out.tileType = pt.tileType;
    out.scalingFactor = pt.scalingFactor;
    out.spacing = { x: pt.spacing.x, y: pt.spacing.y };
    out.horizontalAlignment = pt.horizontalAlignment;
    out.blendMode = pt.blendMode;
    return out;
  }

  if (p.type.indexOf("GRADIENT") === 0) {
    // Angle maths on gradientTransform is easy to get subtly wrong, so emit raw
    // stops + transform and let the node's `css` carry the exact gradient.
    const g = p as GradientPaint;
    out.stops = g.gradientStops.map((s) => ({
      color: colorToCss(s.color),
      position: Number(s.position.toFixed(4)),
    }));
    out.gradientTransform = g.gradientTransform;
    return out;
  }

  // Unknown paint type — say so rather than returning a plausible-looking stub.
  out.unmodelled = true;
  return out;
}

function serializeEffect(e: Effect): SerializedEffect {
  const out: SerializedEffect = { type: e.type, visible: e.visible !== false };

  if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
    const s = e as DropShadowEffect | InnerShadowEffect;
    const spread = "spread" in s && s.spread !== undefined ? s.spread : 0;
    const inset = e.type === "INNER_SHADOW" ? "inset " : "";
    out.offset = { x: s.offset.x, y: s.offset.y };
    out.radius = s.radius;
    out.spread = spread;
    out.color = colorToCss(s.color);
    out.blendMode = s.blendMode;
    out.css = `${inset}${s.offset.x}px ${s.offset.y}px ${s.radius}px ${spread}px ${out.color}`;
    return out;
  }

  // The Effect union has seven members; only the two shadow kinds and blur were
  // modelled, so NOISE / TEXTURE / GLASS / SHADER all reduced to {type, visible}
  // — a design using any of them read as having no effect at all.
  if (e.type === "SHADER") {
    const sh = e as ShaderEffect;
    out.shaderId = sh.id;
    if (sh.properties) out.properties = sh.properties as { [k: string]: unknown };
    return out;
  }

  if (e.type === "NOISE") {
    const n = e as unknown as {
      noiseSize?: number;
      noiseType?: string;
      density?: number;
      opacity?: number;
    };
    out.noiseSize = n.noiseSize;
    out.noiseType = n.noiseType;
    out.density = n.density;
    // No CSS equivalent exists — do not invent one.
    return out;
  }

  if (e.type === "TEXTURE") {
    const tx = e as TextureEffect;
    out.noiseSize = tx.noiseSize;
    out.radius = tx.radius;
    out.clipToShape = tx.clipToShape;
    return out;
  }

  if (e.type === "GLASS") {
    const g = e as unknown as {
      radius?: number;
      refraction?: number;
      depth?: number;
      dispersion?: number;
    };
    out.radius = g.radius;
    out.refraction = g.refraction;
    out.depth = g.depth;
    out.dispersion = g.dispersion;
    // backdrop-filter is the closest primitive, but it is not equivalent —
    // flag it so a consumer does not treat this as a solved translation.
    out.unmodelled = true;
    return out;
  }

  if ("radius" in e && typeof (e as { radius: unknown }).radius === "number") {
    const radius = (e as unknown as { radius: number }).radius;
    out.radius = radius;
    out.css = `blur(${radius}px)`;
    return out;
  }

  out.unmodelled = true;
  return out;
}

// ── Motion / prototyping ──────────────────────────────────────────────────────
// `reactions` was previously emitted raw, which meant every animation spec the
// BA workflow asks for (duration, easing, trigger) was present in the payload
// but unusable without the consumer knowing Figma's prototyping shape. This
// normalises it and derives the CSS equivalent where one genuinely exists.

const EASING_CSS: { [k: string]: string } = {
  LINEAR: "linear",
  EASE_IN: "cubic-bezier(0.42, 0, 1, 1)",
  EASE_OUT: "cubic-bezier(0, 0, 0.58, 1)",
  EASE_IN_AND_OUT: "cubic-bezier(0.42, 0, 0.58, 1)",
  EASE_IN_BACK: "cubic-bezier(0.3, -0.05, 0.7, -0.5)",
  EASE_OUT_BACK: "cubic-bezier(0.45, 1.45, 0.8, 1)",
  EASE_IN_AND_OUT_BACK: "cubic-bezier(0.7, -0.4, 0.4, 1.4)",
};

function serializeEasing(easing: Easing | undefined): unknown {
  if (!easing) return undefined;
  const out: { [k: string]: unknown } = { type: easing.type };
  const bez = easing.easingFunctionCubicBezier;
  const spring = easing.easingFunctionSpring;

  if (easing.type === "CUSTOM_CUBIC_BEZIER" && bez) {
    out.cubicBezier = { x1: bez.x1, y1: bez.y1, x2: bez.x2, y2: bez.y2 };
    out.css = `cubic-bezier(${bez.x1}, ${bez.y1}, ${bez.x2}, ${bez.y2})`;
  } else if (spring) {
    // Springs have no CSS timing-function equivalent. Emit the physical
    // parameters and say plainly that CSS cannot express it.
    out.spring = {
      mass: spring.mass,
      stiffness: spring.stiffness,
      damping: spring.damping,
      initialVelocity: spring.initialVelocity,
    };
    out.css = null;
    out.note = "spring — no CSS timing-function equivalent; use a spring library";
  } else if (EASING_CSS[easing.type]) {
    out.css = EASING_CSS[easing.type];
  }
  return out;
}

function serializeTransition(tr: Transition | null | undefined): unknown {
  if (!tr) return undefined;
  const out: { [k: string]: unknown } = {
    type: tr.type,
    durationMs: Math.round(tr.duration * 1000),
    easing: serializeEasing(tr.easing),
  };
  if ("direction" in tr) {
    out.direction = (tr as DirectionalTransition).direction;
    out.matchLayers = (tr as DirectionalTransition).matchLayers;
  }
  return out;
}

function serializeMotion(node: SceneNode): unknown {
  const rx =
    "reactions" in node
      ? (node as unknown as { reactions: readonly Reaction[] }).reactions
      : undefined;

  const flows: unknown[] = [];
  if (rx) {
    for (const r of rx) {
      const actions: Action[] = r.actions
        ? (r.actions as Action[])
        : r.action
          ? [r.action as Action]
          : [];
      flows.push({
        trigger: r.trigger ? (r.trigger as unknown) : null,
        actions: actions.map((a) => {
          const out: { [k: string]: unknown } = { type: a.type };
          const any = a as unknown as {
            destinationId?: string | null;
            navigation?: string;
            transition?: Transition | null;
            preserveScrollPosition?: boolean;
            url?: string;
            mediaAction?: string;
          };
          if (any.destinationId !== undefined) out.destinationId = any.destinationId;
          if (any.navigation !== undefined) out.navigation = any.navigation;
          if (any.url !== undefined) out.url = any.url;
          if (any.mediaAction !== undefined) out.mediaAction = any.mediaAction;
          if (any.preserveScrollPosition !== undefined) {
            out.preserveScrollPosition = any.preserveScrollPosition;
          }
          const tr = serializeTransition(any.transition);
          if (tr) out.transition = tr;
          return out;
        }),
      });
    }
  }

  const transitionNode = node as unknown as {
    transitionNodeID?: string | null;
    transitionDuration?: number | null;
    transitionEasing?: Easing | null;
  };

  return {
    nodeId: node.id,
    name: node.name,
    type: node.type,
    reactions: flows,
    // Legacy single-transition fields, still set on older prototypes.
    legacyTransition:
      transitionNode.transitionNodeID || transitionNode.transitionDuration
        ? {
            destinationId: transitionNode.transitionNodeID,
            durationMs:
              typeof transitionNode.transitionDuration === "number"
                ? Math.round(transitionNode.transitionDuration * 1000)
                : null,
            easing: serializeEasing(transitionNode.transitionEasing || undefined),
          }
        : undefined,
    hasMotion: flows.length > 0,
  };
}

// Walk a subtree and return motion for every node that actually has some, so a
// caller can ask one question ("what animates in this section?") instead of
// probing node by node.
function collectMotion(root: SceneNode, depth: number): unknown[] {
  const out: unknown[] = [];
  const visit = (n: SceneNode, d: number): void => {
    const m = serializeMotion(n) as { hasMotion?: boolean };
    if (m.hasMotion) out.push(m);
    if (d <= 0) return;
    const kids = (n as unknown as { children?: readonly SceneNode[] }).children;
    if (kids) for (const c of kids) visit(c, d - 1);
  };
  visit(root, depth);
  return out;
}

// ── Variables / styles resolution ─────────────────────────────────────────────

const varNameCache: { [id: string]: string } = {};
const styleNameCache: { [id: string]: string } = {};

async function variableName(id: string): Promise<string> {
  if (varNameCache[id] !== undefined) return varNameCache[id];
  let name = id;
  try {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) name = v.name;
  } catch (_err) {
    // Unresolvable (e.g. an unpublished remote variable) — keep the raw id.
  }
  varNameCache[id] = name;
  return name;
}

async function styleName(id: string): Promise<string | undefined> {
  if (!id) return undefined;
  if (styleNameCache[id] !== undefined) return styleNameCache[id];
  let name = id;
  try {
    const s = await figma.getStyleByIdAsync(id);
    if (s) name = s.name;
  } catch (_err) {
    // Keep the raw id.
  }
  styleNameCache[id] = name;
  return name;
}

function isAlias(v: unknown): v is VariableAlias {
  return !!v && typeof v === "object" && (v as VariableAlias).type === "VARIABLE_ALIAS";
}

async function serializeTokens(node: SceneNode): Promise<SerializedNode["tokens"]> {
  const bound = (node as unknown as { boundVariables?: { [k: string]: unknown } }).boundVariables;
  if (!bound) return undefined;

  const out: { [field: string]: string | string[] } = {};
  for (const field of Object.keys(bound)) {
    const value = bound[field];
    if (isAlias(value)) {
      out[field] = await variableName(value.id);
    } else if (Array.isArray(value)) {
      const names: string[] = [];
      for (const entry of value) {
        if (isAlias(entry)) names.push(await variableName(entry.id));
      }
      if (names.length) out[field] = names;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

// Variables Figma *infers* would fit a hardcoded value — useful for telling the
// implementer "this #703BF7 is really color/purple/60".
async function serializeInferredTokens(node: SceneNode): Promise<SerializedNode["inferredTokens"]> {
  const inferred = (node as unknown as { inferredVariables?: { [k: string]: unknown } }).inferredVariables;
  if (!inferred) return undefined;

  const out: { [field: string]: string[] } = {};
  for (const field of Object.keys(inferred)) {
    const value = inferred[field];
    const names: string[] = [];
    const visit = (v: unknown): void => {
      if (isAlias(v)) names.push(v.id);
      else if (Array.isArray(v)) v.forEach(visit);
    };
    visit(value);
    if (names.length) {
      const resolved: string[] = [];
      for (const id of names) resolved.push(await variableName(id));
      out[field] = resolved;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

async function formatVariableValue(
  raw: VariableValue | undefined,
  type: VariableResolvedDataType
): Promise<unknown> {
  if (isAlias(raw)) return `{${await variableName(raw.id)}}`;
  if (type === "COLOR" && raw && typeof raw === "object" && "r" in raw) {
    return colorToCss(raw as RGB | RGBA);
  }
  return raw;
}

async function collectVariables(): Promise<unknown[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const out: unknown[] = [];

  for (const collection of collections) {
    const variables: unknown[] = [];
    for (const id of collection.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (!v) continue;
      const values: { [mode: string]: unknown } = {};
      for (const mode of collection.modes) {
        values[mode.name] = await formatVariableValue(v.valuesByMode[mode.modeId], v.resolvedType);
      }
      variables.push({
        id: v.id,
        name: v.name,
        type: v.resolvedType,
        scopes: v.scopes,
        description: v.description,
        values,
      });
    }
    out.push({
      id: collection.id,
      name: collection.name,
      modes: collection.modes.map((m) => m.name),
      defaultMode: collection.modes.length ? collection.modes[0].name : null,
      variables,
    });
  }

  return out;
}

// Local paint/text/effect/grid styles — the pre-variables half of a design system.
async function collectStyles(): Promise<unknown> {
  const paints = await figma.getLocalPaintStylesAsync();
  const texts = await figma.getLocalTextStylesAsync();
  const effects = await figma.getLocalEffectStylesAsync();
  const grids = await figma.getLocalGridStylesAsync();

  return {
    paint: paints.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      paints: s.paints.map(serializePaint),
    })),
    text: texts.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      fontFamily: s.fontName.family,
      fontStyle: s.fontName.style,
      fontSize: s.fontSize,
      lineHeight: lineHeightToCss(s.lineHeight),
      letterSpacing: letterSpacingToCss(s.letterSpacing),
      textCase: s.textCase,
      textDecoration: s.textDecoration,
      paragraphSpacing: s.paragraphSpacing,
      paragraphIndent: s.paragraphIndent,
    })),
    effect: effects.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      effects: s.effects.map(serializeEffect),
    })),
    grid: grids.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      layoutGrids: s.layoutGrids,
    })),
  };
}

// ── Text ──────────────────────────────────────────────────────────────────────

function unmix<T>(value: T | symbol): T | Mixed {
  return value === figma.mixed ? "MIXED" : (value as T);
}

function lineHeightToCss(lh: LineHeight | symbol): string | Mixed {
  if (lh === figma.mixed) return "MIXED";
  const v = lh as LineHeight;
  if (v.unit === "AUTO") return "normal";
  if (v.unit === "PERCENT") return `${Number(v.value.toFixed(2))}%`;
  return `${Number(v.value.toFixed(2))}px`;
}

function letterSpacingToCss(ls: LetterSpacing | symbol): string | Mixed {
  if (ls === figma.mixed) return "MIXED";
  const v = ls as LetterSpacing;
  if (v.unit === "PERCENT") return `${Number(v.value.toFixed(2))}%`;
  return `${Number(v.value.toFixed(3))}px`;
}

function serializeText(node: TextNode): SerializedText {
  const font = unmix<FontName>(node.fontName);
  const out: SerializedText = {
    characters: node.characters,
    fontFamily: font === "MIXED" ? "MIXED" : font.family,
    fontStyle: font === "MIXED" ? "MIXED" : font.style,
    fontWeight: unmix<number>(node.fontWeight),
    fontSize: unmix<number>(node.fontSize),
    lineHeight: lineHeightToCss(node.lineHeight),
    letterSpacing: letterSpacingToCss(node.letterSpacing),
    textCase: unmix<string>(node.textCase),
    textDecoration: unmix<string>(node.textDecoration),
    textAlignHorizontal: node.textAlignHorizontal,
    textAlignVertical: node.textAlignVertical,
    textAutoResize: node.textAutoResize,
    textTruncation: node.textTruncation,
    maxLines: node.maxLines,
    paragraphSpacing: unmix<number>(node.paragraphSpacing),
    paragraphIndent: unmix<number>(node.paragraphIndent),
  };

  try {
    const link = unmix<unknown>(node.hyperlink as unknown as symbol);
    if (link) out.hyperlink = link;
  } catch (_err) {
    // Ignore — hyperlink is optional.
  }

  // Mixed styling means one text node maps to several CSS rules — expose the
  // per-range detail so nothing is guessed from a flattened value.
  const isMixedAnywhere =
    out.fontFamily === "MIXED" ||
    out.fontSize === "MIXED" ||
    out.fontWeight === "MIXED" ||
    out.lineHeight === "MIXED" ||
    out.letterSpacing === "MIXED" ||
    out.textCase === "MIXED" ||
    out.textDecoration === "MIXED";

  if (isMixedAnywhere) {
    try {
      out.segments = node
        .getStyledTextSegments([
          "fontName",
          "fontSize",
          "fontWeight",
          "lineHeight",
          "letterSpacing",
          "textCase",
          "textDecoration",
          "fills",
        ])
        .map((s) => ({
          characters: s.characters,
          start: s.start,
          end: s.end,
          fontFamily: s.fontName.family,
          fontStyle: s.fontName.style,
          fontWeight: s.fontWeight,
          fontSize: s.fontSize,
          lineHeight: lineHeightToCss(s.lineHeight),
          letterSpacing: letterSpacingToCss(s.letterSpacing),
          textCase: s.textCase,
          textDecoration: s.textDecoration,
          fills: Array.isArray(s.fills) ? s.fills.map(serializePaint) : undefined,
        }));
    } catch (err) {
      console.error("getStyledTextSegments failed:", err);
    }
  }

  return out;
}

// ── Node serialisation ────────────────────────────────────────────────────────

// getCSSAsync is a round-trip per node; cap it so a pathologically large page
// still syncs. Structured fields are always captured regardless.
const MAX_CSS_NODES = 6000;
let cssBudget = MAX_CSS_NODES;
let cssSkipped = 0;

// When false, per-node round-trips (getCSSAsync, getMainComponentAsync) are
// skipped. Set per sync based on page size; always true for on-demand requests.
let deepMode = true;

// A large page takes a while (one getCSSAsync round-trip per node), so heartbeat
// to the UI — otherwise a slow sync is indistinguishable from a hung one.
let nodesSeen = 0;
let reportTree = false;

function progress(stage: string, detail?: string | number): void {
  figma.ui.postMessage({ type: "SYNC_PROGRESS", stage, detail });
}

async function serializeNode(node: SceneNode, depth?: number): Promise<SerializedNode> {
  if (reportTree) {
    nodesSeen++;
    if (nodesSeen % 200 === 0) progress("tree", nodesSeen);
  }

  const layoutish = node as unknown as LayoutMixin;

  const out: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: "visible" in node ? node.visible : true,
    x: "x" in node ? layoutish.x : 0,
    y: "y" in node ? layoutish.y : 0,
    width: "width" in node ? layoutish.width : 0,
    height: "height" in node ? layoutish.height : 0,
  };

  if ("locked" in node && node.locked) out.locked = true;

  // x/y are parent-relative; absolute coords let consumers measure across nesting.
  if ("absoluteBoundingBox" in node) {
    const box = (node as unknown as { absoluteBoundingBox: Rect | null }).absoluteBoundingBox;
    if (box) out.absolute = { x: box.x, y: box.y, width: box.width, height: box.height };
  }
  if ("rotation" in node) out.rotation = Number(layoutish.rotation.toFixed(4));
  if ("opacity" in node) out.opacity = (node as unknown as { opacity: number }).opacity;
  if ("blendMode" in node) out.blendMode = (node as unknown as { blendMode: string }).blendMode;
  if ("clipsContent" in node) out.clipsContent = (node as unknown as { clipsContent: boolean }).clipsContent;
  if ("isAsset" in node) out.isAsset = (node as unknown as { isAsset: boolean }).isAsset;
  if ("isMask" in node && (node as unknown as { isMask: boolean }).isMask) out.isMask = true;

  // Figma's own inspect-panel CSS — authoritative for gradients/shadows/type.
  if (deepMode && typeof (node as unknown as { getCSSAsync?: unknown }).getCSSAsync === "function") {
    if (cssBudget > 0) {
      cssBudget--;
      try {
        out.css = await (node as unknown as { getCSSAsync: () => Promise<{ [k: string]: string }> }).getCSSAsync();
      } catch (err) {
        console.error(`getCSSAsync failed for "${node.name}":`, err);
      }
    } else {
      cssSkipped++;
    }
  }

  // Auto-layout → flexbox. The single biggest source of spacing drift when absent.
  if ("layoutMode" in node) {
    const f = node as unknown as FrameNode;
    const layout: SerializedLayout = { mode: f.layoutMode };
    if (f.layoutMode !== "NONE") {
      layout.wrap = f.layoutWrap;
      layout.itemSpacing = f.itemSpacing;
      layout.counterAxisSpacing = f.counterAxisSpacing;
      layout.padding = {
        top: f.paddingTop,
        right: f.paddingRight,
        bottom: f.paddingBottom,
        left: f.paddingLeft,
      };
      layout.primaryAxisAlign = f.primaryAxisAlignItems;
      layout.counterAxisAlign = f.counterAxisAlignItems;
      layout.primaryAxisSizing = f.primaryAxisSizingMode;
      layout.counterAxisSizing = f.counterAxisSizingMode;
      layout.itemReverseZIndex = f.itemReverseZIndex;
    }
    out.layout = layout;
  }

  // Fixed vs fill vs hug — decides width/flex-grow in the implementation.
  const sizing: NonNullable<SerializedNode["sizing"]> = {};
  const sz = node as unknown as {
    layoutSizingHorizontal?: string;
    layoutSizingVertical?: string;
    layoutAlign?: string;
    layoutGrow?: number;
    layoutPositioning?: string;
    constraints?: Constraints;
    minWidth?: number | null;
    maxWidth?: number | null;
    minHeight?: number | null;
    maxHeight?: number | null;
    targetAspectRatio?: { x: number; y: number } | null;
  };
  if ("layoutSizingHorizontal" in node) sizing.layoutSizingHorizontal = sz.layoutSizingHorizontal;
  if ("layoutSizingVertical" in node) sizing.layoutSizingVertical = sz.layoutSizingVertical;
  if ("layoutAlign" in node) sizing.layoutAlign = sz.layoutAlign;
  if ("layoutGrow" in node) sizing.layoutGrow = sz.layoutGrow;
  if ("layoutPositioning" in node) sizing.layoutPositioning = sz.layoutPositioning;
  if ("constraints" in node && sz.constraints) {
    sizing.constraints = { horizontal: sz.constraints.horizontal, vertical: sz.constraints.vertical };
  }
  if ("minWidth" in node) sizing.minWidth = sz.minWidth;
  if ("maxWidth" in node) sizing.maxWidth = sz.maxWidth;
  if ("minHeight" in node) sizing.minHeight = sz.minHeight;
  if ("maxHeight" in node) sizing.maxHeight = sz.maxHeight;
  if ("targetAspectRatio" in node && sz.targetAspectRatio) {
    sizing.aspectRatio = Number((sz.targetAspectRatio.x / sz.targetAspectRatio.y).toFixed(4));
  }
  if (Object.keys(sizing).length) out.sizing = sizing;

  // Paint
  if ("fills" in node) {
    const fills = (node as unknown as { fills: readonly Paint[] | symbol }).fills;
    out.fills = fills === figma.mixed ? "MIXED" : (fills as readonly Paint[]).map(serializePaint);
  }
  if ("strokes" in node) {
    const strokes = (node as unknown as { strokes: readonly Paint[] }).strokes;
    if (strokes && strokes.length) out.strokes = strokes.map(serializePaint);
  }
  if ("strokeWeight" in node) {
    out.strokeWeight = unmix<number>((node as unknown as { strokeWeight: number | symbol }).strokeWeight);
  }
  if ("strokeAlign" in node) out.strokeAlign = (node as unknown as { strokeAlign: string }).strokeAlign;
  if ("strokeCap" in node) {
    out.strokeCap = unmix<string>((node as unknown as { strokeCap: string | symbol }).strokeCap);
  }
  if ("strokeJoin" in node) {
    out.strokeJoin = unmix<string>((node as unknown as { strokeJoin: string | symbol }).strokeJoin);
  }
  if ("strokeTopWeight" in node) {
    const s = node as unknown as {
      strokeTopWeight: number;
      strokeRightWeight: number;
      strokeBottomWeight: number;
      strokeLeftWeight: number;
    };
    out.strokeSides = {
      top: s.strokeTopWeight,
      right: s.strokeRightWeight,
      bottom: s.strokeBottomWeight,
      left: s.strokeLeftWeight,
    };
  }
  if ("dashPattern" in node) {
    const dp = (node as unknown as { dashPattern: readonly number[] }).dashPattern;
    if (dp && dp.length) out.dashPattern = dp;
  }

  // Corner radius (uniform or per-corner)
  if ("cornerRadius" in node) {
    const cr = (node as unknown as { cornerRadius: number | symbol }).cornerRadius;
    if (cr === figma.mixed) {
      const c = node as unknown as {
        topLeftRadius: number;
        topRightRadius: number;
        bottomRightRadius: number;
        bottomLeftRadius: number;
      };
      out.cornerRadius = {
        topLeft: c.topLeftRadius,
        topRight: c.topRightRadius,
        bottomRight: c.bottomRightRadius,
        bottomLeft: c.bottomLeftRadius,
      };
    } else if (typeof cr === "number") {
      out.cornerRadius = cr;
    }
  }
  if ("cornerSmoothing" in node) {
    const cs = (node as unknown as { cornerSmoothing: number }).cornerSmoothing;
    if (cs) out.cornerSmoothing = cs;
  }

  if ("effects" in node) {
    const effects = (node as unknown as { effects: readonly Effect[] }).effects;
    if (effects && effects.length) out.effects = effects.map(serializeEffect);
  }

  if ("layoutGrids" in node) {
    const grids = (node as unknown as { layoutGrids: readonly LayoutGrid[] }).layoutGrids;
    if (grids && grids.length) out.layoutGrids = grids.map((g) => g);
  }

  if ("exportSettings" in node) {
    const es = (node as unknown as { exportSettings: readonly ExportSettings[] }).exportSettings;
    if (es && es.length) out.exportSettings = es.map((s) => s);
  }

  // Style bindings — "this uses text style Heading/H2", not "16px semibold".
  const styleRefs: NonNullable<SerializedNode["styles"]> = {};
  const sref = node as unknown as {
    fillStyleId?: string | symbol;
    strokeStyleId?: string;
    textStyleId?: string | symbol;
    effectStyleId?: string;
    gridStyleId?: string;
  };
  if ("fillStyleId" in node && typeof sref.fillStyleId === "string" && sref.fillStyleId) {
    styleRefs.fill = await styleName(sref.fillStyleId);
  }
  if ("strokeStyleId" in node && sref.strokeStyleId) styleRefs.stroke = await styleName(sref.strokeStyleId);
  if ("textStyleId" in node && typeof sref.textStyleId === "string" && sref.textStyleId) {
    styleRefs.text = await styleName(sref.textStyleId);
  }
  if ("effectStyleId" in node && sref.effectStyleId) styleRefs.effect = await styleName(sref.effectStyleId);
  if ("gridStyleId" in node && sref.gridStyleId) styleRefs.grid = await styleName(sref.gridStyleId);
  if (Object.keys(styleRefs).length) out.styles = styleRefs;

  if (node.type === "TEXT") out.text = serializeText(node as TextNode);

  if ("vectorPaths" in node) {
    const vp = (node as unknown as { vectorPaths: readonly VectorPath[] }).vectorPaths;
    if (vp && vp.length) {
      out.vectorPaths = vp.map((p) => ({ windingRule: String(p.windingRule), data: p.data }));
    }
  }

  // Component identity — tells the implementer "this is <Button variant=primary>",
  // not "this is a rounded rectangle with a label".
  if (node.type === "INSTANCE") {
    const inst = node as InstanceNode;
    let mainName: string | null = null;
    let mainId: string | null = null;
    let mainKey: string | undefined;
    let description: string | undefined;
    try {
      // One round-trip per instance — too slow across a whole large page.
      const main = deepMode ? await inst.getMainComponentAsync() : null;
      if (main) {
        mainName = main.name;
        mainId = main.id;
        mainKey = main.key;
        description = main.description;
        // Prefer the component-set name for variants (e.g. "Button", not "Type=Primary").
        if (main.parent && main.parent.type === "COMPONENT_SET") {
          mainName = `${main.parent.name}/${main.name}`;
        }
      }
    } catch (err) {
      console.error(`getMainComponentAsync failed for "${node.name}":`, err);
    }
    out.component = {
      kind: "INSTANCE",
      mainComponent: mainName,
      mainComponentId: mainId,
      key: mainKey,
      description,
      properties: inst.componentProperties,
      variantProperties: inst.variantProperties,
      overrides: inst.overrides,
    };
  } else if (node.type === "COMPONENT") {
    const c = node as ComponentNode;
    out.component = {
      kind: "COMPONENT",
      key: c.key,
      description: c.description,
      variantProperties: c.variantProperties,
      propertyDefinitions: c.componentPropertyDefinitions,
    };
  } else if (node.type === "COMPONENT_SET") {
    const cs = node as ComponentSetNode;
    out.component = {
      kind: "COMPONENT_SET",
      key: cs.key,
      description: cs.description,
      propertyDefinitions: cs.componentPropertyDefinitions,
    };
  }

  const tokens = await serializeTokens(node);
  if (tokens) out.tokens = tokens;
  const inferredTokens = await serializeInferredTokens(node);
  if (inferredTokens) out.inferredTokens = inferredTokens;

  // Dev-mode annotations — the designer's explicit spec notes.
  if ("annotations" in node) {
    const ann = (node as unknown as { annotations: readonly Annotation[] }).annotations;
    if (ann && ann.length) out.annotations = ann.map((a) => a);
  }

  // Prototype interactions — hover/click states an implementer must build.
  if ("reactions" in node) {
    const rx = (node as unknown as { reactions: readonly Reaction[] }).reactions;
    if (rx && rx.length) out.reactions = rx.map((r) => r);
  }

  if ("children" in node && (depth === undefined || depth > 0)) {
    const kids = (node as unknown as ChildrenMixin).children;
    const serialized: SerializedNode[] = [];
    for (const child of kids) {
      serialized.push(await serializeNode(child, depth === undefined ? undefined : depth - 1));
    }
    out.children = serialized;
  }

  return out;
}

// Lightweight structure map — parity with the MCP's get_metadata.
function serializeMetadata(node: SceneNode, depth: number): unknown {
  const layoutish = node as unknown as LayoutMixin;
  const box = "absoluteBoundingBox" in node
    ? (node as unknown as { absoluteBoundingBox: Rect | null }).absoluteBoundingBox
    : null;

  const out: { [k: string]: unknown } = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: "visible" in node ? node.visible : true,
    x: box ? box.x : "x" in node ? layoutish.x : 0,
    y: box ? box.y : "y" in node ? layoutish.y : 0,
    width: "width" in node ? Math.round(layoutish.width) : 0,
    height: "height" in node ? Math.round(layoutish.height) : 0,
  };

  if (node.type === "TEXT") {
    const chars = (node as TextNode).characters;
    out.text = chars.length > 80 ? `${chars.slice(0, 80)}…` : chars;
  }

  if ("children" in node && depth > 0) {
    out.children = (node as unknown as ChildrenMixin).children.map((c) => serializeMetadata(c, depth - 1));
  }

  return out;
}

// ── Collectors used by on-demand jobs ─────────────────────────────────────────

function pageList(): unknown[] {
  return figma.root.children.map((p) => {
    // documentAccess: "dynamic-page" — reading .children of a page that hasn't
    // been loaded throws, so childCount is only reported for the current page.
    let childCount: number | null = null;
    if (p.id === figma.currentPage.id) {
      try {
        childCount = p.children.length;
      } catch (_err) {
        childCount = null;
      }
    }
    return { id: p.id, name: p.name, isCurrent: p.id === figma.currentPage.id, childCount };
  });
}

// Component inventory across the whole document — parity with search_design_system.
async function collectComponents(): Promise<unknown[]> {
  await figma.loadAllPagesAsync();
  const out: unknown[] = [];

  for (const page of figma.root.children) {
    const found = page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] });
    for (const node of found) {
      // Variants are reported via their parent set to avoid duplicate noise.
      if (node.type === "COMPONENT" && node.parent && node.parent.type === "COMPONENT_SET") continue;

      const entry: { [k: string]: unknown } = {
        id: node.id,
        name: node.name,
        type: node.type,
        key: node.key,
        description: node.description,
        page: page.name,
        pageId: page.id,
        width: Math.round(node.width),
        height: Math.round(node.height),
        screenshotUrl: `http://localhost:47291/api/node/${node.id}/screenshot`,
        contextUrl: `http://localhost:47291/api/node/${node.id}/context`,
      };

      if (node.type === "COMPONENT_SET") {
        entry.propertyDefinitions = node.componentPropertyDefinitions;
        entry.variants = node.children.map((v) => ({
          id: v.id,
          name: v.name,
          variantProperties: (v as ComponentNode).variantProperties,
        }));
      } else {
        entry.propertyDefinitions = (node as ComponentNode).componentPropertyDefinitions;
      }

      out.push(entry);
    }
  }

  return out;
}

async function collectAnnotations(): Promise<unknown> {
  const annotated: unknown[] = [];
  const nodes = figma.currentPage.findAll(() => true);

  for (const node of nodes) {
    if ("annotations" in node) {
      const ann = (node as unknown as { annotations: readonly Annotation[] }).annotations;
      if (ann && ann.length) {
        annotated.push({ nodeId: node.id, name: node.name, type: node.type, annotations: ann.map((a) => a) });
      }
    }
  }

  let devResources: unknown[] = [];
  try {
    devResources = await figma.currentPage.getDevResourcesAsync({ includeChildren: true });
  } catch (_err) {
    // Dev resources need Dev Mode access — absent is fine.
  }

  return { page: figma.currentPage.name, annotated, devResources };
}

function collectText(): unknown[] {
  return figma.currentPage
    .findAllWithCriteria({ types: ["TEXT"] })
    .map((t) => ({
      id: t.id,
      name: t.name,
      characters: t.characters,
      fontFamily: t.fontName === figma.mixed ? "MIXED" : (t.fontName as FontName).family,
      fontSize: unmix<number>(t.fontSize),
      width: Math.round(t.width),
      height: Math.round(t.height),
    }));
}

// Every asset-like descendant, exported in one round-trip — parity with download_assets.
async function collectAssets(
  root: SceneNode,
  format: "PNG" | "SVG",
  scale: number
): Promise<unknown[]> {
  const candidates: SceneNode[] = [];
  const visit = (node: SceneNode): void => {
    const isAsset = "isAsset" in node && (node as unknown as { isAsset: boolean }).isAsset;
    const isVector = node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION" || node.type === "STAR" ||
      node.type === "LINE" || node.type === "POLYGON";
    const hasImageFill =
      "fills" in node &&
      node.fills !== figma.mixed &&
      (node.fills as readonly Paint[]).some((f) => f.type === "IMAGE" && f.visible !== false);

    if (isAsset || isVector || hasImageFill) {
      candidates.push(node);
      return; // Don't descend into an asset — export it whole.
    }
    if ("children" in node) {
      (node as unknown as ChildrenMixin).children.forEach(visit);
    }
  };
  visit(root);

  const results: unknown[] = [];
  for (const node of candidates) {
    try {
      const hasImageFill =
        "fills" in node &&
        node.fills !== figma.mixed &&
        (node.fills as readonly Paint[]).some((f) => f.type === "IMAGE" && f.visible !== false);
      // Raster content must stay raster; vectors default to the requested format.
      const useFormat: "PNG" | "SVG" = hasImageFill ? "PNG" : format;
      const settings =
        useFormat === "PNG"
          ? { format: "PNG" as const, constraint: { type: "SCALE" as const, value: scale } }
          : { format: "SVG" as const };
      const bytes = await (node as SceneNode & { exportAsync: (s: ExportSettings) => Promise<Uint8Array> }).exportAsync(settings);
      results.push({
        nodeId: node.id,
        name: node.name,
        type: node.type,
        format: useFormat,
        width: Math.round(node.width),
        height: Math.round(node.height),
        bytes: Array.from(bytes as Uint8Array),
      });
    } catch (err) {
      results.push({ nodeId: node.id, name: node.name, error: String(err) });
    }
  }

  return results;
}

async function imageBytes(hash: string): Promise<number[]> {
  const image = figma.getImageByHash(hash);
  if (!image) throw new Error(`No image for hash ${hash}`);
  const bytes = await image.getBytesAsync();
  return Array.from(bytes);
}

// ── Initial sync ──────────────────────────────────────────────────────────────

function countNodes(root: BaseNode): number {
  let n = 0;
  const stack: BaseNode[] = [root];
  while (stack.length) {
    const cur = stack.pop() as BaseNode;
    n++;
    if ("children" in cur) {
      for (const kid of (cur as unknown as ChildrenMixin).children) stack.push(kid);
    }
  }
  return n;
}

// The UI acks each batch after its POST lands, so the plugin can't queue up
// thousands of unsent messages and blow the VM's memory a second way.
let ackResolve: (() => void) | null = null;

function waitForAck(): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    ackResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    // Don't deadlock the whole sync if an ack goes missing.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        ackResolve = null;
        resolve();
      }
    }, 30_000);
  });
}

async function exportDesignData(): Promise<void> {
  const page = figma.currentPage;

  cssBudget = MAX_CSS_NODES;
  cssSkipped = 0;
  nodesSeen = 0;
  reportTree = false;

  progress("start", page.name);

  const total = countNodes(page);
  deepMode = total <= DEEP_SYNC_NODE_LIMIT;
  progress("counted", total);

  progress("variables");
  const variables = await collectVariables();
  progress("styles");
  const styles = await collectStyles();

  figma.ui.postMessage({
    type: "SYNC_BEGIN",
    variables,
    styles,
    pages: pageList(),
    meta: {
      fileKey: figma.fileKey,
      fileName: figma.root.name,
      pageId: page.id,
      pageName: page.name,
      colorProfile: figma.root.documentColorProfile,
      nodeCount: total,
      deepMode,
      pngScale: 2,
      build: BUILD,
    },
  });
  await waitForAck();

  // Flat depth-first walk: each node carries parentId + order, and the server
  // rebuilds the hierarchy. Keeps every message small and bounded.
  let sent = 0;
  let batch: SerializedNode[] = [];
  const stack: { node: BaseNode; parentId: string | null; order: number }[] = [
    { node: page, parentId: null, order: 0 },
  ];

  while (stack.length) {
    const item = stack.pop() as { node: BaseNode; parentId: string | null; order: number };
    const serialized = await serializeNode(item.node as unknown as SceneNode, 0);
    serialized.parentId = item.parentId;
    serialized.order = item.order;
    batch.push(serialized);

    if ("children" in item.node) {
      const kids = (item.node as unknown as ChildrenMixin).children;
      // Push in reverse so the stack pops them in document order.
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push({ node: kids[i], parentId: item.node.id, order: i });
      }
    }

    if (batch.length >= NODE_BATCH_SIZE) {
      figma.ui.postMessage({ type: "SYNC_NODES", batch });
      sent += batch.length;
      progress("nodes", `${sent}/${total}`);
      batch = [];
      await waitForAck();
    }
  }

  if (batch.length) {
    figma.ui.postMessage({ type: "SYNC_NODES", batch });
    sent += batch.length;
    progress("nodes", `${sent}/${total}`);
    await waitForAck();
  }

  if (cssSkipped > 0) {
    console.warn(`getCSSAsync skipped for ${cssSkipped} nodes (budget ${MAX_CSS_NODES} exhausted).`);
  }

  // Screenshots go one per message as base64 — a 2x PNG as number[] is millions
  // of array entries, which is what killed the previous payload.
  const frames = page.children.filter(
    (c) => c.type === "FRAME" || c.type === "COMPONENT" || c.type === "COMPONENT_SET"
  );
  let shots = 0;
  for (const child of frames) {
    progress("screenshots", `${shots + 1}/${frames.length}`);
    let scale = 2;
    let encoded: string | null = null;
    for (let attempt = 0; attempt < 2 && encoded === null; attempt++) {
      try {
        const bytes = await child.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: scale },
        });
        encoded = figma.base64Encode(bytes);
      } catch (err) {
        console.error(`PNG export failed for "${child.name}" at ${scale}x:`, err);
        scale = 1; // Retry once smaller — huge frames can exceed the export limit.
      }
    }
    if (encoded === null) continue;

    figma.ui.postMessage({
      type: "SYNC_SHOT",
      id: child.id,
      name: child.name,
      scale,
      base64: encoded,
    });
    shots++;
    await waitForAck();
  }

  figma.ui.postMessage({
    type: "SYNC_END",
    nodes: sent,
    screenshots: shots,
    deepMode,
    cssSkipped,
  });
}

// ── Shaders ───────────────────────────────────────────────────────────────────

async function collectShaders(): Promise<unknown> {
  const api = figma as unknown as {
    listAvailableShaders?: () => Promise<
      readonly {
        id: string;
        name: string;
        type: string;
        imported: boolean;
        propertyDefinitions?: unknown;
      }[]
    >;
  };
  if (!api.listAvailableShaders) {
    return { available: false, reason: "This Figma build does not expose listAvailableShaders" };
  }
  const list = await api.listAvailableShaders();
  const fills: unknown[] = [];
  const effects: unknown[] = [];
  for (const s of list) {
    const row = {
      id: s.id,
      name: s.name,
      type: s.type,
      imported: s.imported,
      propertyDefinitions: s.propertyDefinitions,
    };
    if (s.type === "fill") fills.push(row);
    else effects.push(row);
  }
  return { available: true, count: list.length, fills, effects };
}

async function importShader(id: string): Promise<unknown> {
  const api = figma as unknown as { importShaderById?: (id: string) => Promise<unknown> };
  if (!api.importShaderById) {
    throw new Error("This Figma build does not expose importShaderById");
  }
  return api.importShaderById(id);
}

// ── Libraries ─────────────────────────────────────────────────────────────────
// teamLibrary only exposes variable collections; published components and styles
// are not enumerable from a plugin. Say that explicitly rather than returning a
// half-empty object that reads as "this file has no library components".

async function collectLibraries(includeVariables: boolean): Promise<unknown> {
  type TeamLib = {
    getAvailableLibraryVariableCollectionsAsync: () => Promise<
      readonly { name: string; key: string; libraryName: string }[]
    >;
    getVariablesInLibraryCollectionAsync: (
      key: string,
    ) => Promise<readonly { key: string; name: string; resolvedType: string }[]>;
  };

  // Same trap as currentUser: the *getter* throws when manifest.json lacks
  // permissions:["teamlibrary"], so this has to be guarded, not null-checked.
  let tl: TeamLib | undefined;
  try {
    tl = (figma as unknown as { teamLibrary?: TeamLib }).teamLibrary;
  } catch (err) {
    return { available: false, reason: String(err) };
  }

  if (!tl) return { available: false, reason: "teamLibrary API unavailable" };

  let cols: readonly { name: string; key: string; libraryName: string }[] = [];
  try {
    cols = await tl.getAvailableLibraryVariableCollectionsAsync();
  } catch (err) {
    return {
      available: false,
      reason: `getAvailableLibraryVariableCollectionsAsync failed: ${String(err)}`,
    };
  }

  const collections: unknown[] = [];
  for (const c of cols) {
    const row: { [k: string]: unknown } = {
      name: c.name,
      key: c.key,
      libraryName: c.libraryName,
    };
    if (includeVariables) {
      try {
        const vars = await tl.getVariablesInLibraryCollectionAsync(c.key);
        row.variables = vars.map((v) => ({
          key: v.key,
          name: v.name,
          resolvedType: v.resolvedType,
        }));
      } catch (err) {
        row.variablesError = String(err);
      }
    }
    collections.push(row);
  }

  return {
    available: true,
    variableCollections: collections,
    notEnumerable: {
      components:
        "Published library components cannot be listed from a plugin. Use GET /api/components for components in this file, or importComponentByKeyAsync with a known key.",
      styles:
        "Published library styles cannot be listed from a plugin; GET /api/styles returns this file's local styles.",
    },
  };
}

// ── Identity ──────────────────────────────────────────────────────────────────

function whoAmI(): unknown {
  // figma.currentUser THROWS if manifest.json lacks permissions:["currentuser"].
  // Reading it must not take the whole response down — the file/page identity
  // below is still useful, and the reason is more actionable than a 504.
  let u: User | null = null;
  let userError: string | undefined;
  try {
    u = figma.currentUser;
  } catch (err) {
    userError = String(err);
  }
  return {
    user: u
      ? { id: u.id, name: u.name, photoUrl: u.photoUrl, color: u.color, sessionId: u.sessionId }
      : null,
    userError,
    file: { name: figma.root.name, key: figma.fileKey || null },
    currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
    editorType: figma.editorType,
    apiVersion: figma.apiVersion,
    pluginBuild: BUILD,
  };
}

// ── Mutation executor ─────────────────────────────────────────────────────────
// The Figma plugin sandbox is a custom JS VM with no `eval` / `new Function`, so
// the official `use_figma` contract — "send plain JavaScript, we run it against
// the Plugin API" — cannot be reproduced from a third-party plugin. Figma can do
// it because their MCP is first-party desktop-app code, not a plugin.
//
// This is the honest equivalent: a declared op vocabulary executed in order,
// with named refs threading each op's result into the next.
//
// Atomicity: on failure, properties written to pre-existing nodes are restored
// from a captured `before` value and every node this batch created is removed.
// That approximates "a failed script makes zero changes" — it is not a database
// transaction, and any restore that itself fails is reported in the log rather
// than swallowed.
//
// dryRun runs the batch for real and then rolls it back through that same path.
// Skipping the writes instead — the obvious implementation — is broken: a create
// op that produces no node leaves its `as` ref undefined, so every op that
// references it fails with "Unknown ref" and the validation reports errors that
// only exist because of the dry run. Executing then reverting is the only way to
// validate real property names against real node types.

type Op = {
  op: string;
  as?: string;
  target?: string;
  parent?: string;
  child?: string;
  index?: number;
  props?: { [k: string]: unknown };
  [k: string]: unknown;
};

type Undo = { node: SceneNode; prop: string; before: unknown };

const MUTATE_OPS = [
  "createFrame",
  "createRectangle",
  "createEllipse",
  "createText",
  "createLine",
  "createComponent",
  "createPage",
  "clone",
  "createInstance",
  "set",
  "resize",
  "append",
  "remove",
  "bindVariable",
  "loadFont",
  "createImage",
  "importShader",
  "setCurrentPage",
  "notify",
];

const TEXT_PROPS = [
  "characters",
  "fontName",
  "fontSize",
  "fontWeight",
  "textCase",
  "textDecoration",
  "letterSpacing",
  "lineHeight",
];

// Every text mutation must have its font loaded first, including the font the
// node currently uses and the one it is being changed to. A mixed-font node
// needs every segment's font.
async function ensureFontsFor(node: SceneNode, nextFont?: unknown): Promise<void> {
  if (node.type !== "TEXT") return;
  const text = node as TextNode;
  const fonts: FontName[] = [];
  const current = text.fontName;
  if (current === figma.mixed) {
    for (const seg of text.getStyledTextSegments(["fontName"])) fonts.push(seg.fontName);
  } else {
    fonts.push(current as FontName);
  }
  if (nextFont && typeof nextFont === "object") fonts.push(nextFont as FontName);
  for (const f of fonts) {
    try {
      await figma.loadFontAsync(f);
    } catch (err) {
      throw new Error(`loadFontAsync failed for ${f.family} ${f.style}: ${String(err)}`);
    }
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4) + 3);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean.charAt(i));
    const b = chars.indexOf(clean.charAt(i + 1));
    const c = chars.indexOf(clean.charAt(i + 2));
    const d = chars.indexOf(clean.charAt(i + 3));
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

async function applyOps(ops: Op[], dryRun: boolean): Promise<unknown> {
  const refs: { [name: string]: BaseNode } = {};
  const imageRefs: { [name: string]: string } = {};
  const created: SceneNode[] = [];
  const undo: Undo[] = [];
  const log: unknown[] = [];
  // setCurrentPage is a visible side effect that rollback has to undo too,
  // otherwise a failed or dry-run batch leaves the user on a different page.
  const startPage: PageNode | null = figma.currentPage;

  const resolve = async (ref: string | undefined): Promise<BaseNode> => {
    if (!ref) throw new Error("op requires a target/parent/child reference");
    if (ref === "$page") return figma.currentPage;
    if (ref === "$root") return figma.root;
    if (ref.charAt(0) === "$") {
      const r = refs[ref.slice(1)];
      if (!r) {
        throw new Error(`Unknown ref ${ref} — no earlier op declared "as": "${ref.slice(1)}"`);
      }
      return r;
    }
    const n = await figma.getNodeByIdAsync(ref);
    if (!n) throw new Error(`Node ${ref} not found`);
    return n;
  };

  const setProps = async (node: SceneNode, props: { [k: string]: unknown }): Promise<void> => {
    const isNew = created.indexOf(node) >= 0;
    const needsFont = Object.keys(props).some((k) => TEXT_PROPS.indexOf(k) >= 0);
    if (needsFont) await ensureFontsFor(node, props.fontName);

    for (const key of Object.keys(props)) {
      const holder = node as unknown as { [k: string]: unknown };
      // Fail on a typo instead of silently adding a property Figma ignores.
      if (!(key in holder)) throw new Error(`${node.type} has no property "${key}"`);
      if (!isNew) undo.push({ node, prop: key, before: holder[key] });
      holder[key] = props[key];
    }
  };

  // Shared by the failure path and by dryRun. Returns what it managed to undo so
  // the caller can report it instead of asserting a clean revert.
  const rollback = (): { propertiesRestored: number; nodesRemoved: number } => {
    let restored = 0;
    for (let k = undo.length - 1; k >= 0; k--) {
      const u = undo[k];
      try {
        if (u.prop === "__resize") {
          const box = u.before as { w: number; h: number };
          (u.node as unknown as { resize: (w: number, h: number) => void }).resize(box.w, box.h);
        } else {
          (u.node as unknown as { [k: string]: unknown })[u.prop] = u.before;
        }
        restored++;
      } catch (e) {
        log.push({ rollbackFailed: u.prop, nodeId: u.node.id, error: String(e) });
      }
    }
    let removed = 0;
    for (let k = created.length - 1; k >= 0; k--) {
      try {
        created[k].remove();
        removed++;
      } catch (e) {
        log.push({ rollbackFailed: "remove", error: String(e) });
      }
    }
    return { propertiesRestored: restored, nodesRemoved: removed };
  };

  try {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const kind = op.op;
      let produced: BaseNode | null = null;

      if (MUTATE_OPS.indexOf(kind) < 0) {
        throw new Error(`Unknown op "${kind}" — GET /api/mutate lists the vocabulary`);
      }

      switch (kind) {
        case "createFrame":
        case "createRectangle":
        case "createEllipse":
        case "createText":
        case "createLine":
        case "createComponent": {

          const factory = (figma as unknown as { [k: string]: () => SceneNode })[kind];
          if (!factory) throw new Error(`figma.${kind} is not available`);
          const node = factory.call(figma);
          created.push(node);
          produced = node;
          break;
        }

        case "createPage": {

          produced = figma.createPage();
          break;
        }

        case "clone": {
          const src = (await resolve(op.target)) as SceneNode & { clone: () => SceneNode };

          const copy = src.clone();
          created.push(copy);
          produced = copy;
          break;
        }

        case "createInstance": {
          const key = op.componentKey as string | undefined;
          const id = op.componentId as string | undefined;
          let comp: ComponentNode | null = null;
          if (key) comp = await figma.importComponentByKeyAsync(key);
          else if (id) comp = (await figma.getNodeByIdAsync(id)) as ComponentNode;
          if (!comp) throw new Error("createInstance requires componentKey or componentId");

          const inst = comp.createInstance();
          created.push(inst);
          produced = inst;
          break;
        }

        case "set": {
          const node = (await resolve(op.target)) as SceneNode;
          await setProps(node, op.props || {});
          break;
        }

        case "resize": {
          const node = (await resolve(op.target)) as SceneNode & {
            resize: (w: number, h: number) => void;
            width: number;
            height: number;
          };
          const w = Number(op.width);
          const h = Number(op.height);
          if (!isFinite(w) || !isFinite(h)) {
            throw new Error("resize requires numeric width and height");
          }
          if (created.indexOf(node) < 0) {
            undo.push({ node, prop: "__resize", before: { w: node.width, h: node.height } });
          }
          node.resize(w, h);
          break;
        }

        case "append": {
          const parent = (await resolve(op.parent)) as BaseNode & {
            appendChild: (n: SceneNode) => void;
            insertChild: (i: number, n: SceneNode) => void;
          };
          const child = (await resolve(op.child)) as SceneNode;
          if (typeof op.index === "number") parent.insertChild(op.index, child);
          else parent.appendChild(child);
          break;
        }

        case "remove": {
          const node = (await resolve(op.target)) as SceneNode;
          const preExisting = created.indexOf(node) < 0;
          if (preExisting && dryRun) {
            // dryRun executes for real and reverts, but a delete cannot be
            // reverted — so it is refused outright rather than silently skipped,
            // which would validate a batch that behaves differently for real.
            throw new Error(
              `remove on pre-existing node ${node.id} cannot be dry-run — deletion is irreversible`,
            );
          }
          if (preExisting && !op.force) {
            throw new Error(
              `remove on pre-existing node ${node.id} is irreversible — pass "force": true to confirm`,
            );
          }
          node.remove();
          break;
        }

        case "bindVariable": {
          const node = (await resolve(op.target)) as SceneNode & {
            setBoundVariable: (field: never, v: Variable | null) => void;
          };
          const field = op.field as string;
          const varId = op.variableId as string;
          if (!field || !varId) throw new Error("bindVariable requires field and variableId");
          const variable = await figma.variables.getVariableByIdAsync(varId);
          if (!variable) throw new Error(`Variable ${varId} not found`);
          node.setBoundVariable(field as never, variable);
          break;
        }

        case "loadFont": {
          const family = op.family as string;
          if (!family) throw new Error("loadFont requires family");
          await figma.loadFontAsync({ family, style: (op.style as string) || "Regular" });
          break;
        }

        case "createImage": {

          const b64 = op.bytesBase64 as string | undefined;
          const url = op.url as string | undefined;
          let image: Image;
          if (url) image = await figma.createImageAsync(url);
          else if (b64) image = figma.createImage(base64ToBytes(b64));
          else throw new Error("createImage requires bytesBase64 or url");
          // An image is a file-level asset, not a node — it gets its own ref
          // namespace so `$name` in a fill resolves to the hash.
          if (op.as) imageRefs[op.as] = image.hash;
          log.push({ i, op: kind, as: op.as, imageHash: image.hash });
          continue;
        }

        case "importShader": {
          const shader = await importShader(op.shaderId as string);
          log.push({ i, op: kind, shader });
          continue;
        }

        case "setCurrentPage": {
          const page = (await resolve(op.target)) as PageNode;
          await figma.setCurrentPageAsync(page);
          break;
        }

        case "notify": {
          // Skipped under dryRun — a toast is not a document change, and firing
          // it during validation would just confuse whoever is watching Figma.
          if (!dryRun) figma.notify(String(op.message || ""));
          break;
        }
      }

      if (produced && op.as) refs[op.as] = produced;
      log.push({ i, op: kind, as: op.as, nodeId: produced ? produced.id : undefined });
    }
  } catch (err) {
    const rolledBack = rollback();
    if (startPage && figma.currentPage !== startPage) {
      try {
        await figma.setCurrentPageAsync(startPage);
      } catch (e) {
        log.push({ rollbackFailed: "setCurrentPage", error: String(e) });
      }
    }
    throw new Error(JSON.stringify({ error: String(err), rolledBack, log }));
  }

  const refIds: { [k: string]: string } = {};
  for (const name of Object.keys(refs)) refIds[name] = refs[name].id;

  const result: { [k: string]: unknown } = {
    ok: true,
    dryRun,
    opsApplied: ops.length,
    refs: refIds,
    imageRefs,
    createdNodeIds: created.map((n) => n.id),
    log,
  };

  if (dryRun) {
    result.rolledBack = rollback();
    if (startPage && figma.currentPage !== startPage) {
      await figma.setCurrentPageAsync(startPage);
    }
    result.note =
      "Validated by executing and reverting. refs/createdNodeIds are the ids used during validation; they no longer exist.";
  }

  return result;
}

// ── On-demand jobs ────────────────────────────────────────────────────────────

async function findNode(nodeId: string): Promise<SceneNode | null> {
  try {
    const byId = await figma.getNodeByIdAsync(nodeId);
    if (byId) return byId as SceneNode;
  } catch (_err) {
    // Fall through to a current-page scan.
  }
  return figma.currentPage.findOne((n) => n.id === nodeId);
}

type Job = {
  jobId: string;
  kind: string;
  nodeId?: string;
  params?: {
    scale?: number;
    depth?: number;
    format?: string;
    hash?: string;
    shaderId?: string;
    variables?: boolean;
    ops?: Op[];
    dryRun?: boolean;
  };
};

async function runJob(job: Job): Promise<{ bytes?: number[]; json?: unknown }> {
  const params = job.params || {};
  const scale = params.scale && params.scale > 0 ? params.scale : 2;
  // On-demand requests are always deep — that's the whole point of asking for
  // one node rather than a whole page.
  deepMode = true;

  switch (job.kind) {
    case "VARIABLES":
      return { json: await collectVariables() };
    case "STYLE_LIST":
      return { json: await collectStyles() };
    case "PAGES":
      return { json: pageList() };
    case "COMPONENTS":
      return { json: await collectComponents() };
    case "ANNOTATIONS":
      return { json: await collectAnnotations() };
    case "TEXT":
      return { json: collectText() };
    case "IMAGE":
      if (!params.hash) throw new Error("IMAGE job requires params.hash");
      return { bytes: await imageBytes(params.hash) };
    case "SHADERS":
      return { json: await collectShaders() };
    case "SHADER":
      if (!params.shaderId) throw new Error("SHADER job requires params.shaderId");
      return { json: await importShader(params.shaderId) };
    case "LIBRARIES":
      return { json: await collectLibraries(params.variables !== false) };
    case "WHOAMI":
      return { json: whoAmI() };
    case "MUTATE":
      if (!params.ops || !params.ops.length) {
        throw new Error("MUTATE job requires a non-empty params.ops array");
      }
      return { json: await applyOps(params.ops, params.dryRun === true) };
  }

  if (job.kind === "PAGE") {
    if (!job.nodeId) throw new Error("PAGE job requires a nodeId");
    const page = figma.root.children.filter((p) => p.id === job.nodeId)[0];
    if (!page) throw new Error(`Page ${job.nodeId} not found`);
    await page.loadAsync();
    cssBudget = MAX_CSS_NODES;
    return { json: await serializeNode(page as unknown as SceneNode) };
  }

  if (!job.nodeId) throw new Error(`Job kind ${job.kind} requires a nodeId`);
  const node = await findNode(job.nodeId);
  if (!node) throw new Error("Node not found in this document");

  switch (job.kind) {
    case "CONTEXT": {
      cssBudget = MAX_CSS_NODES;
      return { json: await serializeNode(node, params.depth) };
    }
    case "METADATA":
      return { json: serializeMetadata(node, params.depth === undefined ? 4 : params.depth) };
    case "MOTION": {
      // depth 0 = this node only; the default walks the subtree so one call can
      // answer "what animates in this section?".
      const depth = params.depth === undefined ? 99 : params.depth;
      const flows = collectMotion(node, depth);
      return {
        json: {
          root: { nodeId: node.id, name: node.name, type: node.type },
          depth,
          animatedNodeCount: flows.length,
          nodes: flows,
        },
      };
    }
    case "ASSETS": {
      const fmt = params.format === "PNG" ? "PNG" : "SVG";
      return { json: await collectAssets(node, fmt, scale) };
    }
    case "PNG":
    case "JPG":
    case "SVG":
    case "PDF": {
      const exportable = node as SceneNode & { exportAsync: (s: ExportSettings) => Promise<Uint8Array> };
      let settings: ExportSettings;
      if (job.kind === "PNG" || job.kind === "JPG") {
        settings = { format: job.kind, constraint: { type: "SCALE", value: scale } };
      } else if (job.kind === "SVG") {
        settings = { format: "SVG" };
      } else {
        settings = { format: "PDF" };
      }
      const bytes = await exportable.exportAsync(settings);
      return { bytes: Array.from(bytes as Uint8Array) };
    }
  }

  throw new Error(`Unknown job kind: ${job.kind}`);
}

let syncStarted = false;

// The iframe attaches window.onmessage only once its script runs. Anything the
// plugin posts before that is dropped — so wait for the UI to say it's ready
// instead of firing the first progress messages into the void.
async function beginSync(reason: string): Promise<void> {
  if (syncStarted) return;
  syncStarted = true;
  figma.ui.postMessage({ type: "HELLO", build: BUILD, reason });
  await safeExportDesignData();
  syncStarted = false;
}

figma.ui.onmessage = async (msg: { type: string } & Job) => {
  if (msg.type === "UI_READY") {
    await beginSync("initial");

  } else if (msg.type === "BATCH_ACK") {
    if (ackResolve) {
      const resolve = ackResolve;
      ackResolve = null;
      resolve();
    }

  } else if (msg.type === "SYNC_DONE") {
    figma.notify("Design synced — plugin staying open to serve agent requests.", { timeout: 3000 });
    // Do NOT close — stay alive to serve on-demand jobs.

  } else if (msg.type === "SYNC_ERROR") {
    figma.notify("Sync failed — is the server running on localhost:47291?", { error: true });

  } else if (msg.type === "RESYNC") {
    syncStarted = false;
    await beginSync("manual");

  } else if (msg.type === "JOB") {
    try {
      const result = await runJob(msg);
      figma.ui.postMessage({
        type: "JOB_RESULT",
        jobId: msg.jobId,
        kind: msg.kind,
        bytes: result.bytes,
        json: result.json,
      });
    } catch (err) {
      figma.ui.postMessage({ type: "JOB_RESULT", jobId: msg.jobId, kind: msg.kind, error: String(err) });
    }
  }
};

// A throw inside exportDesignData used to die in the plugin console with the UI
// left saying "Syncing…" forever. Surface it instead.
async function safeExportDesignData(): Promise<void> {
  try {
    await exportDesignData();
  } catch (err) {
    reportTree = false;
    const message = err instanceof Error ? `${err.message}` : String(err);
    console.error("exportDesignData failed:", err);
    figma.ui.postMessage({
      type: "SYNC_FAILED",
      message,
      stack: err instanceof Error ? err.stack : undefined,
      nodesSeen,
    });
    figma.notify(`Bridge sync failed: ${message}`, { error: true, timeout: 6000 });
  }
}

// Normally UI_READY drives the first sync. This is a backstop in case the iframe
// never reports in, so the plugin can't sit idle forever.
setTimeout(() => {
  if (!syncStarted) {
    console.warn("No UI_READY after 3s — starting sync anyway.");
    beginSync("timeout-fallback");
  }
}, 3000);
