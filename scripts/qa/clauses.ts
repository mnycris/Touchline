// Delayed money in transfers: a sell-on clause paid out on the player's next sale (and undone with that sale), a loan
// obligation completed as a paid move, an option to buy taken up. npx tsx scripts/qa/clauses.ts <save in an open window>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { submitBid, proposeContract, acceptIncomingBid, exerciseLoanOption } from '../../src/engine/world/userActions'
import { aiBidForUserPlayer, askingPrice, completeLoanPurchase, contractDemand, roleForBuyer } from '../../src/engine/world/transfers'
import { editDealFlags } from '../../src/engine/world/edit'
import { reverseDeal, storiesFor } from '../../src/engine/world/market'
import { Rng } from '../../src/domain/rng'
import { fmtMoney } from '../../src/domain/finance'
import type { World } from '../../src/domain/types'

const w: World = deserialize(fs.readFileSync(process.argv[2]))
w.meta.editMode = true
const me = w.clubs[w.userClubId]
let fails = 0
const ok = (c: boolean, what: string) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`) }
const buy = (p: any, terms: any) => {
  editDealFlags(w, p.id, { willing: true, accept: true })
  const r = submitBid(w, p, terms)
  editDealFlags(w, p.id, { accept: false })
  const d = contractDemand(w, p, me.id, roleForBuyer(w, p, me.id))
  const c = proposeContract(w, r.offerId, p, { ...d, wage: Math.round(d.wage * 1.4), signingBonus: d.signingBonus * 2 }, 1)
  return { r, c }
}
// 1. a 20% sell-on, then he's sold on
const x = Object.values(w.players).filter((p) => p.clubId && p.clubId !== me.id && !p.loan && p.ovr >= 74 && p.ovr <= 78 && p.value < 20e6).sort((a, b) => a.id - b.id)[0]
const orig = w.clubs[x.clubId]
const { c: c1 } = buy(x, { type: 'transfer', fee: Math.round(askingPrice(w, x, me.id) / 1e5) * 1e5, sellOn: 20 })
ok(c1.ok && x.clubId === me.id && x.sellOn?.clubId === orig.id && x.sellOn.pct === 20, `${x.name} signed from ${orig.short} with a sell-on: ${JSON.stringify(x.sellOn)} (${c1.text.slice(0, 50)})`)
const buyer = Object.values(w.clubs).filter((c) => c.id !== me.id && c.id !== orig.id && !c.national && c.leagueId && c.finance.transferBudget > x.value * 2)[0]
aiBidForUserPlayer(w, buyer, x, new Rng(1), undefined, Math.round(x.value * 1.3 / 1e5) * 1e5)
const o = Object.values(w.transfers.offers).find((q) => q.playerId === x.id && q.userIsSeller && q.status === 'Offer Submitted')!
const before = { me: me.finance.balance, orig: orig.finance.balance, origB: orig.finance.transferBudget }
acceptIncomingBid(w, o.id)
const share = Math.round(o.fee * 0.2 / 1e5) * 1e5
ok(x.clubId === buyer.id, `sold to ${buyer.short} for ${fmtMoney(o.fee)}`)
ok(Math.abs(orig.finance.balance - before.orig - share) < 2e5, `${orig.short} received ${fmtMoney(orig.finance.balance - before.orig)} (20% = ${fmtMoney(share)})`)
ok(Math.abs(me.finance.balance - before.me - (o.fee - share)) < 2e5, `${me.short} kept ${fmtMoney(me.finance.balance - before.me)}`)
ok(me.finance.ledger.some((l) => l.label.startsWith('Sell-on to')), 'a ledger line for the sell-on')
ok(!x.sellOn, 'the clause is spent')
// reverse the sale: the payout comes back and so does the clause
const done = storiesFor(w, (s) => s.playerId === x.id && s.to === buyer.id && s.stage === 'done')[0]
const rv = reverseDeal(w, done.id)
ok(rv.ok && x.clubId === me.id, `sale reversed: ${rv.text}`)
ok(Math.abs(orig.finance.balance - before.orig) < 2e5 && Math.abs(orig.finance.transferBudget - before.origB) < 2e5, `${orig.short} back where they were (${fmtMoney(orig.finance.balance - before.orig)})`)
ok(x.sellOn?.clubId === orig.id && x.sellOn.pct === 20, `the clause is back: ${JSON.stringify(x.sellOn)}`)

// 2. a loan with an obligation to buy: completes as a paid move
const y = Object.values(w.players).filter((p) => p.clubId && p.clubId !== me.id && p.clubId !== orig.id && !p.loan && p.ovr >= 72 && p.ovr <= 76 && p.contract.role !== 'Crucial').sort((a, b) => a.id - b.id)[0]
const parent = w.clubs[y.clubId]
const { c: c2 } = buy(y, { type: 'loan-obligation', fee: 0, loanWageSplit: 50, optionFee: 12e6 })
ok(y.clubId === me.id && !!y.loan?.obligation && y.loan.optionFee === 12e6, `${y.name} on loan from ${parent.short} with an obligation (${c2.text.slice(0, 40)})`)
ok(!exerciseLoanOption(w, y).ok, 'no option to take up on an obligation')
const b2 = { me: me.finance.balance, parent: parent.finance.balance }
completeLoanPurchase(w, y)
ok(!y.loan && y.clubId === me.id, 'the loan is now a permanent move')
ok(Math.abs(b2.me - me.finance.balance - 12e6) < 1 && Math.abs(parent.finance.balance - b2.parent - 12e6) < 1, `€12M from ${me.short} to ${parent.short}`)
ok(w.transfers.history[0]?.type === 'loan-buy' && w.transfers.history[0].playerId === y.id, 'recorded as a loan made permanent')

// 3. an option to buy, taken up during the window
const z = Object.values(w.players).filter((p) => p.clubId && ![me.id, orig.id, parent.id].includes(p.clubId) && !p.loan && p.ovr >= 72 && p.ovr <= 76 && p.contract.role !== 'Crucial').sort((a, b) => a.id - b.id)[0]
buy(z, { type: 'loan-option', fee: 0, loanWageSplit: 50, optionFee: 9e6 })
ok(z.clubId === me.id && !!z.loan && !z.loan.obligation && z.loan.optionFee === 9e6, `${z.name} on loan with an option`)
const r3 = exerciseLoanOption(w, z)
ok(r3.ok && !z.loan && z.clubId === me.id, `option taken up: ${r3.text}`)
console.log(fails ? `${fails} FAILED` : 'all ok')
