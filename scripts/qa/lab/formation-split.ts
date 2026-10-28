// Formation balance split into its two halves: for one club, each formation's xG for, xG against and points per game
// over its league season (its best XI for the shape, its own tactics, the same luck for every shape), as effects against
// the club's average over all formations. The last line is JSON, so runs for several clubs (in parallel) can be pooled.
//   CLUB='Arsenal' npx tsx scripts/qa/lab/formation-split.ts [repeats=1]   env ONLY=formation,...
import fs from 'node:fs'
import { createWorld } from '../../../src/data/createWorld'
import type { RawDb } from '../../../src/data/rawTypes'
import { createSim } from '../../../src/engine/world/matchRunner'
import { buildSheet } from '../../../src/engine/match/selection'
import { FORMATIONS } from '../../../src/domain/constants'

const R = Number(process.argv[2] || 1)
const name = process.env.CLUB || 'Arsenal'
const ONLY = process.env.ONLY?.split(',')
const forms = FORMATIONS.map((f) => f.id).filter((f) => !ONLY || ONLY.includes(f))
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const rc = raw.clubs.find((c) => c.short === name || c.name === name) || raw.clubs.find((c) => c.name.includes(name))!
const w = createWorld(raw, { clubId: rc.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as never, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as never, seed: 11 })
w.flags.assistantSubs = true
const club = w.clubs[w.userClubId]
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club.id))!
const fxs = comp.fixtures.map((id) => w.fixtures[id]).filter((x) => x.home === club.id || x.away === club.id)
const base = club.sheets[0]
const out: Record<string, { xf: number; xa: number; ppg: number; gf: number; ga: number; sh: number; sha: number; by: Record<string, number>; byF: Record<string, number> }> = {}
const bucket = (how?: string) => (how === 'counter' ? 'counter' : how === 'through' ? 'through' : how === 'corner' || how === 'freekick' || how === 'throw' || how === 'penalty' ? 'setpiece' : 'open')
for (const f of forms) {
  const sheet = { ...buildSheet(w, club, f, { ...base.tactics }, { flexible: false }), id: base.id, name: base.name }
  let xf = 0, xa = 0, pts = 0, gf = 0, ga = 0, sh = 0, sha = 0, n = 0
  const by: Record<string, number> = {}, byF: Record<string, number> = {}
  for (let k = 0; k < R; k++) for (const fx of fxs) {
    w.meta.seed = 13000 + k * 211
    club.sheets[0] = sheet
    const us = fx.home === club.id ? 0 : 1
    const r = createSim(w, fx, true, false).runToEnd()
    xf += r.stats[us].xg; xa += r.stats[1 - us].xg; gf += r.score[us]; ga += r.score[1 - us]; sh += r.stats[us].shots; sha += r.stats[1 - us].shots
    pts += r.score[us] > r.score[1 - us] ? 3 : r.score[us] === r.score[1 - us] ? 1 : 0
    for (const e of r.events) if (e.xg !== undefined && ['chance', 'save', 'miss', 'woodwork', 'goal'].includes(e.type)) { const k = bucket(e.how); if (e.side === us) byF[k] = (byF[k] || 0) + e.xg; else by[k] = (by[k] || 0) + e.xg }
    n++
  }
  for (const k of Object.keys(by)) by[k] /= n
  for (const k of Object.keys(byF)) byF[k] /= n
  out[f] = { xf: xf / n, xa: xa / n, ppg: pts / n, gf: gf / n, ga: ga / n, sh: sh / n, sha: sha / n, by, byF }
}
club.sheets[0] = base
const mean = (k: 'xf' | 'xa' | 'ppg') => forms.reduce((a, f) => a + out[f][k], 0) / forms.length
const mf = mean('xf'), ma = mean('xa'), mp = mean('ppg')
console.log(`${club.short}: mean xG ${mf.toFixed(2)}-${ma.toFixed(2)}, ppg ${mp.toFixed(2)}`)
for (const f of [...forms].sort((a, b) => (out[b].xf - out[b].xa) - (out[a].xf - out[a].xa))) {
  const o = out[f]
  console.log(`  ${f.padEnd(17)} xGD ${(o.xf - o.xa - (mf - ma) >= 0 ? '+' : '')}${(o.xf - o.xa - (mf - ma)).toFixed(2)}  for ${(o.xf - mf >= 0 ? '+' : '')}${(o.xf - mf).toFixed(2)}  against ${(o.xa - ma >= 0 ? '+' : '')}${(o.xa - ma).toFixed(2)}  ppg ${(o.ppg - mp >= 0 ? '+' : '')}${(o.ppg - mp).toFixed(2)}  shots ${o.sh.toFixed(1)}-${o.sha.toFixed(1)}`)
}
console.log('JSON ' + JSON.stringify({ club: club.short, out }))
