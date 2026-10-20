// The manager's own business in the transfer feed: his bids, clubs' bids for his players, reports of real interest,
// lapses and withdrawals, all as stories that follow the offers. npx tsx scripts/qa/user-deals.ts <save in an open window>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { advance, afterMatch, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { acceptCounter, acceptIncomingBid, proposeContract, rejectIncomingBid, submitBid } from '../../src/engine/world/userActions'
import { aiBidForUserPlayer, askingPrice, contractDemand, roleForBuyer } from '../../src/engine/world/transfers'
import { aiInterestInUserPlayer, offerStory, storiesFor, userInterestRumour } from '../../src/engine/world/market'
import { rosterOf } from '../../src/engine/world/roster'
import { Rng } from '../../src/domain/rng'
import type { TransferStory, World } from '../../src/domain/types'

const w: World = deserialize(fs.readFileSync(process.argv[2]))
const me = w.userClubId
const rng = new Rng(7)
let fails = 0
const ok = (cond: boolean, what: string) => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`) }
const tell = (s?: TransferStory) => s ? `[${s.stage}] ${s.log.map((l) => `${l.date.slice(5)} ${l.stage}: ${l.note}`).join(' | ')}` : '(no story)'
const days = (n: number) => {
  const until = w.date
  let left = n
  while (left > 0) {
    const r = advance(w, left)
    left -= Math.max(r.days, 0)
    if (r.stop === 'match' && r.fixture) afterMatch(w, r.fixture, simulateFixture(w, r.fixture), worldRng(w))
    if (r.days === 0 && r.stop !== 'match') break
  }
  void until
}
const outfield = (p: { positions: string[] }) => p.positions[0] !== 'GK'
const others = Object.values(w.players).filter((p) => p.clubId && p.clubId !== me && !p.loan && p.ovr >= 74 && p.ovr <= 80 && outfield(p) && p.value < w.clubs[me].finance.transferBudget * 0.4)
  .sort((a, b) => a.id - b.id)

// 1. a bid, a counter, the counter accepted, personal terms: one story from bid to done
const t1 = others.find((p) => submitBid(structuredClone(w), p, { type: 'transfer', fee: Math.round(askingPrice(w, p, me) * 0.8 / 1e5) * 1e5 }).status === 'Counter Offer')
if (t1) {
  const r = submitBid(w, t1, { type: 'transfer', fee: Math.round(askingPrice(w, t1, me) * 0.8 / 1e5) * 1e5 })
  const o = w.transfers.offers[r.offerId]
  ok(offerStory(w, o)?.stage === 'negotiating', `bid then counter → negotiating: ${tell(offerStory(w, o))}`)
  acceptCounter(w, o.id)
  ok(offerStory(w, o)?.stage === 'close', 'counter accepted → close')
  const d = contractDemand(w, t1, me, roleForBuyer(w, t1, me))
  const c = proposeContract(w, o.id, t1, { ...d, wage: Math.round(d.wage * 1.25), signingBonus: d.signingBonus * 1.5 }, 1)
  const s = storiesFor(w, (x) => x.playerId === t1.id && x.to === me)[0]
  ok(c.ok ? s?.stage === 'done' : s?.stage === 'close', `personal terms (${c.ok ? 'agreed' : c.text.slice(0, 60)}) → ${s?.stage}: ${tell(s)}`)
} else ok(false, 'found a target who counters')

// 2. a bid turned down that he never improves: lapses to Failed, not stuck on Negotiating
const t2 = others.find((p) => p.id !== t1?.id && p.clubId !== t1?.clubId)!
const r2 = submitBid(w, t2, { type: 'transfer', fee: Math.round(askingPrice(w, t2, me) * 0.45 / 1e5) * 1e5 })
const o2 = w.transfers.offers[r2.offerId]
console.log(`     lowball for ${t2.name}: ${o2.status}`)
days(12)
ok(o2.status === 'Negotiations Failed' || o2.status === 'Offer Accepted', `ignored bid after 12 days: ${o2.status}`)
ok(['failed', 'close'].includes(offerStory(w, o2)?.stage || ''), `its story: ${tell(offerStory(w, o2))}`)

// 3. a club bids for one of his players; he says no
const mine = rosterOf(w, me).filter((p) => !p.untouchable && p.ovr >= 72).sort((a, b) => b.ovr - a.ovr)
const buyerOf = (p: { value: number }) => Object.values(w.clubs).filter((c) => c.id !== me && !c.national && c.leagueId && c.finance.transferBudget > p.value * 1.4).sort((a, b) => b.reputation - a.reputation)[0]
const s3p = mine[3], b3 = buyerOf(s3p)
aiBidForUserPlayer(w, b3, s3p, rng)
const o3 = Object.values(w.transfers.offers).find((o) => o.playerId === s3p.id && o.userIsSeller && o.status === 'Offer Submitted')!
ok(!!o3 && offerStory(w, o3)?.stage === 'talks', `${b3.short} bid for ${s3p.name} → talks, reply by ${o3?.respondBy}`)
rejectIncomingBid(w, o3.id)
const s3 = storiesFor(w, (x) => x.playerId === s3p.id && x.to === b3.id)[0]
ok(s3?.stage === 'failed' || s3?.stage === 'negotiating', `rejected → ${tell(s3)}`)

// 4. a bid nobody answers: withdrawn, and said so
const s4p = mine[5], b4 = buyerOf(s4p)
aiBidForUserPlayer(w, b4, s4p, rng)
const o4 = Object.values(w.transfers.offers).find((o) => o.playerId === s4p.id && o.userIsSeller && o.status === 'Offer Submitted')!
const by = o4.respondBy
days(9)
ok(o4.status === 'Negotiations Failed', `unanswered bid (reply by ${by}) after 9 days: ${o4.status}`)
ok(offerStory(w, o4)?.stage === 'failed', `its story: ${tell(offerStory(w, o4))}`)
ok(w.inbox.some((m) => m.subject.includes('withdraw')), 'a message says they withdrew it')

// 5. reported interest, then the bid days later
const s5p = mine[6], b5 = buyerOf(s5p)
const rum = aiInterestInUserPlayer(w, b5, s5p, Math.round(s5p.value * 1.1), rng)
ok(rum?.stage === 'rumour' && rum.user === 'sell', `report first: ${tell(rum)}`)
days(6)
const o5 = Object.values(w.transfers.offers).find((o) => o.playerId === s5p.id && o.userIsSeller)
ok(!!o5 && rum!.offerId === o5.id, `the bid follows the report: ${tell(rum)}`)
if (o5 && o5.status === 'Offer Submitted') { acceptIncomingBid(w, o5.id); ok(rum!.stage === 'done' || rum!.stage === 'close', `accepted → ${tell(rum)}`) }

// 6. his own interest gets out (shortlist), and a bid carries the same story on
const t6 = others.filter((p) => ![t1?.id, t2.id].includes(p.id))[3]
w.transfers.shortlist = [t6.id]
for (let k = 0; k < 5; k++) userInterestRumour(w, rng)
const r6 = storiesFor(w, (x) => x.playerId === t6.id && x.to === me)
ok(r6.length === 1 && r6[0].stage === 'rumour' && (r6[0].reliability || 0) <= 2, `shortlisted → one low-reliability rumour: ${tell(r6[0])} (rel ${r6[0]?.reliability})`)
const r6b = submitBid(w, t6, { type: 'transfer', fee: Math.round(askingPrice(w, t6, me) / 1e5) * 1e5 })
const s6 = offerStory(w, w.transfers.offers[r6b.offerId])
ok(s6 === r6[0], `the bid carries the rumour on: ${tell(s6)}`)

// 7. nothing involving his club is run by the AI market
days(20)
const rogue = (w.market?.stories || []).filter((s) => (s.to === me || s.from === me) && s.ai && !s.user)
ok(!rogue.length, `no AI-run stories with ${w.clubs[me].short}: ${rogue.length}`)
const unasked = w.transfers.history.filter((h) => h.date >= '2000' && h.to === me && !Object.values(w.transfers.offers).some((o) => o.playerId === h.playerId && o.userIsBuyer))
console.log(`     signings without an offer of his own: ${unasked.length}`)
console.log(fails ? `${fails} FAILED` : 'all ok')
