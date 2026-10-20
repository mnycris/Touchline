"""How each bundled logo is shown on the app's dark surfaces, and the light versions it needs.

Every bundled crest and competition logo is measured against the card surface (#16191f): the share of its visible
pixels that would disappear into it (WCAG contrast under 2.2). Then:

  none     it reads well as it is (most logos)
  light    a single dark colour (Juventus, the Champions League starball, Ligue 1): shown in white, its official
           treatment on dark backgrounds, made here by turning the dark tone white and keeping the shape
  reverse  a dark main colour with coloured accents (Europa League, Bolton): the dark tone turns white, the accents
           keep their colours, as the marks' own dark-background versions do
  plate    a multicolour badge with dark areas (Flamengo, Lecce): authentic colours kept, on a small neutral plate

'reverse' can't be told from 'plate' by pixels alone (a white Flamengo shield would be wrong), so it is curated below
after looking at the contact sheet. Writes src/data/logoTreatments.json and public/assets/{badges,comps}/<key>.rev.webp.

    python3 scripts/assets/logo_treatments.py [contact-sheet.png]
"""
import json
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SURFACE = (0x16, 0x19, 0x1F)
DARK = 2.2  # contrast below this against the surface: lost on it

# decided by eye on the contact sheet, over what the pixels say:
# two-tone marks whose dark tone becomes white; a wordmark whose white version is its own; a blue mark that turns pastel
CURATED = {
    'comps': {'UEL': 'reverse', 'L50': 'reverse', 'L83': 'reverse', 'L68': 'reverse', 'L41': 'light',
              # the Bundesliga wordmarks under the player, the "SERIE A" under its faceted A: dark type on the logo
              'L19': 'reverse', 'L20': 'reverse', 'L31': 'reverse'},
    'badges': {'4': 'reverse', '100087': 'reverse', '131739': 'plate'},
}


def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def lum(rgb):
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


LS = lum(SURFACE)


def contrast(rgb):
    l = lum(rgb)
    hi, lo = max(l, LS), min(l, LS)
    return (hi + 0.05) / (lo + 0.05)


def classify(im):
    """A logo needs help only when its outline disappears into the surface: dark inside a light rim reads fine."""
    w, h = im.size
    px = im.load()
    seen = dark = edge = edge_dark = 0
    depth = 0.0  # how dark the dark tone is: near 1 for black and navy, nearer 2 for a deep red or royal blue
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            seen += 1
            c = contrast((r, g, b))
            d = c < DARK
            dark += d
            if d:
                depth += c
            # on the outline: next to transparency (or the image border)
            if x == 0 or y == 0 or x == w - 1 or y == h - 1 or min(px[x - 1, y][3], px[x + 1, y][3], px[x, y - 1][3], px[x, y + 1][3]) < 128:
                edge += 1
                edge_dark += d
    if not seen:
        return 'none', 0.0
    share, rim = dark / seen, edge_dark / max(1, edge)
    # only a near-black or navy mark goes white; a deep red or blue one would turn pastel, so it keeps its colour
    if share > 0.96 and depth / max(1, dark) < 1.55:
        return 'light', share
    if share > 0.96:
        return 'plate', share
    if share >= 0.35 and rim >= 0.6:
        return 'plate', share
    return 'none', share


# only part of the logo goes white: from this row down (the wordmark), the symbol above it keeps its own dark facets
FROM_ROW = {'L31': 141}


def lighten(im, key=None):
    """Dark tones to white, smoothly (so anti-aliased edges stay clean); everything else as it is."""
    out = Image.new('RGBA', im.size)
    data = []
    start = FROM_ROW.get(key, 0) * im.width
    for i, (r, g, b, a) in enumerate(im.getdata()):
        if a == 0 or i < start:
            data.append((r, g, b, a) if a else (0, 0, 0, 0))
            continue
        if a == 0:
            data.append((0, 0, 0, 0))
            continue
        c = contrast((r, g, b))
        t = max(0.0, min(1.0, (2.6 - c) / (2.6 - 1.4)))
        data.append((round(r + (255 - r) * t), round(g + (255 - g) * t), round(b + (255 - b) * t), a))
    out.putdata(data)
    return out


def main():
    result = {'clubs': {}, 'comps': {}}
    sheet_items = []
    for kind, key_of in (('comps', 'comps'), ('badges', 'clubs')):
        folder = os.path.join(ROOT, 'public', 'assets', kind)
        for f in sorted(os.listdir(folder)):
            if not f.endswith('.webp') or f.endswith('.rev.webp'):
                continue
            key = f[:-5]
            im = Image.open(os.path.join(folder, f)).convert('RGBA')
            t, share = classify(im)
            t = CURATED[kind].get(key, t)
            rev = os.path.join(folder, f'{key}.rev.webp')
            if t in ('light', 'reverse'):
                lighten(im, key).save(rev, 'WEBP', lossless=True, quality=100, method=6)
            elif os.path.exists(rev):
                os.remove(rev)
            if t != 'none':
                result[key_of][key] = t
                sheet_items.append((kind, key, t, im))
    with open(os.path.join(ROOT, 'src', 'data', 'logoTreatments.json'), 'w') as fh:
        json.dump(result, fh, indent=1, sort_keys=True)
        fh.write('\n')
    counts = {k: {} for k in result}
    for k, m in result.items():
        for v in m.values():
            counts[k][v] = counts[k].get(v, 0) + 1
    print(json.dumps(counts))
    if len(sys.argv) > 1:
        contact(sheet_items, sys.argv[1])


def contact(items, path):
    """Before and after, on the card surface: original, then what the app shows."""
    cols, cw, ch = 6, 220, 130
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cw, rows * ch), SURFACE)
    dr = ImageDraw.Draw(sheet)
    for i, (kind, key, t, im) in enumerate(items):
        x0, y0 = (i % cols) * cw, (i // cols) * ch
        a = im.copy(); a.thumbnail((80, 80))
        sheet.paste(a, (x0 + 10 + (80 - a.width) // 2, y0 + 10 + (80 - a.height) // 2), a)
        if t in ('light', 'reverse'):
            b = lighten(im, key); b.thumbnail((80, 80))
        else:
            b = im.copy(); b.thumbnail((68, 68))
            dr.rounded_rectangle((x0 + 112, y0 + 6, x0 + 200, y0 + 94), radius=22, fill=(0x22, 0x26, 0x2D))
        sheet.paste(b, (x0 + 116 + (80 - b.width) // 2, y0 + 10 + (80 - b.height) // 2), b)
        dr.text((x0 + 10, y0 + 104), f'{key} · {t}', fill=(200, 205, 215))
    sheet.save(path)


if __name__ == '__main__':
    main()
