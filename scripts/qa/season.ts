// Headless career test: plays N seasons with auto-simulated user matches.
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { advance, afterMatch, careerIntro, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { sortTable } from '../../src/engine/competitions/tables'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const clubName = process.argv[2] || 'Arsenal FC'
const seasons = Number(process.argv[3] || 1)
const club = (raw.clubs.find((c) => c.dbName === clubName) || raw.clubs.find((c) => c.name === clubName) || raw.clubs.find((c) => c.name.includes(clubName)))!.id
const w = createWorld(raw, {
  clubId: club,
  manager: { firstName: 'Alex', lastName: 'Ferris', nationality: 'England', dob: '1984-03-02', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } },
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' },
  seed: 42,
})
careerIntro(w)
const t0 = Date.now()
let stops: Record<string, number> = {}
let matches = 0
for (let s = 0; s < seasons; s++) {
  const startSeason = w.season
  let guard = 0
  while (w.season === startSeason && guard++ < 2000) {
    const r = advance(w, 400)
    stops[r.stop] = (stops[r.stop] || 0) + 1
    if (r.stop === 'match' && r.fixture) {
      const res = simulateFixture(w, r.fixture)
      afterMatch(w, r.fixture, res, worldRng(w))
      matches++
    }
    if (r.stop === 'sacked') { console.log('SACKED on', w.date); break }
    if (r.stop === 'match' && w.date >= '2027-05-10') diagnostics()
    for (const m of w.inbox) m.read = true
  }
  const arch = w.archive[w.archive.length - 1]
  console.log(`\n=== Season ${arch?.season} done at ${w.date} (${((Date.now() - t0) / 1000).toFixed(1)}s) user matches ${matches}`)
  if (arch) {
    const nm = (id: number) => w.clubs[id]?.name
    for (const k of ['L13', 'L14', 'L53', 'L19', 'L31', 'L16', 'L10', 'L308']) console.log(`  ${k} champion: ${nm(arch.winners[k])}`)
    for (const k of ['UCL', 'UEL', 'UECL', 'FACUP', 'EFLCUP', 'CDR', 'DFB', 'CI', 'CDF', 'COMMSHIELD']) console.log(`  ${k}: ${nm(arch.winners[k])}`)
    console.log('  user finish', arch.userFinish, 'board', w.board.overall, 'awards', arch.awards.filter((a) => a.name.includes('Golden Boot')).map((a) => `${a.name}: ${w.players[a.playerId!]?.name ?? a.playerId} ${a.value}`).slice(0, 4).join(' | '))
    const t = arch.tables['L13']
    if (t) console.log('  PL top 6:', t.slice(0, 6).map((r) => `${nm(r.clubId)} ${r.pts}`).join(', '), '| bottom 3:', t.slice(-3).map((r) => nm(r.clubId)).join(', '))
  }
  console.log('  transfers this season:', w.transfers.history.filter((x) => x.season === (arch?.season ?? w.season) && x.type === 'transfer').length, 'news', w.news.length, 'inbox', w.inbox.length)
}
console.log('stops', stops, 'players', Object.keys(w.players).length)
const json = JSON.stringify(w)
console.log('save size', (json.length / 1e6).toFixed(1), 'MB')
function diagnostics() {
  const top = Object.values(w.players).map((p) => ({ p, s: Object.entries(p.season).find(([k]) => k.startsWith('L13'))?.[1] })).filter((x) => x.s).sort((a, b) => b.s!.goals - a.s!.goals).slice(0, 6)
  console.log('PL scorers:', top.map(({ p, s }) => `${p.name} (${w.clubs[p.clubId]?.short}) g${s!.goals} apps${s!.apps} shots${s!.shots} xg${s!.xg.toFixed(1)} mins${s!.mins}`).join(' | '))
  const pl = Object.values(w.players).filter((p) => w.clubs[p.clubId]?.leagueId === 13)
  console.log('PL avg fitness', (pl.reduce((a, p) => a + p.fitness, 0) / pl.length).toFixed(1), 'sharpness', (pl.reduce((a, p) => a + p.sharpness, 0) / pl.length).toFixed(1))
  const comp = Object.values(w.competitions).find((c) => c.key === 'L13' && c.season === w.season)
  if (!comp) return
  const played = comp.fixtures.map((id) => w.fixtures[id]).filter((f) => f.played && f.result)
  const goals = played.reduce((a, f) => a + f.result!.score[0] + f.result!.score[1], 0)
  console.log('PL goals/match', (goals / played.length).toFixed(2), 'matches', played.length)
}
{
  const parts: Record<string, number> = {}
  for (const [k, v] of Object.entries(w)) parts[k] = JSON.stringify(v).length
  const fx = Object.values(w.fixtures)
  const withPlayers = fx.filter((f) => f.result?.players?.length)
  const resBytes = fx.reduce((a, f) => a + (f.result ? JSON.stringify(f.result).length : 0), 0)
  const plBytes = withPlayers.reduce((a, f) => a + JSON.stringify(f.result!.players).length, 0)
  console.log('save parts (MB):', Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${(v / 1e6).toFixed(1)}`).join(', '))
  console.log(`fixtures: ${fx.length}, results ${(resBytes / 1e6).toFixed(1)}MB, with player stats ${withPlayers.length} (${(plBytes / 1e6).toFixed(1)}MB)`)
  const players = Object.values(w.players)
  const seasonBytes = players.reduce((a, p) => a + JSON.stringify(p.season).length + JSON.stringify(p.career).length + JSON.stringify(p.history || []).length, 0)
  console.log(`players ${players.length}: ${(parts.players / 1e6).toFixed(1)}MB, of which season/career/history ${(seasonBytes / 1e6).toFixed(1)}MB`)
}
