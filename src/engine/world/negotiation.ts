// Contract talks with agents and fee talks with clubs: positions converge, patience runs out, walk-outs have
// consequences (frozen talks, damaged interest/relations, unhappy players), and every reply is phrased differently.
import type { ContractOffer, ISODate, Player, SquadRole, TransferOffer, World } from '../../domain/types'
import { Rng, clamp } from '../../domain/rng'
import { addDays, ageOn, fmtDate } from '../../domain/dates'
import { POS_GROUP } from '../../domain/constants'
import { fmtMoney, roundValue, roundWage } from '../../domain/finance'
import { contractDemand, playerInterest, roleForBuyer } from './transfers'
import { postNews, sendInbox } from './messages'
import { callName } from '../match/commentary'
import { finStyle } from './squadPlan'

export type AgentStyle = 'hardball' | 'businesslike' | 'friendly' | 'greedy'
export interface TalkLine { by: 'me' | 'agent' | 'club' | 'system'; text: string; date: ISODate; tone?: 'good' | 'bad' | 'neutral' }
export interface Talks {
  id: string
  playerId: number
  clubId: number
  kind: 'sign' | 'renew'
  offerId?: string
  started: ISODate
  round: number
  patience: number
  ask: ContractOffer
  floor: number // hidden: lowest weekly wage he'll accept at his preferred length and role
  style: AgentStyle
  /** what the player values most in this deal */
  priority?: Priority
  expectedRole: SquadRole
  lastWage?: number
  status: 'open' | 'agreed' | 'walked'
  used: string[] // phrase keys already used (avoid repeats)
  log: TalkLine[]
}
export interface Block { until: ISODate; reason: string; clubId: number }

const ROLE_RANK: Record<SquadRole, number> = { Crucial: 0, Important: 1, Rotation: 2, Sparingly: 3, Prospect: 3 }
const STYLE_LABEL: Record<AgentStyle, string> = { hardball: 'Tough negotiator', businesslike: 'Businesslike', friendly: 'Cooperative', greedy: 'Money-driven' }
export const agentStyleLabel = (s: AgentStyle) => STYLE_LABEL[s]

function hashN(n: number) { let h = n * 2654435761 >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h ^ (h >>> 13)) >>> 0 }
function styleFor(p: Player): AgentStyle {
  const h = hashN(p.id) % 100
  if (p.hidden.ambition > 78 && h < 45) return 'greedy'
  if (h < 22) return 'hardball'
  if (h < 58) return 'businesslike'
  if (h < 86) return 'friendly'
  return 'greedy'
}

// ---------------------------------------------------------------- what players value
export type Priority = 'Money' | 'Playing time' | 'Security' | 'Ambition' | 'Loyalty' | 'Home'
export const PRIORITY_TEXT: Record<Priority, string> = {
  Money: 'Wants the best financial package', 'Playing time': 'Wants a guaranteed role', Security: 'Wants a long contract',
  Ambition: 'Wants to win trophies', Loyalty: 'Wants to stay at the club', Home: 'Values being close to home',
}
/** Stable per player and deal: age, personality and circumstances decide what matters most. */
export function priorityOf(w: World, p: Player, clubId: number, kind: 'sign' | 'renew'): Priority {
  const age = ageOn(p.dob, w.date)
  const h = hashN(p.id * 7 + clubId) % 100
  const club = w.clubs[clubId]
  if (kind === 'renew' && p.hidden.loyalty > 72 && h < 60) return 'Loyalty'
  if (club && (club.country === p.nation || w.nations[p.nation]?.name === club.country) && h < 30) return 'Home'
  if (age >= 30 && h < 65) return 'Security'
  if (age <= 23 && h < 60) return 'Playing time'
  if (p.hidden.ambition > 74 && h < 55) return 'Ambition'
  if (p.contract.role === 'Sparingly' || p.contract.role === 'Rotation') return h < 55 ? 'Playing time' : 'Money'
  return h < 45 ? 'Money' : h < 70 ? 'Playing time' : h < 88 ? 'Security' : 'Ambition'
}
const PRIORITY_LINE: Record<Priority, string[]> = {
  Money: ["Let's be honest: the financial side matters most to him.", 'He knows his market value, and the package has to reflect it.', 'Money is not everything, but at this level it says how much you value him.'],
  'Playing time': ['What matters most to {p} is playing every week. The role has to be right.', 'He did not come this far to sit on a bench. The role is the key.', 'Guarantee him football and the rest is detail.'],
  Security: ['At this stage of his career, {p} wants security. The length of the deal is key.', 'He wants to know he is settled for years, not months.', 'His family wants stability. A long contract matters more than an extra few thousand.'],
  Ambition: ['{p} wants to win things. He needs to know you can compete.', 'He is ambitious. He will want a way out if the club stops competing.', 'Trophies. That is what drives him.'],
  Loyalty: ['He loves this club, you know that. Let us find a fair deal.', 'He wants to stay. Just show him he is valued.', 'This is home for him. That counts for a lot in these talks.'],
  Home: ['Being close to home means a lot to him and his family.', 'His family is settled here. That helps you.', 'Playing in his own country is important to him.'],
}

// ---------------------------------------------------------------- phrase banks
type Bank = Record<string, string[]>
const AGENT: Bank = {
  open: [
    'Thanks for getting in touch. {p} is flattered by the interest from {club}. To be clear from the start, we are looking at {wage} a week over {years} years, as {roleA} player.',
    'Good to finally sit down. My client knows all about {club} and the project. Our position is {wage} per week, {years} years, and he wants to be {roleA} player.',
    'Let me be straight with you: there is interest from elsewhere. For {p} to choose {club} we need {wage} a week on a {years}-year deal, with {roleA} role.',
    'We have prepared for this meeting. The numbers that work for {p}: {wage} weekly, {years} years, {roleA} role. Everything else we can talk about.',
    '{p} has told me he wants this to happen, but it has to be right for his career. That means {wage} a week and a {years}-year contract as {roleA} player.',
  ],
  openRenew: [
    '{p} is happy here, but he knows his worth now. We are asking for {wage} a week over {years} years as {roleA} player.',
    'We appreciate you opening talks early. My client would sign today for {wage} weekly on a {years}-year deal.',
    'He loves this club, that is not the issue. The issue is that his contract no longer reflects what he brings. {wage} a week, {years} years.',
    'Other clubs have been asking about his situation. If {club} want to secure him, the figure is {wage} per week for {years} years.',
  ],
  accept: [
    'That works for us. {p} is delighted. Let us get the paperwork done.',
    'We have a deal. {p} asked me to say he can\'t wait to get started.',
    'Fair offer, fair outcome. My client accepts. Thank you for the respect you showed him.',
    'Agreed. I told him this was the right move and he agrees. Send the documents over.',
    'You have yourself a player. {p} accepts the terms.',
  ],
  acceptRenew: [
    'Agreed. {p} is proud to extend his stay. He\'ll sign this afternoon.',
    'That\'s a deal. It was always his first choice to stay.',
    'Done. My client wants to thank the club for showing faith in him.',
  ],
  meet: [
    'We are close. Let\'s meet in the middle: {wage} a week and we shake hands.',
    'I can see you are trying. If you come up to {wage}, I will recommend it to him.',
    'Almost there. {wage} weekly and I will call {p} right now to tell him it\'s done.',
    'You are moving in the right direction. Give us {wage} a week and we sign.',
    'Nearly. Split the difference at {wage} and we have an agreement.',
  ],
  close: [
    'Not quite. We can come down to {wage} a week, but that is a real sacrifice from our side.',
    'I have spoken to {p}. He would accept {wage} weekly, but not a euro less.',
    'We have moved, now it is your turn. {wage} a week is where we are.',
    'We want this to happen, so we\'ll reduce to {wage} per week. The ball is in your court.',
    'You are still short. Our revised figure is {wage} a week.',
  ],
  hold: [
    'We\'ve already moved as far as we can. {wage} a week is where we stay.',
    'Our position hasn\'t changed: {wage} per week.',
    'You\'re close, but we can\'t go any lower than {wage}.',
    'I\'ve pushed him as far as he\'ll go. {wage} weekly is the number.',
  ],
  alt: [
    'Here is an idea: {altWage} a week if you add a {altBonus} signing-on fee. Same total, easier on your wage bill.',
    'If the weekly wage is the problem, we could accept {altWage} with a {altBonus} signing bonus.',
    'We can be flexible on structure. {altWage} weekly plus {altBonus} up front would also work.',
  ],
  altYears: [
    'Give him a {altYears}-year contract and we can drop to {altWage} a week.',
    'Security matters to him. At {altYears} years we would accept {altWage} weekly.',
  ],
  low: [
    'That is a long way from what we discussed. We need something close to {wage}, and you need to be serious.',
    'Honestly, I expected more. {p} is disappointed. Our number is {wage} a week.',
    'We are not close yet. {wage} per week is our revised position.',
    'I can\'t take that to my client. He\'d laugh. Move towards {wage} and we can keep talking.',
    'With respect, other clubs are offering much more. {wage} a week, or this is going nowhere.',
  ],
  insult: [
    'Is this a joke? That offer is an insult to a player of his level.',
    'I\'m not even going to show him that. Come back with a proper offer.',
    'If that is how {club} value {p}, maybe we are wasting our time here.',
    'We came here in good faith. That figure tells me you don\'t really want him.',
    'That\'s not an offer, that\'s a provocation. Our position has not changed: {wage} a week.',
  ],
  repeat: [
    'You\'ve made the same offer again. Repeating it won\'t change our answer.',
    'Nothing has moved on your side. We need you to improve the offer.',
    'Same numbers, same answer. My patience is not unlimited.',
  ],
  role: [
    '{p} will not accept being {roleOffered}. He expects {roleA} role, that is non-negotiable.',
    'Money is only part of it. He needs to be {roleA} player, not {roleOffered}.',
    'The role you are offering is a problem. He\'s not coming here to be {roleOffered}.',
  ],
  years: [
    'At his age, a {offYears}-year deal is not enough. He needs {years} years of security.',
    '{offYears} years doesn\'t work for us. We want {years}.',
  ],
  yearsShort: [
    'He doesn\'t want to commit for {offYears} years at that wage. {years} years suits him better.',
  ],
  warn: [
    'I have to be honest: my client is losing patience with these talks.',
    'We are running out of time here. The next offer needs to be your best.',
    'Other clubs are calling me every day. I can\'t keep {p} waiting much longer.',
    'This is starting to feel like a waste of time. One more chance.',
  ],
  walk: [
    'We\'re done here. {p} has decided to explore other options. Don\'t call me for a while.',
    'That\'s it. I\'m advising my client to walk away. You had every chance.',
    'This negotiation is over. We felt disrespected, and {p} agrees.',
    'We have been patient, but enough is enough. Good luck with your search.',
  ],
  walkRenew: [
    'We\'re ending talks. {p} feels undervalued and wants time to think about his future.',
    'My client is hurt by how these talks went. We\'ll speak again in a few weeks, maybe.',
    'That\'s enough for now. Don\'t be surprised if other clubs come calling.',
  ],
  blocked: [
    'His agent isn\'t taking your calls after the last round of talks.',
    '{p}\'s camp have made it clear they won\'t reopen talks yet.',
  ],
}
const CLUB: Bank = {
  style_Seller: [
    "We're a selling club and we don't hide it. But we don't give players away.",
    'Everyone knows we develop players to sell. Pay a fair price and this gets done quickly.',
  ],
  style_Ambitious: [
    "We don't need to sell. If you want him, you'll have to pay what he's worth to us.",
    'Our owners want to compete, not to cash in. Keep that in mind.',
  ],
  style_Frugal: [
    'Our board watches every euro. Make it worth our while.',
    'We run a tight ship here. The right number will be taken seriously.',
  ],
  accept: [
    '{seller} accept. We\'ll grant permission to speak to {p}.',
    'That is acceptable. {seller} agree the fee; you may talk to the player.',
    'Deal. Our board has approved the sale. Good luck with personal terms.',
    '{seller} have accepted your offer. It\'s now up to {p}.',
  ],
  counter: [
    'We appreciate the offer, but {p} is worth more to us. We\'d need {fee}.',
    'Not enough. Our board will sell for {fee}.',
    '{seller} value him at {fee}. Meet that and we can do business.',
    'Our position is {fee}. We\'re open to a deal, but not at that price.',
    'You\'ll have to do better. We\'re asking {fee}.',
  ],
  counterMove: [
    'We\'ve moved on our valuation: {fee}. We expect you to move too.',
    'We can come down to {fee}. That\'s a significant concession from us.',
    'Let\'s be reasonable. {fee} and he\'s yours to talk to.',
    'Our revised asking price is {fee}. We\'re close now.',
    'Final push from our side: {fee}. Take it or leave it.',
  ],
  low: [
    'That falls well short of our valuation. We need {fee}.',
    'Frankly that\'s disappointing. We won\'t accept less than {fee}.',
    'You\'re not close. If you want {p}, it\'s {fee}.',
  ],
  insult: [
    'That bid is insulting. We won\'t even take it to the board.',
    'Is that a serious offer? {p} is not for sale at that price.',
    'Our chairman laughed at that. Come back with a real bid.',
  ],
  warn: [
    'We are losing patience with these bids.',
    'One more offer like that and we end discussions.',
  ],
  walk: [
    '{seller} have ended talks. We won\'t discuss {p} with you for a while.',
    'Enough. {seller} are no longer willing to negotiate over {p}.',
    'We\'re done. Please don\'t contact us about {p} again this window.',
  ],
  blocked: [
    '{seller} refuse to reopen talks about {p} after the last negotiation.',
  ],
}

function fill(t: string, v: Record<string, string | number>) { return t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? '')) }
function pick(rng: Rng, bank: Bank, key: string, used: string[], v: Record<string, string | number>) {
  const lines = bank[key] || ['']
  const fresh = lines.map((_, i) => i).filter((i) => !used.includes(`${key}:${i}`))
  const i = (fresh.length ? fresh : lines.map((_, j) => j))[Math.floor(rng.next() * (fresh.length || lines.length))]
  used.push(`${key}:${i}`)
  if (used.length > 40) used.splice(0, used.length - 40)
  return fill(lines[i], v)
}
const roleA = (r: SquadRole) => (r === 'Crucial' ? 'a crucial' : r === 'Important' ? 'an important' : r === 'Rotation' ? 'a rotation' : r === 'Prospect' ? 'a prospect' : 'a squad')
const roleNoun = (r: SquadRole) => (r === 'Crucial' ? 'a crucial player' : r === 'Important' ? 'an important player' : r === 'Rotation' ? 'a rotation player' : r === 'Prospect' ? 'a prospect' : 'a fringe player')

// ---------------------------------------------------------------- blocks & memory
function blocks(w: World, key: 'talksBlocked' | 'bidBlocked'): Record<number, Block> { return (w.flags[key] ||= {}) }
export function talksBlock(w: World, playerId: number): Block | undefined {
  const b = blocks(w, 'talksBlocked')[playerId]
  return b && b.until > w.date ? b : undefined
}
export function bidBlock(w: World, playerId: number): Block | undefined {
  const b = blocks(w, 'bidBlocked')[playerId]
  return b && b.until > w.date ? b : undefined
}
/** Relationship with another club, -50..+50 (0 neutral). Walk-outs and lowballs hurt it; completed deals help. */
export function clubRelation(w: World, clubId: number): number { return (w.flags.clubRel ||= {})[clubId] || 0 }
export function adjustRelation(w: World, clubId: number, d: number) { const r = (w.flags.clubRel ||= {}); r[clubId] = clamp((r[clubId] || 0) + d, -50, 50) }
/** Interest penalty from a player whose talks with you collapsed (fades over a season). */
export function snubPenalty(w: World, playerId: number): number {
  const s = (w.flags.snubs ||= {})[playerId] as { date: string; v: number } | undefined
  if (!s) return 0
  const days = (Date.parse(w.date) - Date.parse(s.date)) / 86400000
  return days > 300 ? 0 : Math.round(s.v * (1 - days / 300))
}

// ---------------------------------------------------------------- contract talks
function talksMap(w: World): Record<string, Talks> { return (w.flags.talks ||= {}) }
export function getTalks(w: World, kind: Talks['kind'], playerId: number): Talks | undefined { return talksMap(w)[`${kind}:${playerId}`] }

function interestFor(w: World, p: Player, clubId: number, kind: Talks['kind']) {
  if (kind === 'renew') return clamp(58 + (p.morale - 50) * 0.55 + (p.hidden.loyalty - 50) * 0.3 - snubPenalty(w, p.id), 5, 100)
  return playerInterest(w, p, clubId)
}

export function openContractTalks(w: World, p: Player, kind: Talks['kind'], rng: Rng, offerId?: string): Talks {
  const existing = getTalks(w, kind, p.id)
  if (existing && existing.status === 'open' && existing.clubId === w.userClubId) { if (offerId) existing.offerId = offerId; return existing }
  const clubId = w.userClubId
  const club = w.clubs[clubId]
  const expectedRole = roleForBuyer(w, p, clubId)
  const ask = contractDemand(w, p, clubId, expectedRole)
  if (kind === 'renew') ask.wage = Math.max(ask.wage, roundWage(p.contract.wage * 1.05))
  const style = styleFor(p)
  const priority = priorityOf(w, p, clubId, kind)
  const interest = interestFor(w, p, clubId, kind)
  const styleAdj = style === 'hardball' ? 0.035 : style === 'greedy' ? 0.055 : style === 'friendly' ? -0.03 : 0
  // what he values moves his floor: loyal players and home-comers ask less; ambitious ones less for a big club
  const priAdj = priority === 'Loyalty' ? -0.04 : priority === 'Home' ? -0.03 : priority === 'Money' ? 0.02 : priority === 'Ambition' ? clamp((50 - club.reputation) / 800, -0.04, 0.04) : 0
  const floorF = clamp(0.93 - (interest - 55) * 0.0022 + styleAdj + priAdj + rng.normal(0, 0.02), 0.78, 1.05)
  const floor = roundWage(Math.max(kind === 'renew' ? p.contract.wage : 0, ask.wage * floorF))
  const patience = Math.round(100 * (style === 'friendly' ? 1.15 : style === 'hardball' ? 0.85 : style === 'greedy' ? 0.92 : 1) * (priority === 'Loyalty' ? 1.2 : 1) * (0.82 + interest / 280))
  if (priority === 'Security') ask.years = Math.min(5, ask.years + 1)
  const t: Talks = { id: `${kind}:${p.id}`, playerId: p.id, clubId, kind, offerId, started: w.date, round: 0, patience, ask, floor, style, priority, expectedRole, status: 'open', used: [], log: [] }
  const v = vars(w, p, t)
  t.log.push({ by: 'agent', date: w.date, text: `${pick(rng, AGENT, kind === 'renew' ? 'openRenew' : 'open', t.used, { ...v, club: club.short })} ${fill(rng.pick(PRIORITY_LINE[priority]), v)}` })
  talksMap(w)[t.id] = t
  return t
}

function vars(w: World, p: Player, t: Talks): Record<string, string | number> {
  return { p: callName(p.name), club: w.clubs[t.clubId]?.short || '', wage: fmtMoney(t.ask.wage), years: t.ask.years, roleA: roleA(t.expectedRole) }
}

/** Weekly-equivalent value of a package (wage + amortised signing bonus + expected bonuses + clause/role/length fit). */
function packageValue(p: Player, c: ContractOffer, pref: ContractOffer, expected: SquadRole, age: number, pri?: Priority): number {
  const g = POS_GROUP[p.positions[0]]
  const goals = g === 'ATT' ? 14 : g === 'MID' ? 5 : 1.5
  const cs = g === 'GK' || g === 'DEF' ? 11 : 0
  const bonusWeekly = (c.bonusGoal * goals + c.bonusCleanSheet * cs + c.bonusApp * 30) / 52 * 0.6
  const money = pri === 'Money', time = pri === 'Playing time', secure = pri === 'Security', amb = pri === 'Ambition'
  let v = c.wage + c.signingBonus / (52 * Math.max(1, c.years)) * (money ? 1 : 0.85) + bonusWeekly * (money ? 1.3 : 1)
  const gap = ROLE_RANK[expected] - ROLE_RANK[c.role]
  if (gap > 0) v *= 1 + gap * (time ? 0.06 : 0.03) // better role than expected
  if (gap < 0) v *= 1 + gap * (time ? 0.16 : money ? 0.06 : 0.09)
  const dy = c.years - pref.years
  if (dy < 0) v *= 1 + dy * (secure ? 0.1 : age >= 29 ? 0.06 : 0.025)
  if (dy > 0) v *= secure ? 1 + Math.min(1, dy) * 0.02 : 1 - dy * (age <= 24 && p.pot - p.ovr >= 6 ? 0.035 : 0.01)
  if (c.releaseClause > 0) v *= (c.releaseClause < p.value * 1.6 ? 1.035 : 1.015) * (amb ? 1.03 : 1)
  return v
}

export interface TalkResult { result: 'accept' | 'counter' | 'walk'; talks: Talks; replies: TalkLine[] }

export function respondToContract(w: World, t: Talks, c: ContractOffer, rng: Rng): TalkResult {
  const p = w.players[t.playerId]
  const age = ageOn(p.dob, w.date)
  const v = vars(w, p, t)
  const replies: TalkLine[] = []
  const say = (key: string, extra: Record<string, string | number> = {}, tone: TalkLine['tone'] = 'neutral') => {
    const text = pick(rng, AGENT, key, t.used, { ...v, ...extra, wage: fmtMoney(t.ask.wage) })
    replies.push({ by: 'agent', text, date: w.date, tone })
  }
  t.round++
  t.log.push({ by: 'me', date: w.date, text: offerLine(c) })
  const pref = t.ask
  const V = packageValue(p, c, pref, t.expectedRole, age, t.priority)
  const T = packageValue(p, { ...pref }, pref, t.expectedRole, age, t.priority)
  const F = packageValue(p, { ...pref, wage: t.floor }, pref, t.expectedRole, age, t.priority)
  const repeat = t.lastWage != null && c.wage <= t.lastWage && t.round > 1
  // visible progress from the club calms things down
  const progress = t.lastWage != null && c.wage >= t.lastWage * 1.05 ? 0.6 : 1
  t.lastWage = c.wage
  const roleGap = ROLE_RANK[c.role] - ROLE_RANK[t.expectedRole]
  const roleBlocker = roleGap >= 2 && p.ovr >= 70 && t.expectedRole !== 'Prospect'

  const finish = (result: TalkResult['result']) => {
    t.log.push(...replies)
    if (result === 'walk') applyWalkout(w, t, rng)
    if (result === 'accept') t.status = 'agreed'
    return { result, talks: t, replies }
  }

  if (!roleBlocker && V >= T * 0.985) { say(t.kind === 'renew' ? 'acceptRenew' : 'accept', {}, 'good'); return finish('accept') }
  if (!roleBlocker && V >= F) {
    const pAccept = 0.3 + t.round * 0.18 + ((V - F) / Math.max(1, T - F)) * 0.45 + (t.style === 'friendly' ? 0.12 : t.style === 'hardball' ? -0.1 : 0)
    if (rng.next() < pAccept) { say(t.kind === 'renew' ? 'acceptRenew' : 'accept', {}, 'good'); return finish('accept') }
    // meet in the middle
    t.ask = { ...t.ask, wage: roundWage(Math.max(t.floor, (t.ask.wage + c.wage) / 2)) }
    t.patience -= 3
    say('meet', {}, 'good')
    return finish('counter')
  }
  // below the floor
  const gap = (F - V) / F
  if (repeat) { t.patience -= 12; say('repeat', {}, 'bad') }
  if (roleBlocker) { t.patience -= 10; say('role', { roleOffered: roleNoun(c.role) }, 'bad') }
  const yearsIssue = c.years < pref.years && (age >= 29 || t.priority === 'Security')
  // what's actually missing, in the terms that matter to him
  if (!repeat && !roleBlocker && rng.next() < 0.55) {
    const hint = t.priority === 'Playing time' && roleGap > 0 ? `The money is one thing, but ${roleNoun(c.role)}? He wants to be ${roleA(t.expectedRole)} player. That is the sticking point.`
      : t.priority === 'Security' && c.years < pref.years ? `${c.years} years is not enough. He wants security: ${pref.years} years.`
        : t.priority === 'Money' && c.wage < t.floor ? `The number is not there yet. We are still some way apart on the wage.`
          : t.priority === 'Ambition' && !c.releaseClause ? `He wants to know he has options if the club stops competing. A release clause would help.`
            : ''
    if (hint) replies.push({ by: 'agent', text: hint, date: w.date, tone: 'neutral' })
  }
  if (gap > 0.3) {
    t.patience -= (t.style === 'hardball' ? 34 : t.style === 'friendly' ? 20 : 26) * progress
    if (t.style === 'greedy') t.ask = { ...t.ask, wage: roundWage(t.ask.wage * 1.02) }
    if (!repeat) say('insult', {}, 'bad')
  } else if (gap > 0.12) {
    t.patience -= (t.style === 'friendly' ? 9 : t.style === 'hardball' ? 15 : 12) * progress
    t.ask = { ...t.ask, wage: roundWage(Math.max(t.floor, t.ask.wage - (t.ask.wage - t.floor) * (t.style === 'friendly' ? 0.4 : 0.25))) }
    if (!repeat && !roleBlocker) say('low', {}, 'bad')
  } else {
    t.patience -= (t.style === 'hardball' ? 8 : 5) * progress
    const before = t.ask.wage
    t.ask = { ...t.ask, wage: roundWage(Math.max(t.floor, t.ask.wage - (t.ask.wage - t.floor) * (t.style === 'friendly' ? 0.6 : 0.45))) }
    const held = t.ask.wage >= before
    if (!repeat && !roleBlocker) {
      if (yearsIssue) say('years', { offYears: c.years }, 'neutral')
      else if (rng.next() < 0.45) {
        // alternative structure: shift part of the wage into a signing-on fee or a longer deal
        if (rng.next() < 0.55 || age >= 30) {
          const altWage = roundWage(t.floor * 1.01)
          const altBonus = roundValue((t.ask.wage - altWage) * 52 * t.ask.years * 0.9)
          say('alt', { altWage: fmtMoney(altWage), altBonus: fmtMoney(altBonus) }, 'good')
        } else {
          const altYears = Math.min(5, pref.years + 1)
          say('altYears', { altYears, altWage: fmtMoney(roundWage(Math.max(t.floor, t.ask.wage * 0.95))) }, 'good')
        }
      } else say(held ? 'hold' : 'close', {}, 'neutral')
    }
  }
  t.patience = Math.round(t.patience)
  if (t.patience <= 0) {
    replies.length = 0
    say(t.kind === 'renew' ? 'walkRenew' : 'walk', {}, 'bad')
    return finish('walk')
  }
  if (t.patience < 28 && rng.next() < 0.7) say('warn', {}, 'bad')
  return finish('counter')
}

function offerLine(c: ContractOffer) {
  return `${fmtMoney(c.wage)}/wk · ${c.years} yr${c.years > 1 ? 's' : ''} · ${c.role}${c.signingBonus ? ` · ${fmtMoney(c.signingBonus)} signing-on` : ''}${c.releaseClause ? ` · clause ${fmtMoney(c.releaseClause)}` : ''}`
}

function applyWalkout(w: World, t: Talks, rng: Rng) {
  const p = w.players[t.playerId]
  t.status = 'walked'
  const days = t.kind === 'renew' ? 50 + Math.round(rng.next() * 30) : 35 + Math.round(rng.next() * 30)
  blocks(w, 'talksBlocked')[p.id] = { until: addDays(w.date, days), reason: t.kind === 'renew' ? 'Contract talks broke down' : 'His agent walked out of talks', clubId: t.clubId }
  ;(w.flags.snubs ||= {})[p.id] = { date: w.date, v: t.kind === 'renew' ? 12 : 22 }
  const club = w.clubs[t.clubId]
  if (t.kind === 'sign') {
    if (t.offerId) {
      const o = w.transfers.offers[t.offerId]
      if (o) { o.status = 'Negotiations Failed'; o.history.push({ date: w.date, by: 'player', text: `${p.name} rejected personal terms.` }) }
    }
    const tg = w.transfers.targets[p.id]; if (tg) tg.status = 'Negotiations Failed'
    if (p.ovr >= 76) postNews(w, { headline: `${p.name} talks with ${club.short} collapse`, body: `${p.name}'s representatives have ended contract discussions with ${club.name}, sources close to the player say. The two sides were unable to agree personal terms.`, kind: 'transfer', playerIds: [p.id], clubIds: [club.id], importance: 2, userRelated: true })
  } else {
    p.morale = clamp(p.morale - 16, 0, 100)
    if (p.ovr >= 74 && p.hidden.ambition > 55 && rng.next() < 0.55) {
      p.transferListed = true
      sendInbox(w, {
        from: p.name, fromRole: 'Player', category: 'Squad', subject: 'I want to leave', playerId: p.id, image: { kind: 'player', id: p.id },
        body: `Boss, after how the contract talks went I don't feel valued here. I'd like the club to consider offers for me. My agent has already told other clubs I'm available.`,
        actions: [],
      })
    }
    if (p.ovr >= 78) postNews(w, { headline: `${p.name} contract talks stall at ${club.short}`, body: `Negotiations over a new deal for ${p.name} have broken down. The player's camp are said to be unhappy with ${club.name}'s offer.`, kind: 'contract', playerIds: [p.id], clubIds: [club.id], importance: 2, userRelated: true })
  }
}

export function blockedText(w: World, p: Player, rng: Rng): string | undefined {
  const b = talksBlock(w, p.id)
  if (!b) return undefined
  return `${pick(rng, AGENT, 'blocked', [], { p: callName(p.name) })} (until ${fmtDate(b.until, 'dm')})`
}

// ---------------------------------------------------------------- fee talks (selling AI club)
export function clubLine(rng: Rng, key: keyof typeof CLUB, used: string[], v: Record<string, string | number>) { return pick(rng, CLUB, key as string, used, v) }

/** Hidden lowest fee the seller will accept, fixed on the first bid. */
export function sellerFloor(w: World, o: TransferOffer, ask: number, rng: Rng): number {
  if (o.sellerFloor) return o.sellerFloor
  const p = w.players[o.playerId]
  const seller = w.clubs[o.toClubId]
  const role = p.contract.role
  let m = role === 'Crucial' ? 0.95 : role === 'Important' ? 0.9 : role === 'Rotation' ? 0.86 : role === 'Prospect' ? 0.9 : 0.8
  if (p.transferListed) m *= 0.86
  if (seller.finance.balance < 0) m *= 0.9
  // how the club does business: sellers deal, ambitious clubs dig in over players they build around
  const style = finStyle(w, seller)
  m *= style === 'Seller' ? 0.92 : style === 'Frugal' ? 0.97 : style === 'Ambitious' ? (role === 'Crucial' || role === 'Important' ? 1.06 : 1.01) : 1
  const yl = p.contract.until - w.season
  if (yl <= 1) m *= 0.9
  m *= 1 - clubRelation(w, o.fromClubId) / 400
  m += rng.normal(0, 0.025)
  o.sellerFloor = roundValue(ask * clamp(m, 0.65, 1.02))
  return o.sellerFloor
}
