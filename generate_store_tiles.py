"""
Chrome Web Store promo tiles for HydroMonk.
  - Small promo tile:   440 x 280 (JPEG, no alpha)
  - Marquee promo tile: 1400 x 560 (JPEG, no alpha)
"""
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import math, os

os.makedirs('store-assets', exist_ok=True)

# ── Shared colours ────────────────────────────────────────────────────
SKY_DARK   = (  4,  18,  38)   # near-black navy bg
SKY_DEEP   = (  5,  50, 100)
SKY_MID    = (  7, 100, 160)
SKY_BRIGHT = ( 14, 165, 233)   # primary blue
SKY_LIGHT  = ( 56, 189, 248)
WHITE      = (255, 255, 255)
WHITE_DIM  = (200, 230, 250)


# ── Helpers ───────────────────────────────────────────────────────────

def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

FONT_BOLD = '/System/Library/Fonts/HelveticaNeue.ttc'
FONT_REG  = '/System/Library/Fonts/HelveticaNeue.ttc'

def radial_bg(W, H, cx_frac=0.35, cy_frac=0.5):
    """Dark navy → slightly lighter navy radial gradient."""
    arr = np.zeros((H, W, 3), dtype=np.float32)
    cx, cy = W * cx_frac, H * cy_frac
    ys, xs = np.mgrid[0:H, 0:W]
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    max_d = math.hypot(W, H) * 0.7
    t = np.clip(dist / max_d, 0, 1)
    for c, (a, b) in enumerate(zip(SKY_DEEP, SKY_DARK)):
        arr[:, :, c] = a + (b - a) * t
    return Image.fromarray(arr.astype(np.uint8), 'RGB')


def draw_glow_circle(draw, cx, cy, r, color, alpha_max=80, rings=6):
    for i in range(rings, 0, -1):
        a = int(alpha_max * (i / rings) ** 1.5)
        ri = r + (rings - i) * r * 0.25
        draw.ellipse([cx - ri, cy - ri, cx + ri, cy + ri],
                     outline=(*color[:3], a), width=2)


def drop_polygon(cx, tip_y, circle_cy, r, steps=60):
    """Same drop shape as in generate_icons.py."""
    def bezier2(p0, p1, p2, n):
        pts = []
        for i in range(n + 1):
            t = i / n
            x = (1-t)**2 * p0[0] + 2*(1-t)*t * p1[0] + t**2 * p2[0]
            y = (1-t)**2 * p0[1] + 2*(1-t)*t * p1[1] + t**2 * p2[1]
            pts.append((x, y))
        return pts

    pts  = bezier2((cx, tip_y),
                   (cx + r * 0.72, tip_y + (circle_cy - tip_y) * 0.28),
                   (cx + r, circle_cy), steps)
    for i in range(steps + 1):
        a = math.pi * i / steps
        pts.append((cx + r * math.cos(a), circle_cy + r * math.sin(a)))
    pts += bezier2((cx - r, circle_cy),
                   (cx - r * 0.72, tip_y + (circle_cy - tip_y) * 0.28),
                   (cx, tip_y), steps)
    return pts


def draw_drop(canvas, cx, cy_center, height, glow=True):
    """Draw a glassy water drop centred at cx, vertically centred at cy_center."""
    r       = height * 0.34
    tip_y   = cy_center - height * 0.48
    ccy     = cy_center + height * 0.12   # circle centre slightly below midpoint
    pts     = drop_polygon(cx, tip_y, ccy, r)

    overlay = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    od      = ImageDraw.Draw(overlay)

    # Fill gradient (sky-light → sky-mid)
    # Use diagonal fill via manual pixel loop on a small array, then paste
    bb_x0 = int(cx - r - 2); bb_x1 = int(cx + r + 2)
    bb_y0 = int(tip_y - 2);  bb_y1 = int(ccy + r + 2)
    bw, bh = bb_x1 - bb_x0, bb_y1 - bb_y0
    if bw > 0 and bh > 0:
        g = np.zeros((bh, bw, 4), dtype=np.uint8)
        xs = np.linspace(0, 1, bw); ys = np.linspace(0, 1, bh)
        xg, yg = np.meshgrid(xs, ys)
        t = (xg * 0.4 + yg * 0.6)
        for c, (a, b) in enumerate(zip((125, 211, 252), (3, 90, 145))):
            g[:, :, c] = np.clip(a + (b - a) * t, 0, 255).astype(np.uint8)
        g[:, :, 3] = 255
        grad_img = Image.fromarray(g, 'RGBA')
        # mask to drop shape
        m = Image.new('L', canvas.size, 0)
        ImageDraw.Draw(m).polygon(pts, fill=255)
        grad_img_full = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        grad_img_full.paste(grad_img, (bb_x0, bb_y0))
        grad_img_full.putalpha(m)
        overlay = Image.alpha_composite(overlay, grad_img_full)

    # Highlight ellipse (upper-left inside drop)
    hd = ImageDraw.Draw(overlay)
    hcx = cx - r * 0.20
    hcy = tip_y + (ccy - tip_y) * 0.22
    hrx, hry = r * 0.42, (ccy - tip_y) * 0.22
    h_layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(h_layer).ellipse(
        [hcx - hrx, hcy - hry, hcx + hrx, hcy + hry],
        fill=(255, 255, 255, 100))
    from PIL import ImageFilter
    h_layer = h_layer.filter(ImageFilter.GaussianBlur(radius=r * 0.18))
    m = Image.new('L', canvas.size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    ha = np.array(h_layer); ha[:, :, 3] = np.minimum(ha[:, :, 3], np.array(m))
    overlay = Image.alpha_composite(overlay, Image.fromarray(ha, 'RGBA'))

    # Outer glow
    if glow:
        glow_layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        for ring in range(5, 0, -1):
            alpha = int(35 * (ring / 5) ** 1.5)
            expand = ring * r * 0.05
            rpts = drop_polygon(cx, tip_y - expand, ccy + expand, r + expand)
            ImageDraw.Draw(glow_layer).polygon(rpts, fill=(*SKY_LIGHT, alpha))
        from PIL import ImageFilter
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=r * 0.25))
        overlay = Image.alpha_composite(Image.new('RGBA', canvas.size, (0,0,0,0)),
                                        glow_layer)
        overlay = Image.alpha_composite(overlay,
                                        Image.fromarray(np.array(grad_img_full if bw>0 else Image.new('RGBA',canvas.size,(0,0,0,0))), 'RGBA'))
        # Re-apply highlights
        overlay = Image.alpha_composite(overlay, Image.fromarray(ha, 'RGBA'))

    canvas_rgba = canvas.convert('RGBA')
    canvas_rgba = Image.alpha_composite(canvas_rgba, overlay)
    return canvas_rgba.convert('RGB')


def wrap(text, font, max_w):
    words, lines, cur = text.split(), [], ''
    for w in words:
        test = (cur + ' ' + w).strip()
        if font.getbbox(test)[2] > max_w:
            lines.append(cur); cur = w
        else:
            cur = test
    if cur: lines.append(cur)
    return lines


# ══════════════════════════════════════════════════════════════════════
#  SMALL PROMO TILE  440 × 280
# ══════════════════════════════════════════════════════════════════════
def make_small():
    W, H = 440, 280
    img = radial_bg(W, H, cx_frac=0.3, cy_frac=0.5).convert('RGB')
    draw = ImageDraw.Draw(img)

    # ── decorative concentric arcs (top-left) ──
    for i in range(4):
        ri = 60 + i * 40
        draw.arc([(-ri, H // 2 - ri), (ri, H // 2 + ri)],
                 start=280, end=400, fill=(*SKY_BRIGHT, 18 - i*4), width=1)

    # ── water drop (right side) ──
    drop_h = 185
    drop_cx = W - drop_h * 0.46
    drop_cy = H // 2
    img = draw_drop(img, drop_cx, drop_cy, drop_h, glow=True)
    draw = ImageDraw.Draw(img)

    # ── brand name ──
    f_brand  = load_font(FONT_BOLD, 38)
    f_tagline = load_font(FONT_REG, 15)
    f_sub     = load_font(FONT_REG, 12)

    PAD = 26
    draw.text((PAD, 54), 'HydroMonk', font=f_brand, fill=WHITE)

    tag = 'Drink Water Reminder'
    draw.text((PAD, 100), tag, font=f_tagline, fill=(*SKY_LIGHT,))

    # Feature bullets
    feats = ['💧 Smart reminders', '🔥 Streak tracking', '📊 Daily progress']
    for i, feat in enumerate(feats):
        draw.text((PAD, 136 + i * 22), feat, font=f_sub, fill=(*WHITE_DIM,))

    # Bottom brand
    brand_txt = 'by DevOps-Monk'
    bb = f_sub.getbbox(brand_txt)
    draw.text((W - PAD - (bb[2]-bb[0]), H - 18), brand_txt,
              font=f_sub, fill=(*SKY_BRIGHT, 160))

    img.save('store-assets/small-promo-440x280.jpg', 'JPEG', quality=96)
    print('  small-promo-440x280.jpg')
    return img


# ══════════════════════════════════════════════════════════════════════
#  MARQUEE PROMO TILE  1400 × 560
# ══════════════════════════════════════════════════════════════════════
def make_marquee():
    W, H = 1400, 560
    img = radial_bg(W, H, cx_frac=0.28, cy_frac=0.5).convert('RGB')
    draw = ImageDraw.Draw(img)

    # ── background decorative circles (glow rings) ──
    for i in range(6):
        ri = 120 + i * 80
        for cx_, cy_ in [(W * 0.25, H * 0.5), (W * 0.75, H * 0.5)]:
            draw.ellipse([cx_ - ri, cy_ - ri, cx_ + ri, cy_ + ri],
                         outline=(*SKY_BRIGHT, max(4, 20 - i*3)), width=1)

    # ── three water drops (right side) ──
    drops = [
        (W * 0.72, H * 0.5,  310),
        (W * 0.85, H * 0.48, 220),
        (W * 0.95, H * 0.52, 160),
    ]
    for dcx, dcy, dh in drops:
        img = draw_drop(img, dcx, dcy, dh, glow=True)
    draw = ImageDraw.Draw(img)

    # ── main headline ──
    f_logo    = load_font(FONT_BOLD, 88)
    f_tag     = load_font(FONT_BOLD, 34)
    f_feat    = load_font(FONT_REG,  22)
    f_brand   = load_font(FONT_REG,  18)

    PAD = 72

    # Drop emoji + name
    draw.text((PAD, 98),  '💧 HydroMonk',     font=f_logo, fill=WHITE)
    draw.text((PAD, 200), 'Drink Water Reminder',   font=f_tag,  fill=(*SKY_LIGHT,))

    # Divider line
    draw.line([(PAD, 258), (W * 0.46, 258)], fill=(*SKY_BRIGHT, 60), width=1)

    # Feature pills
    feats = [
        ('💧', 'Smart Reminders'),
        ('🔥', 'Streak Tracking'),
        ('📊', 'Daily Progress'),
        ('💡', 'Hydration Facts'),
        ('⚙️', 'Custom Schedule'),
    ]
    fx, fy = PAD, 280
    for emoji, label in feats:
        text = f'{emoji}  {label}'
        draw.text((fx, fy), text, font=f_feat, fill=(*WHITE_DIM,))
        fy += 38

    # Bottom tagline
    tagline = 'Privacy-first · No account · Free — by DevOps-Monk'
    draw.text((PAD, H - 44), tagline, font=f_brand, fill=(*SKY_BRIGHT, 150))

    img.save('store-assets/marquee-promo-1400x560.jpg', 'JPEG', quality=96)
    print('  marquee-promo-1400x560.jpg')
    return img


print('Generating store tiles...')
make_small()
make_marquee()
print('Done → store-assets/')
