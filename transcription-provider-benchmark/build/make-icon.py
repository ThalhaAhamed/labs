"""Draws build/icon.png (1024 px) from the MeetStream mark used in the UI header
(public/index.html: 94x90 viewBox, orange rounded square, ink block, ink flag).
electron-builder turns it into the .ico / .icns / Linux icons."""
from pathlib import Path
from PIL import Image, ImageDraw

SIZE, SS = 1024, 4                    # draw at 4x, then downsample for smooth edges
S = SIZE * SS
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Fit the 94x90 mark into the square with a margin, centred.
margin = 0.08 * S
scale = (S - 2 * margin) / 94
ox, oy = margin, (S - 90 * scale) / 2
P = lambda x, y: (ox + x * scale, oy + y * scale)

orange, ink = (0xFC, 0x64, 0x13, 255), (0x11, 0x11, 0x11, 255)
d.rounded_rectangle([P(0, 0), P(94, 90)], radius=13 * scale, fill=orange)
d.rounded_rectangle([P(17, 42), P(50, 74)], radius=4.5 * scale, fill=ink)
d.polygon([P(51, 16), P(77, 29), P(51, 42)], fill=ink)

out = Path(__file__).with_name("icon.png")
img.resize((SIZE, SIZE), Image.LANCZOS).save(out)
print(out)

# Platform formats too, so the build doesn't depend on electron-builder's converter.
big = Image.open(out)
big.save(out.with_name("icon.ico"), sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
big.save(out.with_name("icon.icns"))
print(out.with_name("icon.ico"), out.with_name("icon.icns"))
