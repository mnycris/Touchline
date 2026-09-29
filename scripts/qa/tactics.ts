// Tactic matrix: the same squad plays itself with different tactical presets. No preset should dominate or collapse.
// Run: npx tsx scripts/qa/tactics.ts [club="Brentford"] [games per pair=120]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { TeamSheet, TeamTactics } from '../../src/domain/types'
import { aiMatchSheet } from '../../src/engine/match/selection'
import { MatchSim, type SideInput } from '../../src/engine/match/engine'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const clubName = process.argv[2] || 'Brentford'
const G = Number(process.argv[3] || 120)
const arsenal = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, { clubId: arsenal, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 5 })
const club = Object.values(w.clubs).find((c) => c.name === clubName)!
const comp = w.competitions[`L${club.leagueId}-2026`]
const base = aiMatchSheet(w, club, comp)
const T = (t: Partial<TeamTactics>): TeamTactics => ({ ...base.tactics, buildUp: 'Balanced', defApproach: 'Balanced', lineHeight: 55, width: 55, tempo: 55, pressing: 50, chanceCreation: 'Balanced', playersInBox: 5, mentality: 'Balanced', timeWasting: false, offsideTrap: false, ...t })
const presets: Record<string, TeamTactics> = {
  Balanced: T({}),
  LowBlockCounter: T({ buildUp: 'Counter', defApproach: 'Deep', lineHeight: 30, pressing: 35, tempo: 72, chanceCreation: 'Direct Passing' }),
  ParkBus: T({ buildUp: 'Long Ball', defApproach: 'Deep', lineHeight: 22, width: 38, tempo: 40, pressing: 25, chanceCreation: 'Direct Passing', playersInBox: 3, mentality: 'Defensive' }),
  HighPress: T({ defApproach: 'High', lineHeight: 72, pressing: 80, tempo: 68, buildUp: 'Short Passing' }),
  Gegenpress: T({ defApproach: 'Aggressive', lineHeight: 68, pressing: 88, tempo: 75, chanceCreation: 'Forward Runs', mentality: 'Attacking' }),
  TikiTaka: T({ buildUp: 'Short Passing', chanceCreation: 'Possession', tempo: 35, width: 50, lineHeight: 62, pressing: 65 }),
  WingPlay: T({ width: 85, playersInBox: 7, chanceCreation: 'Forward Runs', tempo: 60 }),
  LongBall: T({ buildUp: 'Long Ball', chanceCreation: 'Direct Passing', tempo: 70, width: 60 }),
  AllOut: T({ mentality: 'Ultra Attacking', lineHeight: 75, pressing: 70, tempo: 80, playersInBox: 8, width: 70 }),
}
const names = Object.keys(presets)
const side = (name: string, idx: number): SideInput => {
  const sheet: TeamSheet = { ...base, tactics: presets[name] }
  return { clubId: club.id + idx, name: `${club.name} ${name}`, short: name, sheet, players: Object.fromEntries([...sheet.lineup, ...sheet.bench].map((id) => [id, w.players[id]])) }
}
const ctx = (i: number) => ({ id: `t${i}`, compName: 'T', neutral: false, venue: 'X', attendance: 30000, knockout: false, extraTime: false, penaltiesOnly: false, importance: 1, strictness: 1, injuryRate: 1, commentary: false })
const ppg: Record<string, { pts: number; n: number; gf: number; ga: number; xg: number; poss: number; shots: number }> = {}
for (const n of names) ppg[n] = { pts: 0, n: 0, gf: 0, ga: 0, xg: 0, poss: 0, shots: 0 }
const matrix: Record<string, Record<string, number>> = {}
let seed = 1
const t0 = Date.now()
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = names[i], b = names[j]
  let pa = 0
  for (let g = 0; g < G; g++) {
    const flip = g % 2 === 1
    const home = side(flip ? b : a, 0), away = side(flip ? a : b, 1)
    const r = new MatchSim(home, away, ctx(g), seed++).runToEnd()
    const [sa, sb] = flip ? [r.score[1], r.score[0]] : [r.score[0], r.score[1]]
    const [ta, tb] = flip ? [r.stats[1], r.stats[0]] : [r.stats[0], r.stats[1]]
    const ptsA = sa > sb ? 3 : sa === sb ? 1 : 0, ptsB = sb > sa ? 3 : sa === sb ? 1 : 0
    pa += ptsA
    for (const [n, pts, gf, ga, st] of [[a, ptsA, sa, sb, ta], [b, ptsB, sb, sa, tb]] as const) {
      const x = ppg[n]; x.pts += pts; x.n++; x.gf += gf; x.ga += ga; x.xg += st.xg; x.poss += st.possession; x.shots += st.shots
    }
  }
  ;(matrix[a] ||= {})[b] = pa / G
  ;(matrix[b] ||= {})[a] = 3 - pa / G - (0) // approx (draws count 1 for both); recomputed below
}
console.log(`${club.name} (${base.formation}) — ${G} games per pair, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
console.log('preset'.padEnd(16) + 'ppg   gf/g  ga/g  xG/g  shots poss')
for (const n of names.sort((x, y) => ppg[y].pts / ppg[y].n - ppg[x].pts / ppg[x].n)) {
  const x = ppg[n]
  console.log(n.padEnd(16) + (x.pts / x.n).toFixed(2).padStart(4) + (x.gf / x.n).toFixed(2).padStart(6) + (x.ga / x.n).toFixed(2).padStart(6) + (x.xg / x.n).toFixed(2).padStart(6) + (x.shots / x.n).toFixed(1).padStart(6) + (x.poss / x.n).toFixed(0).padStart(5))
}
void MatchSim
