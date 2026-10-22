// The numbers around the box when a shot is considered (attackers in the box less defenders in it, see boxBalance), by
// zone: what is typical, so a chance-quality effect of it can be centred there.
// npx tsx scripts/qa/box-balance.ts [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { MatchSim } from '../../src/engine/match/engine'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 40)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const fx = Object.values(w.fixtures).filter((f) => w.competitions[f.compId]?.key?.startsWith('L13')).slice(0, N)
MatchSim.dbg = {}
let goals = 0
for (const f of fx) { const s = createSim(w, f, false, true); const r = s.runToEnd(); goals += r.score[0] + r.score[1] }
const d = MatchSim.dbg
for (let z = 6; z <= 9; z++) console.log(`zone ${z * 10}-${z * 10 + 10}: shot looks ${d['sc' + z] || 0}, mean box balance ${(((d['s0.sbb' + z] || 0) + (d['s1.sbb' + z] || 0)) / Math.max(1, (d['s0.sc' + z] || 0) + (d['s1.sc' + z] || 0))).toFixed(2)}`)
console.log('goals/m', (goals / fx.length).toFixed(2))
