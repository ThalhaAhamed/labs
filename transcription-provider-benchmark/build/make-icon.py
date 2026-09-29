"""Draws the app icon: a white mark on a rust-orange rounded tile, so it
holds its own next to other filled app icons in the taskbar and dock.

The mark is a ring around a microphone, with a waveform coming in from the
left that turns into a check mark, and an arrow leaving the ring at the top
right (audio in, scored, ranked). Every size uses the same mark; sizes up to
48 px get heavier strokes and no grille slots, so it still reads in the
taskbar and the installer.

Writes build/icon.png (1024 px) plus icon.ico and icon.icns, and
public/favicon.png for the page. The mark is drawn as one alpha mask (strokes
add, cut-outs erase), then laid over the tile.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

SIZE, SS = 1024, 4                      # draw at 4x, then downsample for smooth edges
S = SIZE * SS
C = S / 2
TILE = (204, 86, 30)                    # rust orange
MARK = (255, 255, 255)
ON, OFF = 255, 0


def p(x, y):
    """Design units (0..1024) to canvas pixels."""
    return (x * SS, y * SS)


def w(v):
    return round(v * SS)


def render(small=False):
    mask = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(mask)
    k = 1.4 if small else 1.0            # stroke weight

    def line(points, width, fill=ON):
        pts = [p(*q) for q in points]
        d.line(pts, fill=fill, width=w(width), joint="curve")
        r = w(width) / 2
        for x, y in (pts[0], pts[-1]):   # round caps
            d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

    def curve(points, width):
        """A smooth stroke along a dense path: stamp round dots, no joints."""
        r = w(width) / 2
        for a, b in zip(points, points[1:]):
            n = max(1, int(math.dist(a, b) / 2))
            for i in range(n + 1):
                x, y = p(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)
                d.ellipse([x - r, y - r, x + r, y + r], fill=ON)

    # Ring, open at the top right where the arrow leaves it.
    R, RW = 410, 54 * k
    d.arc([C - w(R), C - w(R), C + w(R), C + w(R)], start=-24, end=292, fill=ON, width=w(RW))

    # Microphone: capsule, grille slots (large sizes only), cradle, stem and base.
    mx, top, mw, mh = 512, 250, 150, 290
    d.rounded_rectangle([*p(mx - mw / 2, top), *p(mx + mw / 2, top + mh)], radius=w(mw / 2), fill=ON)
    if not small:
        for gy in (top + 70, top + 112, top + 154):
            d.rounded_rectangle([*p(mx - mw / 2 + 30, gy), *p(mx + mw / 2 - 30, gy + 16)], radius=w(8), fill=OFF)
    cw, cy, cs = 135, top + mh - 60, 34 * k
    d.arc([*p(mx - cw, cy - cw), *p(mx + cw, cy + cw)], start=0, end=180, fill=ON, width=w(cs))
    line([(mx - cw + cs / 2, top + 150), (mx - cw + cs / 2, cy)], cs)
    line([(mx + cw - cs / 2, top + 150), (mx + cw - cs / 2, cy)], cs)
    line([(mx, cy + cw), (mx, 800)], cs)
    line([(mx - 85, 805), (mx + 85, 805)], cs)

    # The check and arrow sit in front of the mic, with a clear gap around them.
    check = [(318, 560), (455, 700), (740, 372)]
    stroke = 58 * k
    line(check, stroke + 36, fill=OFF)
    ax, ay = check[-1]
    ang = math.atan2(ay - check[1][1], ax - check[1][0])
    head, side = 150, 88 + 12 * (k - 1)

    def arrowhead(grow=0):
        tip = (ax + (head + grow) * math.cos(ang), ay + (head + grow) * math.sin(ang))
        left = (ax + (side + grow) * math.cos(ang + math.pi / 2), ay + (side + grow) * math.sin(ang + math.pi / 2))
        right = (ax + (side + grow) * math.cos(ang - math.pi / 2), ay + (side + grow) * math.sin(ang - math.pi / 2))
        return [p(*tip), p(*left), p(*right)]

    d.polygon(arrowhead(20), fill=OFF)
    line(check, stroke)
    d.polygon(arrowhead(), fill=ON)

    # Waveform from the left of the ring into the start of the check.
    x0, x1, y0 = 128, check[0][0], check[0][1]    # starts inside the ring stroke (PIL draws arcs inward)
    pts = []
    for i in range(161):
        t = i / 160
        x = x0 + (x1 - x0) * t
        amp = 58 * math.sin(math.pi * t) ** 0.8               # swells, then settles into the check
        pts.append((x, y0 - amp * math.sin(2 * math.pi * 2 * t)))
    curve(pts, 28 * k)

    return mask


def compose(small=False):
    """The mark in white on the tile, cropped to its own bounds and filling 84%
    of the tile."""
    mark = render(small)
    mark = mark.crop(mark.getbbox())
    inset = w(40)                                        # tile margin, like other app icons
    side = S - 2 * inset
    scale = side * 0.84 / max(mark.size)
    mark = mark.resize((round(mark.width * scale), round(mark.height * scale)), Image.LANCZOS)

    tile = Image.new("L", (S, S), 0)
    ImageDraw.Draw(tile).rounded_rectangle([inset, inset, S - inset, S - inset], radius=round(side * 0.22), fill=ON)
    img = Image.new("RGBA", (S, S), TILE + (0,))
    img.putalpha(tile)
    white = Image.new("RGBA", mark.size, MARK + (255,))
    img.paste(white, ((S - mark.width) // 2, (S - mark.height) // 2), mark)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


here = Path(__file__).parent
out = here / "icon.png"
big = compose()
small = compose(small=True)
big.save(out)
ico = [small.resize((s, s), Image.LANCZOS) for s in (16, 24, 32, 48)] + [big.resize((s, s), Image.LANCZOS) for s in (64, 128, 256)]
ico[-1].save(here / "icon.ico", sizes=[im.size for im in ico], append_images=ico[:-1])
big.save(here / "icon.icns")
small.resize((64, 64), Image.LANCZOS).save(here.parent / "public" / "favicon.png")
print(out, here / "icon.ico", here / "icon.icns", here.parent / "public" / "favicon.png")
