import type { Club, ContractOffer, Player, SquadRole, TransferOffer, TransferRecord, World } from '../../domain/types'
import { Rng, clamp, hashString } from '../../domain/rng'
import { addDays, ageOn, diffDays, fmtDate } from '../../domain/dates'
import { POS_GROUP } from '../../domain/constants'
import { dynamicValue, fmtMoney, roundValue, wageDemand } from '../../domain/finance'
import { allPlayers, rosterOf, setPlayerClub, touchRoster } from './roster'
import { postNews, sendInbox, staffNames } from './messages'
import { isWindowOpen } from '../competitions/calendar'
import { emptyLine } from './matchRunner'
import { bidBlock, clubLine, clubRelation, adjustRelation, sellerFloor, snubPenalty } from './negotiation'
import { callName } from '../match/commentary'
import { posRating } from '../../domain/ratings'
import { finStyle, planRole, squadPlan, STYLE_REINVEST, type FinStyle, type PlanNeed, type SquadPlan } from './squadPlan'
import { isOpen, moveAppeal, notable, paperTalk, recordDone, startPursuit, storiesFor } from './market'

// how much above market value a club asks for a player, by his importance to them
const ROLE_MULT: Record<SquadRole, number> = { Crucial: 1.35, Important: 1.2, Rotation: 1.05, Sparingly: 0.9, Prospect: 1.15 }

export function yearsLeft(w: World, p: Player): number {
  const seasonEndYear = w.season + 1
  return p.contract.until - seasonEndYear + 1
}

export function askingPrice(w: World, p: Player, buyerId?: number): number {
  const club = w.clubs[p.clubId]
  if (!club) return 0
  // current market value (anchored to the real valuation, with contract length, form and injuries applied)
  let v = dynamicValue(p, w.date, p.valueCalib ?? 1)
  v *= ROLE_MULT[p.contract.role] || 1.2
  const yl = yearsLeft(w, p)
  if (yl === 2) v *= 0.92
  else if (yl >= 4) v *= 1.05
  if (p.transferListed) v *= 0.82
  if (buyerId && club.rivals.some((r) => r[0] === buyerId)) v *= 1.15
  v *= 0.95 + club.prestige.intl * 0.012
  if (settlingIn(w, p) !== undefined) v *= 1.25
  if (buyerId) v *= 1 - clubRelation(w, club.id) / 500
  if (w.settings.transferDifficulty === 'Hard') v *= 1.12
  if (w.settings.transferDifficulty === 'Easy') v *= 0.9
  // Edit Mode selling stance
  if (club.market?.sell === -1) v *= 1.35
  else if (club.market?.sell === 1) v *= 0.85
  if (p.contract.releaseClause && v > p.contract.releaseClause) v = p.contract.releaseClause
  return roundValue(v)
}

/** Days a signing needs before he can be sold on: clubs don't turn a new signing round within six months. */
export const SETTLE_DAYS = 183
/** Last permanent move into his current club for each player, from the career's own transfer record (the database's
 *  join dates can't be used: most players carry the date the data was taken). Rebuilt when the record grows. */
const movedCache = new WeakMap<World, { n: number; at: Map<number, string> }>()
function lastMove(w: World, id: number): string | undefined {
  const h = w.transfers.history
  let c = movedCache.get(w)
  if (!c || c.n !== h.length) {
    const at = new Map<number, string>()
    for (const t of h) if (t.type === 'transfer' || t.type === 'free' || t.type === 'loan-buy') at.set(t.playerId, t.date)
    c = { n: h.length, at }
    movedCache.set(w, c)
  }
  return c.at.get(id)
}
/** Days since a player's last permanent move in this career (free agents and loanees excluded). */
export function daysSinceMove(w: World, p: Player): number | undefined {
  if (!p.clubId || p.loan) return undefined
  const d0 = lastMove(w, p.id)
  return d0 ? diffDays(w.date, d0) : undefined
}
/** Days since a player's last move, when that is within the settling-in period. */
export function settlingIn(w: World, p: Player): number | undefined {
  const d = daysSinceMove(w, p)
  return d !== undefined && d < SETTLE_DAYS ? d : undefined
}
/** The date a player's settling-in period ends, if he is in one. */
export function settledOn(w: World, p: Player): string | undefined {
  const d = settlingIn(w, p)
  return d === undefined ? undefined : addDays(w.date, SETTLE_DAYS - d)
}

/** Would the selling club even consider selling? */
export function sellerStance(w: World, p: Player, buyerId: number): { willing: boolean; reason?: string } {
  const club = w.clubs[p.clubId]
  if (!club) return { willing: true }
  if (w.meta.editMode && w.flags.editWilling?.[p.id]) return { willing: true }
  if (p.untouchable) return { willing: false, reason: `${club.short} consider ${p.name} untouchable.` }
  if (club.market?.sell === 1 && club.id !== w.userClubId) return { willing: true }
  if (club.market?.sell === -1 && club.id !== w.userClubId && (p.contract.role === 'Crucial' || p.contract.role === 'Important')) return { willing: false, reason: `${club.short} are not selling their key players.` }
  const blocked = buyerId === w.userClubId ? bidBlock(w, p.id) : undefined
  if (blocked) return { willing: false, reason: `${club.short} refuse to discuss ${p.name} again until ${fmtDate(blocked.until, 'dm')} after the last talks collapsed.` }
  // a new signing is not for sale in his first six months, unless the club itself has put him on the list
  const settled = settledOn(w, p)
  if (settled && !p.transferListed) return { willing: false, reason: `${p.name} only joined ${club.short} on ${fmtDate(addDays(settled, -SETTLE_DAYS), 'dm')}. They won't consider selling him before ${fmtDate(settled, 'dm')}.` }
  const buyer = w.clubs[buyerId]
  const squad = rosterOf(w, club.id)
  const samePos = squad.filter((q) => POS_GROUP[q.positions[0]] === POS_GROUP[p.positions[0]] && q.id !== p.id).length
  if (samePos < 3 && p.contract.role === 'Crucial') return { willing: false, reason: `${club.short} have no cover for ${p.name}.` }
  if (p.contract.role === 'Crucial' && buyer && buyer.reputation < club.reputation - 5 && !p.contract.releaseClause) return { willing: false, reason: `${club.short} will not sell a key player to a smaller club.` }
  return { willing: true }
}

/** Player's interest in joining a club (0..100): his whole career picture (see moveAppeal), plus, for the
 *  manager's club, the manager's own standing and any snub he remembers. */
export function playerInterest(w: World, p: Player, clubId: number): number {
  const to = w.clubs[clubId]
  if (!to) return 0
  let s = 52 + moveAppeal(w, p, clubId).score * 0.9
  if (to.id === w.userClubId) s += (w.user.reputation - 50) * 0.25 - snubPenalty(w, p.id)
  return clamp(Math.round(s), 0, 100)
}

export function roleForBuyer(w: World, p: Player, clubId: number): SquadRole {
  const squad = rosterOf(w, clubId).filter((q) => q.id !== p.id).sort((a, b) => b.ovr - a.ovr)
  const rank = squad.filter((q) => q.ovr > p.ovr).length
  const age = ageOn(p.dob, w.date)
  if (age <= 20 && p.pot - p.ovr >= 8 && rank > 8) return 'Prospect'
  if (rank < 3) return 'Crucial'
  if (rank < 9) return 'Important'
  if (rank < 16) return 'Rotation'
  return 'Sparingly'
}

export function contractDemand(w: World, p: Player, clubId: number, role: SquadRole): ContractOffer {
  const club = w.clubs[clubId]
  const wage = wageDemand(p, club, w.leagues[club.leagueId], role, w.date)
  const age = ageOn(p.dob, w.date)
  const years = age <= 23 ? 5 : age <= 27 ? 4 : age <= 30 ? 3 : age <= 32 ? 2 : 1
  return {
    wage, years, role, signingBonus: roundValue(wage * (3 + p.intlRep * 1.5)), releaseClause: 0,
    bonusGoal: POS_GROUP[p.positions[0]] === 'ATT' ? roundValue(wage * 0.08) : 0,
    bonusCleanSheet: POS_GROUP[p.positions[0]] === 'GK' || POS_GROUP[p.positions[0]] === 'DEF' ? roundValue(wage * 0.06) : 0,
    bonusApp: roundValue(wage * 0.04),
  }
}

// ---------------------------------------------------------------- user offers
export function makeOffer(w: World, o: Partial<TransferOffer> & { playerId: number; fee: number; type: TransferOffer['type'] }): TransferOffer {
  const p = w.players[o.playerId]
  const offer: TransferOffer = {
    id: `o${w.nextIds.offer++}`, playerId: p.id, fromClubId: o.fromClubId ?? w.userClubId, toClubId: p.clubId, type: o.type,
    fee: o.fee, sellOn: o.sellOn || 0, swapPlayerId: o.swapPlayerId, loanWageSplit: o.loanWageSplit, loanUntil: o.loanUntil,
    optionFee: o.optionFee, status: 'Offer Submitted', history: [{ date: w.date, by: 'buyer', text: offerText(w, o as TransferOffer), fee: o.fee }],
    patience: o.patience ?? 100, created: w.date, respondBy: addDays(w.date, 1), userIsBuyer: (o.fromClubId ?? w.userClubId) === w.userClubId,
    userIsSeller: p.clubId === w.userClubId, delegated: o.delegated,
  }
  w.transfers.offers[offer.id] = offer
  if (offer.userIsBuyer) {
    w.transfers.targets[p.id] = { playerId: p.id, added: w.transfers.targets[p.id]?.added || w.date, status: 'Offer Submitted', offerId: offer.id }
  }
  return offer
}

function offerText(w: World, o: TransferOffer) {
  const swap = o.swapPlayerId ? ` + ${w.players[o.swapPlayerId]?.name}` : ''
  if (o.type.startsWith('loan')) return `Loan offer${o.optionFee ? ` with ${o.type === 'loan-obligation' ? 'obligation' : 'option'} to buy for ${fmtMoney(o.optionFee)}` : ''}, ${o.loanWageSplit ?? 50}% wages`
  return `${fmtMoney(o.fee)}${swap}${o.sellOn ? `, ${o.sellOn}% sell-on` : ''}`
}

/** Selling club (AI) evaluates an offer. Mutates the offer with the response. */
export function evaluateOffer(w: World, o: TransferOffer, rng: Rng): 'accept' | 'counter' | 'reject' | 'walk' {
  const p = w.players[o.playerId]
  if (!p || p.clubId !== o.toClubId) { o.status = 'Negotiations Failed'; return 'walk' }
  const stance = sellerStance(w, p, o.fromClubId)
  const seller = w.clubs[o.toClubId]
  if (!stance.willing) {
    o.status = 'Offer Rejected'
    o.history.push({ date: w.date, by: 'seller', text: stance.reason || 'Not for sale.' })
    o.patience -= 40
    return o.patience <= 0 ? 'walk' : 'reject'
  }
  if (o.type.startsWith('loan')) {
    const age = ageOn(p.dob, w.date)
    const ok = (p.contract.role === 'Sparingly' || p.contract.role === 'Prospect' || p.loanListed || (p.contract.role === 'Rotation' && age <= 23)) && (o.loanWageSplit ?? 50) >= 40
    if (ok) { o.status = 'Offer Accepted'; o.history.push({ date: w.date, by: 'seller', text: `${seller.short} accept the loan proposal.` }); return 'accept' }
    o.status = 'Offer Rejected'
    o.history.push({ date: w.date, by: 'seller', text: `${seller.short} are not prepared to loan ${p.name}.` })
    o.patience -= 30
    return 'reject'
  }
  const ask = askingPrice(w, p, o.fromClubId)
  const floor = sellerFloor(w, o, ask, rng)
  let offered = o.fee + (o.sellOn ? ask * o.sellOn / 100 * 0.35 : 0)
  if (o.swapPlayerId) {
    const sp = w.players[o.swapPlayerId]
    if (sp) offered += sp.value * (seller.squadAvg <= sp.ovr + 2 ? 0.9 : 0.5)
  }
  if (p.contract.releaseClause && o.fee >= p.contract.releaseClause) {
    o.status = 'Offer Accepted'
    o.history.push({ date: w.date, by: 'seller', text: `Release clause of ${fmtMoney(p.contract.releaseClause)} met. ${seller.short} have no choice but to let him talk to you.` })
    return 'accept'
  }
  o.round = (o.round || 0) + 1
  const used = (o.used ||= [])
  const v = { seller: seller.short, p: callName(p.name) }
  const say = (key: Parameters<typeof clubLine>[1], fee?: number) => o.history.push({ date: w.date, by: 'seller', text: clubLine(rng, key, used, { ...v, fee: fee ? fmtMoney(fee) : '' }), fee })
  // their current position: first the asking price, then converging towards the hidden floor
  const position = o.counterFee || roundValue(Math.max(floor, ask * (1 + rng.next() * 0.05)))
  if (offered >= floor && (offered >= position * 0.975 || rng.next() < 0.25 + o.round * 0.2)) {
    o.status = 'Offer Accepted'
    say('accept')
    if (o.userIsBuyer) adjustRelation(w, seller.id, 2)
    return 'accept'
  }
  const ratio = offered / Math.max(1, floor)
  const repeat = o.history.filter((h) => h.by === 'buyer' && h.fee === o.fee).length > 1
  o.patience -= ratio < 0.6 ? 42 : ratio < 0.8 ? 24 : ratio < 0.95 ? 12 : 6
  if (repeat) o.patience -= 12
  if (o.patience <= 0) {
    o.status = 'Negotiations Failed'
    say('walk')
    if (o.userIsBuyer) {
      ;((w.flags.bidBlocked ||= {}) as Record<number, { until: string; reason: string; clubId: number }>)[p.id] = { until: addDays(w.date, 28 + Math.round(rng.next() * 20)), reason: 'Talks collapsed', clubId: seller.id }
      adjustRelation(w, seller.id, -12)
    }
    return 'walk'
  }
  if (ratio < 0.55) {
    o.status = 'Offer Rejected'
    say('insult')
    if (o.userIsBuyer) adjustRelation(w, seller.id, -4)
    return 'reject'
  }
  // concede part of the way towards the bid, never below the floor
  const style = finStyle(w, seller)
  const concession = seller.finance.balance < 0 ? 0.42 : p.transferListed ? 0.5 : style === 'Seller' ? 0.45 : style === 'Frugal' ? 0.38 : style === 'Ambitious' ? 0.22 : 0.3
  const next = o.counterFee ? roundValue(Math.max(floor, position - (position - offered) * concession)) : position
  const moved = !!o.counterFee && next < o.counterFee
  o.counterFee = Math.max(next, roundValue(o.fee * 1.02))
  o.status = 'Counter Offer'
  say(ratio < 0.8 ? 'low' : moved ? 'counterMove' : 'counter', o.counterFee)
  // the first answer tells you what kind of club you're dealing with
  if (o.round === 1 && style !== 'Balanced' && o.userIsBuyer) say(`style_${style}` as Parameters<typeof clubLine>[1])
  if (o.patience < 30) say('warn')
  return 'counter'
}

/** Player evaluates contract terms from the buying/renewing club. */
export function evaluateContract(w: World, p: Player, clubId: number, c: ContractOffer, attempt: number, rng: Rng): { result: 'accept' | 'counter' | 'reject'; demand: ContractOffer; mood: number; text: string } {
  const role = c.role
  const demand = contractDemand(w, p, clubId, roleForBuyer(w, p, clubId) === 'Crucial' ? 'Crucial' : role)
  const interest = clubId === p.clubId ? 60 + (p.morale - 50) * 0.5 : playerInterest(w, p, clubId)
  if (interest < 18) return { result: 'reject', demand, mood: 0, text: `${p.name} is not interested in joining ${w.clubs[clubId].short}.` }
  const expectedRole = roleForBuyer(w, p, clubId)
  const roleGap = rankOf(expectedRole) - rankOf(role) // positive: offering a smaller role than expected
  const wageRatio = c.wage / demand.wage
  const bonusValue = c.signingBonus / Math.max(1, demand.signingBonus)
  let score = 50 + (wageRatio - 1) * 160 + (bonusValue - 1) * 12 - roleGap * 14 + (interest - 55) * 0.4
  const age = ageOn(p.dob, w.date)
  const yearsPref = demand.years
  score -= Math.abs(c.years - yearsPref) * (age >= 30 && c.years < yearsPref ? 8 : 3)
  if (c.releaseClause > 0) score += 4 + (c.releaseClause < p.value * 1.5 ? 6 : 0)
  score += (c.bonusGoal + c.bonusCleanSheet + c.bonusApp) / Math.max(1, demand.wage) * 20
  score -= (attempt - 1) * 3
  score += rng.normal(0, 4)
  if (score >= 55) return { result: 'accept', demand, mood: score, text: `${p.name}'s agent: "We have a deal."` }
  if (attempt >= 3 && score < 45) return { result: 'reject', demand, mood: score, text: `${p.name}'s agent: "We're too far apart. My client has decided to walk away."` }
  const need = roleGap > 0 ? `a ${expectedRole.toLowerCase()} role and ` : ''
  return { result: 'counter', demand, mood: score, text: `${p.name}'s agent: "My client expects ${need}${fmtMoney(demand.wage)}/wk over ${demand.years} years."` }
}

const rankOf = (r: SquadRole) => ({ Crucial: 0, Important: 1, Rotation: 2, Sparingly: 3, Prospect: 3 } as Record<SquadRole, number>)[r]

// ---------------------------------------------------------------- execution
export function executeTransfer(w: World, o: TransferOffer, terms?: ContractOffer, storyId?: number) {
  const p = w.players[o.playerId]
  const from = w.clubs[o.toClubId], to = w.clubs[o.fromClubId]
  if (!p || !to) return
  const isLoan = o.type.startsWith('loan')
  const fee = isLoan ? 0 : o.fee
  // everything the move changes, so it can be undone exactly (Edit Mode: reverse deal)
  const before = {
    contract: { ...p.contract }, wage: p.wage, jersey: p.jersey, loan: p.loan ? { ...p.loan } : undefined, joinedDate: p.joinedDate,
    transferListed: p.transferListed, loanListed: p.loanListed, untouchable: p.untouchable, morale: p.morale,
    season: JSON.parse(JSON.stringify(p.season)), careerLen: p.career.length,
    fromBudget: from?.finance.transferBudget ?? 0, toBudget: to.finance.transferBudget, news: w.nextIds.news, msg: w.nextIds.msg, toBalance: to.finance.balance,
  }
  if (from && !isLoan) noteDeparture(w, p)
  if (from) {
    from.finance.balance += fee
    from.finance.transferBudget += Math.round(fee * (from.id === w.userClubId ? boardReinvest(w) : STYLE_REINVEST[finStyle(w, from)]))
    if (from.id === w.userClubId && fee) from.finance.ledger.push({ date: w.date, label: `Sale of ${p.name}`, amount: fee, kind: 'transfer' })
  }
  to.finance.balance -= fee
  to.finance.transferBudget = Math.max(0, to.finance.transferBudget - fee)
  if (to.id === w.userClubId && fee) to.finance.ledger.push({ date: w.date, label: `Signing of ${p.name}`, amount: -fee, kind: 'transfer' })
  // swap player
  if (o.swapPlayerId && from) {
    const sp = w.players[o.swapPlayerId]
    if (sp) {
      recordHistory(w, sp, sp.clubId, from.id, 0, 'transfer')
      setPlayerClub(w, sp, from.id)
      sp.contract = { ...sp.contract, role: roleForBuyer(w, sp, from.id), signedOn: w.date }
      sp.joinedDate = w.date
    }
  }
  const prevClub = p.clubId
  recordHistory(w, p, prevClub, to.id, fee, isLoan ? 'loan' : prevClub ? 'transfer' : 'free')
  closeCareerEntry(w, p)
  if (isLoan) {
    p.loan = { fromClubId: prevClub, until: `${w.season + 1}-06-30`, wageSplit: o.loanWageSplit ?? 50, optionFee: o.optionFee, obligation: o.type === 'loan-obligation', recallable: true, expectation: terms?.role }
  } else {
    p.loan = undefined
    const role = terms?.role || roleForBuyer(w, p, to.id)
    const c = terms || contractDemand(w, p, to.id, role)
    p.contract = {
      until: w.season + (w.date >= `${w.season}-07-01` && w.date < `${w.season + 1}-01-01` ? c.years : c.years), wage: c.wage, role, releaseClause: c.releaseClause,
      signedOn: w.date, signingBonus: c.signingBonus, bonuses: { goal: c.bonusGoal, cleanSheet: c.bonusCleanSheet, appearance: c.bonusApp },
    }
    p.wage = c.wage
    if (c.signingBonus && to.id === w.userClubId) {
      to.finance.balance -= c.signingBonus
      to.finance.ledger.push({ date: w.date, label: `Signing bonus: ${p.name}`, amount: -c.signingBonus, kind: 'bonus' })
    }
  }
  setPlayerClub(w, p, to.id)
  p.joinedDate = w.date
  p.transferListed = false
  p.loanListed = false
  p.untouchable = false
  p.jersey = freeNumber(w, to.id, p)
  p.morale = clamp(p.morale + 12, 0, 100)
  p.yellowAccum = {}
  o.status = 'Completed'
  if (o.userIsBuyer) w.transfers.targets[p.id] = { ...(w.transfers.targets[p.id] || { playerId: p.id, added: w.date }), status: 'Completed' }
  w.transfers.shortlist = w.transfers.shortlist.filter((id) => id !== p.id || o.userIsBuyer === false)
  // remove from team sheets of the old club
  if (from) for (const s of from.sheets) {
    s.lineup = s.lineup.map((id) => (id === p.id ? 0 : id))
    s.bench = s.bench.filter((id) => id !== p.id)
  }
  // news
  const big = fee >= 30_000_000 || p.ovr >= 82 || to.id === w.userClubId || from?.id === w.userClubId
  if (big || fee >= 8_000_000) {
    const verb = isLoan ? 'joins on loan' : fee ? `completes ${fmtMoney(fee)} move` : 'signs on a free transfer'
    postNews(w, {
      headline: `${p.name} ${verb} to ${to.short}`,
      body: isLoan ? `${to.name} have agreed a season-long loan for ${p.name} from ${from?.name}.` : fee
        ? `${to.name} have completed the signing of ${p.name} from ${from?.name ?? 'free agency'} for a reported ${fmtMoney(fee)}. The ${ageOn(p.dob, w.date)}-year-old ${p.positions[0]} has signed a ${p.contract.until - w.season}-year contract.`
        : `${p.name} has joined ${to.name} as a free agent.`,
      kind: 'transfer', playerIds: [p.id], clubIds: [to.id, ...(from ? [from.id] : [])], fee: fee || undefined, importance: fee >= 60_000_000 ? 5 : fee >= 25_000_000 ? 4 : 3,
      userRelated: to.id === w.userClubId || from?.id === w.userClubId,
    })
  }
  if (!o.userIsBuyer && !o.userIsSeller) delete w.transfers.offers[o.id]
  if (o.userIsBuyer) {
    const staff = staffNames(w)
    sendInbox(w, {
      from: staff.director, fromRole: 'Sporting Director', category: 'Transfers', subject: `${p.name} has signed!`,
      body: `${p.name} has officially completed ${isLoan ? 'a loan move' : 'his transfer'} to ${to.name}${fee ? ` for ${fmtMoney(fee)}` : ''}. He's available for selection immediately.`,
      actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id, primary: true }], playerId: p.id, image: { kind: 'player', id: p.id },
    })
  }
  const range = (a: number, b: number, pre: string) => Array.from({ length: Math.max(0, b - a) }, (_, i) => `${pre}${a + i}`)
  recordDone(w, {
    p, from: prevClub, to: to.id, fee, kind: isLoan ? 'loan' : prevClub ? 'transfer' : 'free', storyId, wage: p.wage, years: isLoan ? undefined : p.contract.until - w.season,
    undo: {
      date: w.date, fee, fromClub: prevClub, toClub: to.id, type: isLoan ? 'loan' : prevClub ? 'transfer' : 'free',
      contract: before.contract, wage: before.wage, jersey: before.jersey, loan: before.loan, joinedDate: before.joinedDate,
      transferListed: before.transferListed, loanListed: before.loanListed, untouchable: before.untouchable, morale: before.morale,
      season: before.season, careerLen: before.careerLen,
      fromBudgetAdded: from ? from.finance.transferBudget - before.fromBudget : 0, toBudgetSpent: before.toBudget - to.finance.transferBudget,
      signingBonus: Math.max(0, before.toBalance - to.finance.balance - fee),
      newsIds: range(before.news, w.nextIds.news, 'n'), inboxIds: range(before.msg, w.nextIds.msg, 'm'), swap: !!o.swapPlayerId,
    },
  })
}

function boardReinvest(w: World) {
  const d = w.settings.difficulty
  return d === 'Beginner' || d === 'Amateur' ? 1 : d === 'Legendary' || d === 'Ultimate' ? 0.6 : 0.8
}

function freeNumber(w: World, clubId: number, p: Player): number {
  const used = new Set(rosterOf(w, clubId).filter((q) => q.id !== p.id).map((q) => q.jersey))
  if (p.jersey && !used.has(p.jersey)) return p.jersey
  const g = POS_GROUP[p.positions[0]]
  const pref = g === 'GK' ? [1, 13, 31] : g === 'DEF' ? [2, 3, 4, 5, 6, 15, 22, 24] : g === 'MID' ? [8, 10, 6, 14, 16, 17, 18, 20] : [9, 7, 11, 19, 10, 17, 18, 29]
  for (const n of pref) if (!used.has(n)) return n
  for (let n = 21; n < 99; n++) if (!used.has(n)) return n
  return 99
}

function recordHistory(w: World, p: Player, from: number, to: number, fee: number, type: TransferRecord['type']) {
  w.transfers.history.unshift({ date: w.date, playerId: p.id, playerName: p.name, from, to, fee, type, season: w.season })
  if (w.transfers.history.length > 1500) w.transfers.history.length = 1500
}

export function closeCareerEntry(w: World, p: Player) {
  const apps = Object.values(p.season).reduce((a, s) => a + s.apps, 0)
  if (!apps || !p.clubId) return
  const sum = Object.values(p.season).reduce((a, s) => ({ goals: a.goals + s.goals, assists: a.assists + s.assists, cs: a.cs + s.cleanSheets, r: a.r + s.ratingSum, n: a.n + s.rated }), { goals: 0, assists: 0, cs: 0, r: 0, n: 0 })
  p.career.push({ season: w.season, clubId: p.clubId, loan: !!p.loan, apps, goals: sum.goals, assists: sum.assists, cleanSheets: sum.cs, ratingAvg: sum.n ? Math.round((sum.r / sum.n) * 100) / 100 : 0, ovr: p.ovr })
  p.season = {}
}

export function releasePlayer(w: World, p: Player, compensation = true) {
  const club = w.clubs[p.clubId]
  if (club && compensation) {
    const remaining = Math.max(0, p.contract.until - w.season) * p.contract.wage * 52 * 0.5
    club.finance.balance -= remaining
    if (club.id === w.userClubId) club.finance.ledger.push({ date: w.date, label: `Contract termination: ${p.name}`, amount: -remaining, kind: 'other' })
  }
  recordHistory(w, p, p.clubId, 0, 0, 'release')
  closeCareerEntry(w, p)
  setPlayerClub(w, p, 0)
  p.contract = { ...p.contract, until: 0, role: 'Rotation' }
  p.transferListed = false
  p.loanListed = false
}

// ---------------------------------------------------------------- AI market
// Clubs recruit from their squad plan (see squadPlan.ts): the most pressing need first, with real budgets and wage room.

/** Eligible players by position group, rebuilt once per day. */
const marketCache = new WeakMap<World, { date: string; v: number; by: Map<string, Player[]> }>()
function market(w: World) {
  const c = marketCache.get(w)
  const v = w.flags.rosterVersion || 0
  if (c && c.date === w.date && c.v === v) return c.by
  const by = new Map<string, Player[]>()
  for (const p of allPlayers(w)) {
    if (p.academy || p.loan || p.retiringAtSeasonEnd) continue
    const g = POS_GROUP[p.positions[0]]
    if (!by.has(g)) by.set(g, [])
    by.get(g)!.push(p)
  }
  for (const arr of by.values()) arr.sort((a, b) => b.ovr - a.ovr)
  marketCache.set(w, { date: w.date, v, by })
  return by
}

const LINE_OF = (pos: string) => (pos === 'RB' || pos === 'LB' || pos === 'RWB' || pos === 'LWB' ? 'FB' : pos === 'RW' || pos === 'LW' || pos === 'RM' || pos === 'LM' ? 'W' : pos === 'CF' ? 'ST' : pos)
const WAGE_ROOM: Record<FinStyle, number> = { Ambitious: 1.16, Balanced: 1.06, Frugal: 1.0, Seller: 1.03 }

/** Most senior players a club carries in one line before it stops recruiting there (keepers: three). */
const LINE_CAP: Record<string, number> = { GK: 3, CB: 5, FB: 4, CDM: 3, CM: 4, CAM: 3, W: 4, ST: 4 }
/**
 * What a club is already doing in each line: pursuits under way (an AI move still at the rumour stage included) and
 * signings in the last six weeks. A club that has just bought a keeper, or is chasing one, does not go after
 * another one: it waits to see what it has (clubs were buying two or three keepers in the same window).
 */
export function lineActivity(w: World, club: Club): { pursuing: Set<string>; signed: Map<string, number> } {
  const pursuing = new Set<string>()
  for (const s of storiesFor(w, (x) => x.to === club.id && isOpen(x) && (x.stage !== 'rumour' || !!x.ai))) {
    const p = w.players[s.playerId]
    if (p) pursuing.add(LINE_OF(p.positions[0]))
  }
  const signed = new Map<string, number>()
  const since = addDays(w.date, -42)
  const h = w.transfers.history
  for (let i = h.length - 1; i >= 0 && h[i].date >= since; i--) {
    const t = h[i]
    if (t.to !== club.id || !['transfer', 'free', 'loan', 'loan-buy'].includes(t.type)) continue
    const p = w.players[t.playerId]
    if (p) { const k = LINE_OF(p.positions[0]); signed.set(k, (signed.get(k) || 0) + 1) }
  }
  return { pursuing, signed }
}
/** Should the club act on this need now, given what it already has and is doing in that line? */
function needStillOpen(w: World, club: Club, plan: SquadPlan, need: PlanNeed, act: ReturnType<typeof lineActivity>): boolean {
  const line = LINE_OF(need.pos)
  if (act.pursuing.has(line)) return false
  const emptySlot = need.kind === 'starter' && !need.replaces
  if (act.signed.has(line) && !emptySlot) return false
  const have = rosterOf(w, club.id).filter((p) => !p.academy && LINE_OF(p.positions[0]) === line).length
  const cap = LINE_CAP[line] ?? 4
  // a clear new first choice can still come in over a full line (keepers never past three)
  return have < cap || (need.kind === 'starter' && line !== 'GK' && have < cap + 1)
}

/** Shortlist of realistic signings for one need, best first. */
export function findPlanTargets(w: World, club: Club, plan: SquadPlan, need: PlanNeed, rng: Rng, freeOnly = false): Player[] {
  const by = market(w)
  const g = POS_GROUP[need.pos]
  const groups = need.pos === 'RM' || need.pos === 'LM' || need.pos === 'CAM' ? ['MID', 'ATT'] : need.pos === 'RW' || need.pos === 'LW' ? ['ATT', 'MID'] : [g]
  const budget = club.finance.transferBudget
  const cap = budget * need.spend
  const style = finStyle(w, club)
  const room = club.finance.wageBudget * WAGE_ROOM[style] - plan.wageBill
  const short: { p: Player; s: number }[] = []
  let looked = 0
  for (const grp of groups) {
    const list = by.get(grp) || []
    // start inside the band of plausible quality
    let lo = 0, hi = list.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].ovr > plan.level + 8) lo = m + 1; else hi = m }
    for (let i = lo; i < list.length && looked < 700; i++) {
      const p = list[i]
      if (p.ovr < need.minRating - 3) break
      if (p.clubId === club.id) continue
      if (rng.next() < 0.35) continue // don't scan the same shortlist every time
      looked++
      if (freeOnly && p.clubId) continue
      const age = ageOn(p.dob, w.date)
      if (age > need.maxAge) continue
      if (need.minPot && p.pot < need.minPot) continue
      // a signing has to play there: natural position for a starter, the same line for cover
      if (need.kind === 'depth' ? !p.positions.some((q) => LINE_OF(q) === LINE_OF(need.pos)) : !p.positions.includes(need.pos) && !(need.kind === 'prospect' && POS_GROUP[p.positions[0]] === g)) continue
      const rating = posRating(p, need.pos)
      if (rating < need.minRating) continue
      const from = w.clubs[p.clubId]
      if (from && from.reputation > club.reputation + 10 && !p.transferListed) continue
      // quick no-gos the seller would give anyway
      if (from && settlingIn(w, p) !== undefined && !p.transferListed) continue
      if (from && p.contract.role === 'Crucial' && from.reputation > club.reputation - 5 && !p.contract.releaseClause && !p.transferListed && from.id !== w.userClubId) continue
      const cost = p.clubId ? p.value * (p.transferListed ? 1.02 : 1.25) : 0
      if (cost > cap) continue
      // rough wage check before the real demand
      if (p.wage > room * 1.3 && p.wage > (club.finance.wageBudget / 22)) continue
      const young = age <= 23 ? (p.pot - rating) * 0.35 : 0
      const score = (rating - need.minRating) * 1.2 + young - (cost / Math.max(1, budget)) * 7
        + (from && from.leagueId === club.leagueId ? 0.8 : 0) + (p.transferListed ? 1.5 : 0) + (!p.clubId && need.kind === 'depth' ? 2 : 0)
        + (style === 'Frugal' && cost === 0 ? 2 : 0) + rng.next() * 2.5
      short.push({ p, s: score })
    }
  }
  return short.sort((a, b) => b.s - a.s).slice(0, 6).map((x) => x.p)
}

/** What the selling club thinks: key starters cost a premium (or aren't for sale), surplus goes cheaply. */
function aiSellerTerms(w: World, p: Player, buyer: Club): { ok: boolean; mult: number } {
  const seller = w.clubs[p.clubId]
  if (!seller || seller.id === w.userClubId) return { ok: true, mult: 1 }
  const plan = squadPlan(w, seller)
  const role = planRole(plan, p.id)
  const style = finStyle(w, seller)
  if (role === 'key') {
    if (buyer.reputation < seller.reputation - 4 && style !== 'Seller') return { ok: false, mult: 1 }
    // nobody hands a direct rival their best players, unless the player wants out
    const rival = buyer.leagueId === seller.leagueId && Math.abs(buyer.reputation - seller.reputation) <= 8
    if (rival && style !== 'Seller' && p.morale >= 40 && !p.transferListed) return { ok: false, mult: 1 }
    // and even then most clubs keep their stars
    if (style !== 'Seller' && hashString(`${p.id}:${buyer.id}:${seller.id}`) % 100 < 55) return { ok: false, mult: 1 }
    return { ok: true, mult: style === 'Seller' ? 1.12 : 1.35 }
  }
  if (role === 'starter') return { ok: true, mult: style === 'Seller' ? 1.02 : 1.15 }
  if (role === 'surplus') return { ok: true, mult: 0.85 }
  return { ok: true, mult: 1 }
}

/** Before a player leaves an AI club: remember a lost starter so the club reacts (and the press can connect the dots). */
export function noteDeparture(w: World, p: Player) {
  const from = w.clubs[p.clubId]
  if (!from || from.id === w.userClubId) return
  const plan = squadPlan(w, from)
  const slot = plan.slots.find((s) => s.id === p.id)
  if (!slot) return
  const tp = (from.transferPolicy ||= {})
  tp.review = w.date
  tp.lost = [...(tp.lost || []).filter((l) => diffDays(w.date, l.date) < 120), { id: p.id, pos: slot.pos, date: w.date, key: plan.key.has(p.id) }]
}

/** Why AI club-days end without a deal (QA counters). */
export const aiMarketStats: Record<string, number> = {}
const miss = (k: string) => { aiMarketStats[k] = (aiMarketStats[k] || 0) + 1 }

/** One club's business for the day. */
function aiClubDay(w: World, club: Club, rng: Rng, windowOpen: boolean) {
  const plan = squadPlan(w, club)
  const tp = (club.transferPolicy ||= {})
  // one move at a time (two on deadline day): a club already in talks waits for them to finish
  const open = storiesFor(w, (s) => s.to === club.id && isOpen(s) && s.stage !== 'rumour').length
  if (open >= (windowOpen && w.windows.some((x) => x.close === w.date) ? 2 : 1)) { miss('already in talks'); return }
  // move surplus on (listed players are what other clubs' bargain hunts find)
  if (windowOpen) for (const p of plan.surplus.slice(0, 2)) if (!p.transferListed && rng.next() < 0.45) p.transferListed = true
  const urgent = !!tp.review
  // the top needs compete; lower ones only sometimes get attention; a line already being dealt with waits
  const act = lineActivity(w, club)
  const pool = plan.needs.filter((n) => needStillOpen(w, club, plan, n, act)).filter((n, i) => i < 3 && (n.priority >= 4 || rng.next() < 0.35 + n.priority / 8))
  const need = pool[0]
  if (!need) { tp.review = undefined; miss('no need'); return }
  if (!windowOpen && need.kind !== 'starter') return
  const list = findPlanTargets(w, club, plan, need, rng, !windowOpen)
  if (!list.length) { if (urgent && rng.next() < 0.3) tp.review = undefined; miss(`no target:${need.kind}`); return }
  // work down the shortlist until a club and a player say yes
  let target: Player | undefined
  let fee = 0
  for (const cand of list) {
    if (cand.clubId === w.userClubId) { if (need.priority >= 3 && rng.next() < 0.5) { aiBidForUserPlayer(w, club, cand, rng); return } continue }
    if (cand.clubId) {
      const terms = aiSellerTerms(w, cand, club)
      if (!terms.ok) { miss('seller refuses'); continue }
      if (!sellerStance(w, cand, club.id).willing) { miss('stance'); continue }
      const f = roundValue(askingPrice(w, cand, club.id) * terms.mult * (0.93 + rng.next() * 0.1))
      if (f > club.finance.transferBudget * Math.max(need.spend, urgent ? 0.9 : 0)) { miss('fee over budget'); continue }
      fee = f
    } else fee = 0
    if (storiesFor(w, (s) => s.playerId === cand.id && isOpen(s) && s.stage !== 'rumour' && s.to !== club.id).length) { miss('others in talks'); continue }
    if (playerInterest(w, cand, club.id) < 44) { miss('player not interested'); continue }
    target = cand
    break
  }
  if (!target) return
  const role = roleForBuyer(w, target, club.id)
  const demand = contractDemand(w, target, club.id, role)
  if (plan.wageBill + demand.wage > club.finance.wageBudget * WAGE_ROOM[finStyle(w, club)] && need.kind !== 'starter') { miss('wages'); return }
  // a move worth following plays out over days in the transfer centre; small business just happens
  if (windowOpen && notable(w, target, target.clubId, club.id, fee)) {
    miss(`pursuit:${need.kind}`)
    startPursuit(w, club, target, fee, rng)
    tp.lastActivity = w.date
    return
  }
  miss(`deal:${need.kind}`)
  const lost = (tp.lost || []).find((l) => LINE_OF(l.pos) === LINE_OF(need.pos) && diffDays(w.date, l.date) < 120)
  const o = makeOffer(w, { playerId: target.id, fee, type: target.clubId ? 'transfer' : 'free', fromClubId: club.id })
  o.userIsBuyer = false
  executeTransfer(w, o, demand)
  tp.lastActivity = w.date
  if (lost && need.kind !== 'prospect') {
    tp.lost = tp.lost!.filter((l) => l !== lost)
    const gone = w.players[lost.id]
    const dest = gone ? w.clubs[gone.clubId] : undefined
    if (gone && (dest?.id === w.userClubId || (lost.key && club.prestige.intl >= 7) || club.leagueId === w.clubs[w.userClubId]?.leagueId)) {
      postNews(w, {
        headline: `${club.short} replace ${callName(gone.name)} with ${target.name}`,
        body: `${club.name} have moved to fill the gap left by ${gone.name}${dest ? `, who joined ${dest.name}` : ''}, signing ${target.name}${fee ? ` for ${fmtMoney(fee)}` : ' on a free transfer'}. The ${ageOn(target.dob, w.date)}-year-old ${target.positions[0]} is expected to go straight into the side.`,
        kind: 'transfer', playerIds: [target.id, gone.id], clubIds: [club.id], importance: dest?.id === w.userClubId ? 3 : 2, userRelated: dest?.id === w.userClubId,
      })
    }
  }
  if (!tp.lost?.length) tp.review = undefined
}

export function aiTransferDay(w: World, rng: Rng) {
  if (!w.settings.aiTransfers) return
  const open = isWindowOpen(w)
  const clubs = Object.values(w.clubs).filter((c) => c.id !== w.userClubId && !c.national)
  const urgent = clubs.filter((c) => c.transferPolicy?.review)
  if (!open) {
    // outside a window only a club that lost a starter looks at free agents, now and then; the papers never stop
    for (const c of urgent) if (c.market?.buy !== -2 && rng.next() < 0.15) aiClubDay(w, c, rng, false)
    if (rng.next() < 0.3) paperTalk(w, rng)
    return
  }
  const win = w.windows.find((x) => w.date >= x.open && w.date <= x.close)!
  const daysLeft = diffDays(win.close, w.date)
  const deadline = daysLeft === 0
  const intensity = deadline ? 3.5 : daysLeft <= 3 ? 1.8 : win.name === 'Summer' ? 1 : 0.55
  const n = Math.round(clubs.length * 0.03 * intensity)
  const picks = new Set<Club>()
  // clubs that just lost a starter act first (within days, not weeks)
  for (const c of urgent) if (picks.size < n && rng.next() < 0.6) picks.add(c)
  // bigger leagues do more business
  const weight = (c: Club) => (1 + (w.leagues[c.leagueId]?.prestige || 2) / 3) * (c.market?.buy === -1 ? 0.25 : c.market?.buy === 1 ? 2 : c.market?.buy === 2 ? 4 : 1)
  for (const c of [...picks]) if (c.market?.buy === -2) picks.delete(c)
  let guard = 0
  while (picks.size < n && guard++ < n * 6) { const c = rng.pick(clubs); if (c.market?.buy !== -2 && rng.next() * 4.4 < weight(c)) picks.add(c) }
  for (const c of picks) aiClubDay(w, c, rng, true)
  // paper talk
  for (let k = rng.next() < 0.5 ? 2 : 1; k > 0; k--) if (rng.next() < 0.6 * intensity) paperTalk(w, rng)
}

function aiBidForUserPlayer(w: World, club: Club, p: Player, rng: Rng) {
  if (Object.values(w.transfers.offers).some((o) => o.playerId === p.id && o.userIsSeller && ['Offer Submitted', 'Counter Offer'].includes(o.status))) return
  if (p.untouchable) return
  const ask = askingPrice(w, p, club.id)
  const fee = roundValue(ask * (0.75 + rng.next() * 0.3))
  if (fee > club.finance.transferBudget * 1.1) return
  const o = makeOffer(w, { playerId: p.id, fee, type: 'transfer', fromClubId: club.id })
  o.userIsBuyer = false
  o.userIsSeller = true
  o.status = 'Offer Submitted'
  o.respondBy = addDays(w.date, 3)
  const staff = staffNames(w)
  sendInbox(w, {
    from: staff.director, fromRole: 'Sporting Director', category: 'Transfers', subject: `Offer received for ${p.name}`,
    body: `${club.name} have submitted an offer of ${fmtMoney(fee)} for ${p.name}. His current market value is ${fmtMoney(p.value)}. We need to respond by ${fmtDate(o.respondBy!, 'dm')}.`,
    actions: [
      { label: 'Accept', action: 'acceptBid', payload: o.id, primary: true },
      { label: 'Negotiate', action: 'negotiateBid', payload: o.id },
      { label: 'Reject', action: 'rejectBid', payload: o.id, danger: true },
    ],
    playerId: p.id, clubId: club.id, urgent: true, expires: o.respondBy, image: { kind: 'club', id: club.id },
  })
}

/** Resolve user offers awaiting a response (called daily). */
export function processOffers(w: World, rng: Rng) {
  for (const o of Object.values(w.transfers.offers)) {
    if (o.userIsBuyer && o.status === 'Offer Submitted' && o.respondBy && w.date >= o.respondBy) {
      const res = evaluateOffer(w, o, rng)
      const p = w.players[o.playerId]
      const seller = w.clubs[o.toClubId]
      const t = w.transfers.targets[p.id]
      if (t) t.status = o.status
      const staff = staffNames(w)
      const actions = res === 'accept'
        ? [{ label: 'Negotiate Contract', action: 'openContract', payload: o.id, primary: true }]
        : res === 'counter' ? [{ label: `Accept ${fmtMoney(o.counterFee!)}`, action: 'acceptCounter', payload: o.id, primary: true }, { label: 'Revise Offer', action: 'openOffer', payload: p.id }]
          : res === 'reject' ? [{ label: 'Revise Offer', action: 'openOffer', payload: p.id, primary: true }] : []
      sendInbox(w, {
        from: staff.director, fromRole: 'Sporting Director', category: 'Transfers',
        subject: res === 'accept' ? `${seller.short} accept offer for ${p.name}` : res === 'counter' ? `${seller.short} counter-offer for ${p.name}` : res === 'walk' ? `${seller.short} end talks for ${p.name}` : `${seller.short} reject offer for ${p.name}`,
        body: o.history[o.history.length - 1].text + (res === 'accept' ? ` We can now open contract talks with ${p.name}'s representatives.` : ''),
        actions, playerId: p.id, clubId: seller.id, urgent: res === 'accept' || res === 'counter', image: { kind: 'player', id: p.id },
      })
    }
    // AI bids expiring for user players
    if (o.userIsSeller && o.status === 'Offer Submitted' && o.respondBy && w.date > o.respondBy) {
      o.status = 'Negotiations Failed'
    }
  }
}

export function ensureSeason(p: Player, key: string) {
  return (p.season[key] ||= emptyLine())
}
