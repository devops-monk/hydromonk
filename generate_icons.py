"""
HydroMonk icon generator.
Classic water-drop: circular base + two quadratic bezier curves to a pointed tip.
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import math


def bezier2(p0, p1, p2, steps):
    """Quadratic bezier from p0 to p2 with control p1."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = (1-t)**2 * p0[0] + 2*(1-t)*t * p1[0] + t**2 * p2[0]
        y = (1-t)**2 * p0[1] + 2*(1-t)*t * p1[1] + t**2 * p2[1]
        pts.append((x, y))
    return pts


def water_drop_points(cx, tip_y, circle_cy, r, steps=48):
    """
    Classic water-drop outline:
      - tip at (cx, tip_y)  [top, pointed]
      - circular base centred at (cx, circle_cy) with radius r  [bottom, round]
    """
    pts = []

    # Right side: tip → right contact point of circle
    right_x, right_y = cx + r, circle_cy
    ctrl_r = (cx + r * 0.72, tip_y + (circle_cy - tip_y) * 0.28)
    pts += bezier2((cx, tip_y), ctrl_r, (right_x, right_y), steps)

    # Bottom arc: right → bottom → left  (angles 0 → π, i.e. clockwise through bottom)
    for i in range(steps + 1):
        angle = math.pi * i / steps          # 0 … π
        pts.append((cx + r * math.cos(angle),
                    circle_cy + r * math.sin(angle)))

    # Left side: left contact point → tip
    left_x, left_y = cx - r, circle_cy
    ctrl_l = (cx - r * 0.72, tip_y + (circle_cy - tip_y) * 0.28)
    pts += bezier2((left_x, left_y), ctrl_l, (cx, tip_y), steps)

    return pts


def diag_gradient(size, tl_color, br_color):
    """Diagonal gradient top-left → bottom-right."""
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    xs = np.linspace(0, 1, size)
    ys = np.linspace(0, 1, size)
    xg, yg = np.meshgrid(xs, ys)
    t = (xg + yg) / 2                        # 0 = top-left, 1 = bottom-right
    for c in range(3):
        arr[:, :, c] = (tl_color[c] + (br_color[c] - tl_color[c]) * t).astype(np.uint8)
    return Image.fromarray(arr, 'RGB')


def make_icon(size):
    SCALE = 8
    S = size * SCALE

    # ── Geometry ─────────────────────────────────────────────────────
    cx        = S / 2
    r         = S * 0.34          # circle radius  (68 % of half-width)
    circle_cy = S * 0.63          # circle centre  (63 % down)
    tip_y     = S * 0.06          # tip             (6 % from top)

    pts = water_drop_points(cx, tip_y, circle_cy, r)

    # ── Mask (anti-aliased) ──────────────────────────────────────────
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=SCALE * 0.5))
    mask_arr = np.array(mask)

    # ── Gradient fill: sky-300 (top-left) → sky-800 (bottom-right) ──
    grad = diag_gradient(S,
                         tl_color=(125, 211, 252),   # #7DD3FC
                         br_color=(  3,  90, 145))   # ~sky-800
    canvas = grad.convert('RGBA')
    # Apply mask to alpha channel
    arr = np.array(canvas)
    arr[:, :, 3] = mask_arr
    canvas = Image.fromarray(arr, 'RGBA')

    # ── Large soft highlight (upper-left inner zone) ─────────────────
    hl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hcx = cx - r * 0.20
    hcy = tip_y + (circle_cy - tip_y) * 0.22
    hrx = r * 0.42
    hry = (circle_cy - tip_y) * 0.22
    hd.ellipse([hcx - hrx, hcy - hry, hcx + hrx, hcy + hry],
               fill=(255, 255, 255, 115))
    hl = hl.filter(ImageFilter.GaussianBlur(radius=SCALE * 1.1))
    hl_arr = np.array(hl)
    hl_arr[:, :, 3] = np.minimum(hl_arr[:, :, 3], mask_arr)
    canvas = Image.alpha_composite(canvas, Image.fromarray(hl_arr, 'RGBA'))

    # ── Small specular dot near tip ───────────────────────────────────
    sp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sp)
    scx, scy = cx - r * 0.24, tip_y + (circle_cy - tip_y) * 0.12
    sr = S * 0.038
    sd.ellipse([scx - sr, scy - sr, scx + sr, scy + sr],
               fill=(255, 255, 255, 200))
    sp = sp.filter(ImageFilter.GaussianBlur(radius=SCALE * 0.55))
    sp_arr = np.array(sp)
    sp_arr[:, :, 3] = np.minimum(sp_arr[:, :, 3], mask_arr)
    canvas = Image.alpha_composite(canvas, Image.fromarray(sp_arr, 'RGBA'))

    return canvas.resize((size, size), Image.LANCZOS)


for sz in [16, 32, 48, 128]:
    make_icon(sz).save(f'icons/icon{sz}.png')
    print(f'  icon{sz}.png')

print('Done.')
