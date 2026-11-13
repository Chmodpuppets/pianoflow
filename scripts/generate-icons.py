#!/usr/bin/env python3
"""Generate PianoFlow PWA icons (zero external assets; Pillow only)."""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public", "icons")
os.makedirs(OUT, exist_ok=True)

BG_TOP = (23, 30, 56)
BG_BOT = (10, 13, 24)
BLUE = (78, 161, 255)
GREEN = (89, 217, 142)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make(size, safe=1.0):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        d.line([(0, y), (size, y)], fill=lerp(BG_TOP, BG_BOT, y / size))

    # glow layer
    glow = Image.new("RGB", (size, size), (0, 0, 0))
    gd = ImageDraw.Draw(glow)

    def bar(cx, top, h, color, w):
        x0 = cx - w / 2
        x1 = cx + w / 2
        r = w / 2
        gd.rounded_rectangle([x0, top, x1, top + h], radius=r, fill=color)
        d.rounded_rectangle([x0, top, x1, top + h], radius=r, fill=color)

    s = size * safe
    off = (size - s) / 2
    w = s * 0.115
    # left blue tall, middle blue short, right green tall
    bar(off + s * 0.32, off + s * 0.24, s * 0.40, BLUE, w)
    bar(off + s * 0.50, off + s * 0.30, s * 0.28, BLUE, w)
    bar(off + s * 0.68, off + s * 0.20, s * 0.46, GREEN, w)

    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.03))
    from PIL import ImageChops
    img = ImageChops.add(img, glow.point(lambda v: int(v * 0.6)))
    return img


make(192).save(os.path.join(OUT, "icon-192.png"))
make(512).save(os.path.join(OUT, "icon-512.png"))
make(512, safe=0.8).save(os.path.join(OUT, "icon-maskable-512.png"))
make(180).save(os.path.join(OUT, "apple-touch-icon.png"))
print("icons written:", sorted(os.listdir(OUT)))
