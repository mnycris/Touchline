// Which part of a team sheet costs the attack? The AI's sheet for the user's club with one element of the user's sheet
// swapped in at a time, against the same opponent. npx tsx scripts/qa/lab/sheet-ab.ts <save> [n=30]
import fs from 'node:fs'
import { deserialize } from '../../../src/services/saves'
import { practiceOpponent } from '../../../src/engine/world/practice'
import { matchContext, sideInput } from '../../../src/engine/world/matchRunner'
import { MatchSim, type SideInput } from '../../../src/engine/match/engine'
import type { Fixture } from '../../../src/domain/types'
const [file, nn = '30'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const N = Number(nn)
const me = w.userClubId, opp = practiceOpponent(w, 'similar')
const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.season === w.season && c.clubs.includes(me))
const U = sideInput(w, me, lg, true), AI = sideInput(w, me, lg, false)
function run(mod: (s: SideInput) => SideInput) {
  const rs = []
  for (let i = 0; i < N; i++) {
    const f = { id: `x:${i}`, compId: lg?.id || '', roundName: 'R', date: w.date, time: '15:00', home: me, away: opp, played: false } as Fixture
    const ctx = matchContext(w, f, true)
    ctx.userSide = -1
    const h = mod({ ...AI, controlledByUser: false, sheet: { ...AI.sheet, roles: [...(AI.sheet.roles || [])], lineup: [...AI.sheet.lineup] }, players: { ...AI.players, ...U.players } })
    rs.push(new MatchSim(h, sideInput(w, opp, lg, false), ctx, 9000 + i * 7919).runToEnd())
  }
  const m = (f: (r: any) => number) => (rs.reduce((x, r) => x + f(r), 0) / rs.length).toFixed(2)
  return `goals ${m((r) => r.score[0])}-${m((r) => r.score[1])} shots ${m((r) => r.stats[0].shots)}-${m((r) => r.stats[1].shots)} xg ${m((r) => r.stats[0].xg)}-${m((r) => r.stats[1].xg)} poss ${m((r) => r.stats[0].possession)}`
}
const role = (i: number, r: string) => (s: SideInput) => { s.sheet.roles![i] = { ...s.sheet.roles![i], role: r } as any; return s }
console.log('AI sheet          ', run((s) => s))
console.log('user formation    ', run((s) => ({ ...s, sheet: { ...s.sheet, formation: U.sheet.formation } })))
console.log('user roles        ', run((s) => ({ ...s, sheet: { ...s.sheet, roles: U.sheet.roles } })))
console.log('Rice B2B          ', run(role(5, 'Box-to-Box')))
console.log('Zubi Playmaker    ', run(role(6, 'Playmaker')))
console.log('Gabriel Defender  ', run(role(2, 'Defender')))
console.log('Madueke WPM       ', run(role(8, 'Wide Playmaker')))
console.log('whole user sheet  ', run((s) => ({ ...s, sheet: U.sheet })))
