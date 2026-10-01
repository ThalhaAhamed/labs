"""Builds the app icon: a white mark on a flat rust-orange rounded tile (one
orange, no shades), so it holds its own next to other filled app icons in
the taskbar and dock.

The mark (a rising chart with an arrow, an audio-level meter between two
lines, and a group of people) is build/icon-mark.png: the white shapes taken
from the supplied design as an alpha mask, so its layout is kept exactly and
only the colours are made flat. Every size uses the same mark.

Writes build/icon.png (1024 px) plus icon.ico and icon.icns, and
public/favicon.png for the page.
"""
from pathlib import Path
from PIL import Image, ImageDraw

SIZE, SS = 1024, 4                      # build at 4x, then downsample for smooth edges
S = SIZE * SS
TILE = (204, 86, 30)                    # rust orange, the only colour
MARK = (255, 255, 255)
HERE = Path(__file__).parent


def compose():
    """The mark in white, centred on the tile, as tall as 74.5% of it (its
    proportion in the supplied design)."""
    mark = Image.open(HERE / "icon-mark.png").convert("L")
    mark = mark.crop(mark.getbbox())
    inset = round(40 * SS)                               # tile margin, like other app icons
    side = S - 2 * inset
    scale = side * 0.745 / mark.height
    mark = mark.resize((round(mark.width * scale), round(mark.height * scale)), Image.LANCZOS)

    tile = Image.new("L", (S, S), 0)
    ImageDraw.Draw(tile).rounded_rectangle([inset, inset, S - inset, S - inset], radius=round(side * 0.2), fill=255)
    img = Image.new("RGBA", (S, S), TILE + (0,))
    img.putalpha(tile)
    white = Image.new("RGBA", mark.size, MARK + (255,))
    img.paste(white, ((S - mark.width) // 2, (S - mark.height) // 2), mark)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == "__main__":
    big = compose()
    big.save(HERE / "icon.png")
    ico = [big.resize((s, s), Image.LANCZOS) for s in (16, 24, 32, 48, 64, 128, 256)]
    ico[-1].save(HERE / "icon.ico", sizes=[im.size for im in ico], append_images=ico[:-1])
    big.save(HERE / "icon.icns")
    big.resize((64, 64), Image.LANCZOS).save(HERE.parent / "public" / "favicon.png")
    print(HERE / "icon.png", HERE / "icon.ico", HERE / "icon.icns", HERE.parent / "public" / "favicon.png")
