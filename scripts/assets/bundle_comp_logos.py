"""Bundle the competition logos fetched by fetch_comp_logos.py: each one trimmed to the mark itself (no transparent
margin, so every logo fills the box it is drawn in the same way), scaled to a 360px long edge (sharp at 120 CSS pixels
on a 3x screen) and saved as WebP with its transparency. Writes public/assets/comps/<file>.webp and
src/data/compLogos.json ({key: {w, h, src}}). Run logo_treatments.py afterwards for the dark-surface versions.

    python3 -I scripts/assets/bundle_comp_logos.py <work-dir from fetch_comp_logos.py>

Edition logos (a tournament's own year) are keyed <KEY>@<year> and stored as <KEY>_<year>.webp.
"""
import json
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'assets', 'comps')
LONG = 360

# the bundled art stays where football-logos.cc only has an older identity: the Roshn Saudi League (its RSL mark since
# 2023; the site has the old SPL one) and the A-League Men (the site has the umbrella A-League wordmark)
KEEP = {'L350', 'L351'}
RENAME = {'EURO-2028': 'EURO@2028', 'WC-2030': 'WC@2030'}


def trim(im):
    a = im.getchannel('A').point(lambda x: 255 if x > 8 else 0)
    box = a.getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    m = round(max(x1 - x0, y1 - y0) * 0.012)
    return im.crop((max(0, x0 - m), max(0, y0 - m), min(im.width, x1 + m), min(im.height, y1 + m)))


def main():
    work = sys.argv[1]
    found = json.load(open(os.path.join(work, 'found.json')))
    manifest_path = os.path.join(ROOT, 'src', 'data', 'compLogos.json')
    old = json.load(open(manifest_path))
    manifest = {k: dict(v, src=v.get('src', 'earlier bundle')) for k, v in old.items() if k in KEEP}
    for key, variants in sorted(found.items()):
        key = RENAME.get(key, key)
        if key in KEEP:
            continue
        v = variants[0]
        im = trim(Image.open(v['file']).convert('RGBA'))
        s = LONG / max(im.size)
        if s < 1:
            im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        name = key.replace('@', '_')
        im.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=92, alpha_quality=100, method=6)
        manifest[key] = {'w': im.width, 'h': im.height, 'src': v['url']}
        print(key, im.size, os.path.getsize(os.path.join(OUT, f'{name}.webp')) // 1024, 'KB')
    with open(manifest_path, 'w') as fh:
        json.dump(dict(sorted(manifest.items())), fh, indent=1, ensure_ascii=False)
        fh.write('\n')
    print(len(manifest), 'logos')


if __name__ == '__main__':
    main()
