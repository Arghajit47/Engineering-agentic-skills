# Local AI Bridge: Coordinate-Aware Screenshot Cropping

> **LEGACY FALLBACK.** Since the 2026-08-13 rebuild, cropping is almost never the
> right tool. Exact colours, spacing, radii, shadows and type now come back as data
> from `GET /api/node/:id/context` and `GET /api/node/:id/css?format=text` — no pixel
> sampling and no vision model involved. Icons come from `GET /api/node/:id/svg`, and
> a whole section's assets from `POST /api/node/:id/assets`.

This guide remains useful only when:

- You need raw pixels from a **rasterised or flattened** image, where no vector node and no fill data exist.
- The plugin window is closed (on-demand exports time out) but a cached full-frame PNG is already on disk.
- You want to eyeball a rendered Figma frame against the running app.

Do **not** use it to determine a colour that `context.fills`, `context.css`, or `context.tokens` already states exactly.

## What the tree gives you

`/api/document` returns `{ tree }` where each node has:

- `id`
- `name`
- `type`
- `x`, `y`, `width`, `height` — **relative to the node's parent**
- `absolute` — `{x, y, width, height}` in absolute canvas coordinates (use this for cropping)
- `text` — an object for `TEXT` nodes (`characters`, `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, …)
- `children`

Nodes also carry `css`, `layout`, `sizing`, `fills`, `strokes`, `effects`, `cornerRadius`,
`tokens`, `styles` and `component` — so fill, stroke and vector data **are** available now.
Read the colour from `fills`/`css` instead of sampling a cropped pixel.

## Recipe

### 1. Find the target frame and child node IDs

```python
import requests, json

r = requests.get("http://localhost:47291/api/document")
tree = r.json()["tree"]

def find(node, target):
    if node.get("id") == target:
        return node
    for c in node.get("children", []):
        result = find(c, target)
        if result:
            return result
    return None

# Frame IDs come from the tree in colon format
frame_id = "5:26176"
node_id = "11:89142"  # e.g. a social icon
```

### 2. Compute absolute canvas coordinates

```python
def build_parent_map(node, parent=None, mapping=None):
    if mapping is None:
        mapping = {}
    for c in node.get("children", []):
        mapping[c["id"]] = node
        build_parent_map(c, node, mapping)
    return mapping

def absolute_pos(tree, node_id):
    parent_map = build_parent_map(tree)
    node = find(tree, node_id)
    if not node:
        return None
    x, y = node["x"], node["y"]
    current = node
    while current.get("id") in parent_map:
        parent = parent_map[current["id"]]
        x += parent["x"]
        y += parent["y"]
        current = parent
    return {"x": x, "y": y, "width": node["width"], "height": node["height"]}

frame = absolute_pos(tree, frame_id)
node = absolute_pos(tree, node_id)
```

### 3. Download the frame screenshot and crop

```python
from PIL import Image
import requests

r = requests.get(f"http://localhost:47291/api/node/{frame_id}/screenshot")
frame_path = f"/tmp/{frame_id.replace(':', '-')}.png"
with open(frame_path, "wb") as f:
    f.write(r.content)

img = Image.open(frame_path)

rel_x = int(node["x"] - frame["x"])
rel_y = int(node["y"] - frame["y"])
w, h = int(node["width"]), int(node["height"])

crop = img.crop((rel_x, rel_y, rel_x + w, rel_y + h))
crop.save("/tmp/cropped-element.png")
```

### 4. Sample exact colors

```python
from PIL import Image

img = Image.open(frame_path)
cx, cy = rel_x + w // 2, rel_y + h // 2
for dx, dy in [(0, 0), (-5, -5), (5, 5), (-10, 0), (10, 0)]:
    print(cx + dx, cy + dy, img.getpixel((cx + dx, cy + dy)))
```

Common colors in the {{PROJECT_NAME}} design:
- Accent: `(202, 255, 51)` → `#CAFF33`
- Dark surface: `(26, 26, 26)` → `#1A1A1A`
- Subtle border: `(38, 38, 38)` → `#262626`
- White text: `(255, 255, 255)` → `#FFFFFF`

## Prefer SVG export for icons and logos

Whenever possible, use the bridge's SVG endpoint instead of cropping screenshots:

```bash
curl -s "http://localhost:47291/api/node/11:89142/svg" -o /tmp/icon.svg
```

SVG exports are real Figma vector data, not reconstructed shapes. Fetch them **sequentially with a 0.1s delay** to avoid queue timeouts.

## Pitfalls

- **Coordinates are relative to parent.** Using raw `x`/`y` without summing parents produces crops outside the frame.
- **Vision models hallucinate on tiny crops.** A 52×52 lime-green icon may be misread as random dots. Pair vision with pixel sampling.
- **Screenshot cropping is a fallback.** It does not give you vector paths. Use `GET /api/node/:id/svg` first.
- **Screenshot mode is RGBA.** Background areas are usually opaque dark (#1A1A1A), which is fine for sampling.

## Verification

After rebuilding icons/styling:

1. Run the local app (`npm start -- --port 3000`).
2. Use Playwright or Chrome MCP to screenshot the same region.
3. Sample pixels and compare colors to the Figma reference.

## Example: {{PROJECT_NAME}} Home Page Desktop

```python
# Frame and key node IDs from the 2026-08-08 BC-72 session
frame_id = "5:26176"            # Home Page Desktop
logo_nav = "5:27273"            # Navbar logo group
active_tab = "5:27282"           # Active Home tab
footer_logo = "11:89116"        # Footer logo group
social_1 = "11:89142"           # Facebook icon
contact_mail = "11:89129"       # Mail icon

# Verified absolute canvas positions
# logo_nav:    (4941.0, -3137.5), size 155.8×40
# active_tab:  (5520.0, -3143.0), size 100×51
# footer_logo: (5627.1, 3435.0), size 155.8×40
# social_1:    (4923.0, 3795.0), size 52×52
# contact_mail:(5362.0, 3653.5), size 24×24
```

Convert to frame-relative coords by subtracting the frame origin (`4745, -3215` for this frame).
