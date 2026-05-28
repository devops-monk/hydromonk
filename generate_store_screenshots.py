"""
HydroMonk — Chrome Web Store screenshots (1280×800, 24-bit PNG)
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np, math, os

SRC  = '/Users/abhaypratapsingh/Documents/Personal/ScreenshotPlugin/hydromonkimages'
OUT  = '/Users/abhaypratapsingh/Documents/Personal/ScreenshotPlugin/hydromonk/store-screenshots'
os.makedirs(OUT, exist_ok=True)

W, H = 1280, 800

FONT_BOLD = '/System/Library/Fonts/HelveticaNeue.ttc'
FONT_REG  = '/System/Library/Fonts/HelveticaNeue.ttc'

# Colour palette (matches extension UI)
C_BG_DARK   = ( 4, 10, 22)
C_BG_MID    = ( 6, 18, 38)
C_BG_LIGHT  = ( 8, 28, 58)
C_PRIMARY   = (14,165,233)
C_BRIGHT    = (56,189,248)
C_WHITE     = (255,255,255)
C_MUTED     = (180,220,245)
C_DIM       = (100,160,200)
C_BADGE_BG  = ( 10, 40, 80)

SHOTS = sorted([f for f in os.listdir(SRC) if f.endswith('.png')])
IMG_MAIN     = Image.open(os.path.join(SRC, SHOTS[0]))  # main popup
IMG_BENEFITS = Image.open(os.path.join(SRC, SHOTS[1]))  # benefits
IMG_SETTINGS = Image.open(os.path.join(SRC, SHOTS[2]))  # settings

# ── helpers ────────────────────────────────────────────────────────────────────

def font(size, bold=True):
    idx = 1 if bold else 0
    try:    return ImageFont.truetype(FONT_BOLD, size, index=idx)
    except: return ImageFont.load_default()

def radial_bg(w, h, cx_frac=0.5, cy_frac=0.5, inner=C_BG_LIGHT, outer=C_BG_DARK):
    arr = np.zeros((h, w, 3), dtype=np.float32)
    cx, cy = w * cx_frac, h * cy_frac
    ys, xs = np.mgrid[0:h, 0:w]
    d = np.sqrt((xs-cx)**2 + (ys-cy)**2) / (math.hypot(w, h) * 0.55)
    t = np.clip(d, 0, 1)
    for i in range(3):
        arr[:,:,i] = inner[i] + (outer[i]-inner[i]) * t
    return Image.fromarray(arr.astype(np.uint8), 'RGB')

def draw_ripples(img, cx, cy, count=5, base_r=120, color=C_PRIMARY):
    """Subtle concentric ring decorations."""
    d = ImageDraw.Draw(img)
    for i in range(count):
        r = base_r + i * 85
        alpha = max(4, 22 - i * 4)
        d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=(*color, alpha), width=1)
    return img

def fit_screenshot(img, target_h):
    """Scale screenshot to target_h, preserve aspect ratio."""
    scale = target_h / img.height
    return img.resize((int(img.width * scale), target_h), Image.LANCZOS)

def add_frame(img):
    """Wrap screenshot in a glassy popup frame with glow border."""
    pw, ph = img.size
    pad = 10
    fw, fh = pw + pad*2, ph + pad*2

    # Glow layer (behind)
    glow = Image.new('RGBA', (fw + 60, fh + 60), (0,0,0,0))
    for g in range(8, 0, -1):
        a = int(18 * (g/8)**2)
        e = g * 5
        ImageDraw.Draw(glow).rounded_rectangle(
            [30-e, 30-e, fw+30+e, fh+30+e], radius=22+e, fill=(*C_BRIGHT, a))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=6))

    # Frame body
    frame = Image.new('RGBA', (fw + 60, fh + 60), (0,0,0,0))
    ImageDraw.Draw(frame).rounded_rectangle(
        [28, 28, fw+32, fh+32], radius=22,
        fill=(*C_BG_MID, 255), outline=(*C_PRIMARY, 55), width=1)

    # Paste screenshot
    frame.paste(img, (30 + pad, 30 + pad))

    # Composite glow + frame
    result = Image.alpha_composite(glow, frame)
    return result.convert('RGBA')

def pill_badge(draw, x, y, text, fnt, bg=C_BADGE_BG, fg=C_BRIGHT, border=C_PRIMARY):
    bb = fnt.getbbox(text)
    tw, th = bb[2]-bb[0], bb[3]-bb[1]
    px, py = 16, 8
    rw, rh = tw + px*2, th + py*2
    r = rh // 2
    draw.rounded_rectangle([x, y, x+rw, y+rh], radius=r,
                            fill=(*bg, 230), outline=(*border, 150), width=1)
    draw.text((x+px, y+py-bb[1]), text, font=fnt, fill=fg)
    return rw, rh

def place_screenshot_right(canvas, shot, shot_h, x_center_frac=0.72):
    """Scale and paste screenshot centred at x_center_frac, vertically centred."""
    shot_scaled = fit_screenshot(shot, shot_h)
    framed = add_frame(shot_scaled)
    fw, fh = framed.size
    x = int(W * x_center_frac - fw // 2)
    y = (H - fh) // 2
    # Paste onto canvas (handle RGBA)
    canvas_rgba = canvas.convert('RGBA')
    canvas_rgba.paste(framed, (x, y), framed)
    return canvas_rgba.convert('RGB')

def draw_text_block(canvas, badge, headline, subtitle, pad_left=62, mid_y=None):
    draw = ImageDraw.Draw(canvas)
    mid_y = mid_y or H // 2

    f_badge = font(14, bold=False)
    f_head  = font(60, bold=True)
    f_sub   = font(20, bold=False)

    # Badge pill
    _, bh = pill_badge(draw, pad_left, mid_y - 190, badge, f_badge)

    # Headline (multi-line)
    lines = headline.split('\n')
    line_h = 68
    ty = mid_y - 150
    for line in lines:
        draw.text((pad_left, ty), line, font=f_head, fill=C_WHITE)
        ty += line_h

    # Blue accent underline under last headline
    last_bb = f_head.getbbox(lines[-1])
    lw = last_bb[2] - last_bb[0]
    draw.line([(pad_left, ty - 2), (pad_left + min(lw, 320), ty - 2)],
              fill=C_BRIGHT, width=3)

    # Subtitle (word-wrap)
    words = subtitle.split()
    lines_sub, cur = [], ''
    for w in words:
        test = (cur + ' ' + w).strip()
        if f_sub.getbbox(test)[2] > 420:
            lines_sub.append(cur); cur = w
        else:
            cur = test
    if cur: lines_sub.append(cur)

    ty += 14
    for ln in lines_sub:
        draw.text((pad_left, ty), ln, font=f_sub, fill=C_MUTED)
        ty += 30

    # Brand
    f_brand = font(13, bold=False)
    draw.text((pad_left, H - 36), 'HydroMonk by DevOps-Monk', font=f_brand, fill=(*C_PRIMARY, 130))

    return canvas

# ── slide factory ──────────────────────────────────────────────────────────────

def make_slide(out_name, screenshot, badge, headline, subtitle,
               shot_h=640, x_frac=0.73, ripple_cx_frac=0.72, bg_cx=0.65):
    # Background
    canvas = radial_bg(W, H, cx_frac=bg_cx, cy_frac=0.5)

    # Ripple decorations behind screenshot
    draw_ripples(canvas, int(W * ripple_cx_frac), H // 2,
                 count=5, base_r=140, color=C_PRIMARY)

    # Screenshot (right side)
    canvas = place_screenshot_right(canvas, screenshot, shot_h, x_frac)

    # Left-side text
    canvas = draw_text_block(canvas, badge, headline, subtitle)

    canvas.save(os.path.join(OUT, out_name), 'PNG', optimize=True)
    print(f'  {out_name}')

# ── 5 slides ───────────────────────────────────────────────────────────────────

slides = [
    dict(
        out_name='01-track-hydration.png',
        screenshot=IMG_MAIN,
        badge='💧  Daily Tracking',
        headline='Track Your Daily\nHydration.',
        subtitle='Beautiful animated circle fills as you log each glass. See your progress at a glance every time you open a new tab.',
        shot_h=640,
    ),
    dict(
        out_name='02-smart-reminders.png',
        screenshot=IMG_MAIN,
        badge='⏰  Smart Reminders',
        headline='Never Miss a\nGlass Again.',
        subtitle='Customizable reminders every 20–90 min. Set active hours so you\'re never pinged at night or on weekends.',
        shot_h=640,
    ),
    dict(
        out_name='03-water-benefits.png',
        screenshot=IMG_BENEFITS,
        badge='💡  Science-Backed',
        headline='Discover Why\nWater Changes\nEverything.',
        subtitle='73% of your brain is water. Even 1% dehydration drops productivity by 12%. See all 8 benefits inside.',
        shot_h=640,
    ),
    dict(
        out_name='04-settings.png',
        screenshot=IMG_SETTINGS,
        badge='⚙️  Fully Customizable',
        headline='Your Schedule,\nYour Rules.',
        subtitle='Set your goal, glass size, reminder interval and active hours. Works around your routine — not against it.',
        shot_h=640,
    ),
    dict(
        out_name='05-build-habit.png',
        screenshot=IMG_MAIN,
        badge='🔥  Streak Tracking',
        headline='Build the Habit.\nBreak Your\nRecord.',
        subtitle='Consecutive daily streaks shown as a badge on the icon. Hit your goal every day and watch your streak grow.',
        shot_h=640,
    ),
]

print('Generating store screenshots...')
for s in slides:
    make_slide(**s)

print(f'Done → {OUT}')
