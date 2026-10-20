"""Vector silhouettes of the big competitions' marks, traced from the genuine bundled logos.

The competition pages and match days show each competition's own mark large and cropped, the way broadcasters and
the leagues' own graphics use it (the starball, the lion, the LaLiga "LL", the Bundesliga player). The bundled logos
are 200px bitmaps, too small to show that large, so the mark (the symbol only, without the wordmark under it) is
upscaled, thresholded and traced into a single-colour SVG here. The app uses it as a mask and fills it with each
competition's colours. The Premier League lion comes from Simple Icons (vector, from premierleague.com), not traced.

    python3 scripts/assets/comp_marks.py [contact-sheet.png]

Writes public/assets/marks/<key>.svg. Needs Pillow, numpy and potracer (pip install potracer).
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

# key: (logo file, top row, bottom row of the mark: the symbol without the wordmark, which part of the logo is the mark)
#   alpha  every visible pixel
#   white  the white figure only (the Bundesliga player and his ball, without the red field around them)
#   bright the bright facets only (the Serie A "A" is the light blue on its navy facets)
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
}

# Simple Icons "Premier League" (CC0 icon data; the mark is the Premier League's), viewBox 0 0 24 24
SIMPLE_ICONS_PL = os.environ.get('SIMPLE_ICONS_PL')


def mask_of(im, top, bottom, mode):
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255
    a = a[top:bottom]
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    if mode == 'alpha':
        m = al
    elif mode == 'white':  # near white, weighted by coverage
        m = np.clip((np.minimum(np.minimum(r, g), b) - 0.6) / 0.25, 0, 1) * al
    else:  # bright
        m = np.clip((np.maximum(np.maximum(r, g), b) - 0.5) / 0.2, 0, 1) * al
    # trim to the mark's own box
    ys, xs = np.where(m > 0.5)
    m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return m


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
    for key, (src, top, bottom, mode) in MARKS.items():
        m = mask_of(Image.open(os.path.join(COMPS, f'{src}.webp')), top, bottom, mode)
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
