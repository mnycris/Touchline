// A whole career season as the game plays it (calendar, cups, Europe, rotation, injuries, transfers; the manager's own
// matches simulated), then the big five's final tables, top scorers and scoreline shape. The harness for questions
// calibrate.ts can't answer: a league season there has no midweek games, no rotation and no fatigue.
//   npx tsx scripts/qa/lab/career-season.ts [seed=42] [club=Brentford] [until=2027-06-05]
import fs from 'node:fs'
import { createWorld } from '../../../src/data/createWorld'
import type { RawDb } from '../../../src/data/rawTypes'
import { advance, afterMatch, careerIntro, worldRng } from '../../../src/engine/world/advance'
import { simulateFixture } from '../../../src/engine/world/matchRunner'
import { sortTable } from '../../../src/engine/competitions/tables'
import { diffDays } from '../../../src/domain/dates'

const [seedArg = '42', clubName = 'Brentford', until = '2027-06-05'] = process.argv.slice(2)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const club = (raw.clubs.find((c) => c.name === clubName) || raw.clubs.find((c) => c.name.includes(clubName)))!.id
const w = createWorld(raw, {
  clubId: club,
  manager: { firstName: 'Jo', lastName: 'Silva', nationality: 'England', dob: '1984-03-02', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } },
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' },
  seed: Number(seedArg),
} as never)
careerIntro(w)
const t0 = Date.now()
let guard = 0
while (w.date < until && guard++ < 5000) {
  const r = advance(w, Math.max(1, Math.min(400, Math.abs(diffDays(w.date, until)))))
  if (r.stop === 'match' && r.fixture) afterMatch(w, r.fixture, simulateFixture(w, r.fixture), worldRng(w))
  for (const m of w.inbox) m.read = true
}
console.log(`seed ${seedArg}, ${w.clubs[club].name}, reached ${w.date} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
const margins = [0, 0, 0, 0, 0, 0]
let n = 0, goals = 0, draws = 0
for (const lid of [13, 53, 19, 31, 16]) {
  const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.leagueId === lid && c.season === 2026)
  if (!comp) continue
  const fx = comp.fixtures.map((id) => w.fixtures[id]).filter((f) => f.played && f.result)
  let g = 0, d = 0
  for (const f of fx) {
    const [h, a] = f.result!.score
    g += h + a; if (h === a) d++
    margins[Math.min(5, Math.abs(h - a))]++
  }
  n += fx.length; goals += g; draws += d
  const t = sortTable(w, comp)
  const gp = t[0].p
  const sc = Object.values(w.players).filter((p) => p.season[comp.id]?.goals).sort((a, b) => b.season[comp.id].goals - a.season[comp.id].goals).slice(0, 3)
  console.log(`${comp.name.slice(0, 18).padEnd(18)} played ${fx.length}/${comp.fixtures.length} · goals/m ${(g / fx.length).toFixed(2)} draws ${Math.round((d / fx.length) * 100)}% · ${w.clubs[t[0].clubId].short} ${t[0].pts} (${t[0].gf} GF, ${(t[0].pts / gp).toFixed(2)} ppg), ${w.clubs[t[1].clubId].short} ${t[1].pts}, last ${t[t.length - 1].pts} · top ${sc.map((p) => `${p.name} ${p.season[comp.id].goals}`).join(', ')}`)
}
console.log(`pooled: goals/m ${(goals / n).toFixed(2)} draws ${((draws / n) * 100).toFixed(1)}% margins ${margins.map((m, i) => `${i < 5 ? i : '5+'}:${Math.round((m / n) * 100)}%`).join(' ')}`)
