"""The Carabao Cup's marks, from the logo's emblem (the sun in its ring, the carabao's head and horns, the glint), each
element in the logo's own paint order so the shapes are the logo's own, written as masks (the card fills them with its
colours, as the other identities' marks are), without the green badge, the "Carabao Cup" wordmark or the EFL ball, in the
same tight frame:
    EFLCUP.svg         the emblem in one tone, as a one-colour print of the logo has it: every coloured part as ink, the
                       white parts (the skull, the horns' highlights, the glint) cut out (its match day)
    EFLCUP-whites.svg  the white parts alone: the skull, the horns' highlights, the glint (its title card)

    python3 -I scripts/assets/carabao_emblem.py <efl-cup.svg>

The vector logo is football-logos.cc's (england/efl-cup, its SVG download: images.football-logos.cc/england/
efl-cup.b9c1128c.svg, fetched with the logo page as referer, the way its download button does). Writes both into
public/assets/marks. The logo's elements, in order: 0 the white rim, 1 the green badge, 2-18 the emblem,
19-27 the wordmark and its line, 28-29 the EFL ball and lettering; its colours are classes (cls-2 white, cls-5 black,
cls-6 yellow, cls-7 red).
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'assets', 'marks')
EMBLEM = range(2, 19)
WHITE = 'cls-2'
# the emblem's own bounds in the logo's frame (the glint's top to the sun's foot, horn tip to horn tip)
X, Y, W, H = 11, 9.5, 212.5, 147.5


def mask(els, ink):
    """The emblem as a mask: each element, in order, as ink (white) or a hole (black) by its colour class."""
    body = []
    for i in EMBLEM:
        e = els[i]
        cls = (re.search(r'class="([^"]*)"', e) or [None, ''])[1]
        body.append(re.sub(r'\sclass="[^"]*"', '', e).replace('<path ', f'<path fill="{"#fff" if ink(cls) else "#000"}" ', 1))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{X} {Y} {W} {H}"><defs>'
            f'<mask id="m" maskUnits="userSpaceOnUse" x="{X}" y="{Y}" width="{W}" height="{H}">'
            f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" fill="#000"/>{"".join(body)}</mask></defs>'
            f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" fill="#000" mask="url(#m)"/></svg>')


def main():
    src = open(sys.argv[1]).read()
    els = [m.group(0) for m in re.finditer(r'<path\b[^>]*>(?:</path>)?', src)]
    if len(els) != 30:
        sys.exit(f'expected the logo\'s 30 elements, found {len(els)}: has the logo changed?')
    for name, ink in (('EFLCUP', lambda c: c != WHITE), ('EFLCUP-whites', lambda c: c == WHITE)):
        out = os.path.join(OUT, f'{name}.svg')
        open(out, 'w').write(mask(els, ink))
        print(out)


if __name__ == '__main__':
    main()
