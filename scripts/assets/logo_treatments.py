"""How each bundled logo is shown on the app's dark surfaces, and the light versions it needs.

Every bundled crest and competition logo is measured against the card surface (#16191f): the share of its visible
pixels that would disappear into it (WCAG contrast under 2.2). Then:

  none     it reads well as it is (most logos, and multicolour crests with a dark outline: Inter, Flamengo, Atlético
           are recognised by what is inside the outline, so they are shown exactly as they are, with no plate or glow)
  light    a single dark colour (Juventus, the Champions League starball, Ligue 1): shown in white, its official
           treatment on dark backgrounds, made here by turning the dark tone white and keeping the shape
  reverse  a dark main colour with coloured accents (Europa League, Bolton): the dark tone turns white, the accents
           keep their colours, as the marks' own dark-background versions do
  edge     a multicolour crest that is dark almost all over (Gwangju's maroon phoenix, Auckland's navy shield): its own
           outer rim is lifted to a lighter shade of itself, just enough for the silhouette to read; nothing is added

'reverse' can't be told from a dark multicolour crest by pixels alone (a white Flamengo shield would be wrong), so it
is curated below after looking at the contact sheet. Writes src/data/logoTreatments.json and
public/assets/{badges,comps}/<key>.rev.webp (light, reverse) and <key>.edge.webp (edge).

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
              'L19': 'reverse', 'L20': 'reverse', 'L31': 'reverse',
              # dark type or a dark ground under coloured marks: the dark goes white, the colours stay (the Copa del
              # Rey's purple and red, the Coppa Italia's tricolour, the Supercopa's red ring, the Taça's diamonds)
              'CDR': 'reverse', 'CI': 'reverse', 'SUPERCOPA': 'reverse', 'SCI': 'reverse', 'TACA': 'reverse',
              'UECL': 'reverse', 'UNL': 'reverse', 'L2012': 'reverse', 'L2149': 'reverse', 'L2076': 'reverse',
              # single-colour navy marks, white on dark as their own white versions are (Eredivisie, Liga Portugal)
              'BELCUP': 'light', 'L1': 'light', 'L10': 'light', 'L308': 'light',
              # read as they are: the KNVB diamond and the FFF hexagon carry their own white outline
              'KNVB': 'none', 'CDF': 'none'},
    # (Auckland's bright blue linework reads on dark as it is: neither white nor lifted)
    # (OH Leuven's current crest is a white diamond with black type: it reads as it is)
    'badges': {'4': 'reverse', '131739': 'none'},
}

# crests whose only available art has a white background baked in (Piast's gold-rimmed shield): the white outside the
# rim is taken out of the bundled file itself, once (a file whose corners are already transparent is left alone)
MATTED = {'badges': {'111086'}}


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
    # dark all over (not just a dark outline round coloured contents): the rim needs lifting for the shape to read
    if share > 0.96 or (share >= 0.35 and rim >= 0.6 and mean_contrast(im) < EDGE_BELOW):
        return 'edge', share
    return 'none', share


EDGE_BELOW = 2.0  # mean contrast of the visible pixels against the surface, under which a crest dissolves into it


def mean_contrast(im):
    px = [p for p in im.getdata() if p[3] >= 128]
    return sum(contrast(p[:3]) for p in px) / max(1, len(px))


def dist_from_outside(im):
    """For every pixel, how many steps it is from the transparency around the logo (0 outside it)."""
    from collections import deque
    w, h = im.size
    a = im.getchannel('A').load()
    INF = 10 ** 9
    d = [[INF] * w for _ in range(h)]
    q = deque()
    for y in range(h):
        for x in range(w):
            if a[x, y] < 100 or x in (0, w - 1) or y in (0, h - 1):
                d[y][x] = 0 if a[x, y] < 100 else 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and d[ny][nx] > d[y][x] + 1:
                d[ny][nx] = d[y][x] + 1
                q.append((nx, ny))
    return d


def lift_rim(im, target=2.0):
    """The crest's own outer rim, where it is dark, lifted to a lighter shade of itself until it reads on the
    surface. Only a thin band along the outline changes; the rest of the crest is exactly as it was."""
    w, h = im.size
    d = dist_from_outside(im)
    band = max(2, round(w * 0.028))
    px = im.load()
    out = im.copy()
    po = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or d[y][x] > band or contrast((r, g, b)) >= target:
                continue
            for step in range(1, 41):
                k = step / 40
                rr, gg, bb = r + (200 - r) * k, g + (205 - g) * k, b + (215 - b) * k
                if contrast((rr, gg, bb)) >= target:
                    break
            fade = 1 if d[y][x] < band else 0.5
            po[x, y] = (round(r + (rr - r) * fade), round(g + (gg - g) * fade), round(b + (bb - b) * fade), a)
    return out


def unmatte(im):
    """The white around a crest made transparent: everything near-white that joins the image's border, plus the
    anti-aliased edge where it meets the crest, which keeps its own colour with the white taken out of it. White inside
    the crest's outline (a white shield) is not reached and stays."""
    from collections import deque
    w, h = im.size
    px = im.load()
    out = im.copy()
    po = out.load()
    outside = [[False] * w for _ in range(h)]
    border = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    q = deque((x, y) for x, y in border if min(px[x, y][:3]) > 225)
    for x, y in q:
        outside[y][x] = True
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not outside[ny][nx] and min(px[nx, ny][:3]) > 225:
                outside[ny][nx] = True
                q.append((nx, ny))
    near = lambda x, y: any(outside[y + dy][x + dx] for dx in (-1, 0, 1) for dy in (-1, 0, 1) if 0 <= x + dx < w and 0 <= y + dy < h)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if outside[y][x]:
                po[x, y] = (0, 0, 0, 0)
            elif near(x, y):
                # an edge pixel is crest colour mixed with white: alpha from how far its darkest channel is from white
                k = max(0.0, min(1.0, (255 - min(r, g, b)) / 150))
                if k < 0.04:
                    po[x, y] = (0, 0, 0, 0)
                else:
                    un = lambda c: max(0, min(255, round((c - 255 * (1 - k)) / k)))
                    po[x, y] = (un(r), un(g), un(b), round(a * k))
    return out


# only part of the logo goes white: from this far down (the wordmark, as a share of the height), the symbol above it
# keeps its own dark facets
FROM_ROW = {'L31': 0.765}


def lighten(im, key=None):
    """Dark tones to white, smoothly (so anti-aliased edges stay clean); everything else as it is."""
    out = Image.new('RGBA', im.size)
    data = []
    start = round(FROM_ROW.get(key, 0) * im.height) * im.width
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
            if not f.endswith('.webp') or f.endswith('.rev.webp') or f.endswith('.edge.webp'):
                continue
            # (an edition's logo, EURO_2028.webp, is the key EURO@2028)
            key = f[:-5].replace('_', '@')
            stem = f[:-5]
            im = Image.open(os.path.join(folder, f)).convert('RGBA')
            if key in MATTED.get(kind, ()) and im.getpixel((0, 0))[3] == 255:
                im = unmatte(im)
                im.save(os.path.join(folder, f), 'WEBP', lossless=True, quality=100, method=6)
            t, share = classify(im)
            t = CURATED[kind].get(key, t)
            rev = os.path.join(folder, f'{stem}.rev.webp')
            edge = os.path.join(folder, f'{stem}.edge.webp')
            if t in ('light', 'reverse'):
                lighten(im, key).save(rev, 'WEBP', lossless=True, quality=100, method=6)
            elif os.path.exists(rev):
                os.remove(rev)
            if t == 'edge':
                lift_rim(im).save(edge, 'WEBP', lossless=True, quality=100, method=6)
            elif os.path.exists(edge):
                os.remove(edge)
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
        b = lighten(im, key) if t in ('light', 'reverse') else lift_rim(im) if t == 'edge' else im.copy()
        b.thumbnail((80, 80))
        sheet.paste(b, (x0 + 116 + (80 - b.width) // 2, y0 + 10 + (80 - b.height) // 2), b)
        dr.text((x0 + 10, y0 + 104), f'{key} · {t}', fill=(200, 205, 215))
    sheet.save(path)


if __name__ == '__main__':
    main()
