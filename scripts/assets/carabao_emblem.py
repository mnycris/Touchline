"""The Carabao Cup's emblem for its title card: the logo's own sun in its yellow ring, the carabao's head and horns and
the glint, cut from the genuine vector logo in its own colours (its classes and style kept), without the green badge,
the "Carabao Cup" wordmark or the EFL ball, framed tightly. The card shows it as it is (an `art` identity), not as a
mask to fill: its colours are the brand.

    python3 -I scripts/assets/carabao_emblem.py <efl-cup.svg>

The vector logo is football-logos.cc's (england/efl-cup, its SVG download: images.football-logos.cc/england/
efl-cup.b9c1128c.svg, fetched with the logo page as referer, the way its download button does). Writes
public/assets/marks/EFLCUP-emblem.svg. The logo's elements, in order: 0 the white rim, 1 the green badge, 2-18 the
emblem, 19-27 the wordmark and its line, 28-29 the EFL ball and lettering.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'assets', 'marks', 'EFLCUP-emblem.svg')
EMBLEM = range(2, 19)
# the emblem's own bounds in the logo's frame (the glint's top to the sun's foot, horn tip to horn tip)
VIEWBOX = '11 9.5 212.5 147.5'


def main():
    src = open(sys.argv[1]).read()
    style = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
    els = [m.group(0) for m in re.finditer(r'<path\b[^>]*>(?:</path>)?', src)]
    if len(els) != 30:
        sys.exit(f'expected the logo\'s 30 elements, found {len(els)}: has the logo changed?')
    body = ''.join(els[i] for i in EMBLEM)
    open(OUT, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VIEWBOX}"><defs><style>{style}</style></defs>{body}</svg>')
    print(OUT)


if __name__ == '__main__':
    main()
