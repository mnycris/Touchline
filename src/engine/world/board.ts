import type { Club, Objective, ObjectiveCategory, Priority, World } from '../../domain/types'
import { Rng, clamp } from '../../domain/rng'
import { ageOn } from '../../domain/dates'
import { fmtMoney } from '../../domain/finance'
import { positionOf } from '../competitions/tables'
import { rosterOf, wageBill } from './roster'

const PRIORITY_W: Record<Priority, number> = { Critical: 3, 'Very High': 2.3, High: 1.7, Medium: 1.2, Low: 0.8 }
export const CATEGORY_W: Record<ObjectiveCategory, number> = { 'Domestic Success': 0.38, 'Continental Success': 0.18, Financial: 0.18, 'Brand Exposure': 0.12, 'Youth Development': 0.14 }

export function expectedRank(w: World, club: Club): number {
  const lg = w.leagues[club.leagueId]
  if (!lg) return 1
  const sorted = lg.clubs.map((id) => w.clubs[id]).sort((a, b) => b.squadAvg - a.squadAvg)
  return sorted.findIndex((c) => c.id === club.id) + 1
}

export function generateObjectives(w: World, rng: Rng) {
  const club = w.clubs[w.userClubId]
  const lg = w.leagues[club.leagueId]
  const n = lg?.clubs.length || 20
  const exp = expectedRank(w, club)
  const season = w.season
  const deadline = `${season + 1}-06-15`
  const obj: Objective[] = []
  let k = 1
  const add = (category: ObjectiveCategory, priority: Priority, text: string, metric: string, target: number, compId?: string) =>
    obj.push({ id: `obj${season}-${k++}`, category, priority, text, metric, target, compId, progress: 0, status: 'active', deadline, season })
  const leagueComp = Object.values(w.competitions).find((c) => c.season === season && c.format === 'league' && c.clubs.includes(club.id))
  // ---- domestic league
  if (leagueComp) {
    const uefaSlots = lg?.uefa?.filter((x) => x === 'UCL').length || 0
    if (exp === 1) add('Domestic Success', 'Critical', `Win the ${leagueComp.short}`, 'leaguePos', 1, leagueComp.id)
    else if (exp <= 3) add('Domestic Success', 'Critical', uefaSlots ? `Qualify for the Champions League` : `Finish in the top ${exp + 1}`, 'leaguePos', uefaSlots || exp + 1, leagueComp.id)
    else if (exp <= 7) add('Domestic Success', 'Very High', `Finish in the top ${Math.min(7, exp + 1)}`, 'leaguePos', Math.min(7, exp + 1), leagueComp.id)
    else if (exp <= n / 2) add('Domestic Success', 'Very High', 'Finish in the top half', 'leaguePos', Math.floor(n / 2), leagueComp.id)
    else if (lg?.rele) add('Domestic Success', 'Critical', `Avoid relegation`, 'leaguePos', n - lg.rele, leagueComp.id)
    else add('Domestic Success', 'High', `Finish in the top ${Math.min(n, exp + 2)}`, 'leaguePos', Math.min(n, exp + 2), leagueComp.id)
    if (lg && lg.level >= 2 && lg.promo && exp <= 4) add('Domestic Success', 'Critical', 'Win promotion', 'leaguePos', lg.promo, leagueComp.id)
  }
  // ---- domestic cups
  const cups = Object.values(w.competitions).filter((c) => c.season === season && c.format === 'cup' && c.clubs.includes(club.id))
  for (const cup of cups.slice(0, 2)) {
    const rounds = cup.rounds.length
    const target = exp <= 2 ? rounds - 1 : exp <= 6 ? Math.max(0, rounds - 3) : Math.max(0, rounds - 5)
    const name = cup.rounds[Math.min(target, rounds - 1)]?.name || 'Final'
    add('Domestic Success', exp <= 3 ? 'High' : 'Medium', target >= rounds - 1 ? `Win the ${cup.short}` : `Reach the ${cup.short} ${name.toLowerCase()}`, 'cupRound', target, cup.id)
  }
  // ---- continental
  const uefa = Object.values(w.competitions).find((c) => c.season === season && c.format === 'uefa' && c.clubs.includes(club.id))
  if (uefa) {
    const pot = Object.values(uefa.groups || {}).findIndex((g) => g.includes(club.id))
    const target = pot === 0 ? 3 : pot === 1 ? 2 : pot <= 3 ? 1 : 0 // 0 KPO, 1 R16, 2 QF, 3 SF
    const names = ['knockout play-offs', 'round of 16', 'quarter-finals', 'semi-finals']
    add('Continental Success', pot === 0 ? 'Very High' : 'High', `Reach the ${uefa.short} ${names[target]}`, 'uefaRound', target, uefa.id)
  } else {
    add('Continental Success', exp <= 6 ? 'Medium' : 'Low', exp <= 6 ? 'Qualify for European competition' : 'Build towards European football', 'europeQual', exp <= 6 ? 1 : 0)
  }
  // ---- financial
  add('Financial', 'High', 'Keep the wage bill within budget', 'wageBudget', 1)
  add('Financial', club.finance.transferBudget > 50_000_000 ? 'Medium' : 'High', `Finish the season with a balance above ${fmtMoney(Math.max(0, club.finance.balance * 0.6))}`, 'balance', Math.round(Math.max(0, club.finance.balance * 0.6)))
  // ---- brand exposure
  if (club.prestige.intl >= 7) add('Brand Exposure', 'High', 'Sign a world-class player (OVR 84+)', 'marquee', 84)
  else add('Brand Exposure', 'Medium', `Score at least ${Math.round(38 + club.prestige.domestic * 3.5)} league goals`, 'leagueGoals', Math.round(38 + club.prestige.domestic * 3.5), leagueComp?.id)
  add('Brand Exposure', 'Low', 'Sell out the stadium: average attendance above 90%', 'attendance', 0.9)
  // ---- youth
  add('Youth Development', club.youthRating >= 6 ? 'High' : 'Medium', 'Give 1,500 minutes to players aged 21 or under', 'u21mins', 1500)
  add('Youth Development', 'Medium', 'Promote a player from the youth academy', 'promoteYouth', 1)
  if (rng.next() < 0.6) add('Youth Development', 'Low', 'Sign a young talent (21 or under, potential 80+)', 'signYoung', 1)
  w.board.objectives = [...w.board.objectives.filter((o) => o.season !== season), ...obj]
}

export function evaluateObjective(w: World, o: Objective): number {
  const club = w.clubs[w.userClubId]
  const comp = o.compId ? w.competitions[o.compId] : undefined
  switch (o.metric) {
    case 'leaguePos': {
      if (!comp) return 0
      const pos = positionOf(w, comp, club.id)
      const played = comp.table?.find((r) => r.clubId === club.id)?.p || 0
      const total = (comp.clubs.length - 1) * 2
      if (!played) return 0.5
      const n = comp.clubs.length
      const p = pos <= o.target ? 1 : clamp(1 - (pos - o.target) / Math.max(3, n * 0.35), 0, 1)
      return clamp(p * (0.4 + 0.6 * Math.min(1, played / Math.max(1, total))) + (1 - Math.min(1, played / total)) * 0.3, 0, 1)
    }
    case 'cupRound': {
      if (!comp) return 0
      const reached = comp.rounds.findIndex((r) => !(r.pool || []).includes(club.id) && !(r.byes || []).includes(club.id))
      const last = comp.rounds.map((r, i) => ((r.pool || []).includes(club.id) || (r.byes || []).includes(club.id) ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
      const won = comp.winner === club.id
      if (won) return 1
      void reached
      const winRequired = o.target >= comp.rounds.length - 1
      if (winRequired) return comp.status === 'finished' ? clamp(last / (o.target + 1), 0, 0.9) : clamp((last + 1) / (o.target + 2), 0, 0.95)
      return clamp((last + 1) / (o.target + 1), 0, 1)
    }
    case 'uefaRound': {
      if (!comp) return 0
      const idx = comp.rounds.map((r, i) => ((r.pool || []).includes(club.id) ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
      if (idx >= o.target) return 1
      if (idx < 0) {
        const pos = comp.table ? positionOf(w, comp, club.id) : 36
        return clamp(1 - pos / 36, 0, 0.6)
      }
      return clamp((idx + 1) / (o.target + 1), 0, 1)
    }
    case 'wageBudget': {
      // the same bill the manager sees: loans at the share the club pays
      const bill = wageBill(w, club.id)
      return bill <= club.finance.wageBudget ? 1 : clamp(1 - (bill - club.finance.wageBudget) / club.finance.wageBudget * 4, 0, 1)
    }
    case 'balance': return clamp(club.finance.balance / Math.max(1, o.target), 0, 1)
    case 'marquee': return w.transfers.history.some((t) => t.to === club.id && t.season === w.season && (w.players[t.playerId]?.ovr || 0) >= o.target) ? 1 : 0
    case 'leagueGoals': return comp ? clamp((comp.table?.find((r) => r.clubId === club.id)?.gf || 0) / o.target, 0, 1) : 0
    case 'attendance': {
      // real average home attendance against stadium capacity
      let sum = 0, n = 0
      for (const f of Object.values(w.fixtures)) {
        if (!f.played || !f.result || f.home !== club.id || f.neutral || w.competitions[f.compId]?.season !== w.season) continue
        sum += Math.min(1, f.result.attendance / Math.max(1, club.capacity)); n++
      }
      if (!n) return 0.5
      return clamp((sum / n) / o.target, 0, 1)
    }
    case 'u21mins': {
      const mins = rosterOf(w, club.id).filter((p) => ageOn(p.dob, w.date) <= 21).reduce((a, p) => a + Object.values(p.season).reduce((b, s) => b + s.mins, 0), 0)
      return clamp(mins / o.target, 0, 1)
    }
    case 'promoteYouth': return (w.flags.youthPromoted?.[w.season] || 0) >= 1 ? 1 : 0
    case 'signYoung': return w.transfers.history.some((t) => t.to === club.id && t.season === w.season && w.players[t.playerId] && ageOn(w.players[t.playerId].dob, w.date) <= 21 && w.players[t.playerId].pot >= 80) ? 1 : 0
    case 'europeQual': {
      const lg = Object.values(w.competitions).find((c) => c.season === w.season && c.format === 'league' && c.clubs.includes(club.id))
      const slots = w.leagues[club.leagueId]?.uefa?.length || 0
      const cupWin = Object.values(w.competitions).some((c) => c.season === w.season && c.format === 'cup' && c.winner === club.id)
      if (!o.target) return 1
      if (cupWin) return 1
      if (!lg || !slots) return 0
      const pos = positionOf(w, lg, club.id)
      const played = lg.table?.find((r) => r.clubId === club.id)?.p || 0
      if (!played) return 0.5
      return pos <= slots ? 1 : clamp(1 - (pos - slots) / 8, 0, 0.9)
    }
  }
  return 0.5
}

/** Weekly confidence update from objective progress. */
export function updateBoardConfidence(w: World) {
  const cats: Record<string, { s: number; w: number }> = {}
  for (const o of w.board.objectives.filter((x) => x.season === w.season)) {
    o.progress = evaluateObjective(w, o)
    const c = (cats[o.category] ||= { s: 0, w: 0 })
    c.s += o.progress * PRIORITY_W[o.priority]
    c.w += PRIORITY_W[o.priority]
  }
  let overall = 0
  for (const cat of Object.keys(CATEGORY_W) as ObjectiveCategory[]) {
    const c = cats[cat]
    const target = c ? (c.s / c.w) * 100 : 70
    const cur = w.board.confidence[cat] ?? 70
    w.board.confidence[cat] = Math.round(cur + (target - cur) * 0.25)
    overall += w.board.confidence[cat] * CATEGORY_W[cat]
  }
  w.board.overall = Math.round(overall)
}

export function finaliseObjectives(w: World) {
  for (const o of w.board.objectives.filter((x) => x.season === w.season && x.status === 'active')) {
    o.progress = evaluateObjective(w, o)
    o.status = o.progress >= 0.999 ? 'complete' : 'failed'
  }
}

export function boardMood(v: number): string {
  if (v >= 85) return 'Delighted'
  if (v >= 70) return 'Pleased'
  if (v >= 50) return 'Satisfied'
  if (v >= 35) return 'Concerned'
  if (v >= 20) return 'Disappointed'
  return 'Furious'
}
