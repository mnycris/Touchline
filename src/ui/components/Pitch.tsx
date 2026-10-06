import type { ReactNode } from 'react'
import type { Formation } from '../../domain/constants'
import { PitchSurface } from './PitchSurface'

/**
 * Vertical positions (top, %) for tall slots that keep the formation's shape: the keeper sits clear of his defence,
 * the outfield keeps its relative depths, and players in the same channel are eased apart until their slots no
 * longer run into each other.
 */
function spacedTops(f: Formation): number[] {
  const GK_TOP = 90, TOP = 12, GAP = 18, GK_GAP = 19.5, BACK = GK_TOP - GK_GAP
  const ys = f.slots.filter((s) => s.pos !== 'GK').map((s) => s.y)
  const lo = Math.min(...ys), hi = Math.max(...ys)
  const k = hi > lo ? Math.min(1.1, (BACK - TOP) / (hi - lo)) : 1
  const gk = f.slots.map((s) => s.pos === 'GK')
  const t = f.slots.map((s, i) => (gk[i] ? GK_TOP : BACK - (s.y - lo) * k))
  for (let it = 0; it < 40; it++) {
    let moved = false
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
      if (Math.abs(f.slots[i].x - f.slots[j].x) >= 20) continue
      const d = t[j] - t[i], need = (gk[i] || gk[j] ? GK_GAP : GAP) - Math.abs(d)
      if (need <= 0.05) continue
      const dir = d >= 0 ? 1 : -1
      // the keeper stays where he is; otherwise both give way
      t[i] -= dir * (gk[i] ? 0 : gk[j] ? need : need / 2)
      t[j] += dir * (gk[j] ? 0 : gk[i] ? need : need / 2)
      moved = true
    }
    for (let i = 0; i < t.length; i++) if (!gk[i]) t[i] = Math.max(TOP, Math.min(BACK + 1, t[i]))
    if (!moved) break
  }
  return t
}

/** Vertical pitch (own goal at the bottom). Slot y is 0 (own goal) → 100 (opponent goal). */
export function Pitch({ formation, render, children, style, compact, spaced }: { formation: Formation; render: (slotIndex: number) => ReactNode; children?: ReactNode; style?: React.CSSProperties; compact?: boolean; spaced?: boolean }) {
  const tops = spaced ? spacedTops(formation) : undefined
  return (
    <PitchSurface vertical aspect={compact ? 0.82 : 0.78} pad={2.5} chevron className="pitch" style={style}>
      {formation.slots.map((s, i) => (
        <div key={i} className="pitch-slot" style={{ left: `${s.x}%`, top: `${tops ? tops[i] : 100 - (compact ? 4 + s.y * 0.9 : s.y) - (compact ? 0 : 2)}%` }}>
          {render(i)}
        </div>
      ))}
      {children}
    </PitchSurface>
  )
}
