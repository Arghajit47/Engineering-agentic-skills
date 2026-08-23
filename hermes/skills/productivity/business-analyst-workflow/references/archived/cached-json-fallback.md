# Cached JSON Fallback — When Local AI Bridge Hangs on Rate Limit

**ARCHIVED — bypass removed.** This file described extracting design specs from a cached Figma REST API `/v1/files/{key}` JSON when the bridge server was rate-limited. That path is no longer allowed. All Figma extraction must go through the Local AI Bridge server at `http://localhost:47291` per the `local-ai-bridge` skill. If the bridge is down or unsynced, stop and tell the user to start/sync it. Do not use this file.

## When to use

Phase 2 (@designerAgent) needs to extract design specs from Figma, but:
- Phase 1 already saved the full file JSON to `/tmp/figma_full.json` (from the `/v1/files/{key}` call)
- Local AI Bridge hangs for 120s+ because Figma returns 429 and Local AI Bridge retries indefinitely
- Direct `curl` to `/v1/files/{key}/nodes?ids={node_id}` also returns 429

This is NOT the same as the "no API access at all" scenario in `figma-design-inventory.md`
(that one uses PIL pixel sampling on screenshots). Here you HAVE the full file JSON —
you just can't make any MORE API calls. The cached JSON is far richer than pixel sampling:
exact fill colors, exact text strings, exact layout modes, exact spacing, exact corner
radii, exact node types — no guessing.

## Technique

### Step 1: Build a flat node index from the cached file

```python
import json

with open('/tmp/figma_full.json') as f:
    d = json.load(f)

def build_node_index(node, index=None):
    if index is None:
        index = {}
    index[node['id']] = node
    for child in node.get('children', []):
        build_node_index(child, index)
    return index

node_index = build_node_index(d['document'])
# 47000+ nodes for a real design file
```

### Step 2: Extract text nodes (exact strings, colors, typography)

```python
def extract_text_nodes(node, depth=0, results=None):
    if results is None:
        results = []
    if node.get('type') == 'TEXT':
        chars = node.get('characters', '')
        style = node.get('style', {})
        fill_data = node.get('fills', [])
        text_color = None
        for fill in fill_data:
            if fill.get('type') == 'SOLID':
                c = fill.get('color', {})
                text_color = f"rgb({int(c.get('r',0)*255)},{int(c.get('g',0)*255)},{int(c.get('b',0)*255)})"
        results.append({
            'id': node.get('id', ''),
            'text': chars,
            'fontSize': style.get('fontSize', '?'),
            'fontWeight': style.get('fontWeight', '?'),
            'textAlignHorizontal': style.get('textAlignHorizontal', '?'),
            'color': text_color,
            'width': node.get('absoluteBoundingBox', {}).get('width', '?'),
            'height': node.get('absoluteBoundingBox', {}).get('height', '?'),
            'depth': depth,
        })
    for child in node.get('children', []):
        extract_text_nodes(child, depth + 1, results)
    return results
```

### Step 3: Extract ALL nodes with visual properties (fills, strokes, layout, radius)

```python
def extract_all_nodes(node, depth=0, results=None):
    if results is None:
        results = []
    bbox = node.get('absoluteBoundingBox', {})
    fills = node.get('fills', [])
    strokes = node.get('strokes', [])
    effects = node.get('effects', [])

    fill_colors = []
    for fill in fills:
        if fill.get('type') == 'SOLID' and fill.get('visible', True) != False:
            c = fill.get('color', {})
            r, g, b = int(c.get('r',0)*255), int(c.get('g',0)*255), int(c.get('b',0)*255)
            fill_colors.append(f"rgb({r},{g},{b})")

    stroke_colors = []
    for stroke in strokes:
        if stroke.get('type') == 'SOLID':
            c = stroke.get('color', {})
            r, g, b = int(c.get('r',0)*255), int(c.get('g',0)*255), int(c.get('b',0)*255)
            stroke_colors.append(f"rgb({r},{g},{b})")

    shadow_info = []
    for effect in effects:
        if effect.get('type') == 'DROP_SHADOW':
            shadow_info.append(f"shadow({effect.get('radius',0)}px)")

    results.append({
        'id': node.get('id', ''),
        'name': node.get('name', '?'),
        'type': node.get('type', '?'),
        'depth': depth,
        'width': bbox.get('width', '?'),
        'height': bbox.get('height', '?'),
        'fills': fill_colors,
        'strokes': stroke_colors,
        'effects': shadow_info,
        'cornerRadius': node.get('cornerRadius', '?'),
        'layoutMode': node.get('layoutMode', 'NONE'),
        'itemSpacing': node.get('itemSpacing', 0),
        'children_count': len(node.get('children', [])),
    })
    for child in node.get('children', []):
        extract_all_nodes(child, depth + 1, results)
    return results
```

### Step 4: Count cards per resolution

```python
# Cards are FRAME nodes named "Card" — count them per resolution section
cards = [n for n in all_nodes if n['name'] == 'Card' and n['type'] == 'FRAME']
print(f"Cards: {len(cards)}")
for c in cards:
    print(f"  {c['id']}: {c['width']}x{c['height']}, fills={c['fills']}, strokes={c['strokes']}, radius={c['cornerRadius']}")
```

### Step 5: Detect navigation arrows

```python
# Navigation arrow buttons are small FRAME nodes named "Button" with circular radius
nav_buttons = [n for n in all_nodes
    if n['name'] == 'Button' and n['type'] == 'FRAME'
    and float(n.get('width', 0) or 0) <= 60]
# Left arrow: fills=[] (transparent), Right arrow: fills=['rgb(25,25,25)'] (filled)
```

### Step 6: Extract card field ordering

Walk the card's subtree (depth >= card_depth) and note the top-to-bottom order:
image -> text container (title + description) -> specs row (pills) -> price + button row.
The `layoutMode` (VERTICAL/HORIZONTAL) and `itemSpacing` tell you the exact spacing.

### Step 7: Extract star ratings (testimonials)

```python
# Stars are type=STAR nodes with fill rgb(255,229,0), inside circular sub-containers
# Each sub-container is 44x44, bg rgb(25,25,25), border rgb(29,27,27), radius=100
stars = [n for n in all_nodes if n['type'] == 'STAR']
print(f"Stars found: {len(stars)}")
for s in stars:
    print(f"  {s['id']}: {s['width']}x{s['height']}, fills={s['fills']}")
# Count per card = rating value (typically 5 per card for 5-star reviews)
```

### Step 8: Extract spec pill structure (property cards)

```python
# Spec pills are small FRAME nodes (43px tall, radius=28px) inside a horizontal container
# Each pill has: icon (24x24 FRAME with VECTOR children, fills white) + text node
# Pills are: bedroom count, bathroom count, property type
spec_pills = [n for n in all_nodes
    if n['type'] == 'FRAME' and float(n.get('width',0) or 0) < 200
    and n.get('cornerRadius') == 28]
```

### Step 9: Walk card subtree for exact field ordering

```python
# For a specific card, filter all_nodes to its subtree and print in depth order
card_nodes = [n for n in all_nodes if n['id'].startswith('4455:')]
for n in card_nodes:
    if n['depth'] >= 3:
        prefix = "  " * n['depth']
        print(f"{prefix}{n['name']} (id={n['id']}, type={n['type']}) — {n['width']}x{n['height']}, fills={n['fills']}, strokes={n['strokes']}, radius={n['cornerRadius']}, layout={n['layoutMode']}, spacing={n['itemSpacing']}")
```

### Step 10: Detect "View All Properties" and "View Property Details" buttons

```python
# "View All Properties" is a top-level Button FRAME (depth=2) with secondary style
# "View Property Details" is inside each card (depth=5) with violet-600 bg rgb(111,59,246)
view_all = [n for n in all_nodes if n['name'] == 'Button' and n['depth'] == 2]
vpd_buttons = [n for n in all_nodes if 'View Property Details' in str(n.get('name',''))]
```

## What you get vs pixel sampling

| Data | Cached JSON | Pixel sampling |
|------|-------------|----------------|
| Exact text strings | YES (from `characters` field) | NO (OCR fails on Figma vector text) |
| Exact fill colors | YES (from `fills[].color` as RGB floats) | APPROXIMATE (corner pixel sampling) |
| Exact stroke/border colors | YES (from `strokes[].color`) | NO (border width <1px hard to detect) |
| Corner radius | YES (from `cornerRadius`) | NO |
| Layout mode + spacing | YES (from `layoutMode`, `itemSpacing`) | NO |
| Card count | YES (count FRAME nodes named "Card") | APPROXIMATE (pixel scanning) |
| Navigation arrows | YES (find small Button nodes) | APPROXIMATE (bright pixel scanning) |
| Font size/weight/align | YES (from `style` field) | NO |
| Star ratings | YES (find STAR type nodes with fill) | NO (can't distinguish filled vs empty stars) |

## Limitations

- No screenshots (Local AI Bridge's `--export-images` can't run without API access)
- No rendered PNG output — just structured data
- The full file JSON can be 38MB+ — building the node index takes ~2 seconds
- You still need to manually map node IDs to resolutions (Phase 1 step 2 already does this)

## When Local AI Bridge recovers later

If the Figma API rate limit clears (wait 60+ minutes), Local AI Bridge can be re-run
to generate the JSON spec files and screenshots that the Frontend ticket requires as
attachments. The cached-JSON analysis provides the ticket content immediately; the
Local AI Bridge output (when available) provides the attachment artifacts.