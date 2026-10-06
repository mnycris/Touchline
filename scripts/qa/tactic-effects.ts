// What each tactical setting actually does: the manager's team over its own fixtures with one setting changed at a
// time from the current sheet, measured from the full engine (possession, passing, where the ball is won and lost,
// chances, energy). npx tsx scripts/qa/tactic-effects.ts <save> [repeats]
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { createSim } from '../../src/engine/world/matchRunner'
import { VISION_TACTICS, DEFAULT_TACTICS } from '../../src/domain/constants'
import type { TeamTactics } from '../../src/domain/types'
const [file, R = '2'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const me = w.userClubId
const club = w.clubs[me]
const sheet = club.sheets.find((s) => s.id === club.activeSheet)!
const fx = Object.values(w.fixtures).filter((f) => !f.played && (f.home === me || f.away === me) && w.competitions[f.compId]?.format === 'league').slice(0, 16)
const base = { ...sheet.tactics }
const variants: [string, Partial<TeamTactics>][] = [
  ['as set', {}], ['balanced (default)', { ...DEFAULT_TACTICS }],
  ['width 20', { width: 20 }], ['width 85', { width: 85 }], ['tempo 20', { tempo: 20 }], ['tempo 85', { tempo: 85 }],
  ['line 25', { lineHeight: 25 }], ['line 80', { lineHeight: 80 }], ['press 20', { pressing: 20 }], ['press 85', { pressing: 85 }],
  ['build: short', { buildUp: 'Short Passing' }], ['build: long', { buildUp: 'Long Ball' }], ['build: counter', { buildUp: 'Counter' }],
  ['chance: possession', { chanceCreation: 'Possession' }], ['chance: direct', { chanceCreation: 'Direct Passing' }], ['chance: runs', { chanceCreation: 'Forward Runs' }],
  ['ultra defensive', { mentality: 'Ultra Defensive' }], ['ultra attacking', { mentality: 'Ultra Attacking' }],
  ['park the bus', { ...VISION_TACTICS['Park the Bus'], mentality: 'Ultra Defensive' }], ['possession preset', { ...VISION_TACTICS.Possession }], ['gegenpress', { ...VISION_TACTICS.Gegenpress }],
]
for (const [label, patch] of variants) {
  sheet.tactics = { ...base, ...patch } as TeamTactics
  const a = { n: 0, poss: 0, passes: 0, acc: 0, shots: 0, xg: 0, xga: 0, gf: 0, ga: 0, off: 0, crosses: 0, energy: 0, fouls: 0, won: 0 }
  for (let k = 0; k < Number(R); k++) for (const f of fx) {
    const s0 = w.meta.seed; w.meta.seed = s0 + k * 7919
    const sim = createSim(w, f, true)
    const r = sim.runToEnd()
    w.meta.seed = s0
    const us = f.home === me ? 0 : 1, S = r.stats[us], T = r.stats[1 - us]
    a.n++; a.poss += S.possession; a.passes += S.passes; a.acc += S.passAcc ?? 0; a.shots += S.shots; a.xg += S.xg; a.xga += T.xg; a.gf += r.score[us]; a.ga += r.score[1 - us]
    a.off += S.offsides; a.crosses += (S as any).crosses ?? 0; a.fouls += S.fouls
    const mine = r.players.filter((p) => p.side === us && p.mins >= 85)
    a.energy += mine.reduce((x, p) => x + (p as any).energy, 0) / Math.max(1, mine.length)
  }
  const m = (v: number, d = 1) => (v / a.n).toFixed(d)
  console.log(`${label.padEnd(20)} poss ${m(a.poss, 0)}% · passes ${m(a.passes, 0)} (${m(a.acc, 0)}%) · shots ${m(a.shots)} xG ${m(a.xg, 2)} · against xG ${m(a.xga, 2)} · goals ${m(a.gf, 2)}-${m(a.ga, 2)} · crosses ${m(a.crosses)} · offsides(ours) ${m(a.off)} · fouls ${m(a.fouls)} · end energy ${m(a.energy, 0)}`)
}
sheet.tactics = base
