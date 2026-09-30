// International football, headless: national teams, the four-year cycle, call-ups and releases, no clashes with club games.
// npx tsx scripts/qa/intl.ts [seasons] [club]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { advance, afterMatch, careerIntro, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { NT_BASE } from '../../src/engine/world/international'
import { sortTable } from '../../src/engine/competitions/tables'
import type { Competition, Fixture } from '../../src/domain/types'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const seasons = Number(process.argv[2] || 1)
const clubName = process.argv[3] || 'Arsenal'
const club = (raw.clubs.find((c) => c.name.includes(clubName)))!.id
const w = createWorld(raw, {
  clubId: club,
  manager: { firstName: 'Alex', lastName: 'Ferris', nationality: 'England', dob: '1984-03-02', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } } as any,
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' } as any,
  seed: 11,
})
careerIntro(w)
const nts = Object.entries(w.intl?.nt || {})
console.log(`national teams: ${nts.length}`, nts.slice(0, 12).map(([n, id]) => `${n} ${w.clubs[id].squadAvg}`).join(', '))
const problems: string[] = []
const t0 = Date.now()
let calls = 0, backs = 0
for (let s = 0; s < seasons; s++) {
  const season = w.season
  // competitions and fixtures are dropped from the save at the rollover: keep references to read them afterwards
  const compRef = new Map<string, Competition>(), fxRef = new Map<string, Fixture>()
  const capture = () => {
    for (const c of Object.values(w.competitions)) if (c.season === season && c.format === 'intl') compRef.set(c.id, c)
    for (const c of compRef.values()) for (const id of c.fixtures) if (w.fixtures[id]) fxRef.set(id, w.fixtures[id])
  }
  capture()
  console.log(`\n=== ${season}/${season + 1}: ${[...compRef.values()].map((c) => `${c.key}(${c.fixtures.length})`).join(' ')}`)
  let guard = 0
  const seen = new Set<string>()
  while (w.season === season && guard++ < 3000) {
    // every day: nobody away with his country is in his club's side, nobody plays twice on a day
    // day by day through the summer so the tournaments can be read back
    const r = advance(w, w.date >= `${season + 1}-05-25` ? 1 : 400)
    if (w.season === season) capture()
    if (r.stop === 'match' && r.fixture) {
      const f = r.fixture
      const res = simulateFixture(w, f)
      for (const st of res.players) if (st.mins > 0 && w.players[st.id]?.intlDuty) problems.push(`${f.date} ${w.players[st.id].name} played for his club while on international duty`)
      afterMatch(w, f, res, worldRng(w))
    }
    for (const m of w.inbox) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      if (/call-up/.test(m.subject)) { calls++; if (calls <= 4) console.log(`  ${m.date} ${m.subject}: ${m.body.slice(0, 150)}`) }
      if (/back from international duty/.test(m.subject)) { backs++; if (backs <= 3) console.log(`  ${m.date} ${m.subject}: ${m.body.slice(0, 150)}`) }
      if (/international duty/.test(m.subject)) console.log(`  ${m.date} ${m.subject}`)
      m.read = true
    }
    if (r.stop === 'sacked') { console.log('sacked'); break }
  }
  // what happened this season (read from the archive and the finished competitions)
  const arch = w.archive[w.archive.length - 1]
  for (const c of compRef.values()) {
    const fx = c.fixtures.map((id) => fxRef.get(id)).filter(Boolean) as Fixture[]
    const unplayed = fx.filter((f) => !f.played).length
    const winner = c.winner ?? arch?.winners[c.key]
    const goals = fx.filter((f) => f.result).reduce((a, f) => a + f.result!.score[0] + f.result!.score[1], 0)
    console.log(`  ${c.name}: ${fx.length} games, ${(goals / Math.max(1, fx.length)).toFixed(2)} goals/game${winner ? `, won by ${w.clubs[winner]?.name}` : ''}${c.runnerUp ? ` (runner-up ${w.clubs[c.runnerUp]?.name})` : ''}${unplayed ? ` UNPLAYED ${unplayed}` : ''}`)
    if (c.intl?.kind === 'tournament' && !winner) problems.push(`${c.name} ${season} finished without a winner (stage ${c.intl.stage})`)
  }
  console.log(`  season done ${w.date} in ${((Date.now() - t0) / 1000).toFixed(0)}s; call-up messages ${calls}, releases ${backs}`)
  // who's still marked away
  const stuck = Object.values(w.players).filter((p) => p.intlDuty)
  if (stuck.length) problems.push(`${stuck.length} players still on international duty after the season`)
}
// records
const top = Object.values(w.players).filter((p) => p.intlCareer?.length).sort((a, b) => b.intlCareer!.reduce((x, c) => x + c[2], 0) - a.intlCareer!.reduce((x, c) => x + c[2], 0)).slice(0, 8)
console.log('\nintl scorers (this career):', top.map((p) => `${p.name} (${p.nation}) ${p.intlCareer!.reduce((x, c) => x + c[2], 0)}g/${p.intlCareer!.reduce((x, c) => x + c[1], 0)}`).join(', '))
const clubStatsLeak = Object.values(w.players).some((p) => Object.keys(p.season).some((k) => w.competitions[k]?.format === 'intl'))
if (clubStatsLeak) problems.push('international stats in a club season line')
const ntFixtures = Object.values(w.fixtures).filter((f) => f.home >= NT_BASE).length
console.log('nt fixtures left in save', ntFixtures, 'save MB', (JSON.stringify(w).length / 1e6).toFixed(1))
console.log(problems.length ? `PROBLEMS (${problems.length}):\n  ${[...new Set(problems)].slice(0, 20).join('\n  ')}` : 'no problems')
void sortTable
