// Who plays a role across the big five AI sheets, and how they fare in it (per 90, starters with 60+ minutes).
// npx tsx scripts/qa/role-who.ts <role> [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'

const ROLE = process.argv[2] || 'Shadow Striker'
const N = Number(process.argv[3] || 300)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Brentford'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const comps = Object.values(w.competitions).filter((c) => c.format === 'league' && ['L13', 'L53', 'L19', 'L31', 'L16'].some((k) => c.key?.startsWith(k)))
const fxs = comps.flatMap((c) => c.fixtures.map((id) => w.fixtures[id])).filter((f) => f && !f.userInvolved).slice(0, N)
const by: Record<string, { n: number; mins: number; r: number; touches: number; shots: number; kp: number; bt: number }> = {}
for (const f of fxs) {
  const sim: any = createSim(w, f, false, true)
  sim.runToEnd()
  for (const s of sim.sides) for (const l of s.lps) {
    if (l.role !== ROLE || !l.st.started || l.st.mins < 60) continue
    const k = `${l.p.name} (${w.clubs[s.input.clubId].short}, ${s.formation} ${l.pos})`
    const e = (by[k] ||= { n: 0, mins: 0, r: 0, touches: 0, shots: 0, kp: 0, bt: 0 })
    e.n++; e.mins += l.st.mins; e.r += l.st.rating; e.touches += l.st.touches; e.shots += l.st.shots; e.kp += l.st.keyPasses; e.bt += l.st.boxTouches
  }
}
for (const [k, e] of Object.entries(by).sort((a, b) => b[1].n - a[1].n)) {
  const p9 = (v: number) => ((v / e.mins) * 90).toFixed(1)
  console.log(`${k.padEnd(60)} n ${String(e.n).padStart(3)} rating ${(e.r / e.n).toFixed(2)} touches ${p9(e.touches)} shots ${p9(e.shots)} keyP ${p9(e.kp)} boxT ${p9(e.bt)}`)
}
