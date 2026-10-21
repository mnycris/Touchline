"""The EFL's ball of 72 dots, one for each club, from the vector logo (the Championship's: its 24 dots in gold, the other
48 in navy). In each division's own logo its 24 are lit in its colour: the Championship the top arm, League One the
left, League Two the bottom right. Writes, into public/assets/marks/:

    EFL.svg          the whole ball (where it is shown on its own: the trophy celebration)
    EFL-<key>.svg    that division's 24 dots;  EFL-<key>o.svg  the other 48 (the title card lights the first)

all in the same frame, centred on the ball.

    python3 -I scripts/assets/efl_ball.py "<…>/EFL Championship Logo.svg"
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from svg_parts import parts, fmt  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'public', 'assets', 'marks')
GOLD, NAVY = '#b69b40', '#283271'


def main():
    dots = []
    for p in parts(open(sys.argv[1]).read()):
        x0, y0, x1, y1 = p['box']
        w, h = x1 - x0, y1 - y0
        # the ball's dots: round, small, between the division's name above and the letters "EFL" below
        if p['fill'] in (GOLD, NAVY) and 0 < w < 12 and abs(w - h) < 0.1 * max(w, h) and 64 < (y0 + y1) / 2 < 112:
            dots.append({'x': (x0 + x1) / 2, 'y': (y0 + y1) / 2, 'r': (w + h) / 4, 'gold': p['fill'] == GOLD})
    cx = (min(d['x'] - d['r'] for d in dots) + max(d['x'] + d['r'] for d in dots)) / 2
    cy = (min(d['y'] - d['r'] for d in dots) + max(d['y'] + d['r'] for d in dots)) / 2
    # League One's arm is the left one (all its dots lie left of x = cx - 2.8), League Two's the bottom right
    for d in dots:
        d['div'] = 'L14' if d['gold'] else 'L60' if d['x'] < cx - 2.8 else 'L61'
    counts = {k: sum(d['div'] == k for d in dots) for k in ('L14', 'L60', 'L61')}
    assert counts == {'L14': 24, 'L60': 24, 'L61': 24}, counts
    R = max(((d['x'] - cx) ** 2 + (d['y'] - cy) ** 2) ** .5 + d['r'] for d in dots)

    def svg(ds):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{fmt(-R)} {fmt(-R)} {fmt(2 * R)} {fmt(2 * R)}">'
                + ''.join(f'<circle cx="{fmt(d["x"] - cx)}" cy="{fmt(d["y"] - cy)}" r="{fmt(d["r"])}"/>' for d in ds) + '</svg>\n')
    open(os.path.join(OUT, 'EFL.svg'), 'w').write(svg(dots))
    for k in counts:
        open(os.path.join(OUT, f'EFL-{k}.svg'), 'w').write(svg([d for d in dots if d['div'] == k]))
        open(os.path.join(OUT, f'EFL-{k}o.svg'), 'w').write(svg([d for d in dots if d['div'] != k]))
    print(len(dots), 'dots', counts)


if __name__ == '__main__':
    main()
