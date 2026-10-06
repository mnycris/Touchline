// Who gets booked: a season of four big leagues (full engine or light sim), yellows per match, per 90 by position,
// how bookings spread over regulars, and the most-booked players with their aggression.
// npx tsx scripts/qa/card-spread.ts [full|quick] [seed]
// Real reference (big five, 2022-25): ~4-5 yellows a match; per 90 by position roughly DM .20, CM .16, CB/FB .14,
// AM .12, W/ST .09, GK .03; a league's most-booked players reach ~11-13, and about 2 in 100 regulars reach 10+.
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim, simulateFixture } from '../../src/engine/world/matchRunner'
import { A } from '../../src/domain/types'
const mode = process.argv[2] || 'full', seed = Number(process.argv[3] || 7)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed })
const G = (pos: string) => pos === 'GK' ? 'GK' : pos === 'CB' ? 'CB' : /^(RB|LB|RWB|LWB)$/.test(pos) ? 'FB' : pos === 'CDM' ? 'DM' : pos === 'CM' ? 'CM' : pos === 'CAM' ? 'AM' : /^(RW|LW|RM|LM)$/.test(pos) ? 'W' : 'ST'
const pl: Record<number, { y: number; apps: number; mins: number }> = {}
const grp: Record<string, { y: number; mins: number; f: number }> = {}
let matches = 0, yel = 0, fouls = 0, dissent = 0
for (const key of [13, 53, 19, 31]) {
  const comp = w.competitions[`L${key}-2026`]
  for (const id of comp.fixtures) {
    const f = w.fixtures[id]
    const r = mode === 'full' ? createSim(w, f, false).runToEnd() : simulateFixture(w, f, false)
    matches++
    fouls += r.stats[0].fouls + r.stats[1].fouls
    for (const p of r.players) {
      if (!p.mins) continue
      const o = (pl[p.id] ||= { y: 0, apps: 0, mins: 0 }); o.apps++; o.mins += p.mins
      const g = (grp[G(p.pos)] ||= { y: 0, mins: 0, f: 0 }); g.mins += p.mins; g.f += p.fouls || 0
      if (p.yellow) { o.y++; g.y++; yel++ }
    }
    for (const e of r.events) if (e.type === 'yellow' && /booked for (dissent|time-wasting)/.test(e.text || '')) dissent++
  }
}
const regs = Object.entries(pl).filter(([, o]) => o.apps >= 20).map(([id, o]) => ({ id: Number(id), ...o })).sort((a, b) => b.y - a.y)
const hist: Record<string, number> = {}
for (const x of regs) { const k = x.y >= 10 ? '10+' : x.y >= 7 ? '7-9' : x.y >= 4 ? '4-6' : x.y >= 1 ? '1-3' : '0'; hist[k] = (hist[k] || 0) + 1 }
const totY = regs.reduce((a, x) => a + x.y, 0)
const top = regs.slice(0, Math.ceil(regs.length * 0.1)).reduce((a, x) => a + x.y, 0)
console.log(`${mode}: ${matches} matches · ${(yel / matches).toFixed(2)} yellows/match · ${(fouls / matches).toFixed(1)} fouls/match · dissent/time-wasting ${((dissent / Math.max(1, yel)) * 100).toFixed(0)}% of yellows`)
console.log('per 90 by position (yellows / fouls): ' + ['DM', 'CM', 'CB', 'FB', 'AM', 'W', 'ST', 'GK'].map((g) => `${g} ${((grp[g].y / grp[g].mins) * 90).toFixed(3)}/${((grp[g].f / grp[g].mins) * 90).toFixed(2)}`).join(' · '))
console.log(`regulars (20+ apps) ${regs.length}: season yellows`, JSON.stringify(hist), `· 10+: ${(((hist['10+'] || 0) / regs.length) * 100).toFixed(1)}% · top 10% of regulars take ${((top / totY) * 100).toFixed(0)}% of their yellows`)
console.log('most booked: ' + regs.slice(0, 10).map((x) => { const p = w.players[x.id]; return `${p.name} (${p.positions[0]}, agg ${p.attrs[A.aggression]}) ${x.y}/${x.apps}` }).join('; '))
