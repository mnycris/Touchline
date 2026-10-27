// Where the cards come from: per match, how many yellows and reds, how widely that spreads (the matches with nine
// bookings are what a player notices), what kind of foul each card was for, and what the referee and a pressing side
// do to it. Real reference (big five, 2022-25): ~4-5 yellows a match, about 2-5 in 100 matches with nine or more;
// reds ~0.12-0.25 a match, of which second yellows ~0.06-0.08; fouls ~21-26.
// npx tsx scripts/qa/discipline.ts [matches] [press: one side pressing high and aggressively]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { MatchSim } from '../../src/engine/match/engine'

const N = Number(process.argv[2] || 300)
const PRESS = process.argv[3] === 'press'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Brentford'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const comps = Object.values(w.competitions).filter((c) => c.format === 'league' && ['L13', 'L53', 'L19', 'L31', 'L16'].some((k) => c.key?.startsWith(k)))
const fxs = comps.flatMap((c) => c.fixtures.map((id) => w.fixtures[id])).filter((f) => f && !f.userInvolved)
// spread over the leagues
fxs.sort((a, b) => (a.id < b.id ? -1 : 1))
const pick = fxs.filter((_, i) => i % Math.max(1, Math.floor(fxs.length / N)) === 0).slice(0, N)
MatchSim.dbg = {}
// per side, by how it defends
const byApp: Record<string, { n: number; y: number; r: number; y2: number; fouls: number }> = {}
const rows: { y: number; r: number; y2: number; fouls: number; strict: number; derby: boolean; inj: number; about: string }[] = []
for (const f of pick) {
  const sim: any = createSim(w, f, false, false)
  if (PRESS) Object.assign(sim.sides[0].tactics, { pressing: 80, defApproach: 'High', lineHeight: 70 })
  const r = sim.runToEnd()
  for (const i of [0, 1]) {
    const t = sim.sides[i].tactics
    const e = (byApp[`${t.defApproach} · press ${t.pressing >= 75 ? '75+' : t.pressing >= 60 ? '60-74' : t.pressing >= 45 ? '45-59' : '<45'}`] ||= { n: 0, y: 0, r: 0, y2: 0, fouls: 0 })
    e.n++; e.y += r.stats[i].yellows; e.r += r.stats[i].reds; e.fouls += r.stats[i].fouls; e.y2 += r.events.filter((x: any) => x.type === 'secondYellow' && x.side === i).length
  }
  rows.push({
    y: r.stats[0].yellows + r.stats[1].yellows, r: r.stats[0].reds + r.stats[1].reds, y2: r.events.filter((e: any) => e.type === 'secondYellow').length,
    fouls: r.stats[0].fouls + r.stats[1].fouls, strict: sim.ctx.strictness, derby: !!sim.ctx.derby, inj: r.events.filter((e: any) => e.type === 'injury').length,
    about: `${w.clubs[f.home].name} ${r.score[0]}-${r.score[1]} ${w.clubs[f.away].name} · ref ${sim.ctx.strictness.toFixed(2)}${sim.ctx.derby ? ' derby' : ''} · fouls ${r.stats[0].fouls}/${r.stats[1].fouls} · yellows ${r.stats[0].yellows}/${r.stats[1].yellows} reds ${r.stats[0].reds}/${r.stats[1].reds} · ${sim.sides.map((s: any) => `${s.tactics.defApproach} press ${s.tactics.pressing}`).join(' v ')} · poss ${r.stats[0].possession}`,
  })
}
console.log('the most-booked matches:')
for (const r of [...rows].sort((a, b) => b.y - a.y).slice(0, 12)) console.log(`  ${r.y} · ${r.about}`)
const n = rows.length
const mean = (k: 'y' | 'r' | 'y2' | 'fouls' | 'inj', xs = rows) => xs.reduce((a, b) => a + b[k], 0) / Math.max(1, xs.length)
const vy = rows.reduce((a, b) => a + (b.y - mean('y')) ** 2, 0) / n
console.log(`${n} matches${PRESS ? ' (home side pressing high)' : ''} · yellows ${mean('y').toFixed(2)} (spread: variance/mean ${(vy / mean('y')).toFixed(2)}; real ~1.1-1.4) · reds ${mean('r').toFixed(3)} (second yellows ${mean('y2').toFixed(3)}) · fouls ${mean('fouls').toFixed(1)} · injuries ${mean('inj').toFixed(2)}`)
const hist: Record<number, number> = {}
for (const r of rows) hist[Math.min(10, r.y)] = (hist[Math.min(10, r.y)] || 0) + 1
console.log('yellows a match: ' + Object.entries(hist).map(([k, v]) => `${k === '10' ? '10+' : k}: ${Math.round((v / n) * 1000) / 10}%`).join('  '))
console.log(`nine or more: ${Math.round((rows.filter((r) => r.y >= 9).length / n) * 1000) / 10}% · a red: ${Math.round((rows.filter((r) => r.r > 0).length / n) * 100)}% of matches`)
for (const [lo, hi] of [[0.85, 0.98], [0.98, 1.11], [1.11, 1.25]]) {
  const xs = rows.filter((r) => r.strict >= lo && r.strict < hi)
  console.log(`  referee ${lo}-${hi}: ${xs.length} matches · yellows ${mean('y', xs).toFixed(2)} · reds ${mean('r', xs).toFixed(3)} · fouls ${mean('fouls', xs).toFixed(1)}`)
}
console.log('per side, by how it defends (real: the most-booked sides ~2.8-3.2 a match, the cleanest ~1.3)')
for (const [k, e] of Object.entries(byApp).sort()) console.log(`  ${k.padEnd(26)} ${String(e.n).padStart(4)} sides · yellows ${(e.y / e.n).toFixed(2)} · reds ${(e.r / e.n).toFixed(3)} (2nd ${(e.y2 / e.n).toFixed(3)}) · fouls ${(e.fouls / e.n).toFixed(1)}`)
const d = rows.filter((r) => r.derby)
if (d.length) console.log(`  derbies: ${d.length} · yellows ${mean('y', d).toFixed(2)} · reds ${mean('r', d).toFixed(3)}`)
// what kind of foul each card was for
const D = MatchSim.dbg
const kinds: Record<string, { fouls: number; y: number; y2: number; red: number }> = {}
for (const [k, v] of Object.entries(D)) {
  if (!k.startsWith('foul.')) continue
  const [what, out] = k.slice(5).split('>')
  const e = (kinds[what] ||= { fouls: 0, y: 0, y2: 0, red: 0 })
  e.fouls += v
  if (out === 'yellow') e.y += v
  else if (out === '2nd') e.y2 += v
  else if (out === 'red') e.red += v
}
console.log('\nfoul kind (per match)'.padEnd(34), 'fouls  yellow  2nd yel  red   card rate')
for (const [k, e] of Object.entries(kinds).sort((a, b) => b[1].fouls - a[1].fouls)) console.log(k.padEnd(33), (e.fouls / n).toFixed(2).padStart(5), (e.y / n).toFixed(3).padStart(7), (e.y2 / n).toFixed(3).padStart(8), (e.red / n).toFixed(3).padStart(6), `${Math.round(((e.y + e.y2 + e.red) / Math.max(1, e.fouls)) * 100)}%`.padStart(9))
console.log(`dissent ${((D['misconduct.dissent'] || 0) / n).toFixed(3)} · time-wasting ${((D['misconduct.time'] || 0) / n).toFixed(3)} a match`)
// the same by the fouling side's approach, per side that defended that way
const sidesBy: Record<string, number> = {}
for (const [k, e] of Object.entries(byApp)) sidesBy[k.split(' · ')[0]] = (sidesBy[k.split(' · ')[0]] || 0) + e.n
const app: Record<string, { fouls: number; y: number; y2: number; red: number }> = {}
for (const [k, v] of Object.entries(D)) {
  if (!k.startsWith('by.')) continue
  const [what, out] = k.slice(3).split('>')
  const e = (app[what] ||= { fouls: 0, y: 0, y2: 0, red: 0 })
  e.fouls += v
  if (out === 'yellow') e.y += v
  else if (out === '2nd') e.y2 += v
  else if (out === 'red') e.red += v
}
console.log('\nby approach and kind (per side)'.padEnd(34), 'fouls  yellow  2nd yel  red   card rate')
for (const [k, e] of Object.entries(app).sort()) { const s = sidesBy[k.split('.')[0]] || 1; console.log(k.padEnd(33), (e.fouls / s).toFixed(2).padStart(5), (e.y / s).toFixed(3).padStart(7), (e.y2 / s).toFixed(3).padStart(8), (e.red / s).toFixed(3).padStart(6), `${Math.round(((e.y + e.y2 + e.red) / Math.max(1, e.fouls)) * 100)}%`.padStart(9)) }
MatchSim.dbg = null
