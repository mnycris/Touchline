// Cards for the manager's own team (their team sheet and tactics) against the AI, over the same fixtures.
// npx tsx scripts/qa/cards-user.ts [repeats]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const R = Number(process.argv[2] || 4)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 7 })
const me = w.userClubId
const sheet = w.clubs[me].sheets.find((s) => s.id === w.clubs[me].activeSheet)!
console.log('user tactics', JSON.stringify({ def: sheet.tactics.defApproach, press: sheet.tactics.pressing, mentality: sheet.tactics.mentality }))
const fx = Object.values(w.fixtures).filter((f) => (f.home === me || f.away === me) && w.competitions[f.compId]?.format === 'league')
const base = { ...sheet.tactics }
for (const [label, patch] of [['default', {}], ['high press', { defApproach: 'High', pressing: 80 }], ['aggressive', { defApproach: 'Aggressive', pressing: 85 }], ['deep', { defApproach: 'Deep', pressing: 25 }]] as const) {
  sheet.tactics = { ...base, ...(patch as object) } as typeof base
  let usY = 0, themY = 0, usR = 0, usF = 0, themF = 0, n = 0
  for (let k = 0; k < R; k++) for (const f of fx) {
    const s = w.meta.seed; w.meta.seed = s + k * 977
    const r = createSim(w, f, true).runToEnd()
    w.meta.seed = s
    const us = f.home === me ? 0 : 1
    usY += r.stats[us].yellows; themY += r.stats[1 - us].yellows; usR += r.stats[us].reds; usF += r.stats[us].fouls; themF += r.stats[1 - us].fouls; n++
  }
  console.log(`${label.padEnd(10)} ${n} matches · our yellows ${(usY / n).toFixed(2)} (fouls ${(usF / n).toFixed(1)}) · their yellows ${(themY / n).toFixed(2)} (fouls ${(themF / n).toFixed(1)}) · total ${((usY + themY) / n).toFixed(2)} · our reds ${(usR / n).toFixed(3)}`)
}
sheet.tactics = base
