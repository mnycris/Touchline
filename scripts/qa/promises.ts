// Player promises judged on what happened: starts and substitute appearances from the matches actually played since
// the promise, the cup tie that was promised, deadlines that leave a fair chance, loan promises that lapse when nobody
// offered and break only when the manager turned offers down. npx tsx scripts/qa/promises.ts <save in the season>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave } from '../../src/engine/world/migrate'
import { advance, afterMatch, worldRng } from '../../src/engine/world/advance'
import { createSim } from '../../src/engine/world/matchRunner'
import { checkPromises, respondConversation } from '../../src/engine/world/morale'
import { matchSheetOf } from '../../src/engine/match/selection'
import { rosterOf } from '../../src/engine/world/roster'
import { addDays, diffDays } from '../../src/domain/dates'
import { POS_GROUP } from '../../src/domain/constants'
import type { Fixture, Player, PlayerPromise, World } from '../../src/domain/types'

const w: World = deserialize(fs.readFileSync(process.argv[2]))
migrateSave(w)
const me = w.clubs[w.userClubId]
let fails = 0
const ok = (c: boolean, what: string) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`) }
const talk = (p: Player, effect: string) => {
  const id = `qa${w.conversations.length}`
  w.conversations.push({ id, playerId: p.id, kind: 'qa', opened: w.date, prompt: '', options: [{ id: 'o', text: '', effect }] })
  respondConversation(w, id, 'o')
  return w.promises[w.promises.length - 1]
}
const mine = (f: Fixture) => f.home === me.id || f.away === me.id
const playTo = (until: string, before?: (f: Fixture) => void) => {
  let guard = 0
  while (w.date < until && guard++ < 400) {
    const r = advance(w, Math.max(1, diffDays(until, w.date)))
    if (r.stop === 'match' && r.fixture) {
      // as the match day screen's Sim does: the manager's sheet for this match, the assistant making the changes
      before?.(r.fixture)
      const sim = createSim(w, r.fixture, true); sim.ctx.assistantSubs = true
      afterMatch(w, r.fixture, sim.runToEnd(), worldRng(w))
    }
    for (const m of w.inbox) m.read = true
  }
}
const squad = () => rosterOf(w, me.id).filter((p) => p.clubId === me.id && !p.loan && !p.injury)
const letDown = (p: Player) => w.inbox.find((m) => m.playerId === p.id && /let down/.test(m.subject))
console.log(`${me.name}, ${w.date}`)

// 1. the next cup tie: the deadline is the tie, and a substitute appearance in it keeps the promise
const tie = Object.values(w.fixtures).filter((f) => !f.played && mine(f) && w.competitions[f.compId]?.format === 'cup').sort((a, b) => a.date.localeCompare(b.date))[0]
const fringe = squad().filter((p) => p.positions[0] !== 'GK').sort((a, b) => a.ovr - b.ovr)
if (!tie) console.log('---- no cup tie ahead in this save; skipping 1')
else {
  const sub = fringe[0]
  const pr = talk(sub, 'promiseCupNext')
  ok(pr.kind === 'Cup Appearances' && pr.compId === tie.compId && pr.requirement === 1, `${sub.name}: promised the ${w.competitions[tie.compId].short} tie on ${tie.date}`)
  ok(pr.deadline >= tie.date, `the deadline (${pr.deadline}) is not before the tie (${tie.date}), ${diffDays(tie.date, w.date)} days away`)
  playTo(addDays(tie.date, -1))
  checkPromises(w)
  ok(pr.status === 'active', `still open the day before the tie: ${pr.status}`)
  // he comes off the bench: put him on the sheet's bench, then make sure the result has him on for 20 minutes
  playTo(addDays(tie.date, 1), (f) => {
    if (f.id !== tie.id) return
    const sh = matchSheetOf(me, f.id)
    sh.lineup = sh.lineup.filter((x) => x !== sub.id); if (!sh.bench.includes(sub.id)) sh.bench = [sub.id, ...sh.bench].slice(0, 12)
  })
  const st = w.fixtures[tie.id].result?.players.find((x) => x.id === sub.id)
  if (!st || st.mins <= 0) {
    // the engine left him on the bench: give him the last twenty minutes, as a substitution would
    const res = w.fixtures[tie.id].result!
    const side = tie.home === me.id ? 0 : 1
    const row = st || (res.players.push({ ...res.players.find((x) => x.side === side)!, id: sub.id, started: false, mins: 0 }), res.players[res.players.length - 1])
    row.started = false; row.mins = 20
    console.log('     (the substitution was written into the result: the engine kept him on the bench)')
  } else console.log(`     he played ${st.mins} minutes${st.started ? ' from the start' : ' off the bench'}`)
  const m0 = sub.morale
  checkPromises(w)
  ok(pr.status === 'fulfilled' && pr.progress === 1, `kept with an appearance in the tie: ${pr.status} ${pr.progress}/${pr.requirement}`)
  ok(sub.morale >= m0, `morale up or level (${m0} → ${sub.morale})`)
}

// 2. more starts: counted from the starts since the promise, over at least five matches
{
  const p = fringe.find((x) => !w.promises.some((pr) => pr.playerId === x.id))!
  const pr = talk(p, 'promiseStarts')
  const ahead = Object.values(w.fixtures).filter((f) => !f.played && mine(f) && f.date >= w.date && f.date <= pr.deadline)
  ok(ahead.length >= 5 || diffDays(pr.deadline, pr.made) === 30, `${p.name}: More Starts until ${pr.deadline}, ${ahead.length} matches in that time`)
  // start him in one of them, leave him out of the rest
  let given = 0
  const g = POS_GROUP[p.positions[0]]
  playTo(addDays(pr.deadline, 8), (f) => {
    if (f.date > pr.deadline) return
    const sh = matchSheetOf(me, f.id)
    if (given < 1) {
      const i = sh.lineup.findIndex((x) => x !== p.id && POS_GROUP[w.players[x]?.positions[0]] === g)
      if (!sh.lineup.includes(p.id) && i >= 0) sh.lineup[i] = p.id
      sh.bench = sh.bench.filter((x) => x !== p.id)
      given++
    } else {
      // dropped, with someone from his line taking the place, and left out of the squad
      const i = sh.lineup.indexOf(p.id)
      const alt = squad().find((x) => x.id !== p.id && !sh.lineup.includes(x.id) && POS_GROUP[x.positions[0]] === g)
      if (i >= 0 && alt) sh.lineup[i] = alt.id
      sh.bench = sh.bench.filter((x) => x !== p.id && x !== alt?.id)
    }
  })
  const played = Object.values(w.fixtures).filter((f) => f.played && mine(f) && f.date >= pr.made && f.date <= pr.deadline)
  const starts = played.filter((f) => f.result!.players.some((x) => x.id === p.id && x.started && x.mins > 0)).length
  // (a kept promise stops counting the day it is kept)
  ok(pr.status === 'fulfilled' ? pr.progress >= pr.requirement && pr.progress <= starts : pr.progress === starts, `progress ${pr.progress} matches the starts since the promise counted from the results (${starts})`)
  // (injured over the deadline: it waits for him once)
  const fit = played.filter((f) => !(pr.out && f.date >= pr.out.from && f.date <= pr.out.to))
  const expect = starts >= pr.requirement ? 'fulfilled' : pr.extended && w.date <= pr.deadline ? 'active' : fit.length >= pr.requirement ? 'broken' : 'lapsed'
  ok(pr.status === expect, `${pr.status} (expected ${expect}: ${starts} of ${played.length} started, ${pr.requirement} promised${pr.extended ? `; injured, deadline moved to ${pr.deadline}` : ''})`)
  if (pr.status === 'broken') ok(/started \d+ of \d+ games/.test(letDown(p)?.body || ''), `his message says what happened: ${letDown(p)?.body}`)
}

// 3. loan promises, judged by hand-made cases at the deadline
const caseLoan = (p: Player, set: Partial<PlayerPromise>, listed: boolean) => {
  p.loanListed = listed
  const pr: PlayerPromise = { id: `prqa${w.promises.length}`, playerId: p.id, kind: 'Loan Move', made: addDays(w.date, -40), deadline: addDays(w.date, -1), requirement: 1, progress: 0, status: 'active', offers: 0, ...set }
  w.promises.push(pr)
  const m0 = p.morale
  checkPromises(w)
  return { pr, dm: p.morale - m0 }
}
{
  const [a, b, c] = squad().filter((p) => !w.promises.some((pr) => pr.playerId === p.id && pr.status === 'active')).slice(-3)
  for (const p of [a, b, c]) p.injury = undefined
  const x = caseLoan(a, { offers: 0 }, true)
  ok(x.pr.status === 'lapsed' && x.dm === 0, `no club came in, still listed: ${x.pr.status}, morale ${x.dm >= 0 ? '+' : ''}${x.dm}`)
  ok(w.inbox.some((m) => m.playerId === a.id && /Nobody came in/.test(m.body)), 'and he says it is not the manager’s fault')
  const y = caseLoan(b, { offers: 3 }, true)
  ok(y.pr.status === 'broken' && y.dm < 0, `three offers turned down: ${y.pr.status}, morale ${y.dm}`)
  ok(/3 clubs wanted me/.test(letDown(b)?.body || ''), `his message: ${letDown(b)?.body}`)
  const z = caseLoan(c, { offers: 0 }, false)
  ok(z.pr.status === 'broken' && /off the loan list/.test(letDown(c)?.body || ''), `taken off the loan list: ${z.pr.status}, ${letDown(c)?.body}`)
}

// 4. an injury through the deadline moves it once; a player who has gone is not a broken promise
{
  const [a, b] = squad().filter((p) => !w.promises.some((pr) => pr.playerId === p.id && pr.status === 'active')).slice(0, 2)
  a.injury = { type: 'Hamstring', severity: 'Moderate', since: addDays(w.date, -10), until: addDays(w.date, 20), totalDays: 30 }
  const pr: PlayerPromise = { id: `prqa${w.promises.length}`, playerId: a.id, kind: 'More Starts', made: addDays(w.date, -30), deadline: addDays(w.date, -1), requirement: 3, progress: 0, status: 'active' }
  w.promises.push(pr)
  checkPromises(w)
  ok(pr.status === 'active' && pr.extended && pr.deadline === addDays(a.injury.until, 14), `injured: deadline moved to ${pr.deadline}`)
  a.injury = undefined
  const other = Object.values(w.clubs).find((c) => c.id !== me.id && !c.national && c.leagueId)!
  const pr2: PlayerPromise = { id: `prqa${w.promises.length + 1}`, playerId: b.id, kind: 'Bigger Role', made: addDays(w.date, -30), deadline: addDays(w.date, 10), requirement: 4, progress: 0, status: 'active' }
  w.promises.push(pr2)
  const was = b.clubId
  b.clubId = other.id
  checkPromises(w)
  ok(pr2.status === 'lapsed', `sold before the deadline: ${pr2.status}`)
  b.clubId = was
}
console.log(fails ? `${fails} FAILED` : 'all ok')
process.exit(fails ? 1 : 0)
