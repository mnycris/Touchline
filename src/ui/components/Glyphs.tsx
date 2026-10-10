// Small colour match glyphs: the football (goals), the boot (assists) and the own goal, drawn in one black-and-white
// language with the same dark keyline.
import { useId } from 'react'

/**
 * The football: one design everywhere (goal marks, shot maps, replays, the spinning ball). White with the same dark
 * keyline as the boot, turned a little so it reads as a sphere: a central panel, five panels foreshortened toward the
 * rim and fine seams, shaded from the top left. At badge sizes the seams drop out and the centre panel grows.
 */
const BALL_CENTRE = 'M10.76 7.85Q12.82 8.47 14.56 9.71Q14.62 11.85 13.98 13.9Q11.95 14.61 9.81 14.63Q8.51 12.93 7.82 10.9Q9.04 9.13 10.76 7.85Z'
const BALL_RIM = [
  'M10.88 5.63Q9.15 5.33 7.71 4.62Q7.79 3.28 8.38 1.97Q10.13 1.41 11.97 1.34Q12.97 2.37 13.51 3.6Q12.4 4.76 10.88 5.63Z',
  'M17.71 8.96Q17.46 7.23 17.69 5.64Q18.99 5.31 20.42 5.46Q21.5 6.95 22.13 8.68Q21.46 9.95 20.46 10.84Q19.01 10.14 17.71 8.96Z',
  'M16.65 16.49Q18.23 15.72 19.81 15.44Q20.53 16.58 20.82 17.99Q19.74 19.47 18.29 20.61Q16.87 20.36 15.71 19.69Q15.93 18.09 16.65 16.49Z',
  'M9.16 17.81Q10.39 19.07 11.14 20.49Q10.28 21.52 9.03 22.24Q7.29 21.67 5.76 20.64Q5.55 19.22 5.84 17.91Q7.42 17.62 9.16 17.81Z',
  'M5.59 11.1Q4.78 12.65 3.66 13.8Q2.41 13.31 1.34 12.34Q1.35 10.5 1.85 8.73Q3.14 8.1 4.48 7.97Q5.24 9.38 5.59 11.1Z',
]
const BALL_SEAMS = 'M10.76 7.85L10.88 5.63M14.56 9.71L17.71 8.96M13.98 13.9L16.65 16.49M9.81 14.63L9.16 17.81M7.82 10.9L5.59 11.1M13.51 3.6L17.69 5.64M20.46 10.84L19.81 15.44M15.71 19.69L11.14 20.49M5.84 17.91L3.66 13.8M4.48 7.97L7.71 4.62'
export function Ball({ size = 12, style, className, own }: { size?: number; style?: React.CSSProperties; className?: string; own?: boolean }) {
  const id = useId().replace(/:/g, '')
  const small = size <= 13
  // an own goal is the same ball with red panels and keyline: the right ball, the wrong net
  const ink = own ? '#e5484d' : '#16191d'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className} aria-hidden>
      <defs>
        <clipPath id={`bc${id}`}><circle cx="12" cy="12" r="10.4" /></clipPath>
        <radialGradient id={`bg${id}`} cx="35%" cy="28%" r="80%"><stop offset="0" stopColor="#fff" /><stop offset=".6" stopColor="#eef0f3" /><stop offset="1" stopColor="#bcc3cc" /></radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.6" fill={`url(#bg${id})`} />
      <g clipPath={`url(#bc${id})`} fill={ink}>
        <path d={BALL_CENTRE} transform={small ? 'translate(11.6 11.4) scale(1.25) translate(-11.6 -11.4)' : undefined} />
        {BALL_RIM.map((d) => <path key={d} d={d} />)}
      </g>
      {!small && <path d={BALL_SEAMS} clipPath={`url(#bc${id})`} stroke={ink} strokeWidth=".75" strokeLinecap="round" fill="none" />}
      <circle cx="12" cy="12" r="10.6" fill="none" stroke={ink} strokeWidth={small ? 1.8 : 1.3} />
    </svg>
  )
}

/** The same ball drawn inside another SVG (shot maps, replays): centred on cx, cy with radius r, in its units. */
export function BallG({ cx, cy, r, own, className }: { cx: number; cy: number; r: number; own?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  const ink = own ? '#e5484d' : '#16191d'
  const k = r / 10.6
  return (
    <g className={className} transform={`translate(${cx} ${cy}) scale(${k}) translate(-12 -12)`}>
      <defs>
        <clipPath id={`gc${id}`}><circle cx="12" cy="12" r="10.4" /></clipPath>
        <radialGradient id={`gg${id}`} cx="35%" cy="28%" r="80%"><stop offset="0" stopColor="#fff" /><stop offset=".6" stopColor="#eef0f3" /><stop offset="1" stopColor="#bcc3cc" /></radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.6" fill={`url(#gg${id})`} />
      <g clipPath={`url(#gc${id})`} fill={ink}><path d={BALL_CENTRE} />{BALL_RIM.map((d) => <path key={d} d={d} />)}</g>
      <path d={BALL_SEAMS} clipPath={`url(#gc${id})`} stroke={ink} strokeWidth=".75" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="12" r="10.6" fill="none" stroke={ink} strokeWidth="1.5" />
    </g>
  )
}

// the boot in profile (drawn toe-right, shown mirrored so the toe points left like FotMob's): upper (heel tab, collar,
// laced instep, long toe), sole plate and studs
const BOOT_UPPER = 'M3.5 5.6c1.2 0 2.1.7 2.4 1.8.8.8 2.2 1.1 3.6.7l1.1-.4c2.4 1.6 5.6 2.8 8.6 3.5 2.2.5 3.5 1.7 3.5 3.3 0 .9-.5 1.6-1.4 1.6H3.3c-.9 0-1.5-.7-1.5-1.6V7.2c0-.9.8-1.6 1.7-1.6Z'
const BOOT_PLATE = 'M1.9 15.8h20.4c-.1 1-.9 1.7-1.9 1.7H3.6c-.9 0-1.6-.7-1.7-1.7Z'
const BOOT_STUDS = ['M3.6 17.3h2.2l-.3 2.1H3.9Z', 'M7.2 17.3h2l-.3 1.9H7.5Z', 'M13.3 17.3h2l-.3 1.9h-1.4Z', 'M17.2 17.3h2.2l-.3 2.1h-1.6Z']

/** Assist marker: a football boot in profile, white with a dark keyline so it reads on a dark pitch and on a light
 *  face alike, studs and all, with one accent stripe. */
export function Boot({ size = 12, style, className }: { size?: number; style?: React.CSSProperties; className?: string }) {
  const small = size <= 14
  const shape = <><path d={BOOT_UPPER} /><path d={BOOT_PLATE} />{BOOT_STUDS.map((d) => <path key={d} d={d} />)}</>
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className} aria-hidden>
      {/* tipped toe-down to the left, as if striking the ball */}
      <g transform="translate(24 0) scale(-1 1) rotate(22 12 12) translate(0 .2)">
        <g fill="#15181c" stroke="#15181c" strokeWidth={small ? 2.6 : 2.1} strokeLinejoin="round">{shape}</g>
        <g fill="#f6f7f9">{shape}</g>
        <path d="M1.9 15.75h20.4" stroke="#15181c" strokeWidth={small ? 1.2 : 0.95} />
        {/* the accent: a solid stripe while it is tiny, a tapering swoosh once there is room for one */}
        {small ? <path d="M4.4 12.4c3.3 0 6.6-.9 9.4-2.6" stroke="var(--acc, #1fd67a)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          : <path d="M3.9 11.9C7.6 12.1 11.1 10.9 14.3 9.1C11.5 11.6 8.1 13.4 4.2 13.6Z" fill="var(--acc, #1fd67a)" />}
        {!small && <path d="M11.9 8.6l-.8 1.2M14 9.7l-.7 1.2M16.1 10.6l-.6 1.1" stroke="#15181c" strokeWidth=".85" strokeLinecap="round" />}
      </g>
    </svg>
  )
}

/**
 * A count of goals or assists: up to three marks overlapping, the first in front (FotMob style); beyond that the
 * overlap stops saying anything, so it becomes one mark with the number beside it.
 */
function Stack({ n, size, mark, label }: { n: number; size: number; mark: (i: number) => React.ReactNode; label: string }) {
  if (n <= 0) return null
  if (n > 3) return <span className="mk-count" aria-label={label}>{mark(0)}<b style={{ fontSize: Math.max(9, size * 0.72) }}>{n}</b></span>
  return (
    <span className="boots" style={{ ['--bo' as any]: `${-Math.round(size * (n === 3 ? 0.5 : 0.42))}px` }} aria-label={label}>
      {/* laid out right to left so the first mark is drawn last, on top */}
      {Array.from({ length: n }, (_, i) => mark(i))}
    </span>
  )
}
export function Boots({ n, size = 12 }: { n: number; size?: number; max?: number }) {
  return <Stack n={n} size={size} label={`${n} assist${n > 1 ? 's' : ''}`} mark={(i) => <Boot key={i} size={size} />} />
}
export function Balls({ n, size = 12, own }: { n: number; size?: number; own?: boolean }) {
  return <Stack n={n} size={size} label={`${n} ${own ? 'own goal' : 'goal'}${n > 1 ? 's' : ''}`} mark={(i) => <Ball key={i} size={size} own={own} />} />
}

/** Sent off: a red card, with how many when there was more than one. */
export function RedCards({ n, size = 12 }: { n: number; size?: number }) {
  if (n <= 0) return null
  return <span className="rc-mark" style={{ width: size * 0.72, height: size }} aria-label={`${n} sent off`}>{n > 1 && <b>{n}</b>}</span>
}

/** A missed penalty: the ball with a small red cross. */
export function MissedPen({ size = 12 }: { size?: number }) {
  return <span className="pen-miss" style={{ width: size, height: size }}><Ball size={size} /><i /></span>
}
