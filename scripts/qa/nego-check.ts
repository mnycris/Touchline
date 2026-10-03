// Transfer/negotiation consistency checks on a save:
//  1. players who moved in the last six months are not for sale (seller stance, AI shortlists, papers)
//  2. agent suggestions are honoured; a lower wage with a bigger signing-on fee is not "the same offer again"
//  3. loan talks are about the role, never contract years.  npx tsx scripts/qa/nego-check.ts <save>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { sellerStance, settlingIn, makeOffer, contractDemand, roleForBuyer } from '../../src/engine/world/transfers'
import { openContractTalks, respondToContract } from '../../src/engine/world/negotiation'
import { Rng } from '../../src/domain/rng'
const w = deserialize(fs.readFileSync(process.argv[2]))
const me = w.userClubId
// 1
const recent = Object.values(w.players).filter((p) => p.clubId && p.clubId !== me && settlingIn(w, p) !== undefined && !p.transferListed)
const willing = recent.filter((p) => sellerStance(w, p, me).willing)
console.log(`1. ${recent.length} players who moved in the last six months · ${willing.length} their clubs would sell to you`)
if (recent[0]) console.log('   e.g.', sellerStance(w, recent[0], me).reason)
// 2
let suggested = 0, honoured = 0, falseRepeat = 0, rounds = 0
const pool = Object.values(w.players).filter((p) => p.clubId && p.clubId !== me && p.ovr >= 70 && p.ovr <= 82 && !p.loan).slice(0, 300)
for (const [i, p] of pool.entries()) {
  const rng = new Rng(1000 + i)
  const t = openContractTalks(w, p, 'sign', rng)
  let offer = { ...t.ask, wage: Math.round(t.floor * 0.9), signingBonus: 0 }
  for (let r = 0; r < 6 && t.status === 'open'; r++) {
    const before = t.suggest
    const res = respondToContract(w, t, offer, rng)
    rounds++
    if (before && offer.wage >= before.wage && offer.signingBonus >= (before.bonus || 0) * 0.98) { if (res.result === 'accept') honoured++ }
    if (res.replies.some((x) => /same offer|Nothing has moved|Same numbers/.test(x.text)) && offer.signingBonus > 0) falseRepeat++
    if (t.status !== 'open') break
    if (t.suggest) { suggested++; offer = { ...offer, wage: t.suggest.wage, signingBonus: t.suggest.bonus || 0, years: Math.max(offer.years, t.suggest.years || 0) } }
    else offer = { ...offer, wage: Math.round(offer.wage * 1.04) }
  }
  delete (w.flags.talks as Record<string, unknown>)[t.id]
}
console.log(`2. ${pool.length} negotiations, ${rounds} rounds · agent suggested a structure ${suggested} times · taking it up: ${honoured} accepted · "same offer again" after a bigger signing-on fee: ${falseRepeat}`)
// 3
let loanTalks = 0, years = 0, roleAccept = 0, roleRefuse = 0
const loanPool = Object.values(w.players).filter((p) => p.clubId && p.clubId !== me && !p.loan && ['Crucial', 'Important', 'Rotation'].includes(roleForBuyer(w, p, me))).slice(0, 120)
for (const [i, p] of loanPool.entries()) {
  const rng = new Rng(5000 + i)
  const o = makeOffer(w, { playerId: p.id, fee: 0, type: 'loan', fromClubId: me })
  const t = openContractTalks(w, p, 'sign', rng, o.id)
  loanTalks++
  if (/year/i.test(t.log.map((l) => l.text).join(' '))) years++
  const d = contractDemand(w, p, me, roleForBuyer(w, p, me))
  const low = respondToContract(w, t, { ...d, role: 'Sparingly' }, rng)
  if (/year/i.test(low.replies.map((x) => x.text).join(' '))) years++
  if (t.expectedRole !== 'Sparingly' && t.expectedRole !== 'Prospect' && low.result !== 'accept') roleRefuse++
  if (t.status === 'open') { const ok = respondToContract(w, t, { ...d, role: t.expectedRole }, rng); if (ok.result === 'accept') roleAccept++ }
  delete (w.flags.talks as Record<string, unknown>)[t.id]
  delete w.transfers.offers[o.id]
}
console.log(`3. ${loanTalks} loan talks · lines mentioning years: ${years} · a bench role refused: ${roleRefuse} · the expected role agreed: ${roleAccept}`)
console.log('   opening line e.g.:', (() => { const p = pool[3]; const o = makeOffer(w, { playerId: p.id, fee: 0, type: 'loan', fromClubId: me }); const t = openContractTalks(w, p, 'sign', new Rng(9), o.id); return t.log[0].text })())
