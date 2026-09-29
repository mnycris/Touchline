import type { Competition, Fixture, MatchResult, World } from '../../domain/types'
import { Rng, clamp } from '../../domain/rng'
import { addDays, ageOn, diffDays, fmtDate, weekday } from '../../domain/dates'
import { fmtMoney } from '../../domain/finance'
import { callName } from '../match/commentary'
import { ClubDateIndex, currentWindow, isWindowOpen } from '../competitions/calendar'
import { advanceCup, advanceSuperCup } from '../competitions/cups'
import { advanceUefa } from '../competitions/uefa'
import { positionOf, sortTable } from '../competitions/tables'
import { applyMatchResult, simulateFixture } from './matchRunner'
import { fixturesByDate, resetFixtureIndexes, worldDateIndex } from '../competitions/fixtures'
import { applyGrowth, dailyTraining } from './development'
import { aiTransferDay, processOffers, yearsLeft } from './transfers'
import { updateBoardConfidence, generateObjectives } from './board'
import { checkPromises, maybeConversations, weeklyMorale } from './morale'
import { dailyScouting, dailyYouth } from './scouting'
import { monthlyAwards } from './awards'
import { isDeepFixture } from './matchRunner'
import { dailyWorldNews, matchWorldNews } from './worldNews'
import { aiManagerReview, userJobSecurity } from './managers'
import { advancePlayoff, createPlayoffs, leagueFinished, seasonRollover } from './season'
import { postNews, sendInbox, staffNames } from './messages'
import { rollInjury } from './matchRunner'
import { rosterOf } from './roster'
import { processPendingDeals } from './userActions'

export type StopReason = 'match' | 'inbox' | 'deadline' | 'season-end' | 'window' | 'sacked' | 'none' | 'limit' | 'watch'

function dateIndex(w: World): ClubDateIndex {
  return worldDateIndex(w)
}

export function worldRng(w: World) {
  return new Rng(w.rng)
}

export function fixturesOn(w: World, date: string): Fixture[] {
  const list = fixturesByDate(w).get(date) || []
  return list.filter((f) => !f.played && w.fixtures[f.id] === f).sort((a, b) => a.time.localeCompare(b.time))
}

export function userFixtureOn(w: World, date: string): Fixture | undefined {
  if (w.flags.unemployed) return undefined
  return fixturesOn(w, date).find((f) => f.home === w.userClubId || f.away === w.userClubId)
}

export function nextUserFixture(w: World): Fixture | undefined {
  let best: Fixture | undefined
  for (const f of Object.values(w.fixtures)) {
    if (f.played || (f.home !== w.userClubId && f.away !== w.userClubId)) continue
    if (!best || (f.date + f.time) < (best.date + best.time)) best = f
  }
  return best
}

/** Everything that happens after a fixture result is known. */
export function afterMatch(w: World, f: Fixture, result: MatchResult, rng: Rng, full = false) {
  const res = applyMatchResult(w, f, result, rng, full)
  const comp = w.competitions[f.compId]
  const idx = dateIndex(w)
  if (comp) {
    if (comp.format === 'cup') {
      const r = advanceCup(w, comp, f, rng, idx)
      if (r.champion) championNews(w, comp, r.champion, f)
      else if (r.roundDone && comp.clubs.includes(w.userClubId)) drawNews(w, comp)
    } else if (comp.format === 'supercup') {
      const r = advanceSuperCup(w, comp, f)
      if (r.champion) championNews(w, comp, r.champion, f)
    } else if (comp.format === 'uefa') {
      const r = advanceUefa(w, comp, f, rng, idx)
      if (r.champion) championNews(w, comp, r.champion, f)
      else if (r.stageDrawn && comp.clubs.includes(w.userClubId)) drawNews(w, comp, r.stageDrawn)
    } else if (comp.format === 'playoff') {
      advancePlayoff(w, comp, f.id)
    } else if (comp.format === 'league') {
      if (comp.status === 'upcoming') comp.status = 'active'
      if (leagueFinished(w, comp)) {
        comp.status = 'finished'
        createPlayoffs(w, comp)
        leagueChampionNews(w, comp)
      }
    }
    if (comp.status === 'upcoming') comp.status = 'active'
  }
  matchWorldNews(w, f, result, res.injuries)
  // user-facing messages
  if (f.userInvolved) {
    const staff = staffNames(w)
    for (const inj of res.injuries) {
      const p = w.players[inj.id]
      if (p?.clubId !== w.userClubId) continue
      sendInbox(w, {
        from: staff.medical, fromRole: 'Head of Medical', category: 'Medical', subject: `Injury: ${p.name}`,
        body: `${p.name} suffered a ${inj.type.toLowerCase()} against ${w.clubs[f.home === w.userClubId ? f.away : f.home].short}. He is expected to be out for ${inj.days} day${inj.days === 1 ? '' : 's'} (return ${fmtDate(p.injury!.until, 'dm')}).`,
        actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id, primary: true }], playerId: p.id, image: { kind: 'player', id: p.id },
      })
      if (p.ovr >= 80) postNews(w, { headline: `${p.name} ruled out with ${inj.type.toLowerCase()}`, body: `${w.clubs[p.clubId].name} will be without ${p.name} for around ${Math.max(1, Math.round(inj.days / 7))} week${inj.days >= 14 ? 's' : ''}.`, kind: 'injury', playerIds: [p.id], clubIds: [p.clubId], importance: 3, userRelated: true })
    }
    for (const b of res.bans) {
      const p = w.players[b.id]
      if (p?.clubId !== w.userClubId) continue
      sendInbox(w, { from: staff.assistant, fromRole: 'Assistant Manager', category: 'Squad', subject: `Suspension: ${p.name}`, body: `${p.name} will miss the next ${b.games} ${comp?.short ?? ''} match${b.games > 1 ? 'es' : ''} through suspension.`, actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id }], playerId: p.id, image: { kind: 'player', id: p.id } })
    }
    resultNews(w, f, result, true)
  } else if (comp && (comp.clubs.includes(w.userClubId) || comp.format === 'uefa' || isDeepFixture(w, f))) {
    resultNews(w, f, result, false)
  }
}

function resultNews(w: World, f: Fixture, r: MatchResult, user: boolean) {
  const home = w.clubs[f.home], away = w.clubs[f.away]
  const [h, a] = r.score
  const comp = w.competitions[f.compId]
  const margin = Math.abs(h - a)
  const upset = (h > a && home.squadAvg + 5 < away.squadAvg) || (a > h && away.squadAvg + 5 < home.squadAvg)
  const hat = r.events.filter((e) => e.type === 'goal' || e.type === 'penGoal').reduce((m, e) => { m.set(e.player!, (m.get(e.player!) || 0) + 1); return m }, new Map<number, number>())
  const hatTrick = [...hat.entries()].find(([, n]) => n >= 3)
  if (!user && !(margin >= 4 || upset || hatTrick || f.derby || f.roundName === 'Final')) return
  const winner = h > a ? home : a > h ? away : undefined
  const scorers = r.events.filter((e) => e.type === 'goal' || e.type === 'penGoal').map((e) => `${callName(w.players[e.player!]?.name || '')} ${e.min}'`).join(', ')
  let headline = winner ? `${winner.short} ${margin >= 3 ? 'thrash' : margin === 2 ? 'beat' : 'edge'} ${winner === home ? away.short : home.short}` : `${home.short} and ${away.short} share the spoils`
  if (hatTrick) headline = `${w.players[hatTrick[0]]?.name} hat-trick ${winner && w.players[hatTrick[0]]?.clubId === winner.id ? `inspires ${winner.short}` : 'in vain'}`
  if (upset && winner) headline = `Shock as ${winner.short} stun ${winner === home ? away.short : home.short}`
  if (f.derby && winner) headline = `${winner.short} win the ${f.derby}`
  if (r.pens) headline = `${r.pens[0] > r.pens[1] ? home.short : away.short} win on penalties against ${r.pens[0] > r.pens[1] ? away.short : home.short}`
  postNews(w, {
    headline,
    body: `${home.name} ${h}-${a} ${away.name}${r.pens ? ` (${r.pens[0]}-${r.pens[1]} pens)` : ''} · ${comp?.short ?? ''} ${f.roundName}. ${scorers ? `Scorers: ${scorers}.` : ''}${r.motm ? ` Player of the Match: ${w.players[r.motm]?.name}.` : ''}`,
    kind: 'result', playerIds: hatTrick ? [hatTrick[0]] : r.motm ? [r.motm] : [], clubIds: [f.home, f.away], compId: f.compId, fixtureId: f.id,
    importance: user ? 4 : (upset && Math.max(home.squadAvg, away.squadAvg) >= 76) || (hatTrick && (w.leagues[comp?.leagueId ?? -1]?.prestige || 0) >= 8) || f.roundName === 'Final' ? 3 : 2, userRelated: user,
  })
}

function championNews(w: World, comp: Competition, champ: number, f: Fixture) {
  const c = w.clubs[champ]
  postNews(w, {
    headline: `${c.short} win the ${comp.short}!`, body: `${c.name} are ${comp.short} winners after victory over ${w.clubs[f.home === champ ? f.away : f.home].name} in the ${f.roundName.toLowerCase()}.`,
    kind: 'title', playerIds: [], clubIds: [champ], compId: comp.id, importance: 5, userRelated: champ === w.userClubId || f.userInvolved === true,
  })
  if (champ === w.userClubId) {
    const staff = staffNames(w)
    sendInbox(w, { from: staff.chairman, fromRole: 'Chairman', category: 'Board', subject: `Congratulations: ${comp.short} winners!`, body: `On behalf of everyone at ${c.name}, congratulations on winning the ${comp.name}. A historic achievement.`, actions: [], compId: comp.id, image: { kind: 'comp', id: comp.logoKey || comp.key } })
    w.flags.celebrate = { compId: comp.id, date: w.date }
  }
}

function leagueChampionNews(w: World, comp: Competition) {
  const t = sortTable(w, comp)
  const champ = t[0]?.clubId
  if (!champ) return
  postNews(w, { headline: `${w.clubs[champ].short} crowned ${comp.short} champions`, body: `${w.clubs[champ].name} finish the ${comp.short} season top with ${t[0].pts} points.`, kind: 'title', playerIds: [], clubIds: [champ], compId: comp.id, importance: comp.clubs.includes(w.userClubId) ? 5 : (w.leagues[comp.leagueId!]?.prestige || 0) >= 8 ? 4 : 2, userRelated: champ === w.userClubId })
  if (champ === w.userClubId) w.flags.celebrate = { compId: comp.id, date: w.date }
}

function drawNews(w: World, comp: Competition, stage?: string) {
  const next = comp.rounds.find((r) => r.drawn && r.fixtures.some((id) => { const f = w.fixtures[id]; return !f.played && (f.home === w.userClubId || f.away === w.userClubId) }))
  if (!next) return
  const f = next.fixtures.map((id) => w.fixtures[id]).find((x) => x.home === w.userClubId || x.away === w.userClubId)!
  const opp = w.clubs[f.home === w.userClubId ? f.away : f.home]
  sendInbox(w, {
    from: comp.name, fromRole: 'Competition', category: 'Competitions', subject: `${comp.short} ${stage || next.name} draw`,
    body: `You have been drawn against ${opp.name} in the ${comp.short} ${next.name.toLowerCase()}. ${next.legs === 2 ? `First leg: ${fmtDate(next.date, 'dm')}.` : `The tie will be played on ${fmtDate(f.date, 'dm')}${f.neutral && f.venue ? ` at ${f.venue}` : f.home === w.userClubId ? ' at home' : ' away'}.`}`,
    actions: [{ label: 'View Competition', action: 'openComp', payload: comp.id, primary: true }], compId: comp.id, clubId: opp.id, image: { kind: 'comp', id: comp.logoKey || comp.key },
  })
}

// ---------------------------------------------------------------- daily loop
/** Simulate every remaining fixture of the day except the user's (which must be played or quick-simmed). */
export function simulateDay(w: World, rng: Rng, includeUser = false) {
  for (const f of fixturesOn(w, w.date)) {
    if (!includeUser && f.userInvolved && !w.flags.unemployed) continue
    const r = simulateFixture(w, f)
    afterMatch(w, f, r, rng)
  }
}

function endOfDay(w: World, rng: Rng) {
  dailyWorldNews(w)
  const d = w.date
  const wd = weekday(d)
  const dom = Number(d.slice(8, 10))
  // injuries heal, training, fitness
  const staff = staffNames(w)
  const breakNow = w.intlBreaks.find((b) => d >= b.start && d <= b.end)
  for (const p of Object.values(w.players)) {
    if (p.injury && d >= p.injury.until) {
      const wasUser = p.clubId === w.userClubId
      p.injury = undefined
      p.fitness = Math.min(p.fitness, 82)
      if (wasUser) sendInbox(w, { from: staff.medical, fromRole: 'Head of Medical', category: 'Medical', subject: `${p.name} back in training`, body: `${p.name} has recovered and is available for selection again. His match sharpness will need building up.`, actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id }], playerId: p.id, image: { kind: 'player', id: p.id } })
    }
    if (p.academy) { p.devProgress += 0.35 * p.hidden.devRate * (p.pot - p.ovr > 0 ? 1 : 0); continue }
    const injured = dailyTraining(w, p, rng, 0)
    if (injured && !p.injury && p.clubId) {
      const inj = rollInjury(w, p, rng, d)
      if (inj.totalDays > 20) { inj.totalDays = Math.round(inj.totalDays / 3); inj.until = addDays(d, inj.totalDays) }
      p.injury = { ...inj, type: `${inj.type} (training)` }
      if (p.clubId === w.userClubId) sendInbox(w, { from: staff.medical, fromRole: 'Head of Medical', category: 'Medical', subject: `Training injury: ${p.name}`, body: `${p.name} picked up a ${inj.type.toLowerCase()} in training and will miss around ${inj.totalDays} days.`, actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id }], playerId: p.id, image: { kind: 'player', id: p.id } })
    }
    if (breakNow && p.intlDuty) p.fitness = clamp(p.fitness - 1.5, 30, 100)
  }
  // international duty flags
  internationalDuty(w, rng)
  // scouting & youth
  dailyScouting(w, rng)
  dailyYouth(w, rng)
  // transfers
  processOffers(w, rng)
  processPendingDeals(w, rng)
  aiTransferDay(w, rng)
  // conversations & morale
  if (!w.flags.unemployed) maybeConversations(w, rng)
  if (wd === 1) {
    for (const c of Object.values(w.clubs)) weeklyMorale(w, c.id, rng, c.id === w.userClubId)
    checkPromises(w)
    if (!w.flags.unemployed) {
      updateBoardConfidence(w)
      if (userJobSecurity(w)) w.flags.stopSacked = true
    }
    aiManagerReview(w, rng)
    weeklyFinances(w)
  }
  // growth twice monthly
  if (dom === 1 || dom === 15) {
    const user: { name: string; d: number; id: number }[] = []
    for (const p of Object.values(w.players)) {
      const dd = applyGrowth(w, p, rng)
      if (dd && p.clubId === w.userClubId) user.push({ name: p.name, d: dd, id: p.id })
    }
    if (user.length && !w.flags.unemployed) {
      const ups = user.filter((x) => x.d > 0).sort((a, b) => b.d - a.d)
      const downs = user.filter((x) => x.d < 0)
      sendInbox(w, {
        from: staff.assistant, fromRole: 'Assistant Manager', category: 'Squad', subject: 'Player development update',
        body: `${ups.length ? `Improved: ${ups.map((u) => `${u.name} (+${u.d})`).join(', ')}.` : ''}${downs.length ? ` Declined: ${downs.map((u) => `${u.name} (${u.d})`).join(', ')}.` : ''}`,
        actions: [{ label: 'Player Development', action: 'openDevelopment', primary: true }],
      })
    }
  }
  if (dom === 1) {
    monthlyAwards(w)
    monthlyFinances(w)
    contractWatch(w, rng)
  }
  // retirement announcements in spring
  if (d.slice(5, 10) === '04-15') announceRetirements(w, rng)
  // window events
  const win = currentWindow(w, addDays(d, 1))
  if (win && addDays(d, 1) === win.open) {
    sendInbox(w, { from: staff.director, fromRole: 'Sporting Director', category: 'Transfers', subject: `The ${win.name.toLowerCase()} transfer window is open`, body: `The ${win.name.toLowerCase()} window is open until ${fmtDate(win.close, 'long')}. Your transfer budget is ${fmtMoney(w.clubs[w.userClubId].finance.transferBudget)}.`, actions: [{ label: 'Transfer Hub', action: 'openTransfers', primary: true }] })
  }
  if (win && addDays(d, 1) === win.close) w.flags.deadlineDay = win.close
}

function internationalDuty(w: World, rng: Rng) {
  const d = w.date
  const starting = w.intlBreaks.find((b) => addDays(d, 1) === b.start)
  const ending = w.intlBreaks.find((b) => d === b.end)
  if (starting) {
    const byNation = new Map<string, typeof w.players[number][]>()
    for (const p of Object.values(w.players)) {
      if (!p.clubId || p.injury || p.academy) continue
      const arr = byNation.get(p.nation) || []
      arr.push(p)
      byNation.set(p.nation, arr)
    }
    const called: string[] = []
    for (const list of byNation.values()) {
      list.sort((a, b) => b.ovr + b.intlRep - (a.ovr + a.intlRep))
      for (const p of list.slice(0, 23)) {
        if (p.ovr < 64) continue
        p.intlDuty = true
        if (p.clubId === w.userClubId) called.push(`${p.name} (${p.nation})`)
      }
    }
    if (called.length) sendInbox(w, { from: staffNames(w).assistant, fromRole: 'Assistant Manager', category: 'Squad', subject: 'International call-ups', body: `${called.length} players have been called up for international duty: ${called.join(', ')}.`, actions: [{ label: 'View Squad', action: 'openSquad', primary: true }] })
  }
  if (ending) {
    for (const p of Object.values(w.players)) {
      if (!p.intlDuty) continue
      p.intlDuty = false
      p.nationalCaps = (p.nationalCaps || 0) + (rng.next() < 0.7 ? 2 : 1)
      if (rng.next() < 0.012 && p.clubId) {
        p.injury = { ...rollInjury(w, p, rng, d), type: 'Knock (international duty)' }
        if (p.clubId === w.userClubId) sendInbox(w, { from: staffNames(w).medical, fromRole: 'Head of Medical', category: 'Medical', subject: `${p.name} returns injured`, body: `${p.name} has returned from international duty with a knock and will be out for ${p.injury.totalDays} days.`, actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id }], playerId: p.id, image: { kind: 'player', id: p.id } })
      }
    }
  }
}

function weeklyFinances(w: World) {
  const club = w.clubs[w.userClubId]
  if (!club) return
  const wages = rosterOf(w, club.id).reduce((a, p) => a + (p.loan && p.loan.fromClubId !== club.id ? p.contract.wage * (1 - (p.loan.wageSplit ?? 50) / 100) : p.contract.wage), 0)
  club.finance.balance -= wages
  club.finance.expensesSeason += wages
  club.finance.ledger.push({ date: w.date, label: 'Player wages', amount: -wages, kind: 'wages' })
  const staffWages = [...w.scouts, ...w.youthScouts].reduce((a, s) => a + s.wage, 0)
  if (staffWages) { club.finance.balance -= staffWages; club.finance.ledger.push({ date: w.date, label: 'Scouting staff', amount: -staffWages, kind: 'wages' }) }
  if (club.finance.ledger.length > 300) club.finance.ledger.splice(0, club.finance.ledger.length - 300)
}

function monthlyFinances(w: World) {
  for (const club of Object.values(w.clubs)) {
    const lg = w.leagues[club.leagueId]
    const tv = Math.round(((lg?.wealth || 2) ** 2.2) * 95_000 * (0.8 + club.prestige.intl * 0.05))
    const spons = Math.round(club.reputation ** 1.8 * 90)
    club.finance.balance += tv + spons
    club.finance.revenueSeason += tv + spons
    if (club.id === w.userClubId) {
      club.finance.ledger.push({ date: w.date, label: 'Broadcasting revenue', amount: tv, kind: 'tv' })
      club.finance.ledger.push({ date: w.date, label: 'Commercial & sponsorship', amount: spons, kind: 'other' })
    }
  }
}

function contractWatch(w: World, rng: Rng) {
  const d = w.date
  if (d.slice(5, 7) !== '01' && d.slice(5, 7) !== '03') return
  const expiring = rosterOf(w, w.userClubId).filter((p) => yearsLeft(w, p) <= 1)
  if (expiring.length) {
    sendInbox(w, {
      from: staffNames(w).director, fromRole: 'Sporting Director', category: 'Squad', subject: 'Expiring contracts',
      body: `${expiring.length} player${expiring.length > 1 ? 's are' : ' is'} in the final months of their contract: ${expiring.map((p) => p.name).join(', ')}. From January they can agree pre-contracts with other clubs.`,
      actions: [{ label: 'Manage Contracts', action: 'openContracts', primary: true }],
    })
    for (const p of expiring) {
      if (p.ovr >= 74 && rng.next() < 0.4) {
        const suitor = Object.values(w.clubs).filter((c) => c.reputation >= w.clubs[w.userClubId].reputation - 10 && c.id !== w.userClubId)
        if (suitor.length) {
          const c = rng.pick(suitor)
          p.interestedClubs = [...new Set([...(p.interestedClubs || []), c.id])]
          postNews(w, { headline: `${c.short} eye free transfer for ${p.name}`, body: `${p.name}'s contract with ${w.clubs[p.clubId].name} expires this summer, and ${c.name} are monitoring the situation.`, kind: 'rumour', playerIds: [p.id], clubIds: [c.id, p.clubId], importance: 3, userRelated: true })
        }
      }
    }
  }
}

function announceRetirements(w: World, rng: Rng) {
  for (const p of Object.values(w.players)) {
    const age = ageOn(p.dob, w.date)
    if (age < 35 || p.retiringAtSeasonEnd) continue
    if (rng.next() < (age >= 38 ? 0.6 : age >= 36 ? 0.3 : 0.12) * (p.ovr >= 80 ? 0.5 : 1)) {
      p.retiringAtSeasonEnd = true
      if (p.ovr >= 78 || p.clubId === w.userClubId) postNews(w, { headline: `${p.name} to retire at the end of the season`, body: `${p.name} has confirmed this will be his final season as a professional.`, kind: 'milestone', playerIds: [p.id], clubIds: [p.clubId], importance: p.ovr >= 84 ? 4 : 2, userRelated: p.clubId === w.userClubId })
    }
  }
}

export interface AdvanceResult { stop: StopReason; days: number; fixture?: Fixture }

/** Advance day by day until something needs the manager. */
export function advance(w: World, maxDays = 60): AdvanceResult {
  const rng = worldRng(w)
  let days = 0
  w.flags.stopForInbox = false
  w.flags.stopSacked = false
  const result = (stop: StopReason, fixture?: Fixture): AdvanceResult => { w.rng = rng.state; return { stop, days, fixture } }
  // finish today (all remaining matches except the user's)
  while (days < maxDays) {
    const uf = userFixtureOn(w, w.date)
    if (uf) return result('match', uf)
    simulateDay(w, rng)
    endOfDay(w, rng)
    // season end
    if (w.date >= `${w.season + 1}-06-20` || (w.date >= `${w.season + 1}-06-01` && allPlayed(w))) {
      if (!allPlayed(w)) { simulateRemaining(w, rng) }
      seasonRollover(w, rng)
      resetFixtureIndexes(w)
      generateNewSeasonInbox(w)
      return result('season-end')
    }
    w.date = addDays(w.date, 1)
    days++
    if (w.flags.stopSacked) return result('sacked')
    const win = currentWindow(w)
    if (win && w.date === win.close) return result('deadline')
    if (win && w.date === win.open) return result('window')
    if (w.flags.stopForInbox) return result('inbox')
    // a match the manager asked to watch: stop on its day (unless it has gone, e.g. postponed or already played)
    if (w.flags.watch) {
      const wf = w.fixtures[w.flags.watch]
      if (!wf || wf.played || wf.date < w.date) w.flags.watch = undefined
      else if (wf.date === w.date && !userFixtureOn(w, w.date)) return result('watch', wf)
    }
  }
  return result('limit')
}

function allPlayed(w: World) {
  for (const f of Object.values(w.fixtures)) if (!f.played) return false
  return true
}

function simulateRemaining(w: World, rng: Rng) {
  const rest = Object.values(w.fixtures).filter((f) => !f.played).sort((a, b) => a.date.localeCompare(b.date))
  for (const f of rest) afterMatch(w, f, simulateFixture(w, f), rng)
}

function generateNewSeasonInbox(w: World) {
  const staff = staffNames(w)
  sendInbox(w, { from: staff.chairman, fromRole: 'Chairman', category: 'Board', subject: 'Board objectives for the new season', body: `The board has set out its expectations for the ${w.season}/${(w.season + 1) % 100} season. Transfer budget: ${fmtMoney(w.clubs[w.userClubId].finance.transferBudget)}.`, actions: [{ label: 'View Objectives', action: 'openBoard', primary: true }] })
}

/** First-day setup for a brand new career. */
export function careerIntro(w: World) {
  const rng = worldRng(w)
  generateObjectives(w, rng)
  updateBoardConfidence(w)
  const club = w.clubs[w.userClubId]
  const staff = staffNames(w)
  const lg = w.leagues[club.leagueId]
  const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club.id))
  const first = nextUserFixture(w)
  sendInbox(w, { from: staff.chairman, fromRole: 'Chairman', category: 'Board', subject: `Welcome to ${club.name}`, body: `Welcome to ${club.name}, ${w.user.firstName}. Everyone at ${club.stadium || club.name} is excited about the season ahead. The board has set clear objectives, and your transfer budget for the summer is ${fmtMoney(club.finance.transferBudget)} with a weekly wage budget of ${fmtMoney(club.finance.wageBudget)}.${w.flags.replacedManager ? ` You take over from ${w.flags.replacedManager}.` : ''}`, actions: [{ label: 'View Objectives', action: 'openBoard', primary: true }, { label: 'Transfer Hub', action: 'openTransfers' }] })
  sendInbox(w, { from: staff.assistant, fromRole: 'Assistant Manager', category: 'Assistant', subject: 'Pre-season plan', body: `Boss, the squad reports back for pre-season today. ${first ? `Our first competitive fixture is ${w.clubs[first.home].short} v ${w.clubs[first.away].short} on ${fmtDate(first.date, 'long')} (${w.competitions[first.compId]?.short}).` : ''} I'd recommend reviewing the squad, setting training plans and checking the tactics before then.`, actions: [{ label: 'Squad Hub', action: 'openSquad', primary: true }, { label: 'Tactics', action: 'openTactics' }] })
  sendInbox(w, { from: staff.director, fromRole: 'Sporting Director', category: 'Scouting', subject: 'Scouting network', body: `We have one scout on the books. Set up the Global Transfer Network to identify targets, and send our youth scout out to find the next generation of talent.`, actions: [{ label: 'Scouting', action: 'openScouting', primary: true }, { label: 'Youth Academy', action: 'openYouth' }] })
  postNews(w, { headline: `${club.short} appoint ${w.user.firstName} ${w.user.lastName}`, body: `${club.name} have confirmed the appointment of ${w.user.firstName} ${w.user.lastName} as their new manager ahead of the ${w.season}/${(w.season + 1) % 100} ${lg?.short ?? ''} season.`, kind: 'manager', playerIds: [], clubIds: [club.id], importance: 5, userRelated: true })
  void comp
  void positionOf
  void diffDays
  void isWindowOpen
  w.rng = rng.state
}
