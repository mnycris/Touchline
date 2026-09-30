// Edit Mode: sandbox changes to the world, applied through the same code paths the game itself uses, so everything
// downstream (overall, value, squads, tables, news, finances) stays consistent. Overall is never set directly: it is
// recalculated from the attributes and the position, exactly like growth does.
import type { AttrKey, Club, ContractOffer, MatchScript, Player, Position, SquadRole, TransferOffer, World } from '../../domain/types'
import { A } from '../../domain/types'
import { computeOvr } from '../../domain/ratings'
import { dynamicValue } from '../../domain/finance'
import { clamp } from '../../domain/rng'
import { contractDemand, executeTransfer } from './transfers'
import { touchRoster } from './roster'
import { getTalks } from './negotiation'

export const isEditMode = (w: World) => !!w.meta.editMode

export interface PlayerPatch {
  attrs?: Partial<Record<AttrKey, number>>
  pot?: number
  positions?: Position[]
  foot?: 'L' | 'R'
  weakFoot?: number
  skillMoves?: number
  height?: number
  morale?: number
  fitness?: number
  sharpness?: number
  healInjury?: boolean
  contract?: { wage?: number; until?: number; releaseClause?: number; role?: SquadRole }
}

/** Apply a player edit; returns the new overall. */
export function editPlayer(w: World, id: number, patch: PlayerPatch): number {
  const p = w.players[id]
  if (!p) return 0
  if (patch.attrs) for (const [k, v] of Object.entries(patch.attrs)) if (v != null) p.attrs[A[k as AttrKey]] = clamp(Math.round(v), 1, 99)
  if (patch.positions?.length) p.positions = [...new Set(patch.positions)].slice(0, 4)
  if (patch.foot) p.foot = patch.foot
  if (patch.weakFoot) p.weakFoot = clamp(Math.round(patch.weakFoot), 1, 5)
  if (patch.skillMoves) p.skillMoves = clamp(Math.round(patch.skillMoves), 1, 5)
  if (patch.height) p.height = clamp(Math.round(patch.height), 150, 210)
  if (patch.morale != null) p.morale = clamp(patch.morale, 0, 100)
  if (patch.fitness != null) p.fitness = clamp(patch.fitness, 20, 100)
  if (patch.sharpness != null) p.sharpness = clamp(patch.sharpness, 0, 100)
  if (patch.healInjury) p.injury = undefined
  p.ovr = computeOvr(p)
  if (patch.pot != null) p.pot = clamp(Math.round(patch.pot), p.ovr, 99)
  p.pot = Math.max(p.pot, p.ovr)
  if (patch.contract) {
    const c = patch.contract
    if (c.wage != null) { p.contract.wage = Math.max(100, Math.round(c.wage)); p.wage = p.contract.wage }
    if (c.until != null) p.contract.until = clamp(Math.round(c.until), w.season, w.season + 7)
    if (c.releaseClause != null) p.contract.releaseClause = Math.max(0, Math.round(c.releaseClause))
    if (c.role) p.contract.role = c.role
  }
  p.value = dynamicValue(p, w.date, p.valueCalib ?? 1)
  touchRoster(w)
  return p.ovr
}

/** A custom transfer: the player moves now, with the fee, contract and news a real deal would bring. */
export function editTransfer(w: World, playerId: number, toClubId: number, kind: 'transfer' | 'loan' | 'free', fee: number): boolean {
  const p = w.players[playerId]
  const to = w.clubs[toClubId]
  if (!p || !to || p.clubId === toClubId) return false
  if (p.academy) p.academy = false
  const role = roleFor(w, p, toClubId)
  const terms: ContractOffer | undefined = kind === 'loan' ? undefined : { ...contractDemand(w, p, toClubId, role), role }
  const o: TransferOffer = {
    id: `edit-${playerId}-${w.date}`, playerId, fromClubId: toClubId, toClubId: p.clubId, type: kind === 'loan' ? 'loan' : kind === 'free' ? 'free' : 'transfer',
    fee: kind === 'transfer' ? Math.max(0, Math.round(fee)) : 0, sellOn: 0, status: 'Offer Accepted', history: [], patience: 100, created: w.date,
    userIsBuyer: toClubId === w.userClubId, userIsSeller: p.clubId === w.userClubId,
  }
  executeTransfer(w, o, terms)
  touchRoster(w)
  return true
}

function roleFor(w: World, p: Player, clubId: number): SquadRole {
  const squad = Object.values(w.players).filter((x) => x.clubId === clubId && !x.academy).map((x) => x.ovr).sort((a, b) => b - a)
  const rank = squad.filter((o) => o > p.ovr).length
  return rank < 6 ? 'Crucial' : rank < 13 ? 'Important' : rank < 19 ? 'Rotation' : p.ovr + 6 < (squad[10] || 0) && p.pot > p.ovr + 8 ? 'Prospect' : 'Sparingly'
}

export function setScript(w: World, fixtureId: string, s: MatchScript | undefined) {
  const f = w.fixtures[fixtureId]
  if (!f || f.played) return
  if (!s || (!s.bias && !s.score && !s.events?.length && !Object.keys(s.form || {}).length && !s.lineups?.['0'] && !s.lineups?.['1'])) {
    if (w.scripts) delete w.scripts[fixtureId]
    return
  }
  ;(w.scripts ||= {})[fixtureId] = s
}

/** Negotiation override: what the selling club will accept, how long they keep talking, or accept on the spot. */
export function editNegotiation(w: World, offerId: string, patch: { floor?: number; patience?: number; accept?: boolean }) {
  const o = Object.values(w.transfers.offers).find((x) => x.id === offerId)
  if (!o) return
  if (patch.floor != null) o.sellerFloor = Math.max(0, Math.round(patch.floor))
  if (patch.patience != null) o.patience = clamp(patch.patience, 0, 100)
  if (patch.accept) { o.status = 'Offer Accepted'; o.history.push({ date: w.date, by: 'seller', text: 'The clubs have agreed a fee.', fee: o.fee }) }
}

/** Negotiation overrides kept per player: the club will talk, or agrees to the next bid. */
export function editDealFlags(w: World, playerId: number, patch: { willing?: boolean; accept?: boolean }) {
  if (patch.willing != null) { const m = (w.flags.editWilling ||= {}); if (patch.willing) m[playerId] = true; else delete m[playerId] }
  if (patch.accept != null) { const m = (w.flags.editAccept ||= {}); if (patch.accept) m[playerId] = true; else delete m[playerId] }
}

/** Personal terms override: the lowest wage the player will take, and a patient agent. */
export function editTalks(w: World, playerId: number, patch: { wageFloor?: number; patience?: number; accept?: ContractOffer }) {
  const t = getTalks(w, 'sign', playerId) || getTalks(w, 'renew', playerId)
  if (!t) return
  if (patch.wageFloor != null) { t.floor = Math.max(0, Math.round(patch.wageFloor)); t.ask = { ...t.ask, wage: Math.max(t.floor, Math.min(t.ask.wage, t.floor * 1.1)) } }
  if (patch.patience != null) t.patience = clamp(patch.patience, 0, 100)
  if (patch.accept) { t.floor = Math.min(t.floor, patch.accept.wage); t.ask = { ...patch.accept }; t.expectedRole = patch.accept.role; t.patience = 100 }
}

export function editClubMoney(w: World, clubId: number, patch: { transferBudget?: number; wageBudget?: number; balance?: number }) {
  const c = w.clubs[clubId]
  if (!c) return
  if (patch.transferBudget != null) c.finance.transferBudget = Math.max(0, Math.round(patch.transferBudget))
  if (patch.wageBudget != null) c.finance.wageBudget = Math.max(0, Math.round(patch.wageBudget))
  if (patch.balance != null) c.finance.balance = Math.round(patch.balance)
}

export interface ClubPatch {
  name?: string; short?: string; stadium?: string; capacity?: number
  reputation?: number; domestic?: number; intl?: number; youthRating?: number
  kit?: [string, string]
  market?: Club['market']
  formation?: string
}

/** Identity, standing, academy, colours, preferred shape and transfer behaviour of a club. */
export function editClub(w: World, clubId: number, patch: ClubPatch) {
  const c = w.clubs[clubId]
  if (!c) return
  if (patch.name?.trim()) c.name = patch.name.trim().slice(0, 40)
  if (patch.short?.trim()) c.short = patch.short.trim().slice(0, 18)
  if (patch.stadium?.trim()) c.stadium = patch.stadium.trim().slice(0, 48)
  if (patch.capacity != null) c.capacity = clamp(Math.round(patch.capacity), 1000, 130000)
  if (patch.reputation != null) c.reputation = clamp(Math.round(patch.reputation), 1, 100)
  if (patch.domestic != null) c.prestige.domestic = clamp(Math.round(patch.domestic), 1, 10)
  if (patch.intl != null) c.prestige.intl = clamp(Math.round(patch.intl), 1, 10)
  if (patch.youthRating != null) c.youthRating = clamp(Math.round(patch.youthRating), 1, 10)
  if (patch.kit) c.kit = patch.kit
  if (patch.market !== undefined) c.market = patch.market && (patch.market.buy || patch.market.sell) ? patch.market : undefined
  if (patch.formation) { const m = w.managers[c.managerId]; if (m) m.formation = patch.formation }
}

/** Make a whole squad stronger or weaker: every player's attributes shift together, overall recalculated. */
export function editSquadStrength(w: World, clubId: number, delta: number): number {
  const c = w.clubs[clubId]
  if (!c || !delta) return c?.squadAvg || 0
  const squad = Object.values(w.players).filter((p) => p.clubId === clubId)
  for (const p of squad) {
    for (let i = 0; i < p.attrs.length; i++) p.attrs[i] = clamp(Math.round(p.attrs[i] + delta), 1, 99)
    p.ovr = computeOvr(p)
    p.pot = clamp(Math.max(p.pot + delta, p.ovr), 1, 99)
    p.value = dynamicValue(p, w.date, p.valueCalib ?? 1)
  }
  const top = squad.map((p) => p.ovr).sort((a, b) => b - a).slice(0, 16)
  if (top.length) c.squadAvg = Math.round((top.reduce((a, b) => a + b, 0) / top.length) * 10) / 10
  touchRoster(w)
  return c.squadAvg
}
