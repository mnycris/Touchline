// The transfer centre: every notable move in the world as a story that develops over days, the way the real window
// does. Rumour → talks → negotiating → close (fee agreed, terms and medical) → done deal, or collapsed at any point
// for a reason. Players (and their agents) decide on their careers: a fee the clubs agree is not a move the player wants.
import type { Club, ISODate, Player, StoryStage, TransferOffer, TransferStory, TransferUndo, World } from '../../domain/types'
import { Rng, clamp, hashString } from '../../domain/rng'
import { addDays, ageOn, diffDays, fmtDate } from '../../domain/dates'
import { fmtMoney, roundValue } from '../../domain/finance'
import { currentWindow, isWindowOpen } from '../competitions/calendar'
import { positionOf } from '../competitions/tables'
import { postNews } from './messages'
import { rosterOf, setPlayerClub, touchRoster, wageBill } from './roster'
import { aiBidForUserPlayer, askingPrice, contractDemand, daysSinceMove, executeTransfer, makeOffer, roleForBuyer, sellerStance, settlingIn, SETTLE_DAYS, slotsInLine, rivalry } from './transfers'
import { finStyle } from './squadPlan'
import { callName } from '../match/commentary'

// ---------------------------------------------------------------- outlets
/** Who reports it, and how often they turn out right (1-5). Invented outlets, one voice per football culture. */
export const OUTLETS: { name: string; rel: number; country?: string }[] = [
  { name: 'Transfer Wire', rel: 5 }, { name: 'Insider FC', rel: 4 }, { name: 'The Athletic Line', rel: 4 },
  { name: 'Matchday Mail', rel: 3, country: 'England' }, { name: 'The Terrace Post', rel: 2, country: 'England' }, { name: 'Sunday Sport Desk', rel: 1, country: 'England' },
  { name: 'Diario Balón', rel: 3, country: 'Spain' }, { name: 'Mundo Gol', rel: 2, country: 'Spain' },
  { name: 'Calcio Quotidiano', rel: 4, country: 'Italy' }, { name: 'Il Pallone', rel: 2, country: 'Italy' },
  { name: 'Fußball Kurier', rel: 4, country: 'Germany' }, { name: 'Bild am Ball', rel: 2, country: 'Germany' },
  { name: 'Le Coup Franc', rel: 3, country: 'France' }, { name: 'Jornal da Bola', rel: 3, country: 'Portugal' },
  { name: 'Voetbal Vandaag', rel: 3, country: 'Netherlands' }, { name: 'Agent Talk', rel: 2 },
]
function outlet(w: World, rng: Rng, country: string | undefined, min: number, max: number) {
  const list = OUTLETS.filter((o) => o.rel >= min && o.rel <= max && (!o.country || o.country === country))
  const local = list.filter((o) => o.country === country)
  return rng.pick(local.length && rng.next() < 0.55 ? local : list)
}

export const STAGE_LABEL: Record<StoryStage, string> = { rumour: 'Rumour', talks: 'Talks', negotiating: 'Negotiating', close: 'Close', done: 'Done deal', failed: 'Failed' }
export const OPEN: StoryStage[] = ['rumour', 'talks', 'negotiating', 'close']
export const isOpen = (s: TransferStory) => OPEN.includes(s.stage)

// ---------------------------------------------------------------- the player's decision
export interface Appeal { score: number; reasons: { v: number; text: string }[] }
const POS_WORD: Record<string, string> = { RW: 'winger', LW: 'winger', RM: 'wide midfielder', LM: 'wide midfielder', RWB: 'wing-back', LWB: 'wing-back', CAM: 'No. 10', CDM: 'holding midfielder', CF: 'second striker', ST: 'striker', RB: 'full-back', LB: 'full-back' }

const uclCache = new WeakMap<World, { date: string; set: Set<number> }>()
function inUcl(w: World, clubId: number) {
  let c = uclCache.get(w)
  if (!c || c.date !== w.date) {
    const set = new Set<number>()
    for (const comp of Object.values(w.competitions)) if (comp.season === w.season && comp.key === 'UCL') for (const id of comp.clubs) set.add(id)
    c = { date: w.date, set }
    uclCache.set(w, c)
  }
  return c.set.has(clubId)
}

function leaguePos(w: World, club: Club): { pos: number; of: number } | undefined {
  const comp = Object.values(w.competitions).find((c) => c.season === w.season && c.format === 'league' && c.clubs.includes(club.id))
  if (!comp?.table?.some((r) => r.p >= 6)) return undefined
  return { pos: positionOf(w, comp, club.id), of: comp.clubs.length }
}

/** How much a player wants a move to `toId`, and why: his club, his minutes, money, league, Europe, home, loyalty. */
export function moveAppeal(w: World, p: Player, toId: number): Appeal {
  const to = w.clubs[toId], from = w.clubs[p.clubId]
  const reasons: Appeal['reasons'] = []
  const add = (v: number, text: string) => { if (Math.abs(v) >= 1) reasons.push({ v: Math.round(v), text }) }
  if (!to) return { score: -100, reasons: [{ v: -100, text: 'no such club' }] }
  const age = ageOn(p.dob, w.date)
  // where he is in his career changes what weighs most: minutes when young, stature in his prime, money and minutes late on
  const stage = age <= 21 ? 0.7 : age <= 29 ? 1.1 : 0.8
  // stature: reputation and squad quality; a free agent measures a club against the level his own game is at
  const rep = from
    ? clamp(((to.reputation - from.reputation) * 0.85 + (to.squadAvg - from.squadAvg) * 0.6) * stage, -32, 30)
    : clamp((to.squadAvg - (p.ovr - 6)) * 1.4 * stage, -32, 18)
  add(rep, rep > 0 ? `${to.short} are a step up` : `${to.short} would be a step down${from ? '' : ' for a player of his level'}`)
  // a free agent still without a club weeks into the window lowers his sights
  if (!from) {
    const left = w.transfers.history.find((h) => h.playerId === p.id && h.to === 0)
    const out = left ? diffDays(w.date, left.date) : 0
    if (out > 21) add(Math.min(16, out / 4), `he has been without a club for ${Math.round(out / 7)} weeks`)
  }
  const lgTo = w.leagues[to.leagueId], lgFrom = w.leagues[from?.leagueId ?? -1]
  const lg = clamp(((lgTo?.prestige ?? 3) - (lgFrom?.prestige ?? 3)) * 3, -15, 15)
  add(lg, lg > 0 ? `a stronger league (${lgTo?.short})` : `a weaker league than the ${lgFrom?.short || 'one he plays in'}`)
  // Europe
  const toUcl = inUcl(w, to.id), fromUcl = from ? inUcl(w, from.id) : false
  if (toUcl && !fromUcl) add(9, 'Champions League football')
  if (fromUcl && !toUcl) add(-8, `he would give up the Champions League`)
  // minutes: what he plays now against what he'd play there
  const mins = p.recentMins?.length ? p.recentMins.reduce((a, b) => a + b, 0) / (p.recentMins.length * 90) : 0.5
  const role = roleForBuyer(w, p, to.id)
  const willStart = role === 'Crucial' || role === 'Important'
  // their system: no place for his position in it
  if (slotsInLine(w, to.id, p.positions[0]) === 0) add(-10, `${to.short}'s system has no place for a ${POS_WORD[p.positions[0]] || p.positions[0]}`)
  // a contender in his prime years: the chance to win things
  const tp0 = leaguePos(w, to), fp0 = from ? leaguePos(w, from) : undefined
  if (age >= 24 && age <= 31 && tp0 && tp0.pos <= 2 && !(fp0 && fp0.pos <= 3)) add(6, `${to.short} are challenging for the title`)
  if (from && mins < 0.35 && willStart) add(18, 'he would play regularly')
  else if (from && mins < 0.35) add(8, `he barely plays at ${from.short}`)
  if (from && mins > 0.7 && !willStart) add(-20, `a regular at ${from.short}, he would be a squad player`)
  if (age <= 22 && !willStart) add(-9, 'he needs minutes at his age')
  // money
  const demand = contractDemand(w, p, to.id, role)
  const ratio = demand.wage / Math.max(500, p.wage || p.contract.wage || 500)
  const money = clamp(Math.log2(ratio) * 11 * (age >= 30 ? 1.4 : 1), -12, 18)
  add(money, money > 0 ? (ratio >= 1.9 ? 'his wages would double' : 'a pay rise') : 'less money')
  // how settled he is
  // how settled he is: a move he made in this career (the database's join dates are mostly the data's own date)
  const moved = from ? daysSinceMove(w, p) : undefined
  if (moved !== undefined && moved < SETTLE_DAYS) add(p.morale < 30 ? -18 : -48, moved < 31 ? `he only joined ${from!.short} a few weeks ago` : `he only joined ${from!.short} ${Math.max(1, Math.round(moved / 30))} months ago`)
  else if (moved !== undefined && moved < 365) add(p.morale < 40 ? -6 : -20, `he joined ${from!.short} less than a year ago`)
  if (p.morale < 35) add(14, `he is unsettled at ${from?.short || 'his club'}`)
  else if (p.morale > 75 && from) add(-8, `he is happy at ${from.short}`)
  if (p.transferListed) add(12, `${from?.short} have made him available`)
  if (from && p.contract.until - (w.season + 1) <= 0) add(6, 'his contract is running down')
  // how the teams are doing
  if (from) {
    const fp = leaguePos(w, from), tp = leaguePos(w, to)
    if (fp && fp.pos > fp.of - 3 && p.ovr >= (from.squadAvg + 2)) add(8, `${from.short} are fighting relegation`)
    if (fp && fp.pos <= 2 && !(tp && tp.pos <= 3)) add(-6, `${from.short} are in a title race`)
    if (tp && tp.pos > tp.of - 3) add(-8, `${to.short} are in a relegation fight`)
  }
  const form = p.formRatings.length ? p.formRatings.reduce((a, b) => a + b, 0) / p.formRatings.length : 6.6
  if (from && form >= 7.3 && mins > 0.6 && rep < 6) add(-7, `he is flourishing at ${from.short}`)
  // age and ambition
  if (age >= 31 && (lgTo?.wealth || 3) >= 8 && (lgTo?.prestige || 3) <= 6) add(10, 'one last big contract')
  if (rep > 0) add((p.hidden.ambition - 50) * 0.25, 'ambition')
  add(-(p.hidden.loyalty - 50) * 0.2, p.hidden.loyalty > 50 ? 'loyal to his club' : 'not one for sentiment')
  // home, and how well he settles abroad
  const homeCountry = p.nation === 'England' || p.nation === 'Scotland' || p.nation === 'Wales' ? p.nation : p.nation
  if (to.country === homeCountry && from && from.country !== homeCountry) add(6 + (age >= 28 ? 5 : 0), `a return home to ${to.country}`)
  else if (from && to.country !== from.country && to.country !== homeCountry && p.hidden.adaptability < 45) add(-6, 'he has struggled to settle abroad before')
  // rivals
  const riv = from ? rivalry(w, from.id, to.id) : 0
  if (riv) add(-(8 + 7 * riv) - p.hidden.loyalty * 0.15, `${to.short} are ${from!.short}'s rivals`)
  // what nobody outside knows: family, a manager he likes, the agent's cut
  const h = (hashString(`${p.id}:${to.id}:${w.season}`) % 13) - 6
  add(h, h > 0 ? 'personal reasons' : 'personal reasons')
  const score = reasons.reduce((a, r) => a + r.v, 0)
  reasons.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
  return { score, reasons }
}

// ---------------------------------------------------------------- stories
const mk = (w: World) => (w.market ||= { stories: [], seq: 1 })

export function storiesFor(w: World, pred: (s: TransferStory) => boolean) {
  return mk(w).stories.filter(pred)
}
export function story(w: World, id: number) {
  return mk(w).stories.find((s) => s.id === id)
}

function newStory(w: World, s: Omit<TransferStory, 'id' | 'log' | 'started' | 'updated'> & { note: string }): TransferStory {
  const m = mk(w)
  const { note, ...rest } = s
  const st: TransferStory = { ...rest, id: m.seq++, started: w.date, updated: w.date, log: [{ date: w.date, stage: s.stage, note }] }
  m.stories.unshift(st)
  return st
}

function step(w: World, s: TransferStory, stage: StoryStage, note: string, days?: number, rng?: Rng) {
  s.stage = stage
  s.updated = w.date
  s.log.push({ date: w.date, stage, note })
  if (stage === 'failed') { s.expires = addDays(w.date, 8 + (s.fee && s.fee >= 30e6 ? 6 : 0)); s.ai = undefined }
  if (s.ai && days != null) s.ai.nextStep = addDays(w.date, days + (rng ? rng.int(0, 1) : 0))
}

/** A move worth following in the centre (the rest just happens and shows in the history). */
export function notable(w: World, p: Player, from: number, to: number, fee: number) {
  const userLg = w.clubs[w.userClubId]?.leagueId
  return fee >= 8e6 || p.ovr >= 74 || from === w.userClubId || to === w.userClubId || w.transfers.shortlist.includes(p.id)
    || (!!userLg && (w.clubs[from]?.leagueId === userLg || w.clubs[to]?.leagueId === userLg) && p.ovr >= 68)
}

/** An AI club starts working on a signing: talks open (a big name is often reported first). */
export function startPursuit(w: World, buyer: Club, p: Player, value: number, rng: Rng): TransferStory {
  const from = p.clubId
  const free = !from
  // they open below what they'd pay, and there is a price they won't go past
  const fee = free ? 0 : roundValue(value * (0.8 + rng.next() * 0.14))
  const cap = free ? 0 : roundValue(value * (0.98 + rng.next() * 0.16) * (finStyle(w, buyer) === 'Ambitious' ? 1.08 : finStyle(w, buyer) === 'Frugal' ? 0.94 : 1))
  const big = p.ovr >= 78 || value >= 20e6
  if (big && !free && rng.next() < 0.6) {
    const o = outlet(w, rng, w.clubs[from]?.country || buyer.country, 3, 5)
    const st = newStory(w, { playerId: p.id, from, to: buyer.id, stage: 'rumour', kind: 'transfer', fee: roundValue(fee * (0.9 + rng.next() * 0.25)), source: o.name, reliability: o.rel, note: `${o.name}: ${buyer.short} are preparing a move for ${callName(p.name)}.`, ai: { interest: moveAppeal(w, p, buyer.id).score, nextStep: addDays(w.date, rng.int(2, 5)), round: 0, cap } })
    if (p.ovr >= 80) rumourNews(w, st)
    return st
  }
  return newStory(w, {
    playerId: p.id, from, to: buyer.id, stage: free ? 'negotiating' : 'talks', kind: free ? 'free' : 'transfer', fee: free ? 0 : fee,
    note: free ? `${buyer.short} in talks with the free agent ${callName(p.name)}.` : `${buyer.short} open talks with ${w.clubs[from]?.short} over ${callName(p.name)}.`,
    ai: { interest: moveAppeal(w, p, buyer.id).score, nextStep: addDays(w.date, rng.int(1, 3)), round: 0, cap },
  })
}

function rumourNews(w: World, s: TransferStory) {
  const p = w.players[s.playerId], to = w.clubs[s.to], from = w.clubs[s.from]
  if (!p || !to) return
  postNews(w, {
    headline: `${to.short} ${s.reliability && s.reliability >= 4 ? 'move for' : 'linked with'} ${p.name}`,
    body: `${s.source} report that ${to.name} ${s.reliability && s.reliability >= 4 ? 'have made' : 'are considering'} ${callName(p.name)} ${from ? `of ${from.name} ` : ''}a target${s.fee ? `, with a fee of around ${fmtMoney(s.fee)} mentioned` : ''}.`,
    kind: 'rumour', playerIds: [p.id], clubIds: [to.id, ...(from ? [from.id] : [])], importance: p.ovr >= 84 ? 3 : 2, userRelated: s.to === w.userClubId || s.from === w.userClubId,
    fee: s.fee,
  })
}

/** Paper talk: a link that may or may not have anything behind it. */
export function paperTalk(w: World, rng: Rng) {
  // the papers don't link a player with a move weeks after he signed; the manager's own players and his own club
  // only appear in stories with real interest behind them (aiInterestInUserPlayer, userInterestRumour)
  const pool = Object.values(w.players).filter((p) => p.ovr >= 77 && p.clubId && p.clubId !== w.userClubId && !p.academy && !p.loan && settlingIn(w, p) === undefined)
  if (!pool.length) return
  const p = rng.pick(pool)
  const from = w.clubs[p.clubId]
  if (!from) return
  if (storiesFor(w, (s) => s.playerId === p.id && isOpen(s)).length >= 3) return
  const clubs = Object.values(w.clubs).filter((c) => !c.national && c.id !== p.clubId && c.id !== w.userClubId && c.leagueId && c.reputation >= from.reputation - 6 && c.finance.transferBudget > p.value * 0.5)
  if (!clubs.length) return
  const to = rng.pick(clubs)
  if (storiesFor(w, (s) => s.playerId === p.id && s.to === to.id && isOpen(s)).length) return
  const o = outlet(w, rng, from.country, 1, 4)
  const st = newStory(w, {
    playerId: p.id, from: from.id, to: to.id, stage: 'rumour', kind: 'transfer', fee: roundValue(p.value * (1 + rng.next() * 0.45)), source: o.name, reliability: o.rel,
    note: `${o.name}: ${to.short} are keeping tabs on ${callName(p.name)}.`, expires: addDays(w.date, rng.int(10, 20)),
    ai: { interest: moveAppeal(w, p, to.id).score, nextStep: addDays(w.date, rng.int(4, 9)), round: -1 },
  })
  p.interestedClubs = [...new Set([...(p.interestedClubs || []), to.id])].slice(-4)
  if (p.ovr >= 80 || p.clubId === w.userClubId) rumourNews(w, st)
}

/** A completed move becomes (or updates) its done-deal story, with what's needed to undo it. */
export function recordDone(w: World, x: { p: Player; from: number; to: number; fee: number; kind: TransferStory['kind']; undo: TransferUndo; storyId?: number; wage?: number; years?: number }) {
  // the deal's own story, or the open link between this player and his new club that it grew out of
  const existing = (x.storyId ? story(w, x.storyId) : undefined) || storiesFor(w, (s) => s.playerId === x.p.id && s.to === x.to && isOpen(s))[0]
  // anyone else chasing him is out of luck
  for (const s of storiesFor(w, (s) => s.playerId === x.p.id && isOpen(s) && s !== existing)) step(w, s, 'failed', `${callName(x.p.name)} joined ${w.clubs[x.to]?.short} instead.`)
  const note = `${w.clubs[x.to]?.short} complete the ${x.kind === 'loan' ? 'loan' : x.kind === 'free' ? 'free signing' : 'signing'} of ${callName(x.p.name)}${x.fee ? ` for ${fmtMoney(x.fee)}` : ''}.`
  if (existing) {
    existing.fee = x.fee; existing.kind = x.kind; existing.undo = x.undo; existing.wage = x.wage; existing.years = x.years
    step(w, existing, 'done', note)
    existing.ai = undefined
    existing.expires = addDays(w.date, 60)
    return existing
  }
  return newStory(w, { playerId: x.p.id, from: x.from, to: x.to, stage: 'done', kind: x.kind, fee: x.fee, wage: x.wage, years: x.years, undo: x.undo, note, expires: addDays(w.date, notable(w, x.p, x.from, x.to, x.fee) ? 60 : 6) })
}

/** One day of the market: stories move on, stall, or collapse. */
export function marketDaily(w: World, rng: Rng) {
  const m = mk(w)
  const win = currentWindow(w)
  const deadline = !!win && win.close === w.date
  for (const s of [...m.stories]) {
    if (!isOpen(s)) continue
    const p = w.players[s.playerId]
    if (!p) { step(w, s, 'failed', 'The player is no longer available.'); continue }
    if (s.ai?.round === -99) continue // frozen in Edit Mode
    // he moved somewhere else in the meantime
    if (s.from && p.clubId !== s.from && s.stage !== 'rumour') { step(w, s, 'failed', `${callName(p.name)} is no longer at ${w.clubs[s.from]?.short}.`); continue }
    if (s.stage === 'rumour' && s.expires && w.date >= s.expires) { m.stories.splice(m.stories.indexOf(s), 1); continue }
    // the manager's club: a story follows his offers (or a club's real bid for his player), never the AI's own talks
    // (an older save may hold an AI-run story that involves him: it is taken over the same way)
    if (!s.user && (s.to === w.userClubId || s.from === w.userClubId) && s.ai) s.user = s.from === w.userClubId ? 'sell' : 'buy'
    if (s.user) {
      if (s.user === 'sell' && !s.offerId && s.ai && s.ai.round !== -99 && w.date >= s.ai.nextStep) bidFromRumour(w, s, p, rng)
      else if (s.user === 'buy' && !s.offerId && s.ai) { s.ai = undefined; if (s.stage !== 'rumour') step(w, s, 'failed', 'Nothing came of it: the talks never went beyond the papers.') }
      continue
    }
    if (!s.ai) continue
    // the window shut (a deal set up by hand waits for the next one instead)
    if (!win && s.kind !== 'free' && s.stage !== 'rumour') {
      if (s.edited) { if (s.stage !== 'close') advanceStory(w, s, p, rng, false); continue }
      step(w, s, 'failed', `The window closed before ${w.clubs[s.to]?.short} and ${w.clubs[s.from]?.short || 'the player'} could finish the deal.`); continue
    }
    const steps = deadline ? 3 : 1
    for (let k = 0; k < steps && isOpen(s) && s.ai && (deadline || w.date >= s.ai.nextStep); k++) advanceStory(w, s, p, rng, deadline)
  }
  // clear out what has had its time in the feed
  m.stories = m.stories.filter((s) => !s.expires || w.date <= s.expires || s.stage === 'rumour')
  // the papers pick up the manager's own interest now and then (more often while the window is open)
  if (rng.next() < (win ? 0.07 : 0.025)) userInterestRumour(w, rng)
  if (m.stories.length > 700) m.stories.length = 700
}

function advanceStory(w: World, s: TransferStory, p: Player, rng: Rng, deadline: boolean) {
  const buyer = w.clubs[s.to], seller = w.clubs[s.from]
  if (!buyer) { step(w, s, 'failed', 'The buying club dropped out.'); return }
  const quick = deadline ? 0 : 1
  switch (s.stage) {
    case 'rumour': {
      const real = (s.ai!.round ?? 0) >= 0
      const appeal = moveAppeal(w, p, buyer.id).score
      const affordable = buyer.finance.transferBudget >= (s.fee || p.value) * 0.8
      // paper talk becomes real only when the club could actually do it and he'd consider it
      if (real || (affordable && appeal > 6 && rng.next() < 0.14 * (s.reliability || 2))) {
        s.ai!.round = 0
        step(w, s, 'talks', `${buyer.short} make contact with ${seller?.short || 'the player’s camp'}${s.reliability && s.reliability >= 4 ? `, as ${s.source} reported` : ''}.`, rng.int(1, 3) * quick, rng)
      } else if (rng.next() < 0.35) {
        s.log.push({ date: w.date, stage: 'rumour', note: `${buyer.short} play down the link.` })
        s.ai!.nextStep = addDays(w.date, rng.int(5, 9))
      } else s.ai!.nextStep = addDays(w.date, rng.int(4, 8))
      return
    }
    case 'talks': {
      if (seller) {
        const stance = sellerStance(w, p, buyer.id)
        if (!stance.willing) { step(w, s, 'failed', stance.reason || `${seller.short} will not sell.`); return }
      }
      const appeal = moveAppeal(w, p, buyer.id)
      s.ai!.interest = appeal.score
      s.why = appeal.reasons.slice(0, 6)
      if ((appeal.score < -12 && s.mood !== 'keen') || s.mood === 'against') { step(w, s, 'failed', `${callName(p.name)} isn’t interested: ${appeal.reasons.find((r) => r.v < 0)?.text || 'he wants to stay'}.`); return }
      step(w, s, 'negotiating', seller ? `${seller.short} are willing to listen. Clubs negotiating a fee.` : `Personal terms under discussion.`, rng.int(1, 3) * quick, rng)
      return
    }
    case 'negotiating': {
      if (seller) {
        // the seller's price moves a little each round; the buyer's ceiling doesn't
        const ask = roundValue(askingPrice(w, p, buyer.id) * (finStyle(w, seller) === 'Seller' ? 0.95 : 1.05) * (1 - Math.min(3, s.ai!.round) * 0.02))
        const cap = Math.min(s.ai!.cap || ask * 1.1, buyer.finance.transferBudget * (buyer.transferPolicy?.review ? 0.95 : 0.85))
        const bid = s.fee || ask * 0.85
        s.ai!.round++
        if (bid >= ask * 0.97) {
          s.fee = roundValue(Math.min(bid, ask))
          step(w, s, 'close', `Fee agreed: ${fmtMoney(s.fee)}. Personal terms and a medical to come.`, rng.int(1, 2) * quick, rng)
        } else if (bid >= cap * 0.99) {
          step(w, s, 'failed', `The clubs couldn’t agree a fee: ${buyer.short} stopped at ${fmtMoney(bid)}, ${seller.short} wanted ${fmtMoney(ask)}.`)
        } else if (s.ai!.round >= 4) {
          step(w, s, 'failed', `Talks broke down: ${seller.short} held out for ${fmtMoney(ask)}.`)
        } else {
          const next = roundValue(Math.min(cap, bid + (ask - bid) * (0.45 + rng.next() * 0.4)))
          s.log.push({ date: w.date, stage: 'negotiating', note: s.ai!.round === 1 ? `${seller.short} reject an opening bid of ${fmtMoney(bid)}.` : `${buyer.short} go to ${fmtMoney(next)}. ${seller.short} want ${fmtMoney(ask)}.` })
          s.fee = next
          s.ai!.nextStep = addDays(w.date, rng.int(1, 3) * quick)
        }
      } else {
        step(w, s, 'close', `Terms close to being agreed.`, rng.int(1, 2) * quick, rng)
      }
      return
    }
    case 'close': {
      const appeal = moveAppeal(w, p, buyer.id)
      s.why = appeal.reasons.slice(0, 6)
      const noise = rng.normal(0, 5)
      if ((appeal.score + noise < -2 && s.mood !== 'keen') || s.mood === 'against') {
        const why = appeal.reasons.find((r) => r.v < 0)?.text
        step(w, s, 'failed', `${callName(p.name)} turns down ${buyer.short}${why ? `: ${why}` : ''}.`)
        return
      }
      if (rng.next() < 0.012 + p.hidden.injuryProne / 4000) { step(w, s, 'failed', `${callName(p.name)} fails his medical at ${buyer.short}.`); return }
      if (s.fee && buyer.finance.transferBudget < s.fee * 0.9) { step(w, s, 'failed', `${buyer.short} can no longer fund the deal.`); return }
      const role = roleForBuyer(w, p, buyer.id)
      const demand = contractDemand(w, p, buyer.id, role)
      // personal terms: the wage he wants against what the club pays its squad
      const bill = wageBill(w, buyer.id)
      const room = buyer.finance.wageBudget * (finStyle(w, buyer) === 'Ambitious' ? 1.15 : 1.05) - bill
      if (demand.wage > room && rng.next() < 0.6) { step(w, s, 'failed', `Personal terms: ${callName(p.name)} wants ${fmtMoney(demand.wage)} a week, more than ${buyer.short} will pay.`); return }
      const o = makeOffer(w, { playerId: p.id, fee: s.fee || 0, type: s.kind === 'loan' ? 'loan' : p.clubId ? 'transfer' : 'free', fromClubId: buyer.id })
      o.userIsBuyer = false
      executeTransfer(w, o, demand, s.id)
      return
    }
  }
}

// ---------------------------------------------------------------- the manager's own business
/** The story that follows an offer. */
export function offerStory(w: World, o: Pick<TransferOffer, 'id'>) {
  return mk(w).stories.find((s) => s.offerId === o.id)
}

/** Where an offer stands, as a stage of its story. */
export function stageOfOffer(o: TransferOffer): StoryStage {
  switch (o.status) {
    case 'Completed': return 'done'
    case 'Negotiations Failed': return 'failed'
    case 'Offer Accepted': case 'Contract Negotiation': case 'Contract Offered': case 'Awaiting Window': case 'Pre-Contract': return 'close'
    // a bid he turned down is over (a club that comes back does so with a new bid); one turned down for him is still
    // his to improve until it lapses
    case 'Offer Rejected': return o.userIsSeller ? 'failed' : 'negotiating'
    case 'Counter Offer': return 'negotiating'
    default: return o.history.filter((h) => h.by === 'buyer').length > 1 ? 'negotiating' : 'talks'
  }
}

/** What the offer's latest turn means, told the way the feed tells everyone else's deals. */
function offerNote(w: World, o: TransferOffer): string {
  const p = w.players[o.playerId]
  const buyer = w.clubs[o.fromClubId]?.short || 'They', seller = w.clubs[o.toClubId]?.short || 'his club'
  const name = p ? callName(p.name) : 'the player'
  const fee = fmtMoney(o.fee), loan = o.type.startsWith('loan')
  const last = o.history[o.history.length - 1]
  switch (o.status) {
    case 'Offer Submitted':
      if (o.history.filter((h) => h.by === 'buyer').length > 1) return loan ? `${buyer} revise their loan proposal for ${name}.` : `${buyer} improve their offer to ${fee}.`
      return loan ? `${buyer} propose a loan for ${name}.` : o.type === 'free' || o.type === 'pre-contract' ? `${buyer} open talks with the free agent ${name}.` : `${buyer} bid ${fee} for ${name}.`
    case 'Counter Offer': return o.userIsSeller ? `${seller} hold out for more; ${buyer} are at ${fee}.` : `${seller} want ${fmtMoney(o.counterFee || o.fee)}; ${buyer} have offered ${fee}.`
    case 'Offer Rejected': return o.userIsSeller ? `${seller} turn down ${buyer}'s ${loan ? 'loan proposal' : `${fee} bid`}.` : `${seller} reject ${buyer}'s ${loan ? 'loan proposal' : `${fee} bid`}.`
    case 'Offer Accepted': return loan ? `Loan agreed in principle. Terms with ${name} to come.` : `Fee agreed: ${fee}. Personal terms to come.`
    case 'Contract Negotiation': case 'Contract Offered': return `${name}'s representatives in talks over personal terms with ${buyer}.`
    case 'Awaiting Window': return `Deal agreed: ${name} joins ${buyer} when the window opens.`
    case 'Pre-Contract': return `${name} agrees a pre-contract with ${buyer}.`
    case 'Negotiations Failed': return last?.by === 'player' ? `${name} turns down personal terms with ${buyer}.` : `Talks between ${buyer} and ${seller} collapse.`
    default: return last?.text || ''
  }
}

/**
 * Bring an offer's story up to date (creating it, or carrying on the rumour or earlier bid it grew out of). Called
 * after every change to one of the manager's offers or a club's bid for his players; the deal itself is recorded by
 * executeTransfer, which completes this same story.
 */
export function syncOfferStory(w: World, o: TransferOffer, note?: string, carryOn?: TransferStory): TransferStory | undefined {
  const p = w.players[o.playerId]
  if (!p || (!o.userIsBuyer && !o.userIsSeller)) return undefined
  let stage = stageOfOffer(o)
  if (stage === 'done') return offerStory(w, o)
  const kind: TransferStory['kind'] = o.type.startsWith('loan') ? 'loan' : o.type === 'free' || o.type === 'pre-contract' ? 'free' : 'transfer'
  const fee = o.status === 'Counter Offer' && o.counterFee && o.userIsBuyer ? o.counterFee : o.fee
  const text = note || offerNote(w, o)
  // the story it grows out of: its own, the one named, or an open link between the same player and clubs
  const s = offerStory(w, o) || carryOn || mk(w).stories.find((x) => x.playerId === p.id && x.to === o.fromClubId && isOpen(x) && !x.offerId)
  // a new bid in talks already under way (or a club coming back after a no) carries the negotiation on
  if (s && stage === 'talks' && s.stage !== 'rumour' && (s.stage !== 'talks' || !!carryOn)) stage = 'negotiating'
  if (!s) return newStory(w, { playerId: p.id, from: o.toClubId, to: o.fromClubId, stage, kind, fee: kind === 'free' ? 0 : fee, user: o.userIsBuyer ? 'buy' : 'sell', offerId: o.id, note: text })
  s.offerId = o.id
  s.user = o.userIsBuyer ? 'buy' : 'sell'
  s.kind = kind
  s.fee = kind === 'free' ? 0 : fee
  s.ai = undefined
  s.expires = undefined
  if (s.stage !== stage) step(w, s, stage, text)
  else if (s.log[s.log.length - 1]?.note !== text) { s.updated = w.date; s.log.push({ date: w.date, stage, note: text }) }
  return s
}

/** A club's interest in one of the manager's players goes public before the bid: a report first, the bid days later. */
export function aiInterestInUserPlayer(w: World, buyer: Club, p: Player, fee: number, rng: Rng): TransferStory | undefined {
  if (storiesFor(w, (s) => s.playerId === p.id && s.to === buyer.id && isOpen(s)).length) return undefined
  const o = outlet(w, rng, w.clubs[p.clubId]?.country || buyer.country, 3, 5)
  const st = newStory(w, {
    playerId: p.id, from: p.clubId, to: buyer.id, stage: 'rumour', kind: 'transfer', fee: roundValue(fee * (0.95 + rng.next() * 0.2)), source: o.name, reliability: o.rel, user: 'sell',
    note: `${o.name}: ${buyer.short} are preparing a bid for ${callName(p.name)}.`,
    ai: { interest: moveAppeal(w, p, buyer.id).score, nextStep: addDays(w.date, rng.int(2, 5)), round: 0, cap: fee },
  })
  p.interestedClubs = [...new Set([...(p.interestedClubs || []), buyer.id])].slice(-4)
  rumourNews(w, st)
  return st
}

/** The reported bid arrives (or the interest quietly fades: the player moved, became untouchable, the money went). */
function bidFromRumour(w: World, s: TransferStory, p: Player, rng: Rng) {
  const buyer = w.clubs[s.to]
  const fee = s.ai?.cap || s.fee || p.value
  if (!buyer || p.clubId !== w.userClubId || p.untouchable || !isWindowOpen(w) || buyer.finance.transferBudget < fee * 0.9) {
    step(w, s, 'failed', `${buyer?.short || 'The club'} cool their interest in ${callName(p.name)}.`)
    return
  }
  aiBidForUserPlayer(w, buyer, p, rng, s, fee)
}

/** The manager's real interest gets out: a player he has shortlisted, is scouting or has asked about. */
export function userInterestRumour(w: World, rng: Rng) {
  const me = w.clubs[w.userClubId]
  if (!me || w.flags.unemployed) return
  const t = w.transfers.targets
  const pool = [...new Set([...w.transfers.shortlist, ...Object.values(t).filter((x) => x.status === 'Scouting' || x.status === 'Club Approached' || x.status === 'Report Available').map((x) => x.playerId)])]
    .map((id) => w.players[id]).filter((p): p is Player => !!p && p.clubId !== me.id && p.ovr >= 70)
    .filter((p) => !storiesFor(w, (s) => s.playerId === p.id && s.to === me.id && (isOpen(s) || diffDays(w.date, s.updated) < 30)).length)
  if (!pool.length) return
  const p = rng.pick(pool)
  // how close to the truth it is depends on how far the interest has gone
  const st = t[p.id]?.status
  const [lo, hi] = st === 'Club Approached' ? [3, 4] : st === 'Scouting' || st === 'Report Available' ? [2, 3] : [1, 2]
  const o = outlet(w, rng, w.clubs[p.clubId]?.country || me.country, lo, hi)
  const verb = st === 'Club Approached' ? 'have made an approach for' : st ? 'have had scouts watching' : 'are keeping tabs on'
  const s = newStory(w, {
    playerId: p.id, from: p.clubId, to: me.id, stage: 'rumour', kind: p.clubId ? 'transfer' : 'free', fee: p.clubId ? roundValue(p.value * (0.95 + rng.next() * 0.35)) : 0, source: o.name, reliability: o.rel, user: 'buy',
    note: `${o.name}: ${me.short} ${verb} ${callName(p.name)}.`, expires: addDays(w.date, rng.int(14, 24)),
  })
  if (p.ovr >= 78) rumourNews(w, s)
}

/** Window closing: whatever isn't finished collapses. */
export function windowShut(w: World) {
  for (const s of storiesFor(w, (s) => isOpen(s) && s.stage !== 'rumour' && s.kind !== 'free' && !!s.ai && !s.edited)) step(w, s, 'failed', `Deadline passed: ${w.clubs[s.to]?.short} ran out of time.`)
}

// ---------------------------------------------------------------- reversing a done deal (Edit Mode)
/** Undo a completed move as if it never happened: player, contract, money both ways, budgets, records, news. */
export function reverseDeal(w: World, storyId: number): { ok: boolean; text: string } {
  const s = story(w, storyId)
  const u = s?.undo
  if (!s || s.stage !== 'done' || !u) return { ok: false, text: 'Only completed deals can be reversed.' }
  const p = w.players[s.playerId]
  if (!p) return { ok: false, text: 'The player no longer exists.' }
  if (u.swap) return { ok: false, text: 'Swap deals can’t be reversed.' }
  if (p.clubId !== u.toClub) return { ok: false, text: `${callName(p.name)} has moved on since; only his latest move can be reversed.` }
  const from = w.clubs[u.fromClub], to = w.clubs[u.toClub]
  // money: the fee goes back, both budgets as they were, the signing bonus refunded
  if (to) {
    to.finance.balance += u.fee + u.signingBonus
    to.finance.transferBudget += u.toBudgetSpent
    to.finance.ledger = to.finance.ledger.filter((l) => !(l.date === u.date && (l.label === `Signing of ${p.name}` || l.label === `Signing bonus: ${p.name}`)))
  }
  if (from) {
    from.finance.balance -= u.fee
    from.finance.transferBudget = Math.max(0, from.finance.transferBudget - u.fromBudgetAdded)
    from.finance.ledger = from.finance.ledger.filter((l) => !(l.date === u.date && l.label === `Sale of ${p.name}`))
    if (from.transferPolicy?.lost) from.transferPolicy.lost = from.transferPolicy.lost.filter((l) => l.id !== p.id)
  }
  // a sell-on paid out of this fee goes back, and his old clause with it
  if (u.sellOnPaid) {
    const ben = w.clubs[u.sellOnPaid.clubId]
    if (ben) { ben.finance.balance -= u.sellOnPaid.amount; ben.finance.transferBudget = Math.max(0, ben.finance.transferBudget - (u.sellOnPaid.budget || 0)); ben.finance.ledger = ben.finance.ledger.filter((l) => !(l.date === u.date && l.label === `Sell-on: ${p.name}`)) }
    if (from) { from.finance.balance += u.sellOnPaid.amount; from.finance.ledger = from.finance.ledger.filter((l) => !(l.date === u.date && l.label.startsWith('Sell-on to '))) }
  }
  p.sellOn = u.sellOn ? { ...u.sellOn } : undefined
  // the player: back where he was, on his old terms
  if (to) for (const sh of to.sheets) { sh.lineup = sh.lineup.map((id) => (id === p.id ? 0 : id)); sh.bench = sh.bench.filter((id) => id !== p.id) }
  setPlayerClub(w, p, u.fromClub)
  p.contract = { ...u.contract }
  p.wage = u.wage
  p.jersey = u.jersey ?? p.jersey
  p.loan = u.loan ? { ...u.loan } : undefined
  p.joinedDate = u.joinedDate
  p.transferListed = !!u.transferListed
  p.loanListed = !!u.loanListed
  p.untouchable = !!u.untouchable
  p.morale = u.morale
  // the season stat line the move closed off comes back (games since stay: they were played)
  if (p.career.length > u.careerLen) p.career.length = u.careerLen
  for (const [k, line] of Object.entries(u.season || {})) {
    const cur = p.season[k]
    if (!cur) { p.season[k] = line; continue }
    for (const key of Object.keys(line) as (keyof typeof line)[]) (cur as any)[key] = ((cur as any)[key] || 0) + ((line as any)[key] || 0)
  }
  // records, news and messages
  const h = w.transfers.history.findIndex((r) => r.playerId === p.id && r.date === u.date && r.to === u.toClub && r.from === u.fromClub)
  if (h >= 0) w.transfers.history.splice(h, 1)
  const news = new Set(u.newsIds), inbox = new Set(u.inboxIds)
  w.news = w.news.filter((n) => !news.has(n.id))
  w.inbox = w.inbox.filter((m) => !inbox.has(m.id))
  if (w.transfers.targets[p.id]?.status === 'Completed') delete w.transfers.targets[p.id]
  // the feed: as if it never happened
  const m = mk(w)
  m.stories = m.stories.filter((x) => x !== s)
  touchRoster(w)
  return { ok: true, text: `${callName(p.name)} is back at ${from?.short || 'free agency'}; the deal has been undone.` }
}

// ---------------------------------------------------------------- Edit Mode
export interface StoryDraft { playerId: number; to: number; stage: StoryStage; kind: TransferStory['kind']; fee: number; source?: string; reliability?: number; freeze?: boolean }

/** Start a move by hand: at any stage, and it carries on from there (unless frozen). A done deal goes through now. */
export function editStartStory(w: World, d: StoryDraft): { ok: boolean; text: string; id?: number } {
  const p = w.players[d.playerId], to = w.clubs[d.to]
  if (!p || !to) return { ok: false, text: 'Pick a player and a club.' }
  if (p.clubId === to.id) return { ok: false, text: `${callName(p.name)} already plays for ${to.short}.` }
  const from = p.clubId
  if (d.stage === 'done') {
    const why = moveAppeal(w, p, to.id).reasons.slice(0, 6)
    const role = roleForBuyer(w, p, to.id)
    const demand = contractDemand(w, p, to.id, role)
    const o = makeOffer(w, { playerId: p.id, fee: d.fee, type: d.kind === 'loan' ? 'loan' : from ? 'transfer' : 'free', fromClubId: to.id })
    o.userIsBuyer = to.id === w.userClubId
    o.userIsSeller = from === w.userClubId
    const st = newStory(w, { playerId: p.id, from, to: to.id, stage: 'close', kind: d.kind, fee: d.fee, edited: true, why, note: 'Deal arranged in Edit Mode.' })
    executeTransfer(w, o, demand, st.id)
    if (!o.userIsBuyer && !o.userIsSeller) delete w.transfers.offers[o.id]
    touchRoster(w)
    return { ok: true, text: `Done deal: ${callName(p.name)} joins ${to.short}.`, id: st.id }
  }
  const src = d.stage === 'rumour' ? OUTLETS.find((o) => o.name === d.source) || OUTLETS[0] : undefined
  const st = newStory(w, {
    playerId: p.id, from, to: to.id, stage: d.stage, kind: d.kind, fee: d.fee, edited: true,
    source: src?.name, reliability: d.stage === 'rumour' ? d.reliability ?? src?.rel : undefined,
    note: d.stage === 'rumour' ? `${src?.name}: ${to.short} want ${callName(p.name)}.` : `${STAGE_LABEL[d.stage]}: ${to.short} and ${w.clubs[from]?.short || 'the player'}.`,
    expires: d.stage === 'rumour' ? addDays(w.date, 21) : undefined,
    ai: { interest: moveAppeal(w, p, to.id).score, nextStep: addDays(w.date, 1), round: d.freeze ? -99 : 0 },
  })
  if (d.stage === 'rumour') rumourNews(w, st)
  return { ok: true, text: `${STAGE_LABEL[d.stage]} started.`, id: st.id }
}

export interface StoryPatch {
  stage?: StoryStage; fee?: number; reliability?: number; freeze?: boolean; reason?: string
  /** a rumour: who reports it (their usual reliability with it), and whether there is real interest behind it */
  source?: string; real?: boolean
  /** talks: the most the buying club will pay, the player's own mind, when the next step comes, or take it now */
  cap?: number; mood?: 'keen' | 'against' | null; nextIn?: number; advanceNow?: boolean
}

/** Change a live story: its stage, the fee, the source; freeze or unfreeze it; force it through or kill it. */
export function editStory(w: World, id: number, patch: StoryPatch): { ok: boolean; text: string } {
  const s = story(w, id)
  if (!s) return { ok: false, text: 'Story not found.' }
  if (s.stage === 'done') return { ok: false, text: 'A done deal can only be reversed.' }
  // the manager's own deals follow their offer: they are edited there (editUserDeal)
  if (s.offerId && (patch.stage || patch.advanceNow || patch.nextIn != null || patch.cap != null)) return { ok: false, text: 'This deal follows a real offer: change the offer instead.' }
  s.edited = true
  if (patch.fee != null) s.fee = roundValue(patch.fee)
  if (patch.source) { const o = OUTLETS.find((x) => x.name === patch.source); if (o) { s.source = o.name; if (patch.reliability == null) s.reliability = o.rel } }
  if (patch.reliability != null) s.reliability = patch.reliability
  if (patch.real != null && s.stage === 'rumour') { s.ai ||= { interest: 0, nextStep: addDays(w.date, 3), round: 0 }; s.ai.round = patch.real ? 0 : -1; if (!patch.real) s.expires ||= addDays(w.date, 14) }
  if (patch.cap != null) { s.ai ||= { interest: 0, nextStep: addDays(w.date, 1), round: 0 }; s.ai.cap = roundValue(patch.cap) }
  if (patch.mood !== undefined) s.mood = patch.mood || undefined
  if (patch.nextIn != null && s.ai) s.ai.nextStep = addDays(w.date, Math.max(0, Math.round(patch.nextIn)))
  if (patch.advanceNow) {
    const p = w.players[s.playerId]
    if (!p) return { ok: false, text: 'The player is gone.' }
    s.ai ||= { interest: 0, nextStep: w.date, round: 0 }
    if (s.ai.round === -99) s.ai.round = 0
    const rng = new Rng(w.rng)
    advanceStory(w, s, p, rng, false)
    w.rng = rng.state
    touchRoster(w)
    return { ok: true, text: `${STAGE_LABEL[s.stage]}: ${s.log[s.log.length - 1]?.note || ''}` }
  }
  if (patch.freeze != null) { s.ai ||= { interest: 0, nextStep: addDays(w.date, 1), round: 0 }; s.ai.round = patch.freeze ? -99 : Math.max(0, s.ai.round) }
  if (patch.stage && patch.stage !== s.stage) {
    if (patch.stage === 'done') {
      const p = w.players[s.playerId], to = w.clubs[s.to]
      if (!p || !to) return { ok: false, text: 'The player or club is gone.' }
      const o = makeOffer(w, { playerId: p.id, fee: s.fee || 0, type: s.kind === 'loan' ? 'loan' : p.clubId ? 'transfer' : 'free', fromClubId: to.id })
      o.userIsBuyer = to.id === w.userClubId
      o.userIsSeller = p.clubId === w.userClubId
      executeTransfer(w, o, contractDemand(w, p, to.id, roleForBuyer(w, p, to.id)), s.id)
      if (!o.userIsBuyer && !o.userIsSeller) delete w.transfers.offers[o.id]
      touchRoster(w)
      return { ok: true, text: 'Deal completed.' }
    }
    if (patch.stage === 'failed') { step(w, s, 'failed', patch.reason || 'The deal is off.'); return { ok: true, text: 'Deal called off.' } }
    s.ai ||= { interest: 0, nextStep: addDays(w.date, 1), round: 0 }
    step(w, s, patch.stage, `${STAGE_LABEL[patch.stage]} (Edit Mode).`, 1)
  }
  return { ok: true, text: 'Story updated.' }
}

export interface UserDealPatch {
  /** his bid: the selling club agrees, counters at a price, or turns it down */
  answer?: 'accept' | 'reject'; counter?: number
  /** a club's bid for his player: what they offer, how long he has to answer, or they pull out */
  fee?: number; replyIn?: number; withdraw?: boolean
}

/** Edit Mode on one of the manager's own deals: the offer itself changes, and its story follows. */
export function editUserDeal(w: World, storyId: number, patch: UserDealPatch): { ok: boolean; text: string } {
  const s = story(w, storyId)
  const o = s?.offerId ? w.transfers.offers[s.offerId] : undefined
  if (!s || !o) return { ok: false, text: 'No offer behind this story.' }
  const p = w.players[o.playerId]
  if (!p) return { ok: false, text: 'The player is gone.' }
  const seller = w.clubs[o.toClubId]?.short || 'They', buyer = w.clubs[o.fromClubId]?.short || 'They'
  const t = w.transfers.targets[p.id]
  if (o.userIsBuyer) {
    if (patch.answer === 'accept') { o.status = 'Offer Accepted'; o.history.push({ date: w.date, by: 'seller', text: `${seller} accept ${fmtMoney(o.fee)}.`, fee: o.fee }) }
    else if (patch.answer === 'reject') { o.status = 'Offer Rejected'; o.history.push({ date: w.date, by: 'seller', text: `${seller} reject the offer.` }) }
    else if (patch.counter != null) { o.counterFee = roundValue(patch.counter); o.status = 'Counter Offer'; o.history.push({ date: w.date, by: 'seller', text: `${seller} want ${fmtMoney(o.counterFee)}.`, fee: o.counterFee }) }
    else return { ok: false, text: 'Nothing to change.' }
    if (t) t.status = o.status
  } else {
    if (patch.withdraw) { o.status = 'Negotiations Failed'; o.history.push({ date: w.date, by: 'buyer', text: `${buyer} withdraw their offer.` }) }
    else {
      if (patch.fee != null) { o.fee = roundValue(patch.fee); o.history.push({ date: w.date, by: 'buyer', text: `${buyer} offer ${fmtMoney(o.fee)}.`, fee: o.fee }) }
      if (patch.replyIn != null) o.respondBy = addDays(w.date, Math.max(0, Math.round(patch.replyIn)))
      if (o.status === 'Offer Rejected') o.status = 'Offer Submitted'
    }
    // the messages about it say what it is now
    for (const m of w.inbox) if (m.actions.some((a) => a.payload === o.id)) { if (patch.withdraw) { m.resolved = true; m.read = true } else if (o.respondBy) m.expires = o.respondBy }
  }
  s.edited = true
  syncOfferStory(w, o, patch.withdraw ? `${buyer} withdraw their offer for ${callName(p.name)}.` : undefined)
  return { ok: true, text: `${STAGE_LABEL[s.stage]}: ${s.log[s.log.length - 1]?.note || ''}` }
}

/** Ids of players in any open story (for badges on player profiles and lists). */
export function openStoryFor(w: World, playerId: number) {
  return storiesFor(w, (s) => s.playerId === playerId && isOpen(s)).sort((a, b) => OPEN.indexOf(b.stage) - OPEN.indexOf(a.stage))[0]
}

void rosterOf
void isWindowOpen
void fmtDate
export type { ISODate }
