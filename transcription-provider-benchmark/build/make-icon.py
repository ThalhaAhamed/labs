"""Draws the app icon: a neutral graphite tile with three horizontal bars of
different lengths (a leaderboard, like the results view), in grays and white,
with no brand colors. Writes build/icon.png (1024 px) plus icon.ico and
icon.icns, and public/favicon.png for the page.
"""
from pathlib import Path
from PIL import Image, ImageDraw

SIZE, SS = 1024, 4                      # draw at 4x, then downsample for smooth edges
S = SIZE * SS
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Tile: graphite with a subtle top-to-bottom lift.
m = int(0.06 * S)
grad = Image.new("RGBA", (1, S))
top, bottom = (44, 47, 55), (22, 24, 29)
for y in range(S):
    t = y / (S - 1)
    grad.putpixel((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
grad = grad.resize((S, S))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([m, m, S - m, S - m], radius=int(0.2 * S), fill=255)
img.paste(grad, (0, 0), mask)

# Axis on the left, then three bars growing from it.
axis_x = int(0.25 * S)
bar_h = int(0.12 * S)
gap = int(0.075 * S)
top_y = (S - (3 * bar_h + 2 * gap)) // 2
d.rounded_rectangle([axis_x - int(0.018 * S), top_y - int(0.05 * S), axis_x, top_y + 3 * bar_h + 2 * gap + int(0.05 * S)],
                    radius=int(0.009 * S), fill=(118, 122, 134, 255))
for i, (length, shade) in enumerate([(0.52, (244, 245, 247)), (0.38, (184, 188, 198)), (0.26, (132, 137, 150))]):
    y = top_y + i * (bar_h + gap)
    d.rounded_rectangle([axis_x + int(0.03 * S), y, axis_x + int(0.03 * S) + int(length * S), y + bar_h],
                        radius=bar_h // 2, fill=shade + (255,))

here = Path(__file__).parent
out = here / "icon.png"
big = img.resize((SIZE, SIZE), Image.LANCZOS)
big.save(out)
big.save(here / "icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
big.save(here / "icon.icns")
big.resize((64, 64), Image.LANCZOS).save(here.parent / "public" / "favicon.png")
print(out, here / "icon.ico", here / "icon.icns", here.parent / "public" / "favicon.png")
