# Local AI Bridge: Coordinate-Aware Screenshot Cropping

> **LEGACY FALLBACK — read this first.** The premise below is out of date. As of the
> 2026-08-13 rebuild the Local AI Bridge **does** expose per-node vector exports and
> per-node screenshots, and it returns exact colours and styling as data. Cropping is
> no longer the way to get colours or icons.
>
> Use instead:
> - **Colours / spacing / radii / type** → `GET /api/node/:id/context` or
>   `GET /api/node/:id/css?format=text`. Exact values, no pixel sampling, no vision model.
> - **Icons and logos** → `GET /api/node/:id/svg`
> - **Every asset in a section at once** → `POST /api/node/:id/assets {dir,format,scale}`
> - **Node screenshot** → `GET /api/node/:id/screenshot` (2x by default)
>
> See the `local-ai-bridge` skill for the full endpoint list. Only fall back to the
> cropping technique below when you genuinely need raw pixels out of a rasterised
> image — e.g. sampling a colour from a flattened/embedded bitmap, or eyeballing a
> rendered frame against the running app.

The Local AI Bridge at `http://localhost:47291` is the Figma plugin's sync server. Its `/api/document` endpoint returns the scene tree, and per-node exports are available on demand. Historically the bridge exposed neither, so this guide cropped regions out of full-frame screenshots using coordinates from the tree.

## When to use

- You need raw pixels from a rasterised or flattened image where no vector node exists.
- You want to visually compare a rendered Figma frame against the running app.
- The plugin window is closed, so on-demand exports time out, and you already have a cached full-frame PNG on disk.

## What the bridge gives you

### `/api/document`
Returns `{ tree }` where each node has:
- `id`
- `name`
- `type`
- `x`, `y`, `width`, `height` — **relative to the node's parent**, not absolute on the canvas
- `children`

No `fills`, `strokes`, `vectorPaths`, or geometry. So you cannot recreate exact SVGs from this data.

### `/api/screenshots`
Lists available rendered node screenshots. Download URLs point at the bridge host on `http://localhost:47291`.

### `/api/node/{FRAME_ID}/screenshot`
Renders a full page/frame as a PNG. This is the workhorse endpoint. Frame IDs come from the document tree (e.g. `5:26176` for "Home Page Desktop", `104:600` for "Home Page Laptop").

## Step-by-step recipe

### 1. Find the frame IDs and bounding boxes

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

def absolute_pos(node_id):
    # Build parent map
    parent_map = {}
    def build_parent(node, parent=None):
        for c in node.get("children", []):
            parent_map[c["id"]] = node
            build_parent(c, node)
    build_parent(tree)

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

for node_id in ["5:26176", "104:600"]:
    pos = absolute_pos(node_id)
    print(f"{node_id}: {pos}")
```

### 2. Download the full-frame screenshot

```python
from PIL import Image
import requests, os

os.makedirs("/tmp/figma-crops", exist_ok=True)

frame_id = "5:26176"
r = requests.get(f"http://localhost:47291/api/node/{frame_id}/screenshot")
path = f"/tmp/figma-crops/{frame_id}.png"
with open(path, "wb") as f:
    f.write(r.content)

img = Image.open(path)
print(img.size)  # e.g. (1920, 7128)
```

### 3. Convert absolute node coords to frame-relative crop coords

```python
frame = absolute_pos("5:26176")  # e.g. x=4745, y=-3215
node = absolute_pos("11:89142")  # e.g. a social icon

rel_x = int(node["x"] - frame["x"])
rel_y = int(node["y"] - frame["y"])
w, h = int(node["width"]), int(node["height"])

crop = img.crop((rel_x, rel_y, rel_x + w, rel_y + h))
crop.save("/tmp/figma-crops/social-icon.png")
```

### 4. Sample exact colors

```python
# Sample center and edge pixels
from PIL import Image
img = Image.open("/tmp/figma-crops/5:26176.png")
cx, cy = rel_x + w // 2, rel_y + h // 2
for dx, dy in [(0, 0), (-5, -5), (5, 5)]:
    print(cx + dx, cy + dy, img.getpixel((cx + dx, cy + dy)))
```

Look for:
- Accent color: `(202, 255, 51)` = `#CAFF33` (lime green)
- Dark surfaces: `(26, 26, 26)` = `#1A1A1A`
- Subtle borders: `(38, 38, 38)` = `#262626`
- White text: `(255, 255, 255)`

### 5. Use sampled data responsibly

Coordinate-aware cropping is for **colors, spacing, and shape confirmation** from screenshots already delivered by the bridge. It is **not** a substitute for the bridge when the bridge is unavailable.

- For exact SVG paths, prefer `GET /api/node/:id/svg` via the bridge.
- If the bridge cannot export an SVG, do **not** hand-trace or approximate the shape from a cropped screenshot. Stop and ask the user to keep the bridge plugin open so the SVG export can complete.
- Use sampled RGB values only to confirm a color already documented in the ticket, not to invent a color when the spec is missing.

If a screenshot crop is too small to read reliably, upscale with Lanczos and pass to `vision_analyze`, but do not trust vision alone for tiny single-color icons — verify against pixel samples.

## Pitfalls

- **Coordinates are relative.** Using the raw `x`/`y` from `/api/document` without summing parents will produce crops outside the frame (e.g. negative or huge Y values).
- **`/api/node/{id}/screenshot` only works for frames.** It returns 404 for leaf vectors, groups, or components. Always render the parent frame and crop.
- **Vision models may hallucinate on small crops.** A 52x52 lime-green icon can be misread as random dots. Always pair vision with pixel sampling.
- **Do not reconstruct exact Figma vectors from crops.** The bridge does not give you path data, and cropping does not either. If you need exact SVG paths, use `GET /api/node/:id/svg` via the bridge; if that fails because the plugin is closed, ask the user to keep it open. Never hand-trace or approximate a logo/icon shape from a screenshot.
- **Screenshot mode is RGBA.** Background areas may be dark opaque (#1A1A1A) rather than transparent, which is fine for color sampling.
- **Never use this technique when the bridge is unavailable.** Cropping only works after the bridge has delivered a full-frame screenshot. If the bridge server is down or unsynced, stop and ask the user to start/sync it.

## Verification

After sampling colors/spacing, confirm the real output against the same bridge screenshot:
1. Run the local app (`npm start -- --port 3000`).
2. Take a browser/Playwright screenshot or use Chrome MCP.
3. Sample the same pixels and compare colors to the Figma reference.

## Related

- `references/figma-pixel-sampling.md` — generic PIL color sampling technique. **Only after the bridge has delivered the screenshot; never a replacement for the bridge.**
