"""Draws the app icon: an orange ring around a microphone, a waveform that
turns into a check mark, and an arrow rising over leaderboard bars (audio in,
scored, ranked). Writes build/icon.png (1024 px) plus icon.ico and icon.icns,
and public/favicon.png for the page.

The mark is drawn as one alpha mask (strokes add, cut-outs erase), then filled
with a top-to-bottom orange gradient.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

SIZE, SS = 1024, 4                      # draw at 4x, then downsample for smooth edges
S = SIZE * SS
C = S / 2


def p(x, y):
    """Design units (0..1024) to canvas pixels."""
    return (x * SS, y * SS)


def w(v):
    return round(v * SS)


ON, OFF = 255, 0


def render(simple=False):
    """The full mark, or (simple) a bolder one without the mic and waveform for 16-64 px."""
    mask = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(mask)

    def line(points, width, fill=ON):
        pts = [p(*q) for q in points]
        d.line(pts, fill=fill, width=w(width), joint="curve")
        r = w(width) / 2
        for x, y in (pts[0], pts[-1]):     # round caps
            d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

    # Outer ring, open at the top right where the arrow leaves it.
    R, RW = 440, (58 if not simple else 84)
    box = [C - w(R), C - w(R), C + w(R), C + w(R)]
    d.arc(box, start=-12, end=286, fill=ON, width=w(RW))
    # Inner ring along the left, behind the waveform.
    if not simple:
        R2, RW2 = 360, 26
        box2 = [C - w(R2), C - w(R2), C + w(R2), C + w(R2)]
        d.arc(box2, start=105, end=235, fill=ON, width=w(RW2))

    # Leaderboard bars, rising left to right, clipped to the inside of the ring.
    bars = Image.new("L", (S, S), 0)
    bd = ImageDraw.Draw(bars)
    for x0, top in (((575, 640), (675, 540), (775, 440)) if not simple else ((560, 650), (690, 500))):
        bd.rounded_rectangle([*p(x0, top), *p(x0 + (72 if not simple else 96), 1000)], radius=w(10), fill=ON)
    inner = R - RW / 2 - 24
    inside = Image.new("L", (S, S), 0)
    ImageDraw.Draw(inside).ellipse([C - w(inner), C - w(inner), C + w(inner), C + w(inner)], fill=ON)
    bars = Image.composite(bars, Image.new("L", (S, S), 0), inside)
    mask.paste(ON, (0, 0), bars)

    # Microphone: capsule with grille slots, a cradle and a stem.
    mx, mtop, mw, mh = 450, 210, 124, 250
    if not simple:
        d.rounded_rectangle([*p(mx - mw / 2, mtop), *p(mx + mw / 2, mtop + mh)], radius=w(mw / 2), fill=ON)
        for gy in (mtop + 70, mtop + 108, mtop + 146):
            d.rounded_rectangle([*p(mx - mw / 2 + 26, gy), *p(mx + mw / 2 - 26, gy + 14)], radius=w(7), fill=OFF)
        d.arc([*p(mx - 100, mtop + 90), *p(mx + 100, mtop + mh + 60)], start=10, end=170, fill=ON, width=w(26))
        line([(mx, mtop + mh + 58), (mx, mtop + mh + 100)], 26)

    # Gap around the check so it reads as its own stroke over the bars and mic.
    check = [(365, 600), (500, 735), (800, 355)] if not simple else [(300, 520), (470, 690), (790, 300)]
    line(check, 120 if not simple else 150, fill=OFF)

    # Waveform from the left edge of the ring into the check mark.
    if not simple:
        wave = [(152, 560), (215, 560), (245, 520), (275, 620), (305, 430), (340, 690), (372, 505), (400, 600)]
        line(wave, 30)

    # Check mark rising into an arrow; the head follows the last stroke's direction.
    stroke = 64 if not simple else 96
    line(check, stroke)
    ax, ay = check[-1]
    ang = math.atan2(ay - check[1][1], ax - check[1][0])
    head, side = (135, 78) if not simple else (170, 100)
    tip = (ax + head * math.cos(ang), ay + head * math.sin(ang))
    left = (ax + side * math.cos(ang + math.pi / 2), ay + side * math.sin(ang + math.pi / 2))
    right = (ax + side * math.cos(ang - math.pi / 2), ay + side * math.sin(ang - math.pi / 2))
    d.polygon([p(*tip), p(*left), p(*right)], fill=ON)

    # Fill: warm orange at the top to a deeper orange at the bottom.
    grad = Image.new("RGBA", (1, S))
    top, bottom = (250, 146, 48), (226, 86, 18)
    for y in range(S):
        t = y / (S - 1)
        grad.putpixel((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
    grad = grad.resize((S, S))
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


here = Path(__file__).parent
out = here / "icon.png"
big = render()
small = render(simple=True)
big.save(out)
# Small sizes get the simple mark, so the icon still reads in the taskbar.
ico = [small.resize((s, s), Image.LANCZOS) for s in (16, 24, 32, 48)] + [big.resize((s, s), Image.LANCZOS) for s in (64, 128, 256)]
ico[-1].save(here / "icon.ico", sizes=[im.size for im in ico], append_images=ico[:-1])
big.save(here / "icon.icns")
small.resize((64, 64), Image.LANCZOS).save(here.parent / "public" / "favicon.png")
print(out, here / "icon.ico", here / "icon.icns", here.parent / "public" / "favicon.png")
