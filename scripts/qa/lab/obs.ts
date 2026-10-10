// What the half-time report and the before/after analysis say, over a run of real fixtures: every observation that
// fires, how often each kind fires, and a tactical change at 55' with its before/after report.
// npx tsx scripts/qa/lab/obs.ts [n=12] [team=Arsenal]
import { freshWorld, play } from '../engine-lab'
import { matchContext, sideInput } from '../../../src/engine/world/matchRunner'
import { MatchSim } from '../../../src/engine/match/engine'
import { observe, spanOf, frameAt } from '../../../src/engine/match/analysis'
import type { Fixture } from '../../../src/domain/types'
void play
const [nn = '12', team = 'Arsenal'] = process.argv.slice(2)
const w = freshWorld()
const T = Object.values(w.clubs).find((c) => !c.national && (c.short === team || c.name.includes(team)))!
const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(T.id))!
const freq: Record<string, number> = {}
for (let i = 0; i < Number(nn); i++) {
  const opp = lg.clubs.filter((x) => x !== T.id)[i % (lg.clubs.length - 1)]
  const home = i % 2 === 0
  const f = { id: `obs:${i}`, compId: lg.id, roundName: 'R', date: '2026-10-10', time: '15:00', home: home ? T.id : opp, away: home ? opp : T.id, played: false } as Fixture
  const ctx = matchContext(w, f, true)
  const us = home ? 0 : 1
  ctx.userSide = us
  const sim = new MatchSim(sideInput(w, f.home, lg, false), sideInput(w, f.away, lg, false), ctx, 777 + i)
  while (sim.phase !== 'HT') sim.step()
  const fr = sim.ledgerFrames
  const span = spanOf(fr, us, -1, fr.length - 1)
  const players = sim.liveRatings(us).filter((r) => r.on).map((r) => { const st = sim.playerStats(us, r.id)!; return { id: r.id, name: w.players[r.id].name.split(' ').pop()!, pos: r.pos, role: r.role, mins: st.mins, touches: st.touches || 0 } })
  const obs = observe({ span, tactics: sim.sideTactics(us), players, seed: f.id, goals: [sim.score[us], sim.score[1 - us]] })
  console.log(`\n== ${w.clubs[f.home].short} ${sim.score[0]}-${sim.score[1]} ${w.clubs[f.away].short} (HT)  xG ${span.us.xg.toFixed(2)}-${span.them.xg.toFixed(2)} poss ${Math.round(span.us.poss * 100)}%`)
  for (const o of obs) { freq[o.key.split(':')[0]] = (freq[o.key.split(':')[0]] || 0) + 1; console.log(`  [${o.tone}] ${o.head} — ${o.text}  (${o.score.toFixed(2)})`) }
  // a change at 55'
  sim.step()
  while (sim.minute < 55) sim.step()
  sim.setTactics(us, { mentality: 'Attacking', width: 75 }, false)
  sim.noteChange(us, 'Attacking mentality, wider')
  const r = sim.runToEnd()
  for (const c of r.changes?.list || []) {
    console.log(`  CHANGE ${c.min}' ${c.text} (${c.minsBefore} min before / ${c.minsAfter} after): ${c.read}`)
    console.log('   ', c.rows.map((x) => `${x.label} ${x.fmt === 'pct' ? Math.round(x.before * 100) + '%' : x.before.toFixed(x.fmt === 'n2' ? 2 : 1)}→${x.fmt === 'pct' ? Math.round(x.after * 100) + '%' : x.after.toFixed(x.fmt === 'n2' ? 2 : 1)}${x.clear ? '*' : ''}`).join(' · '))
    for (const n of c.notes) console.log('    note:', n)
  }
  void frameAt
}
console.log('\nhow often each fires:', JSON.stringify(freq))
