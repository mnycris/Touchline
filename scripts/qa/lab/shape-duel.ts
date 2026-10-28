// One shape against another with everything else equal: a club against a copy of itself at a neutral venue, both on
// the club's own tactics, the XI picked for each shape. Per shape: points, xG and shots, and where its chances came
// from (xG by the scorer's position group and by how the chance came). Tells where a shape's edge comes from.
//   CLUB='Arsenal' A='4-3-3 Attack' B='4-4-2 Holding' npx tsx scripts/qa/lab/shape-duel.ts [n=300]
import { freshWorld } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
import { matchContext, sideInput } from '../../../src/engine/world/matchRunner'
import { buildSheet } from '../../../src/engine/match/selection'
import { RGROUP } from '../../../src/engine/match/rating'
import { hashString } from '../../../src/domain/rng'
import type { Fixture } from '../../../src/domain/types'

const n = Number(process.argv[2] || 300)
const w = freshWorld()
const name = process.env.CLUB || 'Arsenal'
const C = Object.values(w.clubs).find((c) => !c.national && (c.short === name || c.name === name))!
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(C.id))!
const f: Fixture = { id: 'duel', compId: comp.id, home: C.id, away: C.id, date: '2026-10-10', played: false } as Fixture
const base = sideInput(w, C.id, comp, false)
const side = (id: string) => {
  const s = buildSheet(w, C, id, base.sheet.tactics, { comp })
  const players = { ...base.players }
  for (const p of [...s.lineup, ...s.bench]) players[p] = w.players[p]
  return { ...base, players, sheet: { ...base.sheet, formation: s.formation, lineup: s.lineup, bench: s.bench, roles: s.roles } }
}
const names = [process.env.A || '4-3-3 Attack', process.env.B || '4-4-2 Holding']
const S = names.map(side)
const tot = names.map(() => ({ pts: 0, xg: 0, sh: 0, poss: 0, grp: {} as Record<string, number>, how: {} as Record<string, number> }))
const add = (o: Record<string, number>, k: string, v: number) => { o[k] = (o[k] || 0) + v }
for (let i = 0; i < n; i++) {
  const ctx = matchContext(w, f, false); ctx.userSide = -1; ctx.neutral = true
  const flip = i % 2 === 1
  const r = new MatchSim(flip ? S[1] : S[0], flip ? S[0] : S[1], ctx, hashString(`duel${i}`)).runToEnd()
  for (const k of [0, 1] as const) {
    const s = flip ? 1 - k : k, o = 1 - s, t = tot[k]
    t.pts += r.score[s] > r.score[o] ? 3 : r.score[s] === r.score[o] ? 1 : 0
    t.xg += r.stats[s].xg; t.sh += r.stats[s].shots; t.poss += r.stats[s].possession
    for (const x of r.players) if (x.side === s && x.xg) add(t.grp, RGROUP[x.pos], x.xg)
    for (const e of r.events) if (e.side === s && e.xg !== undefined && ['chance', 'save', 'miss', 'woodwork', 'goal'].includes(e.type)) add(t.how, e.how || 'open', e.xg)
  }
}
const f2 = (x: number) => (x / n).toFixed(2)
console.log(`${C.name}: ${names[0]} v ${names[1]}, ${n} matches, neutral, same players and tactics`)
for (const k of [0, 1]) {
  const t = tot[k]
  console.log(`  ${names[k].padEnd(16)} ppg ${f2(t.pts)} · xG ${f2(t.xg)} · shots ${(t.sh / n).toFixed(1)} · poss ${(t.poss / n).toFixed(0)}%`)
  console.log(`    xG by group: ${['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB'].map((g) => `${g} ${f2(t.grp[g] || 0)}`).join(' · ')}`)
  console.log(`    xG by how:   ${Object.entries(t.how).sort((a, b) => b[1] - a[1]).map(([h, v]) => `${h} ${f2(v)}`).join(' · ')}`)
}
