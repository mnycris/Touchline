import { editNegotiation } from './edit'
// Operations the manager performs from the UI. Every function mutates the World
// directly and returns a user-facing outcome; callers persist via the store.
import type { ContractOffer, Player, SquadRole, TransferOffer, World } from '../../domain/types'
import { Rng, clamp } from '../../domain/rng'
import { addDays, ageOn, fmtDate } from '../../domain/dates'
import { fmtMoney, roundValue } from '../../domain/finance'
import { askingPrice, contractDemand, evaluateContract, evaluateOffer, executeTransfer, makeOffer, playerInterest, releasePlayer, roleForBuyer, sellerStance, yearsLeft } from './transfers'
import { rosterOf, setPlayerClub } from './roster'
import { postNews, sendInbox, staffNames } from './messages'
import { currentWindow, isWindowOpen } from '../competitions/calendar'
import { blockedText, openContractTalks, respondToContract, talksBlock, type TalkLine, type Talks } from './negotiation'

export interface Outcome { ok: boolean; text: string; status?: string; counter?: number; demand?: ContractOffer; replies?: TalkLine[] }

/** Open (or resume) personal-terms talks with a player's agent. */
export function startContractTalks(w: World, p: Player, kind: Talks['kind'], offerId?: string): { talks?: Talks; blocked?: string } {
  return withRng(w, (rng) => {
    const b = blockedText(w, p, rng)
    if (b) return { blocked: b }
    return { talks: openContractTalks(w, p, kind, rng, offerId) }
  })
}

function withRng<T>(w: World, fn: (rng: Rng) => T): T {
  const rng = new Rng(w.rng)
  const r = fn(rng)
  w.rng = rng.state
  return r
}

export function wageBill(w: World, clubId = w.userClubId): number {
  return rosterOf(w, clubId).reduce((a, p) => a + (p.loan && p.loan.fromClubId !== clubId ? p.contract.wage * (1 - (p.loan.wageSplit ?? 50) / 100) : p.contract.wage), 0)
}
export function wageRoom(w: World): number {
  const c = w.clubs[w.userClubId]
  return c.finance.wageBudget - wageBill(w)
}

// ---------------------------------------------------------------- squad status
export function setTransferListed(w: World, p: Player, v: boolean) { p.transferListed = v; if (v) { p.loanListed = false; p.untouchable = false } }
export function setLoanListed(w: World, p: Player, v: boolean) { p.loanListed = v; if (v) { p.transferListed = false; p.untouchable = false } }
export function setUntouchable(w: World, p: Player, v: boolean) { p.untouchable = v; if (v) { p.transferListed = false; p.loanListed = false } }
export function setSquadRole(w: World, p: Player, role: SquadRole) {
  const before = p.contract.role
  p.contract.role = role
  const rank = ['Crucial', 'Important', 'Rotation', 'Sparingly', 'Prospect']
  const d = rank.indexOf(before) - rank.indexOf(role)
  if (d !== 0 && role !== 'Prospect') p.morale = clamp(p.morale + d * 6, 0, 100)
}
export function setJersey(w: World, p: Player, n: number): Outcome {
  const clash = rosterOf(w, p.clubId).find((q) => q.id !== p.id && q.jersey === n)
  if (clash) { clash.jersey = p.jersey }
  p.jersey = n
  return { ok: true, text: clash ? `${clash.name} takes #${clash.jersey}` : `#${n} assigned` }
}

export function releaseUserPlayer(w: World, p: Player): Outcome {
  const cost = Math.max(0, p.contract.until - w.season) * p.contract.wage * 52 * 0.5
  releasePlayer(w, p, true)
  for (const s of w.clubs[w.userClubId].sheets) { s.lineup = s.lineup.map((id) => (id === p.id ? 0 : id)); s.bench = s.bench.filter((id) => id !== p.id) }
  return { ok: true, text: `${p.name} released. Severance ${fmtMoney(cost)}.` }
}

export function releaseCost(w: World, p: Player) {
  return Math.max(0, p.contract.until - w.season) * p.contract.wage * 52 * 0.5
}

// ---------------------------------------------------------------- incoming bids (user is seller)
export function acceptIncomingBid(w: World, offerId: string): Outcome {
  const o = w.transfers.offers[offerId]
  const p = o && w.players[o.playerId]
  if (!o || !p || p.clubId !== w.userClubId) return { ok: false, text: 'This offer is no longer valid.' }
  if (!['Offer Submitted', 'Counter Offer'].includes(o.status)) return { ok: false, text: 'This offer has expired.' }
  const buyer = w.clubs[o.fromClubId]
  if (!isWindowOpen(w)) {
    o.status = 'Awaiting Window'
    return { ok: true, text: `Deal agreed. ${p.name} will join ${buyer.short} when the window opens.` }
  }
  executeTransfer(w, o)
  for (const s of w.clubs[w.userClubId].sheets) { s.lineup = s.lineup.map((id) => (id === p.id ? 0 : id)); s.bench = s.bench.filter((id) => id !== p.id) }
  resolveMessages(w, offerId)
  return { ok: true, text: `${p.name} sold to ${buyer.short} for ${fmtMoney(o.fee)}.` }
}

export function rejectIncomingBid(w: World, offerId: string): Outcome {
  const o = w.transfers.offers[offerId]
  const p = o && w.players[o.playerId]
  if (!o || !p) return { ok: false, text: 'Offer not found.' }
  o.status = 'Offer Rejected'
  resolveMessages(w, offerId)
  const buyer = w.clubs[o.fromClubId]
  return withRng(w, (rng) => {
    // a determined club may come back with an improved bid
    if (rng.next() < 0.4 && buyer.finance.transferBudget > o.fee * 1.15) {
      const fee = roundValue(o.fee * (1.1 + rng.next() * 0.12))
      const n = makeOffer(w, { playerId: p.id, fee, type: 'transfer', fromClubId: buyer.id })
      n.userIsBuyer = false; n.userIsSeller = true; n.respondBy = addDays(w.date, 3)
      sendInbox(w, {
        from: staffNames(w).director, fromRole: 'Sporting Director', category: 'Transfers', subject: `Improved offer for ${p.name}`,
        body: `${buyer.name} have come back with an improved offer of ${fmtMoney(fee)} for ${p.name}.`,
        actions: [{ label: 'Accept', action: 'acceptBid', payload: n.id, primary: true }, { label: 'Negotiate', action: 'negotiateBid', payload: n.id }, { label: 'Reject', action: 'rejectBid', payload: n.id, danger: true }],
        playerId: p.id, clubId: buyer.id, image: { kind: 'club', id: buyer.id }, expires: n.respondBy,
      })
      return { ok: true, text: `Offer rejected. ${buyer.short} have returned with ${fmtMoney(fee)}.` }
    }
    return { ok: true, text: `You rejected ${buyer.short}'s offer for ${p.name}.` }
  })
}

/** User counters an AI club's bid with a higher asking fee. */
export function counterIncomingBid(w: World, offerId: string, fee: number): Outcome {
  const o = w.transfers.offers[offerId]
  const p = o && w.players[o.playerId]
  if (!o || !p) return { ok: false, text: 'Offer not found.' }
  const buyer = w.clubs[o.fromClubId]
  return withRng(w, (rng) => {
    // the buyer's hidden ceiling is fixed on the first counter so repeated asks can't ratchet it
    const max = o.sellerFloor ||= roundValue(Math.min(buyer.finance.transferBudget * 1.05, askingPrice(w, p, buyer.id) * (1.02 + rng.next() * 0.2)))
    const used = (o.used ||= [])
    const line = (opts: string[]) => { const fresh = opts.filter((x) => !used.includes(x)); const t = (fresh.length ? fresh : opts)[Math.floor(rng.next() * (fresh.length || opts.length))]; used.push(t); return t }
    o.history.push({ date: w.date, by: 'seller', text: `You ask for ${fmtMoney(fee)}.`, fee })
    if (fee <= max) {
      o.fee = fee
      o.history.push({ date: w.date, by: 'buyer', text: `${buyer.short} agree to pay ${fmtMoney(fee)}.`, fee })
      const r = acceptIncomingBid(w, offerId)
      return { ...r, text: `${line([`Agreed. ${fmtMoney(fee)} it is.`, `You drive a hard bargain. ${fmtMoney(fee)}, done.`, `Our board has approved ${fmtMoney(fee)}. We have a deal.`])} ${r.text}` }
    }
    const gap = fee / max
    o.patience -= gap > 1.6 ? 45 : gap > 1.3 ? 30 : gap > 1.12 ? 18 : 10
    if (o.patience <= 0) {
      o.status = 'Negotiations Failed'
      resolveMessages(w, offerId)
      return { ok: false, text: line([`We're walking away. ${fmtMoney(fee)} is not realistic for ${p.name}.`, `That's too much for us. ${buyer.short} are ending talks and moving on to other targets.`, `We've made our position clear. Good luck selling him elsewhere.`]), status: o.status }
    }
    const counter = roundValue(Math.min(max, o.fee + (fee - o.fee) * (gap > 1.3 ? 0.25 : 0.5)))
    const moved = counter > o.fee
    o.fee = counter
    o.history.push({ date: w.date, by: 'buyer', text: `${buyer.short} improve their offer to ${fmtMoney(counter)}.`, fee: counter })
    const text = !moved
      ? line([`${fmtMoney(counter)} is our limit. We can't go any higher.`, `We won't go beyond ${fmtMoney(counter)}. Take it or leave it.`, `That is our final offer: ${fmtMoney(counter)}.`])
      : gap > 1.3
        ? line([`That valuation is well beyond us. We can stretch to ${fmtMoney(counter)}.`, `Way too high. We'll improve to ${fmtMoney(counter)}, but be realistic.`, `We think you're overvaluing him. ${fmtMoney(counter)} is a strong offer.`])
        : line([`We're getting closer. We can offer ${fmtMoney(counter)}.`, `Let's find a middle ground: ${fmtMoney(counter)}.`, `We'll go to ${fmtMoney(counter)}. We really want him.`, `Revised offer: ${fmtMoney(counter)}. We hope that settles it.`])
    return { ok: false, text: o.patience < 30 ? `${text} Our patience is running out.` : text, counter }
  })
}

function resolveMessages(w: World, offerId: string) {
  for (const m of w.inbox) if (m.actions.some((a) => a.payload === offerId)) { m.resolved = true; m.read = true }
}

// ---------------------------------------------------------------- user buys
export interface BidTerms { type: TransferOffer['type']; fee: number; sellOn?: number; swapPlayerId?: number; loanWageSplit?: number; optionFee?: number }

export function openTalks(w: World, p: Player): Outcome {
  if (p.clubId === w.userClubId) return { ok: false, text: 'He already plays for you.' }
  if (!p.clubId) return { ok: true, text: `${p.name} is a free agent. You can offer him a contract directly.` }
  const stance = sellerStance(w, p, w.userClubId)
  if (!stance.willing) return { ok: false, text: stance.reason || 'Not for sale.' }
  return { ok: true, text: `${w.clubs[p.clubId].short} are willing to discuss a deal.` }
}

/** Live negotiation room: the selling club responds immediately. */
export function submitBid(w: World, p: Player, terms: BidTerms, existing?: string): Outcome & { offerId: string } {
  const club = w.clubs[w.userClubId]
  if (!terms.type.startsWith('loan') && terms.fee > club.finance.transferBudget) return { ok: false, text: `That exceeds your transfer budget of ${fmtMoney(club.finance.transferBudget)}.`, offerId: existing || '' }
  let o = existing ? w.transfers.offers[existing] : undefined
  if (o && ['Offer Rejected', 'Counter Offer', 'Offer Submitted'].includes(o.status)) {
    Object.assign(o, { fee: terms.fee, sellOn: terms.sellOn || 0, swapPlayerId: terms.swapPlayerId, loanWageSplit: terms.loanWageSplit, optionFee: terms.optionFee, type: terms.type, status: 'Offer Submitted' as const })
    o.history.push({ date: w.date, by: 'buyer', text: terms.type.startsWith('loan') ? `Revised loan: ${terms.loanWageSplit ?? 50}% wages` : `Revised bid: ${fmtMoney(terms.fee)}`, fee: terms.fee })
  } else {
    o = makeOffer(w, { playerId: p.id, ...terms, patience: 100 })
  }
  const offer = o
  // Edit Mode override: the selling club agrees to this bid
  const forced = w.meta.editMode && w.flags.editAccept?.[p.id]
  const res = forced ? (editNegotiation(w, offer.id, { accept: true }), 'accept' as const) : withRng(w, (rng) => evaluateOffer(w, offer, rng))
  const last = offer.history[offer.history.length - 1]
  const t = w.transfers.targets[p.id]
  if (t) t.status = offer.status
  if (res === 'accept') return { ok: true, text: last.text, status: offer.status, offerId: offer.id }
  if (res === 'counter') return { ok: false, text: last.text, status: offer.status, counter: offer.counterFee, offerId: offer.id }
  return { ok: false, text: last.text, status: offer.status, offerId: offer.id }
}

export function acceptCounter(w: World, offerId: string): Outcome {
  const o = w.transfers.offers[offerId]
  if (!o || o.status !== 'Counter Offer' || !o.counterFee) return { ok: false, text: 'The counter-offer is no longer available.' }
  const club = w.clubs[w.userClubId]
  if (o.counterFee > club.finance.transferBudget) return { ok: false, text: `You can't afford ${fmtMoney(o.counterFee)} (budget ${fmtMoney(club.finance.transferBudget)}).` }
  o.fee = o.counterFee
  o.status = 'Offer Accepted'
  o.history.push({ date: w.date, by: 'buyer', text: `You accept ${fmtMoney(o.fee)}.`, fee: o.fee })
  const t = w.transfers.targets[o.playerId]
  if (t) t.status = o.status
  resolveMessages(w, offerId)
  return { ok: true, text: `Fee agreed at ${fmtMoney(o.fee)}. Open contract talks with the player.` }
}

/** Contract talks with a transfer target (offer accepted, free agent or pre-contract). */
export function proposeContract(w: World, offerId: string | undefined, p: Player, c: ContractOffer, attempt: number): Outcome {
  const club = w.clubs[w.userClubId]
  const isLoan = offerId ? w.transfers.offers[offerId]?.type.startsWith('loan') : false
  if (!isLoan && c.wage > wageRoom(w) + (p.clubId === club.id ? p.contract.wage : 0)) return { ok: false, text: `The wage exceeds your remaining weekly wage budget (${fmtMoney(Math.max(0, wageRoom(w)))}).` }
  if (c.signingBonus > club.finance.balance) return { ok: false, text: 'The club cannot afford that signing bonus.' }
  if (talksBlock(w, p.id)) return { ok: false, text: withRng(w, (rng) => blockedText(w, p, rng)) || 'Talks are frozen.', status: 'reject' }
  void attempt
  const r = withRng(w, (rng) => respondToContract(w, openContractTalks(w, p, 'sign', rng, offerId), c, rng))
  if (r.result !== 'accept') return { ok: false, text: r.replies.map((x) => x.text).join(' '), status: r.result === 'walk' ? 'reject' : 'counter', demand: r.talks.ask, replies: r.replies }
  // agreement
  let o = offerId ? w.transfers.offers[offerId] : undefined
  if (!o) {
    const precontract = !!p.clubId && yearsLeft(w, p) <= 1 && w.date >= `${w.season + 1}-01-01`
    o = makeOffer(w, { playerId: p.id, fee: 0, type: precontract ? 'pre-contract' : 'free' })
  }
  o.contractTerms = c
  if (o.type === 'pre-contract') {
    o.status = 'Pre-Contract'
    const t = w.transfers.targets[p.id]; if (t) t.status = 'Pre-Contract'
    postNews(w, { headline: `${p.name} agrees pre-contract with ${club.short}`, body: `${p.name} will join ${club.name} on a free transfer when his contract with ${w.clubs[p.clubId]?.name} expires in the summer.`, kind: 'transfer', playerIds: [p.id], clubIds: [club.id, p.clubId], importance: 3, userRelated: true })
    return { ok: true, text: `${p.name} has agreed a pre-contract and will join on 1 July.`, status: 'accept' }
  }
  if (!isWindowOpen(w) && p.clubId) {
    o.status = 'Awaiting Window'
    const t = w.transfers.targets[p.id]; if (t) t.status = 'Awaiting Window'
    const next = w.windows.map((x) => x.open).filter((d) => d > w.date).sort()[0]
    return { ok: true, text: `Agreed! ${p.name} will join when the window opens${next ? ` on ${fmtDate(next, 'dm')}` : ''}.`, status: 'accept' }
  }
  executeTransfer(w, o, c)
  return { ok: true, text: `${p.name} has signed for ${club.short}!`, status: 'accept' }
}

export function renewContract(w: World, p: Player, c: ContractOffer, attempt: number): Outcome {
  if (c.wage - p.contract.wage > wageRoom(w)) return { ok: false, text: `The raise exceeds your wage budget (room ${fmtMoney(Math.max(0, wageRoom(w)))}/wk).` }
  if (talksBlock(w, p.id)) return { ok: false, text: withRng(w, (rng) => blockedText(w, p, rng)) || 'Talks are frozen.', status: 'reject' }
  void attempt
  const r = withRng(w, (rng) => respondToContract(w, openContractTalks(w, p, 'renew', rng), c, rng))
  if (r.result !== 'accept') return { ok: false, text: r.replies.map((x) => x.text).join(' '), status: r.result === 'walk' ? 'reject' : 'counter', demand: r.talks.ask, replies: r.replies }
  const club = w.clubs[w.userClubId]
  p.contract = { until: w.season + c.years, wage: c.wage, role: c.role, releaseClause: c.releaseClause, signedOn: w.date, signingBonus: c.signingBonus, bonuses: { goal: c.bonusGoal, cleanSheet: c.bonusCleanSheet, appearance: c.bonusApp } }
  p.wage = c.wage
  p.morale = clamp(p.morale + 10, 0, 100)
  if (c.signingBonus) { club.finance.balance -= c.signingBonus; club.finance.ledger.push({ date: w.date, label: `Loyalty bonus: ${p.name}`, amount: -c.signingBonus, kind: 'bonus' }) }
  ;(w.flags.renewed ||= {})[p.id] = w.date
  if (p.ovr >= 78) postNews(w, { headline: `${p.name} commits future to ${club.short}`, body: `${p.name} has signed a new contract with ${club.name} running until ${c.years + w.season + 1 - 1 === w.season ? '' : `June ${w.season + c.years + 1}`}.`, kind: 'contract', playerIds: [p.id], clubIds: [club.id], importance: 3, userRelated: true })
  return { ok: true, text: `${p.name} signs a new deal until ${w.season + c.years + 1}.`, status: 'accept' }
}

export function renewalDemand(w: World, p: Player): ContractOffer {
  const role = roleForBuyer(w, p, w.userClubId)
  const d = contractDemand(w, p, w.userClubId, role)
  d.wage = Math.max(d.wage, Math.round(p.contract.wage * 1.05 / 100) * 100)
  return d
}

// ---------------------------------------------------------------- delegation & pending deals
export function delegateTransfer(w: World, p: Player, maxFee: number, type: 'transfer' | 'loan'): Outcome {
  const club = w.clubs[w.userClubId]
  if (type === 'transfer' && maxFee > club.finance.transferBudget) return { ok: false, text: 'Maximum fee exceeds your transfer budget.' }
  ;(w.flags.delegated ||= {})[p.id] = { maxFee, type, date: addDays(w.date, 2) }
  const t = w.transfers.targets[p.id] || (w.transfers.targets[p.id] = { playerId: p.id, added: w.date, status: 'Club Approached' })
  t.status = 'Club Approached'
  return { ok: true, text: `${staffNames(w).director} will negotiate for ${p.name} (max ${fmtMoney(maxFee)}) and report back.` }
}

/** Daily: delegated talks, deals waiting for the window, pre-contracts, loan & listed-player interest. */
export function processPendingDeals(w: World, rng: Rng) {
  const staff = staffNames(w)
  const club = w.clubs[w.userClubId]
  if (!club || w.flags.unemployed) return
  const open = isWindowOpen(w)
  // delegated negotiations
  const del = w.flags.delegated as Record<number, { maxFee: number; type: string; date: string }> | undefined
  if (del) for (const [idStr, d] of Object.entries(del)) {
    if (w.date < d.date) continue
    delete del[Number(idStr)]
    const p = w.players[Number(idStr)]
    if (!p || p.clubId === club.id) continue
    let fee = d.type === 'loan' ? 0 : roundValue(Math.min(d.maxFee, askingPrice(w, p, club.id) * 0.85))
    let o: TransferOffer | undefined
    let res = 'reject'
    for (let round = 0; round < 3; round++) {
      o = o || makeOffer(w, { playerId: p.id, fee, type: d.type === 'loan' ? 'loan' : 'transfer', loanWageSplit: d.type === 'loan' ? 60 : undefined, delegated: true })
      o.fee = fee
      res = evaluateOffer(w, o, rng)
      if (res === 'accept' || res === 'walk') break
      if (res === 'counter' && o.counterFee! <= d.maxFee) { o.fee = o.counterFee!; o.status = 'Offer Accepted'; res = 'accept'; break }
      fee = roundValue(Math.min(d.maxFee, fee * 1.12))
      o.status = 'Offer Submitted'
    }
    if (res === 'accept' && o) {
      const demand = contractDemand(w, p, club.id, roleForBuyer(w, p, club.id))
      const ok = demand.wage <= wageRoom(w) && playerInterest(w, p, club.id) >= 30
      if (ok) {
        if (open) executeTransfer(w, o, demand)
        else { o.contractTerms = demand; o.status = 'Awaiting Window' }
        sendInbox(w, { from: staff.director, fromRole: 'Sporting Director', category: 'Transfers', subject: `Deal done: ${p.name}`, body: `I've agreed a ${d.type === 'loan' ? 'loan' : `fee of ${fmtMoney(o.fee)}`} with ${w.clubs[o.toClubId]?.name} and personal terms of ${fmtMoney(demand.wage)}/wk over ${demand.years} years.${open ? '' : ' He joins when the window opens.'}`, actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id, primary: true }], playerId: p.id, image: { kind: 'player', id: p.id } })
        continue
      }
      o.status = 'Negotiations Failed'
      sendInbox(w, { from: staff.director, fromRole: 'Sporting Director', category: 'Transfers', subject: `${p.name}: personal terms failed`, body: `The clubs agreed a fee, but ${p.name}'s demands (${fmtMoney(demand.wage)}/wk) were beyond what we can offer.`, actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id }], playerId: p.id })
      continue
    }
    sendInbox(w, { from: staff.director, fromRole: 'Sporting Director', category: 'Transfers', subject: `No deal for ${p.name}`, body: `${w.clubs[p.clubId]?.name} would not accept an offer within your limit of ${fmtMoney(d.maxFee)}. ${o?.history[o.history.length - 1]?.text || ''}`, actions: [{ label: 'Negotiate Yourself', action: 'openOffer', payload: p.id, primary: true }], playerId: p.id })
  }
  // deals waiting for the window to open
  if (open) for (const o of Object.values(w.transfers.offers)) {
    if (o.status !== 'Awaiting Window') continue
    const p = w.players[o.playerId]
    if (!p || p.clubId !== o.toClubId) { o.status = 'Negotiations Failed'; continue }
    executeTransfer(w, o, o.contractTerms)
    if (o.userIsSeller) for (const s of club.sheets) { s.lineup = s.lineup.map((id) => (id === p.id ? 0 : id)); s.bench = s.bench.filter((id) => id !== p.id) }
  }
  // pre-contracts complete on 1 July
  if (w.date.slice(5) === '07-01') for (const o of Object.values(w.transfers.offers)) {
    if (o.status !== 'Pre-Contract') continue
    const p = w.players[o.playerId]
    if (!p) continue
    o.fee = 0
    o.toClubId = p.clubId
    executeTransfer(w, o, o.contractTerms)
  }
  // interest in listed players
  if (open) {
    const listed = rosterOf(w, club.id).filter((p) => p.transferListed || p.loanListed)
    for (const p of listed) {
      if (Object.values(w.transfers.offers).some((o) => o.playerId === p.id && o.userIsSeller && ['Offer Submitted', 'Counter Offer'].includes(o.status))) continue
      if (rng.next() > (p.loanListed ? 0.06 : 0.05)) continue
      const age = ageOn(p.dob, w.date)
      const suitors = Object.values(w.clubs).filter((c) => c.id !== club.id && c.leagueId && Math.abs(c.squadAvg - p.ovr) <= 6 && (p.loanListed ? c.reputation <= club.reputation : c.finance.transferBudget > p.value * 0.7))
      if (!suitors.length) continue
      const buyer = rng.pick(suitors)
      const loan = p.loanListed
      const fee = loan ? 0 : roundValue(askingPrice(w, p, buyer.id) * (0.72 + rng.next() * 0.3))
      const o = makeOffer(w, { playerId: p.id, fee, type: loan ? 'loan' : 'transfer', fromClubId: buyer.id, loanWageSplit: loan ? rng.pick([50, 75, 100]) : undefined })
      o.userIsBuyer = false; o.userIsSeller = true; o.respondBy = addDays(w.date, 3)
      sendInbox(w, {
        from: staff.director, fromRole: 'Sporting Director', category: 'Transfers', subject: loan ? `Loan offer for ${p.name}` : `Offer received for ${p.name}`,
        body: loan ? `${buyer.name} want to take ${p.name} (${age}) on loan until the end of the season, covering ${o.loanWageSplit}% of his wages. It would give him regular football.` : `${buyer.name} have bid ${fmtMoney(fee)} for ${p.name}. His market value is ${fmtMoney(p.value)}.`,
        actions: [{ label: 'Accept', action: 'acceptBid', payload: o.id, primary: true }, ...(loan ? [] : [{ label: 'Negotiate', action: 'negotiateBid', payload: o.id }]), { label: 'Reject', action: 'rejectBid', payload: o.id, danger: true }],
        playerId: p.id, clubId: buyer.id, image: { kind: 'club', id: buyer.id }, expires: o.respondBy,
      })
    }
  }
}

export function recallLoan(w: World, p: Player): Outcome {
  if (!p.loan || p.loan.fromClubId !== w.userClubId) return { ok: false, text: 'Not one of your loanees.' }
  if (!isWindowOpen(w)) return { ok: false, text: 'Loans can only be recalled during a transfer window.' }
  const host = w.clubs[p.clubId]
  p.loan = undefined
  setPlayerClub(w, p, w.userClubId)
  w.transfers.history.unshift({ date: w.date, playerId: p.id, playerName: p.name, from: host?.id || 0, to: w.userClubId, fee: 0, type: 'loan-return', season: w.season })
  return { ok: true, text: `${p.name} recalled from ${host?.short}.` }
}

export function loanedOut(w: World): Player[] {
  return Object.values(w.players).filter((p) => p.loan?.fromClubId === w.userClubId)
}

export function windowLabel(w: World): string {
  const win = currentWindow(w)
  if (win) return `${win.name} window open until ${fmtDate(win.close, 'long')}`
  const next = w.windows.filter((x) => x.open > w.date).sort((a, b) => a.open.localeCompare(b.open))[0]
  return next ? `${next.name} window opens ${fmtDate(next.open, 'long')}` : 'Window closed'
}
