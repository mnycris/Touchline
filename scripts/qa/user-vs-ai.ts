// The same club over the same fixtures and the same luck, run as the manager's team (his team sheet and tactics as a
// new career starts them) and as the AI runs it: does a side play worse in the manager's hands before he has changed
// anything? npx tsx scripts/qa/user-vs-ai.ts <club> [repeats=2]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { formationOf } from '../../src/domain/constants'

const CLUB = process.argv[2] || 'Barcelona'
const R = Number(process.argv[3] || 2)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes(CLUB))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const club = w.clubs[w.userClubId]
const sheet = club.sheets.find((s) => s.id === club.activeSheet)!
const f = formationOf(sheet.formation)
console.log(`${club.name} as a new career starts it: ${sheet.formation} · ${sheet.lineup.map((id, i) => `${f.slots[i].label} ${w.players[id].name.split(' ').pop()} (${sheet.roles[i]?.role})`).join(', ')}`)
console.log('tactics', JSON.stringify(sheet.tactics))
const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club.id))!
const fxs = lg.fixtures.map((id) => w.fixtures[id]).filter((x) => x.home === club.id || x.away === club.id)
for (const userLive of [true, false]) {
  let n = 0, won = 0, drawn = 0, gf = 0, ga = 0, xf = 0, xa = 0, poss = 0, sh = 0
  for (let k = 0; k < R; k++) for (const fx of fxs) {
    w.meta.seed = 5000 + k * 101
    const us = fx.home === club.id ? 0 : 1
    // as the AI: the same fixture with nobody's hands on it
    const keep = fx.userInvolved
    if (!userLive) fx.userInvolved = false
    const uc = w.userClubId
    if (!userLive) w.userClubId = -1 as any
    const sim: any = createSim(w, fx, userLive, false)
    const r = sim.runToEnd()
    fx.userInvolved = keep; w.userClubId = uc
    n++; gf += r.score[us]; ga += r.score[1 - us]; if (r.score[us] > r.score[1 - us]) won++; else if (r.score[us] === r.score[1 - us]) drawn++
    xf += r.stats[us].xg; xa += r.stats[1 - us].xg; poss += r.stats[us].possession; sh += r.stats[us].shots
  }
  console.log(`${userLive ? 'as yours' : 'as the AI'}: ${n} matches · W ${Math.round((won / n) * 100)}% D ${Math.round((drawn / n) * 100)}% · goals ${(gf / n).toFixed(2)}-${(ga / n).toFixed(2)} · xG ${(xf / n).toFixed(2)}-${(xa / n).toFixed(2)} · shots ${(sh / n).toFixed(1)} · possession ${(poss / n).toFixed(1)}%`)
}
