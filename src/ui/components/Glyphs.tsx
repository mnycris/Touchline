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

/** Assist marker: a low-cut football boot drawn in the same black-and-white language as the ball. */
export function Boot({ size = 12, style, className }: { size?: number; style?: React.CSSProperties; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className} aria-hidden>
      <defs><linearGradient id={`bt${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#cfd5dc" /></linearGradient></defs>
      <g transform="translate(0,-1.2)">
        <path d="M2.8 8.3C4.6 9.3 6.8 9.5 8.6 8.9L10.1 8.4C11.5 9.7 13.7 10.7 16.6 11.5C19.6 12.3 21.6 13.3 21.8 15.1C21.9 15.9 21.4 16.3 20.6 16.3H3.4C2.6 16.3 2.1 15.7 2.2 14.9Z" fill={`url(#bt${id})`} stroke="#15181c" strokeWidth=".95" strokeLinejoin="round" />
        <path d="M2.3 16.1h19.4c.1.8-.3 1.5-1.1 1.5H3.3c-.7 0-1.1-.6-1-1.5z" fill="#15181c" />
        <path d="M4.3 17.4v1.5M7.3 17.4v1.5M15 17.4v1.5M18.6 17.4v1.5" stroke="#15181c" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M11.6 8.8l-.9 1.5M13.4 9.8l-.8 1.5M15.2 10.6l-.7 1.5" stroke="#15181c" strokeWidth=".9" strokeLinecap="round" />
        <path d="M4.4 13.9c3.6.1 7.4-.6 10.3-2.1" stroke="#15181c" strokeWidth="1.15" strokeLinecap="round" fill="none" opacity=".8" />
      </g>
    </svg>
  )
}

/** A missed penalty: the ball with a small red cross. */
export function MissedPen({ size = 12 }: { size?: number }) {
  return <span className="pen-miss" style={{ width: size, height: size }}><Ball size={size} /><i /></span>
}
