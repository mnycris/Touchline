// The players the starting database had just moved: how many are settling in, a few famous ones, and whether they
// would entertain a move or be sold in the first window (Ferran Torres, just at PSG, linked with Atlético).
// npx tsx scripts/qa/summer-arrivals.ts
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { moveAppeal } from '../../src/engine/world/market'
import { sellerStance, settledOn } from '../../src/engine/world/transfers'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Brentford'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const all = Object.values(w.players).filter((p) => p.clubId)
const arr = all.filter((p) => p.arrivedOn)
console.log(`settling in at the start: ${arr.length} of ${all.length} players at clubs (${arr.filter((p) => p.ovr >= 80).length} rated 80+)`)
const club = (n: string) => Object.values(w.clubs).find((c) => c.name === n)!
for (const [who, to] of [['Ferran Torres', 'Atlético de Madrid'], ['Rodri', 'Manchester City'], ['Bruno Guimarães', 'Newcastle United'], ['M. Salah', 'Liverpool'], ['K. Fortounis', 'PAOK'], ['B. Saka', 'Real Madrid']] as const) {
  const p = Object.values(w.players).find((x) => x.name === who)
  if (!p) { console.log(who, 'not found'); continue }
  const t = club(to) || Object.values(w.clubs)[0]
  const a = moveAppeal(w, p, t.id)
  console.log(`${who} (${w.clubs[p.clubId]?.short}): arrived ${p.arrivedOn || '-'} · settled on ${settledOn(w, p) || '-'} · to ${t.short}: appeal ${a.score} (${a.reasons.slice(0, 3).map((r) => `${r.v > 0 ? '+' : ''}${r.v} ${r.text}`).join('; ')}) · seller: ${sellerStance(w, p, t.id).reason || 'willing'}`)
}
