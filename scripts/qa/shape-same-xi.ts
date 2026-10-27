// Formations with the same eleven: a club's career XI moved into each shape the way the Tactics screen does it (each
// slot in turn takes the best of those left for it, roles reset to their defaults), with the same tactics, over its
// league season against the real opponents, on the same luck. What the shape alone is worth, the players held fixed.
// npx tsx scripts/qa/shape-same-xi.ts <club> [repeats=4]     env ONLY=formation,formation
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { Player, TeamSheet } from '../../src/domain/types'
import { createSim } from '../../src/engine/world/matchRunner'
import { defaultRoles } from '../../src/engine/match/selection'
import { FORMATIONS, formationOf } from '../../src/domain/constants'
import { posRating } from '../../src/domain/ratings'

const CLUB = process.argv[2] || 'Villarreal'
const R = Number(process.argv[3] || 4)
const ONLY = process.env.ONLY?.split(',')
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes(CLUB))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as never, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as never, seed: 11 })
w.flags.assistantSubs = true
const club = w.clubs[w.userClubId]
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club.id))!
const fxs = comp.fixtures.map((id) => w.fixtures[id]).filter((x) => x.home === club.id || x.away === club.id)
const base: TeamSheet = JSON.parse(JSON.stringify(club.sheets[0]))
const xi = base.lineup.map((id) => w.players[id])

// as the Tactics screen's formation picker (ui/screens/Match.tsx assignToFormation)
function assign(players: Player[], formationId: string): number[] {
  const f = formationOf(formationId)
  const left = [...players]
  const out: number[] = new Array(f.slots.length).fill(0)
  const order = f.slots.map((_, i) => i).sort((a, b) => (f.slots[a].pos === 'GK' ? -1 : 0) - (f.slots[b].pos === 'GK' ? -1 : 0))
  for (const i of order) {
    let best = -1, bs = -1e9
    left.forEach((p, k) => {
      if ((f.slots[i].pos === 'GK') !== (p.positions[0] === 'GK') && left.some((q) => (f.slots[i].pos === 'GK') === (q.positions[0] === 'GK'))) return
      const s = posRating(p, f.slots[i].pos)
      if (s > bs) { bs = s; best = k }
    })
    if (best >= 0) { out[i] = left[best].id; left.splice(best, 1) }
  }
  return out.filter(Boolean)
}

console.log(`${club.name}, career XI (${base.formation}) in each shape, ${fxs.length * R} matches each`)
let ref: number | undefined
for (const f of FORMATIONS.filter((x) => !ONLY || ONLY.includes(x.id))) {
  const lineup = assign(xi, f.id)
  const sheet: TeamSheet = { ...base, formation: f.id, lineup, roles: defaultRoles(w, f.id, lineup) }
  const fit = lineup.reduce((a, id, i) => a + posRating(w.players[id], f.slots[i].pos), 0) / 11
  const t = { n: 0, pts: 0, gf: 0, ga: 0, xf: 0, xa: 0 }
  for (let k = 0; k < R; k++) for (const fx of fxs) {
    w.meta.seed = 11000 + k * 191
    club.sheets[0] = sheet
    const us = fx.home === club.id ? 0 : 1
    const r = createSim(w, fx, true, false).runToEnd()
    t.n++; t.gf += r.score[us]; t.ga += r.score[1 - us]; t.xf += r.stats[us].xg; t.xa += r.stats[1 - us].xg
    t.pts += r.score[us] > r.score[1 - us] ? 3 : r.score[us] === r.score[1 - us] ? 1 : 0
  }
  const xgd = (t.xf - t.xa) / t.n
  ref ??= xgd
  console.log(`${f.id.padEnd(16)} fit ${fit.toFixed(1)} · ppg ${(t.pts / t.n).toFixed(2)} · xG ${(t.xf / t.n).toFixed(2)}-${(t.xa / t.n).toFixed(2)} (xGD ${xgd >= ref ? '+' : ''}${(xgd - ref).toFixed(2)} on ${FORMATIONS[0].id}) · goals ${(t.gf / t.n).toFixed(2)}-${(t.ga / t.n).toFixed(2)}`)
}
club.sheets[0] = base
