// Score effects: shot and xG share by game state (lead from the shooting side's view), per minute in that state, one
// league season through the full engine. Real football: a side a goal down takes ~55–58% of the shots, two down ~60%.
//   npx tsx scripts/qa/lab/states.ts [leagueId=13]
import { freshWorld, play } from '../engine-lab'
const w = freshWorld()
const lid = Number(process.argv[2] || 13)
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === lid)!
const T: Record<number, { min: number; sh: number; xg: number; osh: number; oxg: number }> = {}
const row = (k: number) => (T[k] ||= { min: 0, sh: 0, xg: 0, osh: 0, oxg: 0 })
for (const fid of comp.fixtures) {
  const f = w.fixtures[fid]
  const { r } = play(w, f.home, f.away, 277, { compId: comp.id })
  const goals = r.events.filter((e) => e.type === 'goal' || e.type === 'owngoal' || e.type === 'penGoal').map((e) => ({ min: e.min + (e.add ? e.add / 100 : 0), side: e.side }))
  const at = (m: number) => { const s = [0, 0]; for (const g of goals) if (g.min < m) s[g.side as 0 | 1]++; return s }
  // minutes in each state
  for (let m = 0; m < 90; m++) { const s = at(m + 0.5); for (const side of [0, 1]) row(Math.max(-2, Math.min(2, s[side] - s[1 - side]))).min++ }
  for (const e of r.events) {
    if (e.xg === undefined || !['chance', 'save', 'miss', 'woodwork', 'goal'].includes(e.type) || (e.side !== 0 && e.side !== 1)) continue
    const s = at(e.min - 0.01)
    const k = Math.max(-2, Math.min(2, s[e.side] - s[1 - e.side]))
    row(k).sh++; row(k).xg += e.xg
    row(-k).osh++; row(-k).oxg += e.xg
  }
}
console.log('lead  share of time   shots/90  xG/90   opp shots/90  opp xG/90   shot share  xG share')
for (const k of [-2, -1, 0, 1, 2]) {
  const t = T[k]; if (!t) continue
  const tot = Object.values(T).reduce((a, x) => a + x.min, 0)
  console.log(`${String(k).padStart(3)}   ${((t.min / tot) * 100).toFixed(0).padStart(5)}%      ${((t.sh / t.min) * 90).toFixed(1).padStart(6)}  ${((t.xg / t.min) * 90).toFixed(2).padStart(5)}   ${((t.osh / t.min) * 90).toFixed(1).padStart(8)}     ${((t.oxg / t.min) * 90).toFixed(2).padStart(6)}      ${((t.sh / (t.sh + t.osh)) * 100).toFixed(0)}%       ${((t.xg / (t.xg + t.oxg)) * 100).toFixed(0)}%`)
}
