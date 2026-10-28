// One club's season of league opponents (home and away) under different set-ups, the opponents on their own context
// tactics: what each style is worth to this club in points, xG and shots. A style that is far ahead for every club is a
// balance problem; one that suits fast players more than slow ones is football.
//   CLUB='Real Madrid' npx tsx scripts/qa/lab/style-ab.ts [reps=2]
import { freshWorld } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
import { matchContext, sideInput, matchUp } from '../../../src/engine/world/matchRunner'
import { hashString } from '../../../src/domain/rng'
import type { Fixture, TeamTactics } from '../../../src/domain/types'

const reps = Number(process.argv[2] || 2)
const w = freshWorld()
const name = process.env.CLUB || 'Real Madrid'
const C = Object.values(w.clubs).find((c) => !c.national && (c.short === name || c.name === name))!
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(C.id))!
const STYLES: Record<string, Partial<TeamTactics>> = {
  counter: { mentality: 'Attacking', buildUp: 'Counter', chanceCreation: 'Direct Passing', tempo: 78, pressing: 44, lineHeight: 39, width: 52, defApproach: 'Deep', playersInBox: 5 },
  possession: { mentality: 'Attacking', buildUp: 'Short Passing', chanceCreation: 'Possession', tempo: 45, pressing: 69, lineHeight: 72, width: 58, defApproach: 'High', playersInBox: 5 },
  gegenpress: { mentality: 'Balanced', buildUp: 'Balanced', chanceCreation: 'Forward Runs', tempo: 72, pressing: 87, lineHeight: 77, width: 50, defApproach: 'Aggressive', playersInBox: 5 },
  balanced: { mentality: 'Balanced', buildUp: 'Balanced', chanceCreation: 'Balanced', tempo: 55, pressing: 50, lineHeight: 50, width: 55, defApproach: 'Balanced', playersInBox: 5 },
  parkbus: { mentality: 'Defensive', buildUp: 'Long Ball', chanceCreation: 'Direct Passing', tempo: 60, pressing: 30, lineHeight: 28, width: 45, defApproach: 'Deep', playersInBox: 4 },
}
const only = process.env.STYLES?.split(',')
console.log(`${C.name} (avg ${C.squadAvg}), ${comp.name}, ${reps}x home and away against every club`)
for (const [k, st] of Object.entries(STYLES)) {
  if (only && !only.includes(k)) continue
  let pts = 0, n = 0, xf = 0, xa = 0, sf = 0, sa = 0, gf = 0, ga = 0, poss = 0
  for (let r = 0; r < reps; r++) for (const opp of comp.clubs) {
    if (opp === C.id) continue
    for (const home of [true, false]) {
      const f: Fixture = { id: `ab:${opp}:${home}:${r}`, compId: comp.id, home: home ? C.id : opp, away: home ? opp : C.id, date: '2026-10-10', played: false } as Fixture
      const ctx = matchContext(w, f, false); ctx.userSide = -1
      const hs = sideInput(w, f.home, comp, false, undefined, f.id, matchUp(f, 0)), as = sideInput(w, f.away, comp, false, undefined, f.id, matchUp(f, 1))
      const me = home ? hs : as
      me.sheet = { ...me.sheet, tactics: { ...me.sheet.tactics, ...st } as TeamTactics }
      const res = new MatchSim(hs, as, ctx, hashString(`${r}:${opp}:${home}`)).runToEnd()
      const s = home ? 0 : 1
      const a = res.score[s], b = res.score[1 - s]
      pts += a > b ? 3 : a === b ? 1 : 0; n++
      gf += a; ga += b; xf += res.stats[s].xg; xa += res.stats[1 - s].xg; sf += res.stats[s].shots; sa += res.stats[1 - s].shots; poss += res.stats[s].possession
    }
  }
  console.log(`  ${k.padEnd(11)} ppg ${(pts / n).toFixed(2)} · goals ${(gf / n).toFixed(2)}-${(ga / n).toFixed(2)} · xG ${(xf / n).toFixed(2)}-${(xa / n).toFixed(2)} · shots ${(sf / n).toFixed(1)}-${(sa / n).toFixed(1)} · poss ${(poss / n).toFixed(0)}%`)
}
