"""Rebuild the bundled club crests from football-logos.cc's current 512px art, the same art the app fades in for big
displays (so a club never shows one crest small and another large), and measure how much of each canvas the crest
fills (src/data/crestFit.json), so the renderer can draw every crest at the same visual size whatever margin its art
was drawn with.

    python3 -I scripts/assets/bundle_crests.py <folder with <clubId>.png at 512px>

Writes public/assets/badges/<id>.webp (160px). Crests without a 512px source keep their bundled art. Run
logo_treatments.py afterwards for the dark-surface versions.
"""
import json
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'assets', 'badges')
SIZE = 160


def fit(im):
    """[scale, dx, dy]: the scale that makes the crest's long side fill the box, and the crest's centre offset from the
    canvas centre (shares of the canvas), or None when it already fills it."""
    bb = im.getchannel('A').point(lambda x: 255 if x > 24 else 0).getbbox()
    if not bb:
        return None
    w, h = im.size
    fw, fh = (bb[2] - bb[0]) / w, (bb[3] - bb[1]) / h
    s = 1 / max(fw, fh)
    dx, dy = ((bb[0] + bb[2]) / 2 - w / 2) / w, ((bb[1] + bb[3]) / 2 - h / 2) / h
    if s < 1.04 and abs(dx) < 0.01 and abs(dy) < 0.01:
        return None
    return [round(min(s, 1.6), 3), round(dx, 3), round(dy, 3)]


def main():
    src = sys.argv[1]
    clubs = json.load(open(os.path.join(ROOT, 'public', 'data', 'world.json')))['clubs']
    fits, done, kept = {}, 0, []
    for c in clubs:
        cid = c['id']
        f = os.path.join(src, f'{cid}.png')
        try:
            im = Image.open(f).convert('RGBA') if os.path.exists(f) else None
        except Exception:
            im = None
        if im is None:
            # no current art: the bundled crest stays, measured as it is
            b = os.path.join(OUT, f'{cid}.webp')
            if c.get('badge') and os.path.exists(b):
                kept.append(c['short'])
                im = Image.open(b).convert('RGBA')
                ft = fit(im)
                if ft:
                    fits[str(cid)] = ft
            continue
        if c.get('badge'):
            im.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, f'{cid}.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
            done += 1
        ft = fit(im)
        if ft:
            fits[str(cid)] = ft
    with open(os.path.join(ROOT, 'src', 'data', 'crestFit.json'), 'w') as fh:
        json.dump(fits, fh, separators=(',', ':'))
    print(f'{done} crests rebuilt, kept as they were: {kept}, {len(fits)} with a fit')


if __name__ == '__main__':
    main()
