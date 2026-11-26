"""Draws the Mattana Vita icon: night-blue ground, a luminous electric-blue route curving up to a flag, a GPS dot."""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

S = 2048
img = Image.new("RGB", (S, S), (4, 6, 12))
px = img.load()
for y in range(S):
    for x in range(S):
        d = math.hypot(x - S * 0.5, y - S * 0.42) / (S * 0.75)
        t = max(0.0, 1 - d)
        px[x, y] = (round(4 + 10 * t), round(6 + 24 * t), round(12 + 58 * t))

# route: smooth S curve from bottom to top
pts = []
for i in range(241):
    t = i / 240
    y = S * 0.80 - t * S * 0.56
    x = S * 0.5 + math.sin(t * math.pi * 2.0 + 0.4) * S * 0.17 * (0.35 + 0.65 * math.sin(t * math.pi))
    pts.append((x, y))

glow = Image.new("RGB", (S, S), (0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.line(pts, fill=(30, 110, 255), width=150, joint="curve")
glow = glow.filter(ImageFilter.GaussianBlur(70))
img = Image.blend(img, Image.composite(glow, img, Image.new("L", (S, S), 255)), 0.0)
base = img.copy()
from PIL import ImageChops
img = ImageChops.add(base, glow)

d = ImageDraw.Draw(img)
d.line(pts, fill=(61, 139, 255), width=64, joint="curve")
d.line(pts, fill=(150, 200, 255), width=18, joint="curve")

# flag at the top end
fx, fy = pts[-1]
d.line([(fx, fy), (fx, fy - 330)], fill=(240, 246, 255), width=26)
d.polygon([(fx + 8, fy - 330), (fx + 250, fy - 262), (fx + 8, fy - 190)], fill=(240, 246, 255))

# GPS dot at the start
sx, sy = pts[0]
r = 120
d.ellipse((sx - r - 38, sy - r - 38, sx + r + 38, sy + r + 38), fill=(255, 255, 255))
d.ellipse((sx - r, sy - r, sx + r, sy + r), fill=(10, 132, 255))

os.makedirs("public/icons", exist_ok=True)
for name, size in (("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180), ("favicon-32.png", 32)):
    img.resize((size, size), Image.LANCZOS).save(f"public/icons/{name}", optimize=True)
print("ok")
