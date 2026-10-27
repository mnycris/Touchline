// Why a side does worse in the manager's hands than the AI's, taken apart: the same club over the same league fixtures
// and the same luck, run four ways, from the manager who touches nothing to the AI doing everything:
//   yours           his team sheet, nobody managing it during the match (no subs, no changes)
//   + assistant     the same, with the assistant making the substitutions (the setting in Settings)
//   + AI in-match   his team sheet, managed during the match the way an AI manager does (subs, reads, the score)
//   AI              the AI's own sheet for each match, and its management
// For each: results, goals against xG, goals by half, substitutions made and how tired the side ends.
// npx tsx scripts/qa/user-gap.ts <club> [repeats=2]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'

const CLUB = process.argv[2] || 'Barcelona'
const R = Number(process.argv[3] || 2)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes(CLUB))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as never, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as never, seed: 11 })
const club = w.clubs[w.userClubId]
const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club.id))!
const fxs = lg.fixtures.map((id) => w.fixtures[id]).filter((x) => x.home === club.id || x.away === club.id)

type Mode = 'yours' | '+ assistant' | '+ AI in-match' | 'AI'
for (const mode of ['yours', '+ assistant', '+ AI in-match', 'AI'] as Mode[]) {
  const t = { n: 0, w: 0, d: 0, gf: 0, ga: 0, xf: 0, xa: 0, gf1: 0, gf2: 0, ga1: 0, ga2: 0, subs: 0, energy: 0, late: 0 }
  for (let k = 0; k < R; k++) for (const fx of fxs) {
    w.meta.seed = 5000 + k * 101
    const us = fx.home === club.id ? 0 : 1
    const keep = fx.userInvolved, uc = w.userClubId
    w.flags.assistantSubs = mode === '+ assistant'
    if (mode === 'AI') { fx.userInvolved = false; w.userClubId = -1 as never }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim: any = createSim(w, fx, mode !== 'AI', false)
    if (mode === '+ AI in-match') sim.sides[us].input.controlledByUser = false
    const r = sim.runToEnd()
    fx.userInvolved = keep; w.userClubId = uc
    t.n++; t.gf += r.score[us]; t.ga += r.score[1 - us]
    if (r.score[us] > r.score[1 - us]) t.w++; else if (r.score[us] === r.score[1 - us]) t.d++
    t.xf += r.stats[us].xg; t.xa += r.stats[1 - us].xg
    for (const e of r.events || []) {
      // (an own goal's side is the side it counts for, like every goal's)
      if (e.type !== 'goal' && e.type !== 'penGoal' && e.type !== 'owngoal') continue
      const mine = e.side === us
      const second = e.min > 45
      if (mine) { if (second) t.gf2++; else t.gf1++ } else { if (second) t.ga2++; else t.ga1++ }
    }
    const side = sim.sides[us]
    t.subs += side.subsUsed
    const on = side.on as { energy: number; pos: string }[]
    t.energy += on.filter((l) => l.pos !== 'GK').reduce((a, l) => a + l.energy, 0) / Math.max(1, on.filter((l) => l.pos !== 'GK').length)
  }
  const n = t.n, f = (x: number) => (x / n).toFixed(2)
  console.log(`${mode.padEnd(14)} W ${Math.round((t.w / n) * 100)}% D ${Math.round((t.d / n) * 100)}% · goals ${f(t.gf)}-${f(t.ga)} (xG ${f(t.xf)}-${f(t.xa)}, scored/xG ${(t.gf / t.xf).toFixed(2)}, conceded/xG ${(t.ga / t.xa).toFixed(2)}) · by half for ${f(t.gf1)}/${f(t.gf2)} against ${f(t.ga1)}/${f(t.ga2)} · subs ${f(t.subs)} · energy at the end ${(t.energy / n).toFixed(0)}`)
}
