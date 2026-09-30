// Plays a career forward headlessly (user matches auto-simulated) and writes an importable save, for UI checks of
// later-season screens. npx tsx scripts/qa/make-save.ts <out.touchline> <until YYYY-MM-DD> [club] [seed]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { advance, afterMatch, careerIntro, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { serialize } from '../../src/services/saves'
import { diffDays } from '../../src/domain/dates'

const [out, until = '2027-03-20', clubName = 'Arsenal', seedArg = '42'] = process.argv.slice(2)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const club = (raw.clubs.find((c) => c.name === clubName) || raw.clubs.find((c) => c.name.includes(clubName)))!.id
const w = createWorld(raw, {
  clubId: club,
  manager: { firstName: 'Jo', lastName: 'Silva', nationality: 'England', dob: '1984-03-02', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } },
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' },
  seed: Number(seedArg),
} as any)
careerIntro(w)
const t0 = Date.now()
let guard = 0
while (w.date < until && guard++ < 5000) {
  const r = advance(w, Math.max(1, Math.min(400, Math.abs(diffDays(w.date, until)))))
  if (r.stop === 'match' && r.fixture) afterMatch(w, r.fixture, simulateFixture(w, r.fixture), worldRng(w))
  for (const m of w.inbox) m.read = true
}
w.meta.saveName = `${w.clubs[w.userClubId]?.name} · ${w.date}`
fs.writeFileSync(out, serialize(w))
console.log(`${w.date} in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`)
