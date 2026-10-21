// Formation against formation with the players and the tactics taken out of it: a club against a copy of itself at a
// neutral venue on neutral tactics, the XI picked for each shape. No shape should simply beat the others.
//   CLUB='Brighton' npx tsx scripts/qa/lab/forms.ts [n=120]
import { freshWorld } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
import { matchContext, sideInput } from '../../../src/engine/world/matchRunner'
import { buildSheet } from '../../../src/engine/match/selection'
import { hashString } from '../../../src/domain/rng'
import { DEFAULT_TACTICS, FORMATIONS, formationOf } from '../../../src/domain/constants'
import { posRating } from '../../../src/domain/ratings'
import type { Fixture, TeamTactics } from '../../../src/domain/types'
const n = Number(process.argv[2] || 120)
const w = freshWorld()
const C = Object.values(w.clubs).find((c) => !c.national && (c.short === (process.env.CLUB || 'Brighton') || c.name === process.env.CLUB))!
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(C.id))!
const f: Fixture = { id: 'forms', compId: comp.id, home: C.id, away: C.id, date: '2026-10-10', played: false } as Fixture
const base = sideInput(w, C.id, comp, false)
const T: TeamTactics = { ...DEFAULT_TACTICS, ...base.sheet.tactics, mentality: 'Balanced', buildUp: 'Balanced', chanceCreation: 'Balanced', lineHeight: 50, pressing: 50, tempo: 50, defApproach: 'Balanced', width: 55, playersInBox: 4 } as TeamTactics
const ref = process.env.REF || '4-3-3 Holding'
const list = process.env.FORMS ? process.env.FORMS.split(';') : FORMATIONS.map((x) => x.id).filter((x) => x !== ref)
const DEG = Number(process.env.DEGRADE || 0)
const side = (id: string) => { const s = buildSheet(w, C, id, T, { comp }); const players = { ...base.players }; for (const p of [...s.lineup, ...s.bench]) players[p] = DEG ? { ...w.players[p], ovr: w.players[p].ovr - DEG, attrs: w.players[p].attrs.map((x) => x - DEG) } : w.players[p]; return { ...base, players, sheet: { ...base.sheet, formation: s.formation, lineup: s.lineup, bench: s.bench, roles: s.roles, tactics: T } } }
const xi = (s: ReturnType<typeof side>) => { const f = formationOf(s.sheet.formation); return s.sheet.lineup.reduce((a, p, i) => a + posRating(s.players[p], f.slots[i].pos), 0) / 11 }
const R = side(ref)
console.log(`${ref} XI ${xi(R).toFixed(1)}`)
console.log(`${C.name}: each formation v ${ref}, neutral, ${n} each`)
for (const id of list) {
  const X = side(id)
  const res = [0, 0, 0]; let xa = 0, xb = 0, pa = 0
  for (let i = 0; i < n; i++) {
    const ctx = matchContext(w, f, false); ctx.userSide = -1; ctx.neutral = true
    const flip = i % 2 === 1
    const r = new MatchSim(flip ? R : X, flip ? X : R, ctx, hashString(`f${i}`)).runToEnd()
    const ia = flip ? 1 : 0, ib = 1 - ia
    res[r.score[ia] > r.score[ib] ? 0 : r.score[ia] === r.score[ib] ? 1 : 2]++
    xa += r.stats[ia].xg / n; xb += r.stats[ib].xg / n; pa += r.stats[ia].possession / n
  }
  console.log(`  ${id.padEnd(16)} XI ${xi(X).toFixed(1)} W/D/L ${Math.round((res[0] / n) * 100)}/${Math.round((res[1] / n) * 100)}/${Math.round((res[2] / n) * 100)} · pts ${((res[0] * 3 + res[1]) / n).toFixed(2)} · xG ${xa.toFixed(2)}–${xb.toFixed(2)} · poss ${pa.toFixed(0)}%`)
}
