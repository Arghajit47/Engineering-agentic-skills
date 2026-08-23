# Design Fidelity Audit — Chrome JavaScript Snippets

Extract computed styles and DOM structure from the running app, then compare them
against ground truth. Two sources of ground truth, in priority order:

1. **The Local AI Bridge — preferred.** It returns Figma's own Inspect-panel CSS per
   node, so fidelity becomes a numeric diff. See § "Figma-vs-DOM numeric CSS diff".
2. **The ticket's Design Inventory section** — use when the bridge is down, or for
   structural checks (field order, card counts) that aren't CSS.

The snippets below are the exact ones from KAN-50 QA.

## Figma-vs-DOM numeric CSS diff

Design fidelity is measurable, not a judgement call. Pull the Figma CSS, pull the
computed CSS, diff them.

```bash
# Ground truth from Figma (node id in colon format; use /api/resolve for a share URL)
curl -s "http://localhost:47291/api/node/1:130/css" > /tmp/figma-css.json
```

Collect the DOM side, mapping each Figma node to its rendered selector:

```javascript
// chrome_javascript / browser_console
const TARGETS = {
  '1:130': '[data-testid="hero-card"]',
  '1:131': '[data-testid="hero-title"]',
};
const PROPS = ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color',
               'backgroundColor','paddingTop','paddingRight','paddingBottom','paddingLeft',
               'gap','borderRadius','borderWidth','borderStyle','borderColor','boxShadow',
               'display','flexDirection','justifyContent','alignItems'];
const out = {};
for (const [nodeId, sel] of Object.entries(TARGETS)) {
  const el = document.querySelector(sel);
  if (!el) { out[nodeId] = {missing: sel}; continue; }
  const cs = getComputedStyle(el);
  out[nodeId] = Object.fromEntries(PROPS.map(p => [p, cs[p]]));
}
return JSON.stringify(out, null, 2);
```

Then diff, with explicit tolerances:

```python
import json, re

figma = {r['nodeId']: r['css'] for r in json.load(open('/tmp/figma-css.json'))['rules']}
dom   = json.load(open('/tmp/dom-css.json'))

CAMEL = lambda k: re.sub(r'-([a-z])', lambda m: m.group(1).upper(), k)
PX_TOLERANCE = 1.0          # sub-pixel rounding only
UNITLESS_OK  = {'font-weight', 'display', 'flex-direction'}

def px(v):
    m = re.match(r'^(-?[\d.]+)px$', str(v).strip())
    return float(m.group(1)) if m else None

for node_id, fcss in figma.items():
    dcss = dom.get(node_id)
    if not dcss or 'missing' in dcss:
        print(f'{node_id}: NOT RENDERED ({dcss})'); continue
    for prop, fval in fcss.items():
        dval = dcss.get(CAMEL(prop))
        if dval is None:
            continue                                  # not collected — widen PROPS
        fpx, dpx = px(fval), px(dval)
        if fpx is not None and dpx is not None:
            if abs(fpx - dpx) > PX_TOLERANCE:
                print(f'{node_id} {prop}: Figma {fval} vs DOM {dval}  ❌')
        elif str(fval).strip().lower() != str(dval).strip().lower():
            print(f'{node_id} {prop}: Figma {fval} vs DOM {dval}  ⚠️ verify')
```

### Rules

- **Quote both values in the finding**: `gap: Figma 24px vs DOM 16px`. A bare
  "spacing looks off" is not a reportable finding.
- **A mismatch outside tolerance is a FAIL**, not a non-blocking observation.
- **Colours need normalising before comparing** — Figma emits `#703BF7`, the DOM emits
  `rgb(112, 59, 247)`. Convert both to one form; the `⚠️ verify` branch above catches
  these for manual check rather than silently passing them.
- **Percentage line-heights**: Figma may emit `line-height: 120%` where the DOM
  computes `45.6px`. Multiply the font size before comparing.
- **Shorthand vs longhand**: compare longhands (`paddingTop` …), never `padding`
  against `padding` — the DOM normalises shorthands unpredictably.
- **Prefer token names over hex.** Cross-check `context.tokens` and
  `/api/variables?format=css` against the CSS custom properties actually used in the
  app; a hardcoded hex where a token exists is a finding even when the value matches.
- **`context.layout`** gives the intended flexbox directly (`itemSpacing` → `gap`,
  `padding*`, `primaryAxisAlign` → `justify-content`). Assert against it rather than
  inferring intent from rendered positions.
- If `meta.deepMode` is `false`, per-node CSS is still available on demand —
  `/api/node/:id/css` falls back to a live fetch. Never report it as unavailable.

## Full Audit (all 8 sub-checks in one call)

```javascript
// Wait for loading to finish (800ms setTimeout)
await new Promise(r => setTimeout(r, 3000));

// 1. TEXT CONTENT — all text nodes with alignment
const allText = Array.from(document.querySelectorAll('h1,h2,h3,h4,p,span,button'))
  .map(el => ({tag: el.tagName, text: el.textContent.trim().substring(0, 60),
               align: getComputedStyle(el).textAlign || getComputedStyle(el.parentElement).textAlign}))
  .filter(e => e.text.length > 0);

// 2. CARD FIELD ORDER — walk first card's DOM tree
const firstCard = document.querySelector('[data-testid="property-card"]');
const cardFields = [];
if (firstCard) {
  const walk = (el, depth) => {
    if (depth > 3) return;
    const testid = el.getAttribute?.('data-testid') || '';
    const text = el.textContent.trim().substring(0, 40);
    if (text && testid) cardFields.push({tag: el.tagName, testid, text});
    el.childNodes.forEach(c => { if (c.nodeType === 1) walk(c, depth + 1); });
  };
  walk(firstCard, 0);
}

// 3. NAVIGATION — arrows exist + disabled state
const prev = document.querySelector('[data-testid="prev-arrow"]');
const next = document.querySelector('[data-testid="next-arrow"]');

// 4. VISIBLE CARD COUNT
const propCards = document.querySelectorAll('[data-testid="property-card"]').length;
const reviewCards = document.querySelectorAll('[data-testid="review-card"]').length;

// 5. CARD BORDER/STYLE — check width/style/shadow/radius individually, NOT `border` alone
const cardStyle = firstCard ? {
  borderWidth: getComputedStyle(firstCard).borderWidth,
  borderStyle: getComputedStyle(firstCard).borderStyle,
  borderColor: getComputedStyle(firstCard).borderColor,
  boxShadow: getComputedStyle(firstCard).boxShadow,
  borderRadius: getComputedStyle(firstCard).borderRadius,
  bg: getComputedStyle(firstCard).backgroundColor
} : null;

// 6. BUTTON INVENTORY
const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
  text: b.textContent.trim().substring(0, 40),
  testid: b.getAttribute('data-testid') || '',
  disabled: b.disabled
}));

// 7. LABEL-VALUE PAIRS
const priceLabels = document.querySelectorAll('[data-testid*="price-label"]').length;

// 8. FONT COLORS
const fpHeading = document.querySelector('[data-testid="featured-properties-heading"]');
const colors = {
  fpHeading: fpHeading ? getComputedStyle(fpHeading).color : 'not found',
  // ... add more as needed
};

// Alignment
const fpAlign = fpHeading ? getComputedStyle(fpHeading.parentElement).textAlign : 'not found';

// Broken images
const images = Array.from(document.querySelectorAll('img')).map(img => ({
  alt: img.alt.substring(0, 30), naturalWidth: img.naturalWidth, broken: img.naturalWidth === 0
}));
const brokenCount = images.filter(i => i.broken).length;

// Leftover light-theme classes
const lightClasses = [];
document.querySelectorAll('*').forEach(el => {
  const cls = typeof el.className === 'string' ? el.className : '';
  if (cls.includes('bg-white') || cls.includes('text-zinc-900') || cls.includes('bg-zinc-50') || cls.includes('ring-zinc-200'))
    lightClasses.push({tag: el.tagName, class: cls.substring(0, 60)});
});

return JSON.stringify({allText, cardFields, navigation: {prev, next, propCards, reviewCards},
  cardStyle, buttons, priceLabels, colors, alignment: {fpAlign},
  images: {total: images.length, broken: brokenCount},
  lightClasses: {found: lightClasses.length, details: lightClasses.slice(0, 3)}
}, null, 2);
```

## Responsive Card Count (per breakpoint)

Resize the viewport, reload the page (useEffect must re-run), then count:

```javascript
// After chrome_computer resize_page + chrome_navigate (reload):
await new Promise(r => setTimeout(r, 2000));
const propCards = document.querySelectorAll('[data-testid="property-card"]').length;
const reviewCards = document.querySelectorAll('[data-testid="review-card"]').length;
const prevDisabled = document.querySelector('[data-testid="prev-arrow"]')?.disabled;
const nextDisabled = document.querySelector('[data-testid="next-arrow"]')?.disabled;
return JSON.stringify({viewport: window.innerWidth, propCards, reviewCards, prevDisabled, nextDisabled});
```

CRITICAL: After resizing the viewport via Chrome MCP, you MUST reload the page
(`chrome_navigate` to the same URL) — `useEffect` doesn't fire on viewport resize
alone, so the responsive hook won't update the card count.

## Lighthouse on Production Build

```bash
# Build and start prod server
npx next build && npx next start -p 3001

# Run Lighthouse against prod (NOT dev — dev scores 50-60 lower)
npx lighthouse@12 http://localhost:3001 --output=json --output-path=/tmp/lh.json \
  --quiet --chrome-flags="--headless=new --no-sandbox"

# Parse scores
python3 -c "
import json
with open('/tmp/lh.json') as f: d=json.load(f)
c=d.get('categories',{})
print(f'Performance: {c.get(\"performance\",{}).get(\"score\",\"?\")}')
print(f'Accessibility: {c.get(\"accessibility\",{}).get(\"score\",\"?\")}')
print(f'Best Practices: {c.get(\"best-practices\",{}).get(\"score\",\"?\")}')
print(f'SEO: {c.get(\"seo\",{}).get(\"score\",\"?\")}')
"
```

## KAN-50 Pass Criteria (all 8 sub-checks)

1. Text Content: heading text matches ticket, alignment matches (left/center/right)
2. Card Field Order: every field from ticket's Card Field Inventory present, in order
3. Navigation: arrows exist, left disabled on first page, right enabled if more data
4. Card Count: matches ticket's Card Count Per Breakpoint (not total, VISIBLE)
5. Card Border: border/shadow/ring matches ticket (e.g., "none, blended" = 0px border)
6. Button Inventory: every button from ticket present, correct label, correct position
7. Label-Value Pairs: labels above values exist (e.g., "Price" above price)
8. Font Colors: computed colors match Design Theme section

FAIL = any sub-check mismatch. CRITICAL = missing field, missing button, wrong card count, wrong alignment.