from PIL import Image, ImageDraw
import math, os

os.makedirs('icons', exist_ok=True)

def make_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    p = size / 128

    # Background circle with gradient feel
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bgd = ImageDraw.Draw(bg)
    for i in range(size // 2):
        t = i / (size / 2)
        r = int(5 + 20 * t)
        g = int(14 + 151 * t)
        b = int(28 + 195 * t)
        bgd.ellipse([i, i, size - i, size - i], fill=(r, g, b, 255))
    img = Image.alpha_composite(img, bg)
    d = ImageDraw.Draw(img)

    # Water drop shape
    cx = size / 2
    drop_top = size * 0.12
    drop_bottom = size * 0.88
    drop_w = size * 0.42

    # Draw drop body: circle at bottom + triangle top
    circle_cy = drop_bottom - drop_w * 0.85
    circle_r = drop_w * 0.82

    d.ellipse([
        cx - circle_r, circle_cy - circle_r,
        cx + circle_r, circle_cy + circle_r
    ], fill=(255, 255, 255, 230))

    # Triangle top (teardrop point)
    poly = [
        (cx, drop_top),
        (cx - drop_w * 0.75, circle_cy),
        (cx + drop_w * 0.75, circle_cy),
    ]
    d.polygon(poly, fill=(255, 255, 255, 230))

    # Inner highlight/shine
    shine_r = circle_r * 0.28
    shine_cx = cx - circle_r * 0.28
    shine_cy = circle_cy - circle_r * 0.28
    d.ellipse([
        shine_cx - shine_r, shine_cy - shine_r,
        shine_cx + shine_r, shine_cy + shine_r
    ], fill=(255, 255, 255, 120))

    # Small waves inside drop for detail (only on 48px+)
    if size >= 48:
        wave_y = circle_cy + circle_r * 0.18
        wave_color = (14, 165, 233, 160)
        for wi in range(2):
            wy = wave_y + wi * circle_r * 0.22
            wr = circle_r * (0.55 - wi * 0.1)
            d.ellipse([cx - wr, wy - circle_r * 0.06,
                        cx + wr, wy + circle_r * 0.06],
                       fill=wave_color)

    return img

for sz in [16, 32, 48, 128]:
    icon = make_icon(sz)
    icon.save(f'icons/icon{sz}.png')
    print(f'  icon{sz}.png')

print('Icons generated.')
