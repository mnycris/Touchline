import type { Club, World } from '../../domain/types'
import { Rng, clamp } from '../../domain/rng'
import { addDays, fmtDate } from '../../domain/dates'
import { positionOf } from '../competitions/tables'
import { expectedRank } from './board'
import { postNews, sendInbox, staffNames } from './messages'

/** Weekly AI manager review: underperforming managers get sacked and replaced. */
export function aiManagerReview(w: World, rng: Rng) {
  for (const club of Object.values(w.clubs)) {
    if (club.id === w.userClubId || !club.leagueId) continue
    const mgr = w.managers[club.managerId]
    if (!mgr) continue
    const comp = w.competitions[`L${club.leagueId}-${w.season}`]
    const row = comp?.table?.find((r) => r.clubId === club.id)
    if (!row || row.p < 9) continue
    const pos = positionOf(w, comp, club.id)
    const exp = expectedRank(w, club)
    const n = comp.clubs.length
    const gap = (pos - exp) / n
    const ppg = row.pts / row.p
    let risk = 0
    if (gap > 0.35) risk += 0.05
    if (gap > 0.5) risk += 0.08
    const rel = comp.rules.rele ? pos > n - comp.rules.rele : false
    if (rel && exp < n - 3) risk += 0.06
    if (ppg < 1 && exp <= n / 2) risk += 0.04
    if (row.form.slice(-5).filter((x) => x === 'L').length >= 4) risk += 0.05
    if (mgr.appointed && mgr.appointed > addDays(w.date, -90)) risk *= 0.3
    if (rng.next() < risk) sackManager(w, club, rng)
  }
}

export function sackManager(w: World, club: Club, rng: Rng) {
  const old = w.managers[club.managerId]
  if (old) { old.clubId = 0; old.reputation = clamp(old.reputation - 4, 5, 99) }
  const pool = Object.values(w.managers).filter((m) => m.clubId === 0 && !m.retired)
  const fit = pool.sort((a, b) => Math.abs(a.reputation - club.reputation) - Math.abs(b.reputation - club.reputation))
  const next = fit[Math.floor(rng.next() * Math.min(3, fit.length))]
  // the vacancy may go to the user first, if it makes sense for both sides
  const chance = userJobInterest(w, club)
  if (chance > 0 && rng.next() < chance) offerUserJob(w, club, old?.name, rng)
  if (next) {
    next.clubId = club.id
    next.appointed = w.date
    club.managerId = next.id
    // new manager may bring a new shape
    const sheet = club.sheets[0]
    if (sheet) sheet.formation = next.formation
  }
  postNews(w, {
    headline: `${club.short} part company with ${old?.name ?? 'manager'}`,
    body: `${club.name} have dismissed ${old?.name ?? 'their manager'} following a run of poor results.${next ? ` ${next.name} has been appointed as the new head coach.` : ''}`,
    kind: 'manager', playerIds: [], clubIds: [club.id], importance: club.reputation >= 70 ? 4 : 2, userRelated: false,
  })
}

/** How attractive a job is: club reputation, league standing and continental level. */
function standing(w: World, c: Club) {
  // reputation saturates near the top, so squad quality and continental level carry the distinction
  return c.squadAvg * 1.6 + c.prestige.intl * 2 + (w.leagues[c.leagueId]?.prestige || 3) * 1.2
}

/** Chance that a club with a vacancy approaches the user. Considers whether the move is up, sideways or down,
 *  how the user is doing, how long they've been in the job and whether the club would realistically want them. */
export function userJobInterest(w: World, club: Club): number {
  if (club.id === w.userClubId || !club.leagueId) return 0
  const rep = w.user.reputation
  // the manager reputation a club of this size looks for (same scale as the user's)
  const wanted = clamp((standing(w, club) - 110) * 1.1, 8, 95)
  if (rep < wanted - 14) return 0
  const recent = w.user.jobOffers.filter((o) => o.date > addDays(w.date, -30))
  if (recent.length) return 0
  if (w.flags.unemployed) return clamp(0.55 - Math.max(0, wanted - rep) / 30 - Math.max(0, rep - wanted - 20) / 40, 0.05, 0.6)
  const cur = w.clubs[w.userClubId]
  if (!cur) return 0
  const move = standing(w, club) - standing(w, cur)
  const h = w.user.history[w.user.history.length - 1]
  const games = h ? h.p : 0
  const winRate = games >= 8 ? h!.w / games : 0.4
  const tenureDays = h ? (Date.parse(w.date) - Date.parse(h.from)) / 86400000 : 0
  const form = clamp((winRate - 0.35) * 2.2, -0.4, 0.8) // 0 around a 35% win rate
  const settled = tenureDays < 150 ? 0.25 : 1
  const unhappy = w.board.overall < 35 ? 1 : 0
  let p: number
  if (move >= 6) p = 0.28 + form * 0.35 + Math.min(0.2, move / 60)
  else if (move >= -4) p = 0.06 + Math.max(0, form) * 0.12 + unhappy * 0.12
  else if (move >= -15) p = unhappy ? 0.12 : 0.012
  else p = unhappy && move >= -25 ? 0.04 : 0
  // a reputation short of what the club wants makes it a gamble for them; giant leaps are rarer still
  const repFit = clamp(1 - (wanted - rep) / 20, 0.2, 1)
  const leap = move > 20 ? 20 / move : 1
  return clamp(p * settled * repFit * leap, 0, 0.55)
}

function offerUserJob(w: World, club: Club, oldName: string | undefined, rng: Rng) {
  const cur = w.clubs[w.userClubId]
  const move = cur ? standing(w, club) - standing(w, cur) : 0
  const lg = w.leagues[club.leagueId]
  const exp = expectedRank(w, club)
  const pitch = w.flags.unemployed
    ? rng.pick([`They believe you're the right person to get ${club.short} moving again.`, `The board want a quick appointment and your name is at the top of their list.`])
    : move >= 6
      ? rng.pick([`They have followed your work at ${cur?.short} closely and see you as the one to lead them forward.`, `${club.short} want a proven winner and believe you are ready for a job of this size.`, `The board are prepared to make you one of the best-paid coaches in ${lg?.name || 'the league'}.`])
      : move >= -4
        ? rng.pick([`They see it as a fresh project with backing from the board.`, `They like the way your sides play and think you'd fit their squad.`])
        : rng.pick([`They know it would be a step down, but they are offering full control of the football side.`, `A long-term project: they would build the club around your ideas.`])
  const target = exp <= 2 ? 'challenge for the title' : exp <= 4 ? 'finish in the top four' : exp <= Math.ceil((w.competitions[`L${club.leagueId}-${w.season}`]?.clubs.length || 20) / 2) ? 'push for Europe' : 'stay clear of trouble'
  w.user.jobOffers.push({ clubId: club.id, date: w.date, expires: addDays(w.date, 7) })
  sendInbox(w, {
    from: `${club.name} Board`, fromRole: 'Chairman', category: 'Board', subject: `Job offer: ${club.name}`,
    body: `Following the departure of ${oldName ?? 'their manager'}, ${club.name} would like to offer you the manager's job. ${pitch} The board's expectation would be to ${target}. The offer stands until ${fmtDate(addDays(w.date, 7), 'dm')}.`,
    actions: [{ label: 'View Offer', action: 'openJobOffer', payload: club.id, primary: true }], clubId: club.id, urgent: move >= 6, image: { kind: 'club', id: club.id },
  })
}

/** Board patience with the user: dismissal when confidence collapses. */
export function userJobSecurity(w: World): boolean {
  if (!w.settings.sacking) return false
  const threshold = w.settings.difficulty === 'Beginner' ? 8 : w.settings.difficulty === 'Legendary' || w.settings.difficulty === 'Ultimate' ? 25 : 16
  if (w.board.overall < threshold && w.date > addDays(w.seasonStart, 100)) {
    fireUser(w)
    return true
  }
  if (w.board.overall < threshold + 12 && !w.flags.boardWarned) {
    w.flags.boardWarned = w.date
    w.board.warnings++
    const staff = staffNames(w)
    sendInbox(w, { from: staff.chairman, fromRole: 'Chairman', category: 'Board', subject: 'A warning from the board', body: `The board is extremely concerned with the club's direction. Results and objectives must improve immediately, or we will be forced to act.`, actions: [{ label: 'View Objectives', action: 'openBoard', primary: true }], urgent: true })
  }
  return false
}

export function fireUser(w: World) {
  const club = w.clubs[w.userClubId]
  const h = w.user.history[w.user.history.length - 1]
  if (h) h.to = w.date
  w.user.sacked = w.date
  w.user.reputation = clamp(w.user.reputation - 10, 5, 100)
  // AI caretaker takes over
  const pool = Object.values(w.managers).filter((m) => m.clubId === 0 && !m.retired)
  const m = pool.sort((a, b) => b.reputation - a.reputation)[0]
  if (m) { m.clubId = club.id; club.managerId = m.id; m.appointed = w.date }
  w.flags.unemployed = true
  sendInbox(w, { from: `${club.name} Board`, fromRole: 'Chairman', category: 'Board', subject: 'You have been dismissed', body: `The board has decided to relieve you of your duties as manager of ${club.name}. We thank you for your service.`, actions: [{ label: 'Find a new job', action: 'openJobs', primary: true }], urgent: true })
  postNews(w, { headline: `${club.short} sack ${w.user.firstName} ${w.user.lastName}`, body: `${club.name} have dismissed ${w.user.firstName} ${w.user.lastName} after a disappointing run.`, kind: 'manager', playerIds: [], clubIds: [club.id], importance: 5, userRelated: true })
}

export function acceptJob(w: World, clubId: number) {
  const club = w.clubs[clubId]
  const prev = w.clubs[w.userClubId]
  if (!club) return
  const h = w.user.history[w.user.history.length - 1]
  if (h && !h.to) h.to = w.date
  // incumbent leaves
  const inc = w.managers[club.managerId]
  if (inc) inc.clubId = 0
  if (prev && prev.managerId === -1) {
    const pool = Object.values(w.managers).filter((m) => m.clubId === 0 && !m.retired && m.id !== inc?.id)
    const m = pool.sort((a, b) => b.reputation - a.reputation)[0]
    if (m) { m.clubId = prev.id; prev.managerId = m.id; m.appointed = w.date }
  }
  club.managerId = -1
  w.userClubId = clubId
  w.user.clubId = clubId
  w.user.jobOffers = []
  w.user.sacked = undefined
  w.flags.unemployed = false
  w.user.history.push({ clubId, from: w.date, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, trophies: [] })
  w.transfers.targets = {}
  w.transfers.shortlist = []
  // the new club's fixtures are the user's now; matches already played stay in the career record
  for (const f of Object.values(w.fixtures)) if (f.home === clubId || f.away === clubId) f.userInvolved = true; else if (!f.played) f.userInvolved = false
  w.flags.staff = undefined
  w.flags.newJob = w.date
  postNews(w, { headline: `${club.short} appoint ${w.user.firstName} ${w.user.lastName}`, body: `${club.name} have appointed ${w.user.firstName} ${w.user.lastName} as their new manager.`, kind: 'manager', playerIds: [], clubIds: [clubId], importance: 4, userRelated: true })
}

export function vacancies(w: World): Club[] {
  return Object.values(w.clubs).filter((c) => c.leagueId && c.id !== w.userClubId && (!w.managers[c.managerId] || w.user.jobOffers.some((o) => o.clubId === c.id)))
}

export function applyForJob(w: World, clubId: number, rng: Rng): boolean {
  const club = w.clubs[clubId]
  const chance = clamp(0.6 + (w.user.reputation - club.reputation) / 40, 0.05, 0.95)
  return rng.next() < chance
}
