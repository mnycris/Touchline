// Goal replays vs shot records: the last action of every goal's replay chain must end where the shot map says.
// Also counts direct free kicks on the shot map. npx tsx scripts/qa/replay-shots.ts [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 120)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 5 })
const fx = Object.values(w.fixtures).filter((f) => ['L13', 'L53', 'L19', 'L31'].includes(w.competitions[f.compId]?.key || '') && !f.userInvolved).slice(0, N)
let goals = 0, withChain = 0, match = 0, off = 0, fkShots = 0, fkWithShot = 0, maxD = 0
for (const f of fx) {
  const r = createSim(w, f, false, true).runToEnd()
  for (const e of r.events) {
    if (e.how === 'freekick' && ['goal', 'save', 'miss', 'chance'].includes(e.type)) { fkShots++; if (e.shot) fkWithShot++ }
    if (e.type !== 'goal') continue
    goals++
    const last = e.chain?.[e.chain.length - 1]
    if (!last || last.k !== 'goal' || !e.shot) continue
    withChain++
    const d = Math.hypot(last.x1 - e.shot.end[0], last.y1 - e.shot.end[1])
    maxD = Math.max(maxD, d)
    if (d < 0.2) match++; else { off++; if (off < 5) console.log('MISMATCH', f.id, e.min, 'chain end', last.x1, last.y1, 'shot end', e.shot.end, 'gy', e.shot.gy) }
  }
}
console.log(`${fx.length} matches · ${goals} goals · ${withChain} with a replay · ${match} replay end = shot end · ${off} different (max distance ${maxD.toFixed(2)})`)
console.log(`direct free kicks: ${fkShots} shots, ${fkWithShot} on the shot map`)
