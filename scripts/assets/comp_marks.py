"""Vector silhouettes of the big competitions' marks, traced from the genuine bundled logos.

The competition pages and match days show each competition's own mark large and cropped, the way broadcasters and
the leagues' own graphics use it (the starball, the lion, the LaLiga "LL", the Bundesliga player). The bundled logos
are 200px bitmaps, too small to show that large, so the mark (the symbol only, without the wordmark under it) is
upscaled, thresholded and traced into a single-colour SVG here. The app uses it as a mask and fills it with each
competition's colours. The Premier League lion comes from Simple Icons (vector, from premierleague.com), not traced.

    python3 scripts/assets/comp_marks.py [contact-sheet.png]

Writes public/assets/marks/<key>.svg (ONLY=<key,…> for just those). Needs Pillow, numpy and potracer
(pip install potracer).
"""
import os
import sys
import numpy as np
import potrace
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COMPS = os.path.join(ROOT, 'public', 'assets', 'comps')
OUT = os.path.join(ROOT, 'public', 'assets', 'marks')
SCALE = 6  # upscale before tracing: smooth curves from a small bitmap

# key: (logo file, top row, bottom row of the mark: the symbol without the wordmark, which part of the logo is the mark,
#       [options])
#   alpha  every visible pixel
#   white  the white figure only (the Bundesliga player and his ball, without the red field around them)
#   bright the bright facets only (the Serie A "A" is the light blue on its navy facets)
#   ink    everything that isn't white (the EFL's ball of coloured dots on the white of its shield)
#   dots   as ink, drawn as true circles (see dots)
#   dark   the black parts only, green the green parts only (the Conference League trophy and its brackets, traced as
#          two marks in one frame so each takes its own colour)
# options: 'x' (left, right) columns to keep; 'big' keeps only the shapes at least this share of the largest one's area
#   (the symbol without the letters of a wordmark set beside or around it: Liga Portugal, the Eredivisie's ring);
#   'notrim' keeps the whole crop as the frame (two marks laid over each other line up);
#   'thin' pulls the edges in (a power on the coverage) so shapes set close together stay apart (the EFL's dots)
MARKS = {
    'UCL': ('UCL', 0, 97, 'alpha'),
    'UEL': ('UEL', 0, 103, 'alpha'),
    'L53': ('L53', 0, 129, 'alpha'),
    'L54': ('L54', 0, 129, 'alpha'),
    'L19': ('L19', 0, 152, 'white'),
    'L20': ('L20', 0, 152, 'white'),
    'L31': ('L31', 0, 141, 'bright'),
    'L16': ('L16', 0, 126, 'alpha'),
    'L17': ('L17', 0, 127, 'alpha'),
    'FACUP': ('FACUP', 0, 124, 'alpha'),
    # the Conference League trophy on its own, without its green brackets (the Pro League's bull, the EFL's ball,
    # Liga Portugal's symbol and the Eredivisie's emblem come from vector logos instead: see svg_parts.py, efl_ball.py)
    'UECL': ('UECL', 0, 184, 'dark', {'x': (95, 265)}),
}

# Simple Icons "Premier League" (CC0 icon data; the mark is the Premier League's), viewBox 0 0 24 24
SIMPLE_ICONS_PL = os.environ.get('SIMPLE_ICONS_PL')


def mask_of(im, top, bottom, mode, opts=None):
    opts = opts or {}
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255
    a = a[top:bottom]
    if 'x' in opts:
        a = a[:, opts['x'][0]:opts['x'][1]]
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    if mode == 'alpha':
        m = al
    elif mode == 'white':  # near white, weighted by coverage
        m = np.clip((np.minimum(np.minimum(r, g), b) - 0.6) / 0.25, 0, 1) * al
    elif mode in ('ink', 'dots'):  # anything but the white ground
        m = np.clip((0.88 - np.minimum(np.minimum(r, g), b)) / 0.2, 0, 1) * al
    elif mode == 'dark':
        m = np.clip((0.4 - np.maximum(np.maximum(r, g), b)) / 0.2, 0, 1) * al
    elif mode == 'green':
        m = np.clip((g - np.maximum(r, b) - 0.2) / 0.2, 0, 1) * al
    else:  # bright
        m = np.clip((np.maximum(np.maximum(r, g), b) - 0.5) / 0.2, 0, 1) * al
    if 'big' in opts:
        m = m * big_shapes(m > 0.5, opts['big'])
    if 'thin' in opts:
        m = m ** opts['thin']
    if opts.get('notrim'):
        return m
    # trim to the mark's own box
    ys, xs = np.where(m > 0.5)
    m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return m


def components(on):
    """Connected shapes (8-connected): a label for every pixel (0 outside), and each label's size."""
    from collections import deque
    h, w = on.shape
    lab = np.zeros((h, w), np.int32)
    sizes = [0]
    for y in range(h):
        for x in range(w):
            if not on[y, x] or lab[y, x]:
                continue
            n = len(sizes)
            lab[y, x] = n
            q, size = deque([(y, x)]), 0
            while q:
                cy, cx = q.popleft()
                size += 1
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and on[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            q.append((ny, nx))
            sizes.append(size)
    return lab, sizes


def big_shapes(on, share):
    """Only the connected shapes at least `share` of the largest one's area (a little grown, so a shape's
    anti-aliased rim stays with it)."""
    lab, sizes = components(on)
    keep = {i for i, sz in enumerate(sizes) if i and sz >= share * max(sizes)}
    k = np.isin(lab, list(keep))
    # grow by two pixels into the soft edge
    g = k.copy()
    for _ in range(2):
        g[1:] |= g[:-1]; g[:-1] |= g[1:]; g[:, 1:] |= g[:, :-1]; g[:, :-1] |= g[:, 1:]
    return g.astype(np.float32)


def dots(m):
    """A mark made of round dots (the EFL's ball), drawn as true circles: each dot's centre and size measured from the
    logo, never traced, so no dot comes out as a polygon however large it is shown. Dots set close together touch at
    their soft edges, so each is found by its solid core, and every edge pixel goes to the nearest core: a dot's area is
    the coverage it gathers, its radius that of a circle of that area."""
    h, w = m.shape
    yy, xx = np.mgrid[0:h, 0:w]
    lab, sizes = components(m > 0.9)
    cores = []
    for i in range(1, len(sizes)):
        k = lab == i
        cores.append(((xx * k).sum() / k.sum(), (yy * k).sum() / k.sum()))
    cores = np.array(cores)
    on = m > 0.02
    px, py, cov = xx[on], yy[on], m[on]
    near = np.argmin((px[:, None] - cores[None, :, 0]) ** 2 + (py[:, None] - cores[None, :, 1]) ** 2, axis=1)
    out = []
    for i in range(len(cores)):
        sel = near == i
        a = cov[sel].sum()
        if a < 1.5:
            continue
        cx, cy = (px[sel] * cov[sel]).sum() / a + 0.5, (py[sel] * cov[sel]).sum() / a + 0.5
        # (a touch smaller than its share: the logo's dots stand apart, the shared edge pixels don't)
        out.append((cx, cy, 0.9 * (a / np.pi) ** 0.5))
    return w, h, out


def trace(m):
    h, w = m.shape
    img = Image.fromarray((m * 255).astype(np.uint8), 'L')
    img = img.resize((w * SCALE, h * SCALE), Image.LANCZOS).filter(ImageFilter.GaussianBlur(SCALE * 0.45))
    bm = potrace.Bitmap(np.asarray(img) <= 127)  # potracer traces the dark pixels
    path = bm.trace(turdsize=SCALE * SCALE * 2, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.25)
    d = []
    f = lambda p: f'{p.x / SCALE:.2f} {p.y / SCALE:.2f}'
    for curve in path:
        d.append(f'M{f(curve.start_point)}')
        for s in curve.segments:
            d.append(f'L{f(s.c)}L{f(s.end_point)}' if s.is_corner else f'C{f(s.c1)} {f(s.c2)} {f(s.end_point)}')
        d.append('Z')
    return w, h, ''.join(d)


def svg(w, h, d):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><path fill-rule="evenodd" d="{d}"/></svg>\n'


def main():
    os.makedirs(OUT, exist_ok=True)
    made = []
    only = set(filter(None, os.environ.get('ONLY', '').split(',')))
    for key, (src, top, bottom, mode, *opts) in MARKS.items():
        if only and key not in only:
            continue
        m = mask_of(Image.open(os.path.join(COMPS, f'{src}.webp')), top, bottom, mode, opts[0] if opts else None)
        if mode == 'dots':
            w, h, cs = dots(m)
            d = ''.join(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r:.2f}"/>' for x, y, r in cs)
            with open(os.path.join(OUT, f'{key}.svg'), 'w') as fh:
                fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">{d}</svg>\n')
            made.append(key)
            print(f'{key}: {w}x{h}, {len(cs)} dots')
            continue
        w, h, d = trace(m)
        with open(os.path.join(OUT, f'{key}.svg'), 'w') as fh:
            fh.write(svg(w, h, d))
        made.append(key)
        print(f'{key}: {w}x{h}, {len(d)} chars')
    if SIMPLE_ICONS_PL:
        import re
        d = re.search(r' d="([^"]+)"', open(SIMPLE_ICONS_PL).read()).group(1)
        with open(os.path.join(OUT, 'L13.svg'), 'w') as fh:
            fh.write(svg(24, 24, d))
        made.append('L13')
        print('L13: Simple Icons lion')
    if len(sys.argv) > 1:
        contact(made, sys.argv[1])


def contact(keys, path):
    """What was traced: each mark rasterised large, to check the curves by eye."""
    import cairosvg  # optional: only for the contact sheet
    import io
    cw, ch = 260, 260
    sheet = Image.new('RGB', (cw * 4, ch * ((len(keys) + 3) // 4)), (22, 25, 31))
    for i, k in enumerate(keys):
        png = cairosvg.svg2png(url=os.path.join(OUT, f'{k}.svg'), output_height=230)
        im = Image.open(io.BytesIO(png)).convert('RGBA')
        im.thumbnail((240, 240))
        white = Image.new('RGBA', im.size, (235, 238, 245, 255))
        x, y = (i % 4) * cw + (cw - im.width) // 2, (i // 4) * ch + (ch - im.height) // 2
        sheet.paste(white, (x, y), im)
    sheet.save(path)


if __name__ == '__main__':
    main()
