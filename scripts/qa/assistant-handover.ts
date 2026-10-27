// The assistant's substitutions and the manager taking over: a live match of the manager's side with the assistant on,
// once left alone and once with one change of the manager's own at 50 minutes. Left alone, the assistant makes the
// changes; after the manager's own, none of the rest are the assistant's. npx tsx scripts/qa/assistant-handover.ts [club] [n=20]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
const CLUB = process.argv[2] || 'Barcelona', N = Number(process.argv[3] || 20)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes(CLUB))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as never, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as never, seed: 11 })
w.flags.assistantSubs = true
const club = w.clubs[w.userClubId]
const fxs = Object.values(w.fixtures).filter((f) => f.userInvolved).sort((a, b) => a.date.localeCompare(b.date)).slice(0, N)
for (const take of [false, true]) {
  let mine = 0, after = 0, theirs = 0
  for (const fx of fxs) {
    const us = fx.home === club.id ? 0 : 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim: any = createSim(w, fx, true, false)
    let made = false
    while (!sim.finished) {
      if (sim.injuredWaiting.length) sim.autoResolveInjuries()
      sim.step()
      if (take && !made && sim.minute >= 50 && sim.phase === '2H') {
        const out = sim.sides[us].on.find((l: { pos: string }) => l.pos !== 'GK')
        const inn = sim.sides[us].bench.find((l: { p: { positions: string[] } }) => l.p.positions[0] !== 'GK')
        if (out && inn && sim.managerSub(us, out.p.id, inn.p.id)) { made = true; mine++ }
      }
    }
    const subs = sim.events.filter((e: { type: string; side: number; min: number }) => e.type === 'sub' && e.side === us)
    after += take ? subs.filter((e: { min: number }) => e.min >= 50).length - 1 : 0
    theirs += subs.length
  }
  console.log(take ? `manager's own change at 50': ${mine}/${fxs.length} made; changes after it by the assistant: ${after} (should be 0); all changes ${(theirs / fxs.length).toFixed(1)} a match`
    : `left to the assistant: ${(theirs / fxs.length).toFixed(1)} changes a match`)
}
