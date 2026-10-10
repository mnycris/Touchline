// Is a practice match played like a real one? Same two sides and tactics, toggling one practice difference at a time.
// npx tsx scripts/qa/lab/spar-ctx.ts <save> [n=30]
import fs from 'node:fs'
import { deserialize } from '../../../src/services/saves'
import { practiceOpponent, PRACTICE_STYLES } from '../../../src/engine/world/practice'
import { matchContext, sideInput } from '../../../src/engine/world/matchRunner'
import { MatchSim, type SideInput } from '../../../src/engine/match/engine'
import type { Fixture } from '../../../src/domain/types'
const [file, nn = '30'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const N = Number(nn)
const me = w.userClubId, opp = practiceOpponent(w, 'similar')
const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.season === w.season && c.clubs.includes(me))
const club = w.clubs[me]
const A = { ...club.sheets.find((s) => s.id === club.activeSheet)!.tactics }
const bal = PRACTICE_STYLES[0].tactics
const fresh = (s: SideInput): SideInput => ({ ...s, players: Object.fromEntries(Object.entries(s.players).map(([k, p]) => [k, { ...p, fitness: 100 }])) })
function run(o: { userSheet: boolean; fresh: boolean; practiceCtx: boolean; oppBal: boolean }) {
  const rs = []
  for (let i = 0; i < N; i++) {
    const f: Fixture = { id: `x:${i}`, compId: lg?.id || '', roundName: 'R', date: w.date, time: '15:00', home: me, away: opp, played: false, neutral: o.practiceCtx } as Fixture
    const ctx = matchContext(w, f, true)
    if (o.practiceCtx) Object.assign(ctx, { attendance: 0, importance: 1, derby: undefined, final: false, knockout: false, extraTime: false, penaltiesOnly: false, injuryRate: 0, userSide: 0, aiBoost: 1, assistantSubs: true, compName: 'Practice' })
    else ctx.userSide = -1
    let h = sideInput(w, me, lg, o.userSheet)
    h = { ...h, controlledByUser: false, sheet: { ...h.sheet, tactics: { ...A } } }
    let a = sideInput(w, opp, lg, false)
    if (o.oppBal) a = { ...a, sheet: { ...a.sheet, tactics: { ...a.sheet.tactics, ...bal } } }
    if (o.fresh) { h = fresh(h); a = fresh(a) }
    rs.push(new MatchSim(h, a, ctx, 9000 + i * 7919).runToEnd())
  }
  const m = (f: (r: any) => number) => (rs.reduce((x, r) => x + f(r), 0) / rs.length).toFixed(2)
  return `goals ${m((r) => r.score[0])}-${m((r) => r.score[1])} shots ${m((r) => r.stats[0].shots)}-${m((r) => r.stats[1].shots)} xg ${m((r) => r.stats[0].xg)}-${m((r) => r.stats[1].xg)} poss ${m((r) => r.stats[0].possession)}`
}
const base = { userSheet: false, fresh: false, practiceCtx: false, oppBal: false }
console.log(`${club.short} v ${w.clubs[opp].short}`)
console.log('league, AI sheet  ', run(base))
console.log('+ user sheet      ', run({ ...base, userSheet: true }))
console.log('+ fresh legs      ', run({ ...base, userSheet: true, fresh: true }))
console.log('+ practice ctx    ', run({ ...base, userSheet: true, fresh: true, practiceCtx: true }))
console.log('+ opp balanced    ', run({ userSheet: true, fresh: true, practiceCtx: true, oppBal: true }))
console.log('league + opp bal. ', run({ ...base, oppBal: true }))
