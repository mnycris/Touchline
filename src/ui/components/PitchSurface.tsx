// One pitch for the whole app, in the FotMob language: a flat charcoal surface with rounded corners, thin grey
// markings drawn to real dimensions (so the centre circle is a circle whatever the box), a margin round the lines and
// an optional attacking-direction chevron. Line-ups, the formation board, the live 2D pitch, the heat map, the
// Matches tab and the tactics diagrams all draw on it.
import type { CSSProperties, ReactNode } from 'react'

export const PITCH_W = 68
const BOX_W = 40.32, BOX_D = 16.5, SIX_W = 18.32, SIX_D = 5.5, SPOT = 11, R = 9.15

export interface PitchSurfaceProps {
  /** Own goal at the bottom, attacking up. Otherwise attacking left to right. */
  vertical?: boolean
  /** Width ÷ height of the whole surface; the drawn pitch length follows from it. Default: real proportions. */
  aspect?: number
  /** Margin round the lines, in metres. */
  pad?: number
  /** Small chevron in the top margin pointing the way the team attacks. */
  chevron?: boolean
  /** Goal frames drawn in the margin behind each goal line. */
  goals?: boolean
  /** Thinner markings for small renders. */
  thin?: boolean
  /** Content laid over the playing area only (the lines rectangle): positions in % map to the pitch itself. */
  field?: ReactNode
  /** Content laid under the markings, in the playing area (heat, zones). */
  under?: ReactNode
  className?: string
  style?: CSSProperties
  /** Content positioned against the whole surface. */
  children?: ReactNode
}

/** Pitch length (m) drawn for a given surface aspect. */
function lengthFor(vertical: boolean, aspect: number | undefined, pad: number) {
  if (!aspect) return 105
  return vertical ? (PITCH_W + 2 * pad) / aspect - 2 * pad : aspect * (PITCH_W + 2 * pad) - 2 * pad
}

/** The markings of a pitch attacking left to right, L metres long, in metres. */
export function Markings({ L, W = PITCH_W, sw = 1 }: { L: number; W?: number; sw?: number }) {
  const cy = W / 2
  const arc = Math.sqrt(R * R - (BOX_D - SPOT) ** 2)
  return (
    <g fill="none" stroke="var(--pitch-line)" strokeWidth={sw}>
      <rect x="0" y="0" width={L} height={W} rx=".6" vectorEffect="non-scaling-stroke" />
      <path d={`M${L / 2} 0V${W}`} vectorEffect="non-scaling-stroke" />
      <circle cx={L / 2} cy={cy} r={R} vectorEffect="non-scaling-stroke" />
      <path vectorEffect="non-scaling-stroke" d={[
        `M0 ${cy - BOX_W / 2}H${BOX_D}V${cy + BOX_W / 2}H0`, `M${L} ${cy - BOX_W / 2}H${L - BOX_D}V${cy + BOX_W / 2}H${L}`,
        `M0 ${cy - SIX_W / 2}H${SIX_D}V${cy + SIX_W / 2}H0`, `M${L} ${cy - SIX_W / 2}H${L - SIX_D}V${cy + SIX_W / 2}H${L}`,
        `M${BOX_D} ${cy - arc}A${R} ${R} 0 0 1 ${BOX_D} ${cy + arc}`, `M${L - BOX_D} ${cy - arc}A${R} ${R} 0 0 0 ${L - BOX_D} ${cy + arc}`,
      ].join('')} />
      <g fill="var(--pitch-line)" stroke="none">
        <circle cx={L / 2} cy={cy} r=".55" /><circle cx={SPOT} cy={cy} r=".45" /><circle cx={L - SPOT} cy={cy} r=".45" />
      </g>
    </g>
  )
}

export function PitchSurface({ vertical = false, aspect, pad = 3, chevron, goals, thin, field, under, className = '', style, children }: PitchSurfaceProps) {
  const L = lengthFor(vertical, aspect, pad)
  const W = PITCH_W
  // the surface in metres
  const sw = vertical ? W + 2 * pad : L + 2 * pad
  const sh = vertical ? L + 2 * pad : W + 2 * pad
  const inset = `${(pad / sh) * 100}% ${(pad / sw) * 100}%`
  const c = Math.min(pad * 0.42, 1.6)
  return (
    <div className={`psf ${className}`} style={{ aspectRatio: `${sw} / ${sh}`, ...style }}>
      {under && <div className="psf-field" style={{ inset }}>{under}</div>}
      <svg className="psf-lines" viewBox={`${-pad} ${-pad} ${sw} ${sh}`} preserveAspectRatio="none" aria-hidden>
        <g transform={vertical ? `translate(0 ${L}) rotate(-90)` : undefined}>
          <Markings L={L} W={W} sw={thin ? 0.75 : 1} />
          {goals && <g fill="var(--pitch-goal)" stroke="var(--pitch-mark)" strokeWidth="1">
            <rect x={-Math.min(pad * 0.75, 2)} y={W / 2 - 3.66} width={Math.min(pad * 0.75, 2)} height="7.32" vectorEffect="non-scaling-stroke" />
            <rect x={L} y={W / 2 - 3.66} width={Math.min(pad * 0.75, 2)} height="7.32" vectorEffect="non-scaling-stroke" />
          </g>}
        </g>
        {chevron && (vertical
          ? <path d={`M${W / 2 - c} ${-pad / 2 + c / 2}l${c} ${-c}l${c} ${c}`} fill="none" stroke="var(--pitch-mark)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          : <path d={`M${L / 2 - c / 2} ${-pad / 2 - c}l${c} ${c}l${-c} ${c}`} fill="none" stroke="var(--pitch-mark)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
      </svg>
      {field && <div className="psf-field" style={{ inset }}>{field}</div>}
      {children}
    </div>
  )
}

/** Half a pitch (for small diagrams in a w×h box), attacking up: our half with the goal at the bottom, or the
 *  opponent's half with it at the top. Lines sit p units inside the box. */
export function HalfMarkings({ w, h, goal, p = 3 }: { w: number; h: number; goal: 'top' | 'bottom'; p?: number }) {
  const s = (w - 2 * p) / PITCH_W
  const bw = BOX_W * s, bd = BOX_D * s, xw = SIX_W * s, xd = SIX_D * s, r = R * s, spot = SPOT * s
  const cx = w / 2
  const arc = Math.sqrt(r * r - (bd - spot) ** 2)
  const gy = goal === 'bottom' ? h - p : p, dir = goal === 'bottom' ? -1 : 1
  const my = goal === 'bottom' ? p : h - p
  const v = { vectorEffect: 'non-scaling-stroke' as const }
  return (
    <g fill="none" stroke="var(--pitch-line)" strokeWidth="1">
      <rect x={p} y={p} width={w - 2 * p} height={h - 2 * p} {...v} />
      <path {...v} d={[
        `M${cx - bw / 2} ${gy}V${gy + dir * bd}H${cx + bw / 2}V${gy}`,
        `M${cx - xw / 2} ${gy}V${gy + dir * xd}H${cx + xw / 2}V${gy}`,
        `M${cx - arc} ${gy + dir * bd}A${r} ${r} 0 0 ${goal === 'bottom' ? 1 : 0} ${cx + arc} ${gy + dir * bd}`,
        `M${cx - r} ${my}A${r} ${r} 0 0 ${goal === 'bottom' ? 0 : 1} ${cx + r} ${my}`,
      ].join('')} />
      <circle cx={cx} cy={gy + dir * spot} r={0.6 * s} fill="var(--pitch-line)" stroke="none" />
    </g>
  )
}
