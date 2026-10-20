// The loan market in a window: clubs loan players between themselves (at home or nearby, adults, to clubs where they
// would play), clubs come in for the manager's loan-listed players, and a loan promise is judged on those offers.
// npx tsx scripts/qa/loans.ts <save with a window open>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave } from '../../src/engine/world/migrate'
import { advance, afterMatch, worldRng } from '../../src/engine/world/advance'
import { createSim } from '../../src/engine/world/matchRunner'
import { checkPromises, respondConversation } from '../../src/engine/world/morale'
import { currentWindow } from '../../src/engine/competitions/calendar'
import { rosterOf } from '../../src/engine/world/roster'
import { addDays, ageOn, diffDays } from '../../src/domain/dates'
import type { World } from '../../src/domain/types'

const w: World = deserialize(fs.readFileSync(process.argv[2]))
migrateSave(w)
const me = w.clubs[w.userClubId]
let fails = 0
const ok = (c: boolean, what: string) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`) }
const win = currentWindow(w)
if (!win) { console.log(`no window open on ${w.date}`); process.exit(1) }
console.log(`${me.name}, ${w.date}: ${win.name} window until ${win.close}`)

// three of the manager's fringe players ask to go out on loan, and he agrees
const fringe = rosterOf(w, me.id).filter((p) => p.clubId === me.id && !p.loan && !p.injury && ageOn(p.dob, w.date) >= 18 && ageOn(p.dob, w.date) <= 24).sort((a, b) => a.ovr - b.ovr).slice(0, 3)
const prs = fringe.map((p) => {
  const id = `qa${w.conversations.length}`
  w.conversations.push({ id, playerId: p.id, kind: 'qa', opened: w.date, prompt: '', options: [{ id: 'o', text: '', effect: 'loanList' }] })
  respondConversation(w, id, 'o')
  return w.promises[w.promises.length - 1]
})
for (const pr of prs) ok(pr.kind === 'Loan Move' && pr.deadline >= win.close && diffDays(pr.deadline, win.close) <= 1 && p(pr.playerId).loanListed, `${p(pr.playerId).name} (${p(pr.playerId).ovr}) loan-listed, promise until ${pr.deadline}`)
function p(id: number) { return w.players[id] }

const from = w.date
let guard = 0
while (w.date < addDays(win.close, 8) && guard++ < 200) {
  const r = advance(w, Math.max(1, diffDays(addDays(win.close, 8), w.date)))
  if (r.stop === 'match' && r.fixture) { const sim = createSim(w, r.fixture, true); sim.ctx.assistantSubs = true; afterMatch(w, r.fixture, sim.runToEnd(), worldRng(w)) }
  for (const m of w.inbox) m.read = true
}
checkPromises(w)

// offers for the manager's players: counted, and the promise judged on them (he never answered any)
for (const pr of prs) {
  const pl = p(pr.playerId)
  const offers = Object.values(w.transfers.offers).filter((o) => o.playerId === pl.id && o.type.startsWith('loan') && o.userIsSeller).length
  const expect = (pr.offers || 0) > 0 ? 'broken' : 'lapsed'
  ok(pr.status === expect, `${pl.name}: ${pr.offers} loan offer(s) counted (${offers} on record), promise ${pr.status} (expected ${expect})`)
}

// the AI market
const loans = w.transfers.history.filter((t) => t.type === 'loan' && t.date >= from)
const ai = loans.filter((t) => t.from !== me.id && t.to !== me.id)
const abroad = ai.filter((t) => w.clubs[t.from]?.country !== w.clubs[t.to]?.country)
const young = ai.filter((t) => ageOn(w.players[t.playerId].dob, t.date) < 18)
const ups = ai.filter((t) => (w.clubs[t.to]?.reputation || 0) > (w.clubs[t.from]?.reputation || 0))
ok(ai.length >= 20, `${ai.length} loans between AI clubs in the window`)
ok(young.length === 0, `none under 18 (${young.length})`)
ok(abroad.length <= ai.length * 0.15, `${abroad.length} abroad (${ai.length ? Math.round((abroad.length / ai.length) * 100) : 0}%)`)
ok(ups.length === 0, `never to a club of higher standing (${ups.length})`)
for (const t of abroad) console.log(`     abroad: ${w.players[t.playerId].name} ${w.clubs[t.from]?.short} (${w.clubs[t.from]?.country}, ${w.leagues[w.clubs[t.from]?.leagueId]?.name}) → ${w.clubs[t.to]?.short} (${w.clubs[t.to]?.country})`)
for (const t of ai.slice(0, 8)) {
  const pl = w.players[t.playerId]
  console.log(`     ${t.date} ${pl.name} (${ageOn(pl.dob, t.date)}, ${pl.ovr}) ${w.clubs[t.from]?.short} → ${w.clubs[t.to]?.short}`)
}
console.log(fails ? `${fails} FAILED` : 'all ok')
process.exit(fails ? 1 : 0)
