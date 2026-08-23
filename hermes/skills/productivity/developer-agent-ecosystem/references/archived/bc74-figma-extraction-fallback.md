# Figma asset fallback when the Local AI Bridge plugin cannot stay open

**ARCHIVED — bypass removed.** This file described falling back to PIL sampling and hand-rebuilding SVGs when the Local AI Bridge plugin could not stay open. That path is no longer allowed. If the bridge cannot export an SVG, the correct action is to ask the user to keep the Figma plugin window open until the export completes. Do not reconstruct, hand-trace, or approximate Figma assets from screenshots. Do not use this file.

During BC-74 the Figma Desktop plugin was synced with the bridge server, but the
plugin window could not stay open for on-demand SVG exports. The `/api/node/:id/svg`
endpoint timed out after ~30 seconds. This is a common situation when the user
is not actively watching the Figma window.

This reference documents the safe fallback pattern so developers never guess a
logo or icon shape.

## What still works when the plugin is closed

- `GET /api/document` — full scene tree (node names, ids, bounding boxes, text)
- `GET /api/screenshots` — list of cached PNGs
- `GET /api/node/:id/screenshot` — PNG export, but only if a screenshot was
  cached while the plugin was open
- Full-frame screenshots already saved locally (e.g. `/tmp/page_desktop.png`)

## Fallback order

1. **Use the cached `/api/document` tree** to confirm node IDs, bounding boxes,
   and text. Never skip this.

2. **Try `/api/node/:id/svg`** once. If it times out with
   `{"error":"Export timed out — is the Local AI Bridge plugin still open in Figma?"}`,
   stop and inform the user: "The bridge server is synced, but on-demand SVG
   exports require the Figma plugin window to stay open. Please keep it open, or
   paste the exact SVG path data here."

3. **While waiting, sample exact colors from the cached full-frame screenshot**
   using PIL so non-asset fixes (text color, pill background, hamburger color)
   are not blocked:

   ```python
   from PIL import Image
   img = Image.open('/tmp/page_desktop.png')
   # crop around known bounding box and sample dominant color
   crop = img.crop((left, top, right, bottom))
   pixels = list(crop.getdata())
   # filter non-transparent, pick most frequent or average
   ```

4. **For the logo/icon shape itself, do not hand-trace from a screenshot unless**
   the user explicitly approves a temporary approximation. The safest options are:
   - Ask the user to keep the plugin open for SVG export.
   - Ask the user to paste the SVG `<path>` data directly into the chat.
   - If the design system already has an approved asset file, use that.

5. **If the user provides exact SVG path data**, save it as a shared component
   (e.g. `src/components/LogoIcon.tsx`) and as `public/logo-icon.svg`. Update
   all consumers to import the shared component. Do not inline the paths in two
   places.

## Rules

- Never ship a diamond when Figma specifies a pinwheel/flower/asterisk.
- Never use `next/image` for a vector icon that must scale crisply at every size.
- When a user supplies exact SVG paths, commit them verbatim; do not "improve" the
  coordinates.
- Record the source of every sampled color and every SVG path in the ticket
  comment or `instructions.txt` so QA can verify provenance.
