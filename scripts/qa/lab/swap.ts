// Style vs quality: one fixture with each side's own (context) tactics, with the two tactics swapped, and with both on
// the other side's, so the effect of the set-up can be told apart from the effect of the players.
//   PAIRS='Real Madrid,Elche' npx tsx scripts/qa/lab/swap.ts [n=120]
import { freshWorld } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
import { matchContext, sideInput, matchUp } from '../../../src/engine/world/matchRunner'
import { hashString } from '../../../src/domain/rng'
import type { Fixture, TeamTactics } from '../../../src/domain/types'
const n = Number(process.argv[2] || 120)
const w = freshWorld()
const club = (name: string) => Object.values(w.clubs).find((c) => !c.national && (c.short === name || c.name === name))!
const pc = (x: number) => Math.round(x * 100) + '%'
for (const [h, a] of (process.env.PAIRS || 'Real Madrid,Elche;Man City,Burnley').split(';').map((x) => x.split(','))) {
  const H = club(h), A = club(a)
  const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(H.id))!
  const f: Fixture = { id: 'swap', compId: comp.id, home: H.id, away: A.id, date: '2026-10-10', played: false } as Fixture
  const base = [sideInput(w, H.id, comp, false, undefined, f.id, matchUp(f, 0)), sideInput(w, A.id, comp, false, undefined, f.id, matchUp(f, 1))]
  const T = base.map((s) => s.sheet.tactics)
  const LB = { ...T[1], buildUp: 'Counter', chanceCreation: 'Direct Passing', lineHeight: 30, pressing: 32, defApproach: 'Deep', mentality: 'Defensive', tempo: 60, playersInBox: 3 } as TeamTactics
  const MB = { ...T[1], buildUp: 'Balanced', chanceCreation: 'Balanced', lineHeight: 45, pressing: 45, defApproach: 'Balanced', mentality: 'Balanced', tempo: 55, playersInBox: 4 } as TeamTactics
  const variants: [string, TeamTactics, TeamTactics][] = [['own', T[0], T[1]], ['swapped', T[1], T[0]], [`both ${h}'s`, T[0], T[0]], [`both ${a}'s`, T[1], T[1]], [`${a} low block+counter`, T[0], LB], [`${a} mid block`, T[0], MB]]
  console.log(`\n${h} v ${a}\n  ${h}: ${T[0].mentality} ${T[0].buildUp}/${T[0].chanceCreation} line ${T[0].lineHeight} press ${T[0].pressing} tempo ${T[0].tempo} ${T[0].defApproach}\n  ${a}: ${T[1].mentality} ${T[1].buildUp}/${T[1].chanceCreation} line ${T[1].lineHeight} press ${T[1].pressing} tempo ${T[1].tempo} ${T[1].defApproach}`)
  for (const [name, th, ta] of variants) {
    const res = [0, 0, 0]; let xh = 0, xa = 0, ph = 0
    for (let i = 0; i < n; i++) {
      const ctx = matchContext(w, f, false); ctx.userSide = -1
      const hs = { ...base[0], sheet: { ...base[0].sheet, tactics: th } }, as = { ...base[1], sheet: { ...base[1].sheet, tactics: ta } }
      const r = new MatchSim(hs, as, ctx, hashString(`${20000 + i}:${H.id}:${A.id}`)).runToEnd()
      res[r.score[0] > r.score[1] ? 0 : r.score[0] === r.score[1] ? 1 : 2]++
      xh += r.stats[0].xg / n; xa += r.stats[1].xg / n; ph += r.stats[0].possession / n
    }
    console.log(`  ${name.padEnd(22)} W/D/L ${pc(res[0] / n)}/${pc(res[1] / n)}/${pc(res[2] / n)} · xG ${xh.toFixed(2)}–${xa.toFixed(2)} · poss ${ph.toFixed(0)}%`)
  }
}
