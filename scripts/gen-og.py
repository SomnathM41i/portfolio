#!/usr/bin/env python3
"""Generate the portfolio Open Graph image (1200x630) with the site's design tokens.

Usage:  python3 scripts/gen-og.py
Output: og-image.png  (repo root)
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (13, 17, 23)
BG2 = (22, 27, 34)
GREEN = (0, 255, 157)
GREEN_DIM = (0, 204, 122)
TEXT = (230, 237, 243)
MUTED = (157, 167, 179)
BORDER = (48, 54, 61)

FONT_DIR = "/mnt/c/Windows/Fonts"
def F(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)

def main():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # subtle grid, like the hero
    step = 44
    for x in range(0, W, step):
        d.line([(x, 0), (x, H)], fill=(0, 36, 24), width=1)
    for y in range(0, H, step):
        d.line([(0, y), (W, y)], fill=(0, 36, 24), width=1)

    # soft green radial glow top-right
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([700, -260, 1400, 440], fill=(0, 255, 157, 26))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    d = ImageDraw.Draw(img)

    # top-left monogram block
    d.rounded_rectangle([60, 60, 168, 168], radius=18, outline=GREEN, width=4)
    d.text((82, 92), "SM", font=F("arialbd.ttf", 52), fill=GREEN)

    # availability line
    d.rounded_rectangle([200, 72, 356, 102], radius=15, fill=(0, 255, 157, 255))
    d.text((214, 77), "AVAILABLE FOR HIRE", font=F("arialbd.ttf", 16), fill=(0, 0, 0))

    # name + role
    d.text((60, 220), "Somnath Mali", font=F("arialbd.ttf", 92), fill=TEXT)
    d.text((62, 336), "Full-Stack Developer", font=F("segoeui.ttf", 40), fill=GREEN)
    d.text((62, 396), "PHP · Laravel · CodeIgniter · FastAPI · Python · React", font=F("segoeui.ttf", 30), fill=MUTED)

    # divider
    d.line([(60, 470), (1140, 470)], fill=BORDER, width=2)

    # bottom tagline
    d.text((60, 496), "Production fintech systems · Payments · AI/LLM · Security (DCSC)", font=F("segoeui.ttf", 26), fill=TEXT)
    d.text((60, 546), "somnathm41i-portfolio.vercel.app", font=F("consola.ttf", 24), fill=GREEN_DIM)

    # bottom-right stats
    stats = [("3+", "Years"), ("25+", "Platforms"), ("10K-50K", "Users")]
    x = 640
    for num, label in stats:
        d.text((x, 496), num, font=F("arialbd.ttf", 44), fill=GREEN)
        d.text((x, 552), label, font=F("segoeui.ttf", 20), fill=MUTED)
        x += 190

    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "og-image.png")
    img.save(out, "PNG")
    print("wrote", out, img.size)

if __name__ == "__main__":
    main()