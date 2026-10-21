"""Download every competition logo the game uses from football-logos.cc at 700px, with any official white variant,
into a work folder for inspection (nothing is bundled from here directly: see bundle_comp_logos.py).

    python3 -I scripts/assets/fetch_comp_logos.py <out-dir>

football-logos.cc's terms: the logos belong to their clubs, leagues and federations and may be used for informational,
editorial and non-commercial fan projects (https://football-logos.cc/license/).
"""
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

# the game's competition keys and the logo that is theirs (country/slug); the ones football-logos.cc has no logo for
# are left out (see docs/assets/competition-logos.md)
EXTRA = {
    'CDR': 'spain/copa-del-rey', 'SUPERCOPA': 'spain/supercopa-de-espana', 'CI': 'italy/coppa-italia',
    'TACA': 'portugal/taca-de-portugal', 'UNL': 'tournaments/uefa-nations-league', 'ASIAN': 'tournaments/afc-asian-cup',
    'GOLD': 'tournaments/concacaf-gold-cup',
    # editions: the game's next EURO (summer 2028) and World Cup (summer 2030)
    'EURO-2028': 'tournaments/uefa-euro-2028', 'WC-2030': 'tournaments/fifa-world-cup-2030',
}


def get(url, out=None):
    args = ['curl', '-sSL', '-m', '40', '-A', UA, '-w', '%{http_code}', url]
    if out:
        args[1:1] = ['-o', out]
    r = subprocess.run(args, capture_output=True, text=True)
    return r.stdout if not out else r.stdout[-3:]


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    cc = json.load(open(os.path.join(ROOT, 'src', 'data', 'crestsCC.json')))['comps']
    want = {k: v.rsplit('.', 1)[0] for k, v in cc.items()}
    want.update(EXTRA)
    found = {}
    for key, path in sorted(want.items()):
        country, slug = path.split('/')
        html = get(f'https://football-logos.cc/{country}/{slug}/')
        time.sleep(0.4)
        urls = sorted(set(re.findall(r'https://assets\.football-logos\.cc/logos/' + re.escape(country) + r'/700x700/(' + re.escape(slug) + r'(?:--[a-z-]+)?)\.([0-9a-f]{8})\.png', html)))
        if not urls:
            print(f'{key}: no 700px asset on its page')
            continue
        found[key] = []
        for name, h in urls:
            f = os.path.join(out, f'{key}__{name}.png')
            code = get(f'https://assets.football-logos.cc/logos/{country}/700x700/{name}.{h}.png', f)
            found[key].append({'variant': name, 'url': f'https://assets.football-logos.cc/logos/{country}/700x700/{name}.{h}.png', 'file': f, 'status': code})
            time.sleep(0.2)
        print(key, [x['variant'] + ' ' + x['status'] for x in found[key]])
    json.dump(found, open(os.path.join(out, 'found.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
