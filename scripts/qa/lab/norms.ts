// Baselines for the match analysis (src/engine/match/analysis.ts): what an ordinary side does in a half and in a match,
// measured on full-engine league fixtures across the big five. Prints mean and spread per team for each ledger figure.
// npx tsx scripts/qa/lab/norms.ts [matchesPerLeague=60]
import { freshWorld, play } from '../engine-lab'
import { ledgerDiff, viewOf, type LedgerView } from '../../../src/engine/match/ledger'
const N = Number(process.argv[2] || 60)
const w = freshWorld()
const leagues = ['Premier', 'LaLiga', 'Bundesliga', 'Serie A', 'Ligue 1'].map((n) => Object.values(w.competitions).find((c) => c.format === 'league' && c.name.includes(n))!).filter(Boolean)
const keys = ['poss', 'passes', 'passAcc', 'spell', 'fwdShare', 'fwdAcc', 'longShare', 'reach', 'entries', 'boxEntries', 'tilt', 'lostOwn', 'lostMid', 'lostFinal', 'lostPressed', 'wonHigh', 'wonMid', 'wonOwn', 'quickWon', 'counters', 'shots', 'sot', 'xg', 'progCarries', 'dribbles', 'dribbleAcc', 'crosses', 'crossAcc'] as const
const half: Record<string, number[]> = {}, full: Record<string, number[]> = {}
const touch: Record<string, number[]> = {}
const byRole: Record<string, number[]> = {}
const counterShots: number[] = [], counterXg: number[] = []
for (const lg of leagues) for (let i = 0; i < N; i++) {
  const h = lg.clubs[i % lg.clubs.length], a = lg.clubs[(i * 7 + 3) % lg.clubs.length]
  if (h === a) continue
  const { r, sim } = play(w, h, a, 4000 + i, { detail: true })
  const fr = sim!.ledgerFrames
  const ht = fr.filter((f) => f.m <= 45).pop()!
  for (const s of [0, 1] as const) {
    const o = (1 - s) as 0 | 1
    const vh = viewOf(ht.L[s], ht.L[o], 45) as unknown as Record<string, number>
    const vf = viewOf(sim!.ledger(s), sim!.ledger(o), 90) as unknown as Record<string, number>
    for (const k of keys) { (half[k] ||= []).push(vh[k]); (full[k] ||= []).push(vf[k]) }
    const by = (sim!.ledger(s) as any).by.counter || [0, 0]
    counterShots.push(by[0]); counterXg.push(by[1])
  }
  const roleOf = new Map<number, string>()
  for (const s of [0, 1] as const) for (const lr of sim!.liveRatings(s)) roleOf.set(lr.id, lr.role)
  for (const p of r.players) if (p.started && p.mins >= 85) { const g = p.pos === 'GK' ? 'GK' : ['CB'].includes(p.pos) ? 'CB' : ['LB', 'RB', 'LWB', 'RWB'].includes(p.pos) ? 'FB' : p.pos === 'CDM' ? 'DM' : p.pos === 'CM' ? 'CM' : p.pos === 'CAM' ? 'AM' : ['LW', 'RW', 'LM', 'RM'].includes(p.pos) ? 'W' : 'ST'; (touch[g] ||= []).push((p.touches || 0) * 90 / p.mins); (byRole[g + ':' + roleOf.get(p.id)] ||= []).push((p.touches || 0) * 90 / p.mins) }
  void ledgerDiff
}
const ms = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); return [m, sd] }
const r3 = (x: number) => Math.round(x * 1000) / 1000
console.log('export const NORM_HALF = {')
for (const k of keys) { const [m, sd] = ms(half[k]); console.log(`  ${k}: [${r3(m)}, ${r3(sd)}],`) }
console.log('}\nexport const NORM_FULL = {')
for (const k of keys) { const [m, sd] = ms(full[k]); console.log(`  ${k}: [${r3(m)}, ${r3(sd)}],`) }
console.log('}\nexport const TOUCHES_90 = {')
for (const [g, xs] of Object.entries(touch)) { const [m, sd] = ms(xs); console.log(`  ${g}: [${r3(m)}, ${r3(sd)}],`) }
console.log('}')
console.log('// by role: touches per 90 relative to the group')
for (const [k, xs] of Object.entries(byRole).sort()) { const g = k.split(':')[0]; const gm = ms(touch[g])[0]; if (xs.length >= 20) console.log(`  '${k}': ${r3(ms(xs)[0] / gm)}, // n=${xs.length}`) }
console.log('// counter shots/xG per team-match', ms(counterShots).map(r3), ms(counterXg).map(r3))
void ([] as LedgerView[])
