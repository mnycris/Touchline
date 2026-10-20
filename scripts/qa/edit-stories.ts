// Edit Mode on transfer stories: stages, the player's mind, freezing, forcing a deal through and reversing it, and the
// manager's own deals edited through their offer. npx tsx scripts/qa/edit-stories.ts <save with a busy feed>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { editStory, editUserDeal, marketDaily, offerStory, reverseDeal, storiesFor, story } from '../../src/engine/world/market'
import { aiBidForUserPlayer, askingPrice } from '../../src/engine/world/transfers'
import { submitBid } from '../../src/engine/world/userActions'
import { rosterOf } from '../../src/engine/world/roster'
import { addDays } from '../../src/domain/dates'
import { Rng } from '../../src/domain/rng'
import type { TransferStory, World } from '../../src/domain/types'

const w: World = deserialize(fs.readFileSync(process.argv[2]))
const me = w.userClubId
let fails = 0
const ok = (cond: boolean, what: string) => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`) }
const tell = (s?: TransferStory) => s ? `[${s.stage}] ${s.log.slice(-2).map((l) => `${l.stage}: ${l.note}`).join(' | ')}` : '(no story)'
const aiOpen = (stage: string) => storiesFor(w, (s) => !s.user && s.stage === stage && !!w.players[s.playerId] && !!w.clubs[s.from])
const day = (n: number) => { const rng = new Rng(11); for (let i = 0; i < n; i++) { w.date = addDays(w.date, 1); marketDaily(w, rng) } }

// 1. paper talk made real, then a rumour moved on by hand
const r = aiOpen('rumour').find((s) => (s.ai?.round ?? 0) < 0) || aiOpen('rumour')[0]
editStory(w, r.id, { real: true })
ok((r.ai?.round ?? -1) >= 0, `rumour made real: round ${r.ai?.round}`)
editStory(w, r.id, { source: 'Transfer Wire' })
ok(r.source === 'Transfer Wire' && !!r.reliability, `source changed: ${r.source} ${r.reliability}/5`)
editStory(w, r.id, { stage: 'talks' })
ok(r.stage === 'talks', `moved to talks: ${tell(r)}`)

// 2. he refuses to go: the next step ends it
const a = aiOpen('talks').find((s) => s.id !== r.id) || r
editStory(w, a.id, { mood: 'against' })
editStory(w, a.id, { advanceNow: true })
ok(a.stage === 'failed', `refuses to go → ${tell(a)}`)

// 3. frozen: nothing moves for ten days, then it carries on
const f = aiOpen('negotiating')[0] || aiOpen('talks')[0]
const was = f.stage, logs = f.log.length
editStory(w, f.id, { freeze: true })
day(10)
ok(f.stage === was && f.log.length === logs, `frozen at ${was} for 10 days: ${f.stage}, ${f.log.length - logs} new updates`)
editStory(w, f.id, { freeze: false, nextIn: 0 })
day(3)
ok(f.stage !== was || f.log.length > logs, `unfrozen, it moves again: ${tell(f)}`)

// 4. forced through, then reversed: everything back as it was
const c = aiOpen('negotiating').find((s) => s.kind === 'transfer' && s.id !== f.id) || aiOpen('rumour').find((s) => s.kind === 'transfer')!
const p = w.players[c.playerId]
const fromId = p.clubId, buyer = w.clubs[c.to], seller = w.clubs[fromId]
const before = { bal: buyer.finance.balance, sBal: seller.finance.balance, wage: p.contract.wage, until: p.contract.until }
editStory(w, c.id, { fee: Math.round(p.value / 1e5) * 1e5 })
editStory(w, c.id, { stage: 'done' })
ok(c.stage === 'done' && p.clubId === c.to, `completed by hand: ${p.name} now at ${w.clubs[p.clubId]?.short}`)
const rev = reverseDeal(w, c.id)
ok(rev.ok && p.clubId === fromId, `reversed: ${rev.text} · back at ${w.clubs[p.clubId]?.short}`)
ok(buyer.finance.balance === before.bal && seller.finance.balance === before.sBal && p.contract.wage === before.wage && p.contract.until === before.until, `money and contract restored (${buyer.finance.balance - before.bal}, ${seller.finance.balance - before.sBal})`)

// 5. the manager's own bid: the selling club's answer is set by hand
const target = Object.values(w.players).filter((x) => x.clubId && x.clubId !== me && !x.loan && x.ovr >= 70 && x.value < w.clubs[me].finance.transferBudget * 0.3).sort((x, y) => x.id - y.id)[0]
const bid = submitBid(w, target, { type: 'transfer', fee: Math.round(askingPrice(w, target, me) * 0.5 / 1e5) * 1e5 })
const o = w.transfers.offers[bid.offerId]
const os = offerStory(w, o)!
ok(!!os, `his bid has a story: ${tell(os)}`)
ok(!editStory(w, os.id, { stage: 'close' }).ok, 'the stage of an offer-linked story can’t be set directly')
editUserDeal(w, os.id, { counter: Math.round(target.value * 1.2 / 1e5) * 1e5 })
ok(o.status === 'Counter Offer' && os.stage === 'negotiating', `they counter → ${o.status}, ${tell(os)}`)
editUserDeal(w, os.id, { answer: 'accept' })
ok(o.status === 'Offer Accepted' && os.stage === 'close', `they accept → ${o.status}, ${tell(os)}`)

// 6. a club's bid for his player: raised, given a deadline, then withdrawn
const mine = rosterOf(w, me).filter((x) => !x.untouchable && x.ovr >= 70).sort((x, y) => y.ovr - x.ovr)[2]
const club = Object.values(w.clubs).filter((x) => x.id !== me && !x.national && x.leagueId && x.finance.transferBudget > mine.value * 1.5).sort((x, y) => y.reputation - x.reputation)[3]
aiBidForUserPlayer(w, club, mine, new Rng(3))
const inc = Object.values(w.transfers.offers).find((x) => x.playerId === mine.id && x.userIsSeller && x.status === 'Offer Submitted')
if (inc) {
  const is = offerStory(w, inc)!
  ok(!!is, `${club.short}'s bid for ${mine.name} has a story: ${tell(is)}`)
  editUserDeal(w, is.id, { fee: inc.fee + 5_000_000, replyIn: 2 })
  ok(inc.respondBy === addDays(w.date, 2), `reply window set to 2 days: ${inc.respondBy}`)
  editUserDeal(w, is.id, { withdraw: true })
  ok(inc.status === 'Negotiations Failed' && is.stage === 'failed', `withdrawn → ${inc.status}, ${tell(is)}`)
  ok(!w.inbox.some((m) => !m.resolved && m.actions.some((x) => x.payload === inc.id)), 'its inbox message is closed')
} else ok(false, `${club?.short} made a bid for ${mine?.name}`)

void story
console.log(fails ? `${fails} FAILED` : 'all ok')
process.exit(fails ? 1 : 0)
