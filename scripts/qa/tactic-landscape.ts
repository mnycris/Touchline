// The tactical landscape a manager meets: his club over its league season, from the set-up a career starts with, one
// thing changed at a time (mentality, pressing, line, tempo, width, build-up, chance creation, players in the box, the
// formation), on the same luck. Do sensible changes make sensible differences (trade-offs, not a single right answer),
// or does everything but the default fall apart? The assistant makes the substitutions throughout (fatigue aside).
// npx tsx scripts/qa/tactic-landscape.ts <club> [repeats=3]      env ONLY=name,name to run some variants
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { TeamSheet, TeamTactics } from '../../src/domain/types'
import { createSim, matchUp } from '../../src/engine/world/matchRunner'
import { aiMatchSheet, buildSheet } from '../../src/engine/match/selection'

const CLUB = process.argv[2] || 'Barcelona'
const R = Number(process.argv[3] || 3)
const ONLY = process.env.ONLY?.split(',')
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes(CLUB))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as never, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as never, seed: 11 })
w.flags.assistantSubs = true
const club = w.clubs[w.userClubId]
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club.id))!
const fxs = comp.fixtures.map((id) => w.fixtures[id]).filter((x) => x.home === club.id || x.away === club.id)
const base: TeamSheet = JSON.parse(JSON.stringify(club.sheets[0]))
const T = base.tactics

type Variant = { name: string; sheet: () => TeamSheet; ai?: boolean }
const tac = (name: string, p: Partial<TeamTactics>): Variant => ({ name, sheet: () => ({ ...base, tactics: { ...T, ...p } }) })
const shape = (formation: string): Variant => ({ name: formation, sheet: () => ({ ...buildSheet(w, club, formation, { ...T }, { flexible: false }), id: 'first', name: 'First Team' }) })
const variants: Variant[] = [
  { name: 'default', sheet: () => base },
  { name: 'AI per match', sheet: () => base, ai: true },
  tac('Ultra Defensive', { mentality: 'Ultra Defensive' }), tac('Defensive', { mentality: 'Defensive' }), tac('Attacking', { mentality: 'Attacking' }), tac('Ultra Attacking', { mentality: 'Ultra Attacking' }),
  tac('press 40', { pressing: 40 }), tac('press 60', { pressing: 60 }),
  tac('line 45', { lineHeight: 45 }), tac('line 60', { lineHeight: 60 }),
  tac('tempo 40', { tempo: 40 }), tac('tempo 55', { tempo: 55 }),
  tac('width 30', { width: 30 }), tac('width 75', { width: 75 }),
  tac('Short Passing', { buildUp: 'Short Passing' }), tac('Long Ball', { buildUp: 'Long Ball' }), tac('Counter', { buildUp: 'Counter' }),
  tac('Possession', { chanceCreation: 'Possession' }), tac('Direct Passing', { chanceCreation: 'Direct Passing' }), tac('Balanced cc', { chanceCreation: 'Balanced' }),
  tac('box 3', { playersInBox: 3 }), tac('box 7', { playersInBox: 7 }),
  tac('Deep def', { defApproach: 'Deep' }), tac('Balanced def', { defApproach: 'Balanced' }), tac('High def', { defApproach: 'High' }),
  shape('4-2-3-1 Wide'), shape('4-4-2 Flat'), shape('4-3-3 Attack'), shape('3-5-2'), shape('5-3-2'), shape('4-1-4-1'), shape('3-4-2-1'),
].filter((v) => !ONLY || ONLY.includes(v.name))

let baseline: { ppg: number; xgd: number } | undefined
for (const v of variants) {
  const t = { n: 0, pts: 0, gf: 0, ga: 0, xf: 0, xa: 0, sh: 0, sha: 0, poss: 0 }
  const sheet = v.sheet()
  for (let k = 0; k < R; k++) for (const fx of fxs) {
    w.meta.seed = 7000 + k * 131
    const us = fx.home === club.id ? 0 : 1
    club.sheets[0] = sheet
    club.activeSheet = sheet.id
    const keep = fx.userInvolved, uc = w.userClubId
    if (v.ai) { fx.userInvolved = false; w.userClubId = -1 as never }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim: any = createSim(w, fx, !v.ai, false)
    const r = sim.runToEnd()
    fx.userInvolved = keep; w.userClubId = uc
    t.n++; t.gf += r.score[us]; t.ga += r.score[1 - us]
    t.pts += r.score[us] > r.score[1 - us] ? 3 : r.score[us] === r.score[1 - us] ? 1 : 0
    t.xf += r.stats[us].xg; t.xa += r.stats[1 - us].xg; t.sh += r.stats[us].shots; t.sha += r.stats[1 - us].shots; t.poss += r.stats[us].possession
  }
  const n = t.n, ppg = t.pts / n, xgd = (t.xf - t.xa) / n
  baseline ||= { ppg, xgd }
  const d = (x: number, b: number) => `${x - b >= 0 ? '+' : ''}${(x - b).toFixed(2)}`
  console.log(`${v.name.padEnd(15)} ppg ${ppg.toFixed(2)} (${d(ppg, baseline.ppg)}) · xG ${(t.xf / n).toFixed(2)}-${(t.xa / n).toFixed(2)} (xGD ${d(xgd, baseline.xgd)}) · goals ${(t.gf / n).toFixed(2)}-${(t.ga / n).toFixed(2)} · shots ${(t.sh / n).toFixed(1)}-${(t.sha / n).toFixed(1)} · poss ${(t.poss / n).toFixed(0)}%`)
}
club.sheets[0] = base
void aiMatchSheet; void matchUp
