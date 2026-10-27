// Formation balance across clubs: each club picks its best eleven for each formation (as Auto Pick and the AI do), keeps
// its own tactics, and plays its league season on the same luck. A formation's effect is its xG difference per match
// against that club's average over all formations; averaged over clubs of different strength and make-up, what is left
// is the shape's own worth. Balanced: every formation within about ±0.15, none consistently far off.
// npx tsx scripts/qa/formation-balance.ts [repeats=2]   env CLUBS=Barcelona,Villarreal,...  ONLY=formation,...
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { buildSheet } from '../../src/engine/match/selection'
import { FORMATIONS } from '../../src/domain/constants'

const R = Number(process.argv[2] || 2)
const CLUBS = (process.env.CLUBS || 'Barcelona,Villarreal,Arsenal,Sunderland,Inter,Brentford').split(',')
const ONLY = process.env.ONLY?.split(',')
const forms = FORMATIONS.map((f) => f.id).filter((f) => !ONLY || ONLY.includes(f))
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const effect: Record<string, number[]> = Object.fromEntries(forms.map((f) => [f, []]))
const t0 = Date.now()
let goals = 0, matches = 0
for (const name of CLUBS) {
  const rc = raw.clubs.find((c) => c.short === name || c.name === name) || raw.clubs.find((c) => c.name.includes(name))!
  const w = createWorld(raw, { clubId: rc.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as never, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as never, seed: 11 })
  w.flags.assistantSubs = true
  const club = w.clubs[w.userClubId]
  const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club.id))!
  const fxs = comp.fixtures.map((id) => w.fixtures[id]).filter((x) => x.home === club.id || x.away === club.id)
  const base = club.sheets[0]
  const xgd: Record<string, number> = {}
  for (const f of forms) {
    const sheet = { ...buildSheet(w, club, f, { ...base.tactics }, { flexible: false }), id: base.id, name: base.name }
    let d = 0, n = 0
    for (let k = 0; k < R; k++) for (const fx of fxs) {
      w.meta.seed = 13000 + k * 211
      club.sheets[0] = sheet
      const us = fx.home === club.id ? 0 : 1
      const r = createSim(w, fx, true, false).runToEnd()
      d += r.stats[us].xg - r.stats[1 - us].xg
      goals += r.score[0] + r.score[1]; matches++
      n++
    }
    xgd[f] = d / n
  }
  club.sheets[0] = base
  const mean = forms.reduce((a, f) => a + xgd[f], 0) / forms.length
  for (const f of forms) effect[f].push(xgd[f] - mean)
  console.log(`${club.short.padEnd(12)} mean xGD ${mean.toFixed(2)} · ` + forms.map((f) => `${f} ${(xgd[f] - mean >= 0 ? '+' : '')}${(xgd[f] - mean).toFixed(2)}`).join(', '))
}
console.log(`\n${CLUBS.length} clubs, ${R} seasons each per formation, ${((Date.now() - t0) / 60000).toFixed(1)} min; goals per match in these games ${(goals / matches).toFixed(2)}`)
const rows = forms.map((f) => { const e = effect[f], m = e.reduce((a, b) => a + b, 0) / e.length; return { f, m, sd: Math.sqrt(e.reduce((a, b) => a + (b - m) ** 2, 0) / e.length), lo: Math.min(...e), hi: Math.max(...e) } })
for (const r of rows.sort((a, b) => b.m - a.m)) console.log(`${r.f.padEnd(17)} ${(r.m >= 0 ? '+' : '') + r.m.toFixed(2)}  (clubs ${r.lo.toFixed(2)} to ${r.hi.toFixed(2)}, sd ${r.sd.toFixed(2)})`)
const all = rows.map((r) => r.m)
console.log(`spread of formation effects: sd ${Math.sqrt(all.reduce((a, b) => a + b * b, 0) / all.length).toFixed(3)}, range ${(Math.max(...all) - Math.min(...all)).toFixed(2)}`)
