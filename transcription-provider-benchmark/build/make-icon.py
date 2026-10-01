"""Draws the app icon: a white mark on a flat rust-orange rounded tile (one
orange, no shades), so it holds its own next to other filled app icons in
the taskbar and dock.

The mark: bars rising left to right with an arrow climbing over them (the
ranking), a waveform across the middle (the audio), and a group of people
below it (a meeting). Every size uses the same mark; sizes up to 48 px get
heavier strokes so it still reads in the taskbar and the installer.

Writes build/icon.png (1024 px) plus icon.ico and icon.icns, and
public/favicon.png for the page. The mark is drawn as one alpha mask (shapes
add, cut-outs erase gaps between them), then laid over the tile.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

SIZE, SS = 1024, 4                      # draw at 4x, then downsample for smooth edges
S = SIZE * SS
TILE = (204, 86, 30)                    # rust orange, the only colour
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
    k = 1.35 if small else 1.0           # stroke weight

    def line(points, width, fill=ON):
        pts = [p(*q) for q in points]
        d.line(pts, fill=fill, width=w(width), joint="curve")
        r = w(width) / 2
        for x, y in (pts[0], pts[-1]):   # round caps
            d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

    # A zigzag climbing to an arrow, with a bar hanging from each peak down to
    # the waveform: one chart shape, the zigzag its top edge.
    base = 528
    climb = [(236, 470), (346, 425), (411, 448), (476, 375), (541, 398), (606, 322), (716, 215)]
    stroke = 42 * k
    for cx in (346, 476, 606):
        top = dict(climb)[cx]
        d.rectangle([*p(cx - 46, top), *p(cx + 46, base)], fill=ON)
    ax, ay = climb[-1]
    ang = math.atan2(ay - climb[-2][1], ax - climb[-2][0])
    head, side = 118, 74 + 10 * (k - 1)
    tip = (ax + head * math.cos(ang), ay + head * math.sin(ang))
    left = (ax + side * math.cos(ang + math.pi / 2), ay + side * math.sin(ang + math.pi / 2))
    right = (ax + side * math.cos(ang - math.pi / 2), ay + side * math.sin(ang - math.pi / 2))
    line(climb, stroke)
    d.polygon([p(*tip), p(*left), p(*right)], fill=ON)

    # The waveform: flat, then a burst in the middle, with a gap above and below.
    y = 588
    wave = [(196, y), (456, y), (472, y - 16), (488, y + 20), (504, y - 30), (520, y + 30), (536, y - 18),
            (552, y + 10), (566, y), (828, y)]
    line(wave, 24 * k + 34, fill=OFF)
    line(wave, 24 * k)

    # People, back row first; each front figure cuts a gap into the ones behind.
    bottom = 852

    def person(cx, head_y, r, body_w, body_top, gap=14):
        def shape(grow, fill):
            d.ellipse([*p(cx - r - grow, head_y - r - grow), *p(cx + r + grow, head_y + r + grow)], fill=fill)
            box = [*p(cx - body_w / 2 - grow, body_top - grow), *p(cx + body_w / 2 + grow, body_top + 2 * (bottom - body_top) + grow)]
            d.chord(box, 180, 360, fill=fill)
        shape(gap, OFF)
        shape(0, ON)

    for cx, hy, r, bw, bt in ((300, 732, 30, 112, 776), (724, 732, 30, 112, 776),   # outer pair
                              (402, 714, 36, 136, 760), (622, 714, 36, 136, 760),   # middle pair
                              (512, 694, 44, 168, 744)):                            # front
        person(cx, hy, r, bw, bt)
    # Level base under the group.
    d.rectangle([*p(150, bottom), *p(880, 920)], fill=OFF)

    return mask


def compose(small=False):
    """The mark in white on the tile, cropped to its own bounds and filling 76%
    of the tile."""
    mark = render(small)
    mark = mark.crop(mark.getbbox())
    inset = w(40)                                        # tile margin, like other app icons
    side = S - 2 * inset
    scale = side * 0.76 / max(mark.size)
    mark = mark.resize((round(mark.width * scale), round(mark.height * scale)), Image.LANCZOS)

    tile = Image.new("L", (S, S), 0)
    ImageDraw.Draw(tile).rounded_rectangle([inset, inset, S - inset, S - inset], radius=round(side * 0.22), fill=ON)
    img = Image.new("RGBA", (S, S), TILE + (0,))
    img.putalpha(tile)
    white = Image.new("RGBA", mark.size, MARK + (255,))
    img.paste(white, ((S - mark.width) // 2, (S - mark.height) // 2), mark)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == "__main__":
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
