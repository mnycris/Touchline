"""Split a vector logo into its separate shapes (each subpath, written out in absolute coordinates), so one part of a
competition's genuine logo can be used on its own as the mark on its title card (the bull without its shield, the
EFL ball without its lettering).

    python3 -I scripts/assets/svg_parts.py list <logo.svg>                 the parts: index, fill, bounding box
    python3 -I scripts/assets/svg_parts.py pick <logo.svg> <out.svg> 3,4,7  those parts, framed tightly

The marks made this way (logos from habereet/team-league-competition-logos, Soccer/…):
    L4    Jupiler Pro League Logo.svg   all          the bull in its shield
    L308  Primeira Liga Logo.svg        13,14        the symbol, without "LIGA PORTUGAL"
    L10   Eredivisie Logo.svg           0,1,2        the emblem, without the wordmark; and in the same frame (viewBox
    L10r                                1,2          168.884 0 191.908 192.865) its ring
    L10e                                0            and its "e"
"""
import math
import re
import sys

NUM = re.compile(r'\s*,?\s*(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)')
FLAG = re.compile(r'\s*,?\s*([01])')
ARGN = {'m': 2, 'l': 2, 'c': 6, 's': 4, 'q': 4, 't': 2, 'h': 1, 'v': 1, 'a': 7, 'z': 0}


def fmt(v):
    return f'{v:.3f}'.rstrip('0').rstrip('.')


def arc_points(x0, y0, rx, ry, rot, large, sweep, x1, y1, n=24):
    """Points along an elliptical arc (for the bounding box)."""
    if rx == 0 or ry == 0:
        return [(x1, y1)]
    phi = math.radians(rot); c, s = math.cos(phi), math.sin(phi)
    dx, dy = (x0 - x1) / 2, (y0 - y1) / 2
    x1p, y1p = c * dx + s * dy, -s * dx + c * dy
    rx, ry = abs(rx), abs(ry)
    lam = x1p ** 2 / rx ** 2 + y1p ** 2 / ry ** 2
    if lam > 1:
        rx *= math.sqrt(lam); ry *= math.sqrt(lam)
    num = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2
    den = rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2
    co = math.sqrt(max(0, num / den)) if den else 0
    if large == sweep:
        co = -co
    cxp, cyp = co * rx * y1p / ry, -co * ry * x1p / rx
    cx, cy = c * cxp - s * cyp + (x0 + x1) / 2, s * cxp + c * cyp + (y0 + y1) / 2
    ang = lambda ux, uy, vx, vy: math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    elif sweep and dt < 0:
        dt += 2 * math.pi
    pts = []
    for k in range(1, n + 1):
        t = t1 + dt * k / n
        pts.append((cx + rx * math.cos(t) * c - ry * math.sin(t) * s, cy + rx * math.cos(t) * s + ry * math.sin(t) * c))
    return pts


def bez(p0, p1, p2, p3, n=16):
    return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d for a, b, c, d in zip(p0, p1, p2, p3)) for t in (k / n for k in range(1, n + 1))]


def subpaths(d):
    """Each subpath as (absolute path string, points along it)."""
    i = 0; cmd = None; x = y = sx = sy = 0; out = []; cur = None; last_c = None; last_q = None
    while True:
        while i < len(d) and d[i] in ' ,\n\t\r':
            i += 1
        if i >= len(d):
            break
        if d[i].isalpha():
            cmd = d[i]; i += 1
        c = cmd.lower(); rel = cmd.islower()
        if c == 'z':
            cur[0].append('Z'); x, y = sx, sy; last_c = last_q = None
            continue
        a = []
        for k in range(ARGN[c]):
            m = (FLAG if c == 'a' and k in (3, 4) else NUM).match(d, i)
            a.append(float(m.group(1))); i = m.end()
        P = (lambda px, py: (x + px, y + py)) if rel else (lambda px, py: (px, py))
        if c == 'm':
            x, y = P(a[0], a[1]); sx, sy = x, y
            cur = ([f'M{fmt(x)} {fmt(y)}'], [(x, y)]); out.append(cur)
            cmd = 'l' if rel else 'L'; last_c = last_q = None
            continue
        segs, pts = cur
        if c == 'l':
            x, y = P(*a); segs.append(f'L{fmt(x)} {fmt(y)}'); pts.append((x, y)); last_c = last_q = None
        elif c == 'h':
            x = x + a[0] if rel else a[0]; segs.append(f'L{fmt(x)} {fmt(y)}'); pts.append((x, y)); last_c = last_q = None
        elif c == 'v':
            y = y + a[0] if rel else a[0]; segs.append(f'L{fmt(x)} {fmt(y)}'); pts.append((x, y)); last_c = last_q = None
        elif c in 'cs':
            if c == 'c':
                p1 = P(a[0], a[1]); p2 = P(a[2], a[3]); p3 = P(a[4], a[5])
            else:
                p1 = (2 * x - last_c[0], 2 * y - last_c[1]) if last_c else (x, y); p2 = P(a[0], a[1]); p3 = P(a[2], a[3])
            segs.append('C' + ' '.join(fmt(v) for v in (*p1, *p2, *p3))); pts += bez((x, y), p1, p2, p3)
            last_c = p2; last_q = None; x, y = p3
        elif c in 'qt':
            if c == 'q':
                q1 = P(a[0], a[1]); p3 = P(a[2], a[3])
            else:
                q1 = (2 * x - last_q[0], 2 * y - last_q[1]) if last_q else (x, y); p3 = P(a[0], a[1])
            p1 = (x + 2 / 3 * (q1[0] - x), y + 2 / 3 * (q1[1] - y)); p2 = (p3[0] + 2 / 3 * (q1[0] - p3[0]), p3[1] + 2 / 3 * (q1[1] - p3[1]))
            segs.append('C' + ' '.join(fmt(v) for v in (*p1, *p2, *p3))); pts += bez((x, y), p1, p2, p3)
            last_q = q1; last_c = None; x, y = p3
        elif c == 'a':
            nx, ny = P(a[5], a[6])
            segs.append(f'A{fmt(a[0])} {fmt(a[1])} {fmt(a[2])} {int(a[3])} {int(a[4])} {fmt(nx)} {fmt(ny)}')
            pts += arc_points(x, y, a[0], a[1], a[2], int(a[3]), int(a[4]), nx, ny)
            x, y = nx, ny; last_c = last_q = None
    return [(''.join(s), p) for s, p in out]


def parts(svg):
    body = svg[svg.find('</defs>') + 1 if '</defs>' in svg else 0:]
    res = []
    for m in re.finditer(r'<path\b([^>]*)>', body):
        attrs = m.group(1)
        d = re.search(r'\bd="([^"]+)"', attrs)
        if not d:
            continue
        fill = re.search(r'fill:\s*([^;"]+)|fill="([^"]+)"', attrs)
        fill = (fill.group(1) or fill.group(2)) if fill else '#000'
        rule = 'evenodd' if 'evenodd' in attrs else 'nonzero'
        for sd, pts in subpaths(d.group(1)):
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            res.append({'d': sd, 'fill': fill.strip(), 'rule': rule, 'box': (min(xs), min(ys), max(xs), max(ys))})
    return res


def main():
    mode, src = sys.argv[1], sys.argv[2]
    ps = parts(open(src).read())
    if mode == 'list':
        for k, p in enumerate(ps):
            b = p['box']
            print(k, p['fill'], p['rule'], ' '.join(fmt(v) for v in b), f'{fmt(b[2] - b[0])}x{fmt(b[3] - b[1])}')
        return
    out, pick = sys.argv[3], [int(v) for v in sys.argv[4].split(',')] if len(sys.argv) > 4 and sys.argv[4] != 'all' else range(len(ps))
    sel = [ps[k] for k in pick]
    x0 = min(p['box'][0] for p in sel); y0 = min(p['box'][1] for p in sel)
    x1 = max(p['box'][2] for p in sel); y1 = max(p['box'][3] for p in sel)
    rule = sel[0]['rule']
    d = ''.join(p['d'] for p in sel)
    open(out, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{fmt(x0)} {fmt(y0)} {fmt(x1 - x0)} {fmt(y1 - y0)}"><path fill-rule="{rule}" d="{d}"/></svg>\n')
    print(out, f'{fmt(x1 - x0)}x{fmt(y1 - y0)}')


if __name__ == '__main__':
    main()
