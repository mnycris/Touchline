// Disciplinary frequency over many matches, full engine and quick sim, by league; plus fouls per card.
// Real reference (2023-25 big five): ~3.9-5.3 yellows per match (Premier League ~4.0, LaLiga ~5.1, Serie A ~4.6,
// Bundesliga ~4.1, Ligue 1 ~3.9), reds ~0.12-0.25, fouls ~21-26. npx tsx scripts/qa/cards.ts [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim, simulateFixture } from '../../src/engine/world/matchRunner'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 150)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 7 })
for (const key of ['L13', 'L53', 'L31', 'L19']) {
  const fx = Object.values(w.fixtures).filter((f) => w.competitions[f.compId]?.key === key && !f.userInvolved).slice(0, N)
  for (const mode of ['full', 'quick'] as const) {
    let y = 0, r = 0, fouls = 0, sy = 0, derbyY = 0, derbyN = 0, pens = 0
    const dist: Record<number, number> = {}
    for (const f of fx) {
      const res = mode === 'full' ? createSim(w, f, false, true).runToEnd() : simulateFixture(w, f, false)
      const yy = res.stats[0].yellows + res.stats[1].yellows
      y += yy; r += res.stats[0].reds + res.stats[1].reds; fouls += res.stats[0].fouls + res.stats[1].fouls
      sy += res.events.filter((e) => e.type === 'secondYellow').length
      pens += res.events.filter((e) => e.type === 'penGoal' || e.type === 'penMiss').length
      dist[Math.min(9, yy)] = (dist[Math.min(9, yy)] || 0) + 1
      if (f.derby) { derbyY += yy; derbyN++ }
    }
    const n = fx.length
    console.log(`${key} ${mode.padEnd(5)} ${n} matches · yellows ${(y / n).toFixed(2)} · reds ${(r / n).toFixed(3)} (2nd yellows ${(sy / n).toFixed(3)}) · fouls ${(fouls / n).toFixed(1)} · fouls/yellow ${(fouls / Math.max(1, y)).toFixed(1)} · pens ${(pens / n).toFixed(2)}${derbyN ? ` · derbies ${(derbyY / derbyN).toFixed(2)} (${derbyN})` : ''} · dist ${JSON.stringify(dist)}`)
  }
}
