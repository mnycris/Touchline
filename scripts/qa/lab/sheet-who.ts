// Who has the ball, per player, for the user's club with the AI's sheet (optionally one slot's role changed):
// touches, passes, key passes, shots and possession lost per match. npx tsx scripts/qa/lab/sheet-who.ts <save> [slot] [role] [n=20]
import fs from 'node:fs'
import { deserialize } from '../../../src/services/saves'
import { practiceOpponent } from '../../../src/engine/world/practice'
import { matchContext, sideInput } from '../../../src/engine/world/matchRunner'
import { MatchSim } from '../../../src/engine/match/engine'
import type { Fixture } from '../../../src/domain/types'
const [file, slot, role, nn = '20'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const N = Number(nn)
const me = w.userClubId, opp = practiceOpponent(w, 'similar')
const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.season === w.season && c.clubs.includes(me))
const S = sideInput(w, me, lg, !!process.env.USER_SHEET)
const roles = [...(S.sheet.roles || [])]
if (slot) roles[Number(slot)] = { ...roles[Number(slot)], role } as any
const acc = new Map<number, Record<string, number>>()
for (let i = 0; i < N; i++) {
  const f = { id: `x:${i}`, compId: lg?.id || '', roundName: 'R', date: w.date, time: '15:00', home: me, away: opp, played: false } as Fixture
  const ctx = matchContext(w, f, true)
  ctx.userSide = -1
  const r = new MatchSim({ ...S, controlledByUser: false, sheet: { ...S.sheet, roles } }, sideInput(w, opp, lg, false), ctx, 9000 + i * 7919).runToEnd()
  for (const p of r.players) {
    if (p.side !== 0 || !p.started) continue
    const a = acc.get(p.id) || {}
    for (const k of ['touches', 'passes', 'passesCompleted', 'keyPasses', 'shots', 'xg', 'possLost', 'longBalls', 'throughBalls', 'dribbles']) a[k] = (a[k] || 0) + ((p as any)[k] || 0)
    acc.set(p.id, a)
  }
}
console.log('slot role'.padEnd(34), 'touch  pass  ok%  key  shots   xg  lost long thru drib')
S.sheet.lineup.forEach((pid, i) => {
  const a = acc.get(pid) || {}
  const g = (k: string) => (a[k] || 0) / N
  console.log(`${String(i).padStart(2)} ${w.players[pid].name.slice(0, 14).padEnd(14)} ${(roles[i]?.role || '').padEnd(16)}`, [g('touches'), g('passes')].map((x) => x.toFixed(0).padStart(5)).join(' '), (g('passesCompleted') / (g('passes') || 1) * 100).toFixed(0).padStart(4), [g('keyPasses'), g('shots'), g('xg'), g('possLost'), g('longBalls'), g('throughBalls'), g('dribbles')].map((x) => x.toFixed(1).padStart(4)).join(' '))
})
