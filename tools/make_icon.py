#!/usr/bin/env python3
"""Draws the app icon (build/icon.png, 1024x1024): a cooking pot over a fire with
a heart of steam, on a Sheikah-blue tile. Original artwork, no game assets."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

S = 1024
out = Path(__file__).resolve().parent.parent / "build" / "icon.png"
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

# tile with a vertical gradient
tile = Image.new("RGBA", (S, S))
td = ImageDraw.Draw(tile)
for y in range(S):
    k = y / S
    td.line([(0, y), (S, y)], fill=(int(10 + 18 * k), int(44 - 18 * k), int(52 - 22 * k), 255))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([40, 40, S - 40, S - 40], radius=210, fill=255)
img.paste(tile, (0, 0), mask)
d = ImageDraw.Draw(img)
d.rounded_rectangle([40, 40, S - 40, S - 40], radius=210, outline=(82, 219, 234, 120), width=10)

# glow behind the pot
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([250, 330, 774, 830], fill=(82, 219, 234, 90))
img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(70)))

# fire
fire = Image.new("RGBA", (S, S), (0, 0, 0, 0))
fd = ImageDraw.Draw(fire)
for cx, h, col in [(420, 190, (255, 130, 40, 255)), (512, 240, (255, 196, 70, 255)), (604, 190, (255, 130, 40, 255))]:
    fd.polygon([(cx - 62, 930), (cx, 930 - h), (cx + 62, 930)], fill=col)
img.alpha_composite(fire.filter(ImageFilter.GaussianBlur(6)))

# pot body, rim and handles
d.ellipse([250, 470, 774, 800], fill=(26, 30, 34, 255), outline=(120, 226, 238, 255), width=12)
d.rounded_rectangle([230, 440, 794, 505], radius=30, fill=(40, 46, 52, 255), outline=(120, 226, 238, 255), width=12)
d.rounded_rectangle([175, 470, 250, 520], radius=22, fill=(40, 46, 52, 255), outline=(120, 226, 238, 255), width=10)
d.rounded_rectangle([774, 470, 849, 520], radius=22, fill=(40, 46, 52, 255), outline=(120, 226, 238, 255), width=10)

# heart made of steam
heart = Image.new("RGBA", (S, S), (0, 0, 0, 0))
hd = ImageDraw.Draw(heart)
hd.ellipse([398, 200, 518, 320], fill=(255, 100, 104, 255))
hd.ellipse([506, 200, 626, 320], fill=(255, 100, 104, 255))
hd.polygon([(404, 283), (620, 283), (512, 405)], fill=(255, 100, 104, 255))
img.alpha_composite(heart.filter(ImageFilter.GaussianBlur(14)))
img.alpha_composite(heart)

# macOS-style margin: the tile takes ~80% of the canvas
final = Image.new("RGBA", (S, S), (0, 0, 0, 0))
final.alpha_composite(img.resize((840, 840), Image.LANCZOS), (92, 92))
out.parent.mkdir(exist_ok=True)
final.save(out)
print(out)
