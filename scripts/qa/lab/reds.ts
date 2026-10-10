// How AI sides respond to a red card: forced dismissals at a set minute, then what the side did and what followed.
// npx tsx scripts/qa/lab/reds.ts [n=60] [minute=30] [pos=CB]
import { freshWorld } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
import { matchContext, sideInput } from '../../../src/engine/world/matchRunner'
import { hashString } from '../../../src/domain/rng'
const [nn = '60', mm = '30', pp = 'CB'] = process.argv.slice(2)
const w = freshWorld()
const club = (n: string) => Object.values(w.clubs).find((c) => !c.national && c.name.includes(n))!
const H = club('Brighton'), A = club('Fulham')
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(H.id))!
let subs = 0, shuffles = 0, gfAfter = 0, gaAfter = 0, n = 0, ctl = [0, 0]
for (let i = 0; i < Number(nn); i++) {
  const f: any = { id: `red:${i}`, compId: comp.id, home: H.id, away: A.id, date: '2026-10-10', played: false }
  const ctx = matchContext(w, f, true); ctx.userSide = -1
  const sim: any = new MatchSim(sideInput(w, H.id, comp, false), sideInput(w, A.id, comp, false), ctx, hashString('red' + i))
  let sent = false, scoreAt = [0, 0], subsBefore = 0
  let guard = 0
  while (sim.phase !== 'FT' && guard++ < 400) {
    if (sim.paused) sim.paused = false
    sim.step()
    if (!sent && sim.minute >= Number(mm) && (sim.phase === '1H' || sim.phase === '2H')) {
      const v = sim.sides[0].on.find((l: any) => l.pos === pp || l.g === pp)
      if (!v) break
      subsBefore = sim.sides[0].subsUsed
      const ev0 = sim.events.length
      sim.sendOff(v, false)
      scoreAt = [...sim.score]
      sent = true
      if (sim.sides[0].subsUsed > subsBefore) subs++
      else if (sim.events.slice(ev0).some((e: any) => e.type === 'tactic')) shuffles++
      ctl[0] += sim.sides[0].on.length
    }
  }
  if (!sent) continue
  n++
  gfAfter += sim.score[0] - scoreAt[0]; gaAfter += sim.score[1] - scoreAt[1]
}
console.log(`${n} matches, ${pp} sent off at ${mm}': sub ${Math.round(subs / n * 100)}% · midfielder drops in ${Math.round(shuffles / n * 100)}% · on pitch ${(ctl[0] / n).toFixed(1)} · goals after: for ${(gfAfter / n).toFixed(2)} against ${(gaAfter / n).toFixed(2)}`)
