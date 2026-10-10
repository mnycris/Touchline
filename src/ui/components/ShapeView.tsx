// The team's shape at a moment, as the match engine lays it out: our side attacking left to right (solid), the sparring
// side faint, the ball, and our back line. A second setup can be shown as rings so two shapes can be read against each
// other. Players glide to their new places when the moment or an instruction changes.
import type { World } from '../../domain/types'
import type { ShapeDot } from '../../engine/world/practice'
import { PitchSurface } from './PitchSurface'
import { Ball } from './Lineup'

const lum = (h: string) => { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 }
const pct = (v: number, lo = 1.5, hi = 98.5) => `${Math.max(lo, Math.min(hi, v))}%`

export function ShapeView({ w, dots, ghost, ball, inPoss, kit, oppKit }: { w: World; dots: ShapeDot[]; ghost?: ShapeDot[]; ball: { x: number; y: number }; inPoss: boolean; kit: string; oppKit: string }) {
  const us = dots.filter((d) => d.side === 0), them = dots.filter((d) => d.side === 1)
  const out = us.filter((d) => !d.gk)
  const back = out.length ? Math.min(...out.map((d) => d.x)) : 0
  const theirLine = them.filter((d) => !d.gk).reduce((m, d) => Math.max(m, d.x), 0)
  const ink = lum(kit) > 165 ? '#0b0d11' : '#fff'
  return (
    <PitchSurface className="sv" pad={2.4} goals field={<>
      {/* the line that matters in this moment: ours without the ball, theirs with it */}
      {inPoss
        ? <span className="sv-line them" style={{ left: pct(theirLine, 0, 100) }}><i>their line</i></span>
        : <span className="sv-line" style={{ left: pct(back, 0, 100) }}><i>our line</i></span>}
      {them.map((d) => <span key={`t${d.id}`} className={`sv-dot opp ${d.gk ? 'gk' : ''}`} style={{ left: pct(d.x), top: pct(d.y, 3, 97), ['--kit' as any]: oppKit }} />)}
      {ghost && ghost.filter((d) => d.side === 0).map((d) => <span key={`g${d.id}`} className="sv-ghost" style={{ left: pct(d.x), top: pct(d.y, 3, 97) }} />)}
      {us.map((d) => (
        <span key={`u${d.id}`} className={`sv-dot ${d.gk ? 'gk' : ''}`} style={{ left: pct(d.x), top: pct(d.y, 3, 97), ['--kit' as any]: d.gk ? '#f5d90a' : kit, color: d.gk ? '#0b0d11' : ink }}>
          {w.players[d.id]?.jersey || ''}
        </span>
      ))}
      <span className="sv-ball" style={{ left: pct(ball.x, 0, 100), top: pct(ball.y, 3, 97) }}><Ball size={10} /></span>
    </>} />
  )
}
