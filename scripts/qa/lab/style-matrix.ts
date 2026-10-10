// Every AI style against every other: goals, shots and xG per match when both sides of mixed PL fixtures play them,
// with the same squads on both sides of the comparison (so the cell is the style match-up, not the clubs).
// A real league has match-up effects, but none of its pairings is sterile or a shoot-out, and no style wins everywhere.
// npx tsx scripts/qa/lab/style-matrix.ts [n=24] [--light] [--brief]
import { freshWorld, play } from '../engine-lab'
import type { TeamTactics } from '../../../src/domain/types'
const N = Number(process.argv[2] || 24)
const light = process.argv.includes('--light')
const brief = process.argv.includes('--brief')
const w = freshWorld()
const pl = Object.values(w.competitions).find((c) => c.format === 'league' && c.name.includes('Premier'))!
const styles = new Map<string, TeamTactics>()
const count: Record<string, number> = {}
const styleOf = (t: TeamTactics) => t.buildUp === 'Short Passing' ? 'possess' : t.defApproach === 'Aggressive' ? 'press' : t.buildUp === 'Counter' ? 'counter' : t.buildUp === 'Long Ball' ? (t.defApproach === 'Deep' ? 'lowblock' : 'direct') : 'balanced'
for (const c of Object.values(w.clubs)) {
  if (c.national || !c.sheets?.length) continue
  const t = c.sheets.find((s) => s.id === c.activeSheet)!.tactics
  const k = styleOf(t)
  if (!styles.has(k)) styles.set(k, { ...t })
  if (pl.clubs.includes(c.id)) count[k] = (count[k] || 0) + 1
}
const keys = ['possess', 'press', 'balanced', 'counter', 'direct', 'lowblock'].filter((k) => styles.has(k))
const cells: Record<string, { g: number; s: number; x: number; edge: number; pts: number }> = {}
for (const hk of keys) for (const ak of keys) {
  let g = 0, s = 0, x = 0, edge = 0, pts = 0
  for (let i = 0; i < N; i++) {
    // the same pair of clubs plays the cell both ways round, so neither style gets the better squad
    const h0 = pl.clubs[i % pl.clubs.length], a0 = pl.clubs[(i * 7 + 5) % pl.clubs.length]
    if (h0 === a0) continue
    const [h, a] = i % 2 ? [a0, h0] : [h0, a0]
    const H = w.clubs[h], A = w.clubs[a]
    const keep = [H, A].map((c) => c.sheets.map((sh) => sh.tactics))
    H.sheets.forEach((sh) => { sh.tactics = { ...styles.get(hk)! } })
    A.sheets.forEach((sh) => { sh.tactics = { ...styles.get(ak)! } })
    const r = play(w, h, a, 700 + i, { light }).r
    ;[H, A].forEach((c, k) => c.sheets.forEach((sh, j) => { sh.tactics = keep[k][j] }))
    g += r.score[0] + r.score[1]; s += r.stats[0].shots + r.stats[1].shots; x += r.stats[0].xg + r.stats[1].xg
    edge += r.stats[0].xg - r.stats[1].xg
    pts += r.score[0] > r.score[1] ? 3 : r.score[0] === r.score[1] ? 1 : 0
  }
  cells[hk + '|' + ak] = { g: g / N, s: s / N, x: x / N, edge: edge / N, pts: pts / N }
}
if (!brief) {
  console.log('home \\ away'.padEnd(12) + keys.map((k) => k.padStart(22)).join(''))
  for (const hk of keys) console.log(hk.padEnd(12) + keys.map((ak) => { const c = cells[hk + '|' + ak]; return `${c.g.toFixed(1)}g ${c.s.toFixed(0)}s ${c.x.toFixed(1)}x ${c.edge >= 0 ? '+' : ''}${c.edge.toFixed(2)}`.padStart(22) }).join(''))
}
// weighted by how often each pairing happens in the Premier League
let wsum = 0, wg = 0, ws = 0
const vals = Object.values(cells)
for (const hk of keys) for (const ak of keys) { const wt = (count[hk] || 0) * (count[ak] || 0); wsum += wt; wg += cells[hk + '|' + ak].g * wt; ws += cells[hk + '|' + ak].s * wt }
const style = keys.map((k) => {
  // a style's edge over the field: xG difference and points as the home side, mirrored for away
  let e = 0, p = 0
  for (const o of keys) { e += cells[k + '|' + o].edge - cells[o + '|' + k].edge; p += cells[k + '|' + o].pts + (3 - cells[o + '|' + k].pts) }
  return `${k} ${(e / keys.length / 2 >= 0 ? '+' : '') + (e / keys.length / 2).toFixed(2)}xg`
})
console.log(`PL-weighted ${(wg / wsum).toFixed(2)} goals ${(ws / wsum).toFixed(1)} shots | cells goals ${Math.min(...vals.map((c) => c.g)).toFixed(1)}–${Math.max(...vals.map((c) => c.g)).toFixed(1)} shots ${Math.min(...vals.map((c) => c.s)).toFixed(0)}–${Math.max(...vals.map((c) => c.s)).toFixed(0)} | style edge: ${style.join(' · ')}`)
