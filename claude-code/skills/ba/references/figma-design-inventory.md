# Figma Design Inventory Extraction

When `vision_analyze` is unavailable and the Figma REST API is rate-limited,
extract design details from screenshots + the .fig file programmatically.

## Source Materials

1. **Figma screenshots** — pre-downloaded PNGs at all 5 breakpoints (1920/1440/1024/768/375)
2. **.fig file** — downloaded locally, it's a ZIP archive:
   ```bash
   unzip "file.fig" -d /tmp/figma_extract
   # Extracts: canvas.fig (binary Kiwi scene graph), meta.json, images/ (embedded photos/avatars/icons)
   ```
3. **meta.json** — contains `background_color` as {r,g,b,a} floats (multiply by 255 for RGB)
4. **User observations** — the user looking at the Figma design can provide field-level detail that pixel analysis cannot

## Pixel Analysis with Pillow

```bash
pip3 install Pillow  # one-time — NOT in default macOS Python
```

### Background theme
```python
from PIL import Image
img = Image.open("/tmp/screenshots/story1_featured_1920.png")
bg = img.getpixel((5, 5))[:3]  # top-left corner
# rgb(20,20,20) = dark, rgb(255,255,255) = light
```

### Header alignment
```python
# Scan rows for light pixels — find leftmost text start
for y in range(40, 200, 4):
    light = [x for x in range(0, w, 2) if sum(img.getpixel((x,y))[:3])/3 > 100]
    if len(light) > 5:
        if light[0] < w//4:
            print("LEFT-ALIGNED")
        elif abs(light[0] - w//2) < w//8:
            print("CENTER-ALIGNED")
        break
```

### Card count (visible, not total)
```python
# Scan a row through the card area for non-bg regions
for y in [350, 400, 450]:
    regions = []
    in_card = False
    for x in range(0, w, 2):
        px = img.getpixel((x, y))
        is_bg = abs(px[0]-20) < 25 and abs(px[1]-20) < 25 and abs(px[2]-20) < 25
        if not is_bg and not in_card:
            start = x; in_card = True
        elif is_bg and in_card:
            if x - start > 100:  # min card width
                regions.append((start, x, x-start))
            in_card = False
    print(f"y={y}: {len(regions)} cards")
```

### Arrow detection
```python
# Scan left/right edges for bright pixels (arrow icons)
for side, x_range in [("left", range(0, 100)), ("right", range(w-100, w))]:
    count = sum(1 for x in x_range for y in range(200, 900, 4)
                if sum(img.getpixel((x,y))[:3])/3 > 120)
    print(f"{side}: {count} bright pixels")
```

### .fig embedded images
```bash
# List all embedded images with dimensions
cd /tmp/figma_extract/images
for f in *; do sips -g pixelWidth -g pixelHeight "$f" 2>/dev/null | grep pixel; done
# Categorize: 1500+ = property photos, 400-600 = avatars, <300 = icons
```

## OCR Attempt (does NOT work)

Tesseract OCR on Figma screenshot PNGs returns empty output — Figma renders
text as vector shapes, not rasterized text. Do NOT rely on OCR for text
extraction from Figma screenshots.

## The 8-Category Design Inventory

Extract these from pixel analysis + user observations + .fig images:

1. **Text Content** — every visible text node (exact string, alignment, color)
2. **Alignment** — heading/subheading/card/button left/center/right per section
3. **Navigation Controls** — arrows, dots, swipe; position, default state
4. **Card Count Per Breakpoint** — VISIBLE cards (not total) at each resolution
5. **Card Field Order** — every field top-to-bottom (image → title → description → specs → price label → price → button)
6. **Card Border/Style** — border? shadow? ring? blended with bg?
7. **Button Inventory** — every button: label, position, style, action
8. **Label-Value Pairs** — labels above values (e.g., "Price" above "$1,250,000")

## KAN-6 Lessons (14 violations from first attempt)

The original KAN-6 ticket had fabricated ACs that didn't match Figma:
- Wrong header alignment (center vs left)
- Wrong card count (6 in grid vs 3 visible with arrows)
- Missing pagination arrows
- Missing card description field
- Wrong specs field (area sqft vs property type)
- Missing "Price" label above price value
- Missing "View property details" button
- Card had ring border (Figma has no border, blended)

Root cause: BA wrote ACs from assumptions, not from actual Figma extraction.
The 8-category inventory prevents this — every AC must trace to an inventory item.