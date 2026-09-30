// Small colour match glyphs: the football (goals) and the boot (assists), drawn in one black-and-white language.
import { useId } from 'react'

/** A proper black-and-white football (truncated icosahedron look), not a glowing dot. */
export function Ball({ size = 12, style, className }: { size?: number; style?: React.CSSProperties; className?: string }) {
  const id = useId().replace(/:/g, '')
  // at badge sizes the seams turn to noise: drop them, grow the patches, darken the rim
  const small = size <= 13
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className} aria-hidden>
      <defs>
        <clipPath id={`bc${id}`}><circle cx="12" cy="12" r={small ? 9.2 : size <= 16 ? 9.9 : 11} /></clipPath>
        <radialGradient id={`bg${id}`} cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#fff" /><stop offset=".75" stopColor="#e9ecef" /><stop offset="1" stopColor="#b8bec6" /></radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#bg${id})`} />
      <g clipPath={`url(#bc${id})`} fill="#15181c">
        <path d="M12 7.3l4.2 3.05-1.6 4.95H9.4l-1.6-4.95z" transform={small ? 'translate(12 11.4) scale(1.28) translate(-12 -11.4)' : undefined} />
        <path d="M9.4 -0.6h5.2l.9 3.4-3.5 2.2-3.5-2.2z" />
        <path d="M23.8 8.1l.2 5.4-3.2 1.2-2.4-3 1.6-4.1z" />
        <path d="M19.9 21.6l-4.5 2.6-2-2.8 1.8-3.6 3.8.3z" />
        <path d="M4.1 21.6l4.5 2.6 2-2.8-1.8-3.6-3.8.3z" />
        <path d="M.2 8.1L0 13.5l3.2 1.2 2.4-3-1.6-4.1z" />
      </g>
      {!small && (
        <g stroke="#15181c" strokeWidth=".9" fill="none" clipPath={`url(#bc${id})`}>
          <path d="M12 7.3V5M16.2 10.35l2.8-1M14.6 15.3l1.2 2.5M9.4 15.3l-1.2 2.5M7.8 10.35l-2.8-1" />
        </g>
      )}
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth=".8" />
    </svg>
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
      <g transform="translate(24 0) scale(-1 1) rotate(14 12 12) translate(0 .2)">
        <g fill="#15181c" stroke="#15181c" strokeWidth={small ? 2.6 : 2.1} strokeLinejoin="round">{shape}</g>
        <g fill="#f6f7f9">{shape}</g>
        <path d="M1.9 15.75h20.4" stroke="#15181c" strokeWidth={small ? 1.2 : 0.95} />
        <path d="M4.4 12.4c3.3 0 6.6-.9 9.4-2.6" stroke="var(--acc, #1fd67a)" strokeWidth={small ? 2.2 : 1.8} strokeLinecap="round" fill="none" />
        {!small && <path d="M11.9 8.6l-.8 1.2M14 9.7l-.7 1.2M16.1 10.6l-.6 1.1" stroke="#15181c" strokeWidth=".85" strokeLinecap="round" />}
      </g>
    </svg>
  )
}

/** Several assists: that many boots overlapping, the first one in front (FotMob style), never "boot ×2". */
export function Boots({ n, size = 12, max = 4 }: { n: number; size?: number; max?: number }) {
  if (n <= 0) return null
  const k = Math.min(n, max)
  return (
    <span className="boots" style={{ ['--bo' as any]: `${-Math.round(size * 0.42)}px` }} aria-label={`${n} assist${n > 1 ? 's' : ''}`}>
      {/* laid out right to left so the first boot is drawn last, on top */}
      {n > max && <b className="boots-more">+{n - max}</b>}
      {Array.from({ length: k }, (_, i) => <Boot key={i} size={size} />)}
    </span>
  )
}

/** A missed penalty: the ball with a small red cross. */
export function MissedPen({ size = 12 }: { size?: number }) {
  return <span className="pen-miss" style={{ width: size, height: size }}><Ball size={size} /><i /></span>
}
