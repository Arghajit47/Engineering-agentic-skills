# Figma Screenshot Pixel Sampling

When `vision_analyze` fails (model lacks vision), sample Figma screenshot
pixels programmatically to extract the design theme and pass it to the
sub-agent in text context.

## Recipe

```bash
pip3 install Pillow  # one-time setup — not in default macOS Python
```

```python
from PIL import Image

# Sample multiple breakpoints to detect responsive theme changes
for name in ['story1_featured_1920.png', 'story1_testimonials_1920.png']:
    path = f'/tmp/kan-6-screenshots/{name}'
    img = Image.open(path)
    w, h = img.size
    print(f'{name} ({w}x{h}):')

    # Sample a grid of points
    for y in [50, 200, 500, 700, 900]:
        for x in [100, 400, 800, 1200, 1500]:
            if x < w and y < h:
                px = img.getpixel((x, y))
                if px[3] > 0:  # non-transparent
                    print(f'  ({x},{y}): {px[:3]}')
```

## Sample session output (KAN-6 — dark theme confirmed)

```
story1_featured_1920.png (1920x1080):
  (100,50): (20, 20, 20)   ← body bg, dark
  (100,200): (20, 20, 20)  ← section bg, same dark
  (100,500): (20, 20, 20)  ← card area still dark
  (800,200): (20, 20, 20)

story1_testimonials_1920.png (1920x1080):
  (100,50): (20, 20, 20)
  (100,500): (20, 20, 20)
```

This confirmed the Figma design uses rgb(20,20,20) — dark theme.
The implementation was using bg-white (light) — a mismatch caught by
pixel sampling, not by any skill's default workflow.

## What to extract

1. **Body/page background** — sample top-left corner (5,5) and bottom-left
   (5, h-5). If transparent (alpha=0), the canvas extends beyond content —
   sample interior points. Common: `rgb(20,20,20)` = dark theme,
   `rgb(255,255,255)` = light theme.

2. **Section backgrounds** — sample at vertical center of each section.
   If different from body bg, the section has its own background color
   (e.g., `bg-zinc-50` on light, `bg-zinc-900` on dark).

3. **Card backgrounds** — sample inside card areas (between image and text).
   `rgb(255,255,255)` = white cards on dark bg, `rgb(24,24,24)` = dark cards.

4. **Accent colors** — sample button areas, price text, star icons.
   Common: `rgb(112,59,247)` = indigo/violet, `rgb(245,158,11)` = amber.

5. **Text colors** — for dark-theme pages, headings are usually near-white
   (`rgb(244,244,245)` / zinc-100) and body text is grey
   (`rgb(161,161,170)` / zinc-400). On light-theme pages, headings are
   near-black and body text is dark grey.

## Passing to sub-agent

Include in the delegate_task context:

```
DESIGN THEME (from Figma pixel sampling):
- Page background: rgb(20,20,20) — DARK theme
- Featured Properties section: transparent (inherits body)
- Testimonials section: rgb(20,20,20) — same as body
- Card backgrounds: rgb(24,24,24) — dark cards
- Card ring/border: rgb(39,39,42) — zinc-800
- Heading text: rgb(244,244,245) — zinc-100
- Body text: rgb(161,161,170) — zinc-400
- Muted text: rgb(113,113,122) — zinc-500
- Price/accent: rgb(129,140,248) — indigo-400
- Star filled: rgb(251,191,36) — amber-400
- CTA button: rgb(79,70,229) — indigo-600
```

Without this, the sub-agent defaults to light theme (`bg-white`,
`text-zinc-900`) and the implementation won't match the design.

## Screenshot Download Failure Modes

Figma screenshot downloads can silently produce broken files (94-byte HTML error pages or 1x1 placeholder PNGs) when:
- Figma API rate limit is hit
- The node ID does not exist
- The Figma file is deleted or permissions changed

**Always validate after downloading:**
```python
from PIL import Image
img = Image.open(path)
w, h = img.size
if w < 10 or h < 10:
    raise ValueError(f"Broken screenshot {path}: {w}x{h}")
```
Or via terminal:
```bash
python3 -c "from PIL import Image; img=Image.open('$path'); print(img.size)"
# 94-byte broken: raises "cannot identify image file"
```

**Fallback when screenshots are broken:** Read the JIRA ticket description for:
1. Explicit design theme values (KAN-6 style: `rgb(20,20,20)` table)
2. Text content inventory from the ticket description (exact strings like heading, button labels, placeholders)
3. Text color descriptions ("light grey-to-white gradient", "dark charcoal background")
Do NOT guess RGB values from broken screenshots.

## .fig File Extraction (when Figma API is rate-limited)

The user can download the .fig file locally. It's a ZIP archive:

```bash
unzip "file.fig" -d /tmp/figma_extract
# Extracts: canvas.fig (binary Kiwi scene graph), meta.json, images/ (embedded photos)
```

- `meta.json` — contains `background_color` as {r,g,b,a} floats (×255 for RGB)
- `images/` — 50+ embedded images (property photos, avatars, icons). List with:
  ```bash
  cd /tmp/figma_extract/images && for f in *; do sips -g pixelWidth -g pixelHeight "$f" 2>/dev/null | grep pixel; done
  ```
  Categorize by size: 1500+ = property photos, 400-600 = avatars, <300 = icons
- `canvas.fig` — binary Kiwi-encoded scene graph. `strings` returns gibberish (compressed). No known parser outside Figma.

## OCR Attempt (does NOT work)

Tesseract OCR on Figma screenshot PNGs returns empty output — Figma renders
text as vector shapes, not rasterized text. Do NOT rely on OCR for text
extraction from Figma screenshots.

## Chrome MCP as Figma viewer alternative

If Figma REST API is rate-limited but the user is logged into Figma in Chrome,
you can navigate to the Figma file URL and take screenshots via Chrome MCP.
However, the screenshot captures the Figma editor UI (toolbars, layers panel),
not a clean design view. Pre-downloaded screenshots from the Figma API are
always preferable.