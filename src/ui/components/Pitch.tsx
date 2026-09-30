import type { ReactNode } from 'react'
import type { Formation } from '../../domain/constants'
import { PitchSurface } from './PitchSurface'

/** Vertical pitch (own goal at the bottom). Slot y is 0 (own goal) → 100 (opponent goal). */
export function Pitch({ formation, render, children, style, compact }: { formation: Formation; render: (slotIndex: number) => ReactNode; children?: ReactNode; style?: React.CSSProperties; compact?: boolean }) {
  return (
    <PitchSurface vertical aspect={compact ? 0.82 : 0.78} pad={2.5} chevron className="pitch" style={style}>
      {formation.slots.map((s, i) => (
        <div key={i} className="pitch-slot" style={{ left: `${s.x}%`, top: `${100 - (compact ? 4 + s.y * 0.9 : s.y) - (compact ? 0 : 2)}%` }}>
          {render(i)}
        </div>
      ))}
      {children}
    </PitchSurface>
  )
}
