// Strength gradient: how the squad-rating gap between two clubs translates into results (neutral venue).
// Run: npx tsx scripts/qa/strength.ts [games=3000]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { aiMatchSheet } from '../../src/engine/match/selection'
import { MatchSim, type SideInput } from '../../src/engine/match/engine'
import { Rng } from '../../src/domain/rng'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 3000)
const arsenal = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, { clubId: arsenal, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 11 })
const clubs = Object.values(w.clubs).filter((c) => c.squadAvg >= 62 && w.competitions[`L${c.leagueId}-2026`])
const rng = new Rng(99)
const side = (c: (typeof clubs)[number], idx: number): SideInput => {
  const sheet = aiMatchSheet(w, c, w.competitions[`L${c.leagueId}-2026`])
  return { clubId: c.id, name: c.name, short: c.short, sheet, players: Object.fromEntries([...sheet.lineup, ...sheet.bench].map((id) => [id, w.players[id]])) }
}
const ctx = (i: number) => ({ id: `s${i}`, compName: 'T', neutral: true, venue: 'X', attendance: 30000, knockout: false, extraTime: false, penaltiesOnly: false, importance: 1, strictness: 1, injuryRate: 1, commentary: false })
// XI average rating (what actually plays)
const xiAvg = (s: SideInput) => s.sheet.lineup.reduce((a, id) => a + w.players[id].ovr, 0) / s.sheet.lineup.length
const buckets: Record<number, { n: number; w: number; d: number; gd: number; big: number; gf: number; ga: number }> = {}
for (let i = 0; i < N; i++) {
  const a = rng.pick(clubs), b = rng.pick(clubs)
  if (a === b) continue
  const A = side(a, 0), B = side(b, 1)
  const diff = xiAvg(A) - xiAvg(B)
  if (Math.abs(diff) > 22) continue
  const r = new MatchSim(A, B, ctx(i), 5000 + i).runToEnd()
  const k = Math.max(-5, Math.min(5, Math.round(diff / 3)))
  for (const [kk, gf, ga] of [[k, r.score[0], r.score[1]], [-k, r.score[1], r.score[0]]] as const) {
    const x = (buckets[kk] ||= { n: 0, w: 0, d: 0, gd: 0, big: 0, gf: 0, ga: 0 })
    x.n++; x.gd += gf - ga; x.gf += gf; x.ga += ga
    if (gf > ga) x.w++; else if (gf === ga) x.d++
    if (gf - ga >= 4) x.big++
  }
}
console.log('XI rating gap   n     W%   D%   L%  goal diff  gf/ga     win by 4+')
for (const k of Object.keys(buckets).map(Number).sort((a, b) => a - b)) {
  const x = buckets[k]
  if (k < 0) continue
  console.log(`${String(k * 3).padStart(3)} (±1.5)  ${String(x.n).padStart(5)}  ${(x.w / x.n * 100).toFixed(0).padStart(3)}  ${(x.d / x.n * 100).toFixed(0).padStart(3)}  ${((x.n - x.w - x.d) / x.n * 100).toFixed(0).padStart(3)}    ${(x.gd / x.n).toFixed(2).padStart(5)}    ${(x.gf / x.n).toFixed(2)}/${(x.ga / x.n).toFixed(2)}   ${(x.big / x.n * 100).toFixed(1)}%`)
}
