// A save from before international football: national teams and the rest of the season's windows are added on load.
// npx tsx scripts/qa/intl-migrate.ts
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { advance, afterMatch, careerIntro, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { NT_BASE, migrateIntl } from '../../src/engine/world/international'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const club = raw.clubs.find((c) => c.name.includes('Liverpool'))!.id
const w = createWorld(raw, {
  clubId: club,
  manager: { firstName: 'A', lastName: 'B', nationality: 'Scotland', dob: '1984-03-02', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } } as any,
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' } as any,
  seed: 5,
})
careerIntro(w)
// play into October the old way: strip everything international first
const strip = () => {
  for (const [id, c] of Object.entries(w.competitions)) if (c.format === 'intl') { for (const f of c.fixtures) delete w.fixtures[f]; delete w.competitions[id] }
  for (const id of Object.keys(w.clubs)) if (Number(id) >= NT_BASE) delete w.clubs[Number(id)]
  delete w.intl
}
strip()
let guard = 0
while (w.date < '2026-10-20' && guard++ < 200) {
  const r = advance(w, 400)
  if (r.stop === 'match' && r.fixture) afterMatch(w, r.fixture, simulateFixture(w, r.fixture), worldRng(w))
}
console.log('old-style save at', w.date, 'intl?', !!w.intl, 'players marked away', Object.values(w.players).filter((p) => p.intlDuty).length)
// load: migrate
const json = JSON.parse(JSON.stringify(w))
migrateIntl(json)
const fx = Object.values(json.fixtures).filter((f: any) => f.home >= NT_BASE) as any[]
const dates = [...new Set(fx.map((f) => f.date))].sort()
console.log('national teams', Object.keys(json.intl.nt).length, 'intl fixtures', fx.length, 'dates', dates.join(' '))
if (fx.some((f) => f.date <= json.date)) console.log('PROBLEM: fixture in the past')
// and it plays on
let g2 = 0, played = 0
while (json.date < '2026-11-20' && g2++ < 200) {
  const r = advance(json, 400)
  if (r.stop === 'match' && r.fixture) afterMatch(json, r.fixture, simulateFixture(json, r.fixture), worldRng(json))
}
played = (Object.values(json.fixtures) as any[]).filter((f) => f.home >= NT_BASE && f.played).length
const caps = (Object.values(json.players) as any[]).filter((p) => p.intlSeason && Object.keys(p.intlSeason).length).length
console.log('after the November window:', json.date, 'intl games played', played, 'players with caps this season', caps, 'still away', (Object.values(json.players) as any[]).filter((p) => p.intlDuty).length)
