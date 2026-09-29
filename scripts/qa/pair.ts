// One tactical pairing in detail: npx tsx scripts/qa/pair.ts <presetHome> <presetAway> [games] [club]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { TeamSheet, TeamTactics } from '../../src/domain/types'
import { aiMatchSheet } from '../../src/engine/match/selection'
import { MatchSim, type SideInput } from '../../src/engine/match/engine'
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const [pa, pb] = [process.argv[2] || 'Balanced', process.argv[3] || 'ParkBus']
const G = Number(process.argv[4] || 100)
const clubName = process.argv[5] || 'Brentford'
const arsenal = raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id
const w = createWorld(raw, { clubId: arsenal, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 5 })
const club = Object.values(w.clubs).find((c) => c.name === clubName)!
const base = aiMatchSheet(w, club, w.competitions[`L${club.leagueId}-2026`])
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
  DeepOnly: T({ defApproach: 'Deep', lineHeight: 22 }),
  LowPress: T({ pressing: 25 }),
  DefMent: T({ mentality: 'Defensive' }),
  LongOnly: T({ buildUp: 'Long Ball', chanceCreation: 'Direct Passing' }),
  SlowTempo: T({ tempo: 40 }),
  Narrow: T({ width: 38, playersInBox: 3 }),
}
const side = (name: string, idx: number): SideInput => { const sheet: TeamSheet = { ...base, tactics: presets[name] }; return { clubId: club.id + idx, name, short: name, sheet, players: Object.fromEntries([...sheet.lineup, ...sheet.bench].map((id) => [id, w.players[id]])) } }
const ctx = (i: number) => ({ id: `t${i}`, compName: 'T', neutral: true, venue: 'X', attendance: 30000, knockout: false, extraTime: false, penaltiesOnly: false, importance: 1, strictness: 1, injuryRate: 1, commentary: false })
MatchSim.dbg = {}
const acc = [0, 1].map(() => ({ g: 0, xg: 0, shots: 0, poss: 0, pass: 0, acc: 0, tk: 0, int: 0, drb: 0, cr: 0 }))
for (let g = 0; g < G; g++) {
  const r = new MatchSim(side(pa, 0), side(pb, 1), ctx(g), 1000 + g).runToEnd()
  for (const i of [0, 1]) { const s = r.stats[i], a = acc[i]; a.g += r.score[i]; a.xg += s.xg; a.shots += s.shots; a.poss += s.possession; a.pass += s.passes; a.acc += s.passAcc; a.tk += s.tackles || 0; a.int += s.interceptions || 0; a.drb += s.dribbles || 0; a.cr += s.crosses || 0 }
}
const d = MatchSim.dbg
for (const i of [0, 1]) {
  const a = acc[i]
  console.log(`${[pa, pb][i].padEnd(16)} goals ${(a.g / G).toFixed(2)} xG ${(a.xg / G).toFixed(2)} shots ${(a.shots / G).toFixed(1)} poss ${(a.poss / G).toFixed(0)} passes ${(a.pass / G).toFixed(0)} acc ${(a.acc / G).toFixed(0)} tackles ${(a.tk / G).toFixed(1)} int ${(a.int / G).toFixed(1)} drb ${(a.drb / G).toFixed(1)} crosses ${(a.cr / G).toFixed(1)}`)
  const hows = Object.keys(d).filter((k) => k.startsWith(`s${i}.shot.`)).map((k) => k.split('.')[2]).sort((x, y) => d[`s${i}.shot.${y}`] - d[`s${i}.shot.${x}`])
  console.log('   shots:', hows.map((h) => `${h} ${(d[`s${i}.shot.${h}`] / G).toFixed(1)}@${(d[`s${i}.xg.${h}`] / d[`s${i}.shot.${h}`]).toFixed(2)}`).join('  '))
  console.log('   lost at x:', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => ((d[`s${i}.lost${z}`] || 0) / G).toFixed(1)).join(' '))
}
if (process.argv[6] === 'trace') {
  MatchSim.trace = []
  new MatchSim(side(pa, 0), side(pb, 1), ctx(0), 77).runToEnd()
  const t = MatchSim.trace
  const out: string[] = []
  if (process.argv[7]) console.log(t.filter((l) => l.startsWith(process.argv[7])).slice(0, 90).join('\n'))
  else { t.forEach((l, i) => { if (/ (shot|goal) /.test(l)) out.push(t.slice(Math.max(0, i - 6), i + 1).join('\n') + '\n---') }); console.log(out.slice(0, 14).join('\n')) }
}
{
  const d = MatchSim.dbg!
  for (const i of [0, 1]) console.log(`${[pa, pb][i]} shots by x:`, [60, 65, 70, 75, 80, 85, 90, 95].map((x) => `${x}:${((d[`s${i}.shotx${x}`] || 0) / G).toFixed(1)}`).join(' '))
}
{
  const d = MatchSim.dbg!
  for (const i of [0, 1]) console.log(`${[pa, pb][i]} passes:`, ['short', 'back', 'prog', 'long', 'switch', 'through', 'cutback'].map((k) => `${k} ${((d[`s${i}.pass.${k}`] || 0) / G).toFixed(0)}@${((d[`s${i}.passL.${k}`] || 0) / (d[`s${i}.pass.${k}`] || 1)).toFixed(2)}`).join(' '))
}
