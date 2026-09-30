// The academy as part of the club: who is ready for the first team, how fast each player is growing, a monthly
// report from the Head of Youth Development, and milestones (debuts, first goals) for the players it produces.
import type { Fixture, MatchResult, Player, World } from '../../domain/types'
import { ageOn } from '../../domain/dates'
import { academyOf, rosterOf } from './roster'
import { squadPlan } from './squadPlan'
import { postNews, sendInbox, staffNames } from './messages'

export type Readiness = 'Ready' | 'Close' | 'Developing'

/** The first-team bar: a player who could be real cover in the current XI's formation. */
export function firstTeamBar(w: World): number {
  const club = w.clubs[w.userClubId]
  return club ? Math.round(squadPlan(w, club).level - 10) : 70
}

export function readiness(p: Player, bar: number): Readiness {
  return p.ovr >= bar ? 'Ready' : p.ovr >= bar - 5 ? 'Close' : 'Developing'
}

/** Coach's read of development pace (hidden dev rate made visible as words). */
export function paceOf(p: Player): { label: string; tone: 'pos' | 'neu' | 'neg' } {
  const r = p.hidden.devRate
  return r >= 1.2 ? { label: 'Fast developer', tone: 'pos' } : r >= 0.95 ? { label: 'Steady progress', tone: 'neu' } : { label: 'Slow burner', tone: 'neg' }
}

/** Days until the next improvement at the current rate (academy growth is daily, applied twice a month). */
export function daysToNext(p: Player): number | undefined {
  if (p.pot <= p.ovr) return undefined
  const per = 0.35 * p.hidden.devRate
  return per > 0 ? Math.max(1, Math.ceil((10 - Math.max(0, p.devProgress)) / per)) : undefined
}

/** 1st of each month: the Head of Youth Development's report. */
export function monthlyAcademyReport(w: World) {
  const club = w.clubs[w.userClubId]
  if (!club || w.flags.unemployed) return
  const squad = academyOf(w, club.id)
  if (!squad.length) return
  const bar = firstTeamBar(w)
  const month = w.date.slice(0, 7)
  const monthAgo = new Date(`${w.date}T00:00:00Z`); monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1)
  const from = monthAgo.toISOString().slice(0, 10)
  const gained = squad.map((p) => {
    const before = [...p.growthHistory].reverse().find((g) => g.date < from)?.ovr ?? p.growthHistory[0]?.ovr ?? p.ovr
    return { p, from: before, d: p.ovr - before }
  }).sort((a, b) => b.d - a.d || b.p.pot - a.p.pot)
  const risers = gained.filter((x) => x.d > 0)
  const ready = squad.filter((p) => readiness(p, bar) === 'Ready')
  const deadline = squad.filter((p) => ageOn(p.dob, w.date) >= 18 && readiness(p, bar) !== 'Ready')
  const staff = staffNames(w)
  const lines = [
    risers.length ? `${risers.length === 1 ? `${risers[0].p.name} has` : `${risers.length} players have`} improved this month${risers[0] ? `, led by ${risers[0].p.name} (+${risers[0].d})` : ''}.` : 'A quiet month: nobody moved up a level, but the work goes on.',
    ready.length ? `${ready.map((p) => p.name).slice(0, 2).join(' and ')} ${ready.length > 1 ? 'are' : 'is'} ready for first-team football now.` : '',
    deadline.length ? `${deadline.map((p) => p.name).slice(0, 2).join(' and ')} ${deadline.length > 1 ? 'turn' : 'turns'} 19 soon; we need to decide on ${deadline.length > 1 ? 'their' : 'his'} future before the summer.` : '',
  ].filter(Boolean)
  sendInbox(w, {
    from: staff.youth, fromRole: 'Head of Youth Development', category: 'Youth', subject: `Academy report: ${new Date(`${month}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}`,
    body: lines.join(' '),
    dev: gained.slice(0, 6).map((x) => ({ id: x.p.id, from: x.from, to: x.p.ovr, attrs: (x.p.attrGains || []).filter((g) => g.date >= from).sort((a, b) => b.d - a.d).slice(0, 3).map((g) => [g.k, g.d] as [typeof g.k, number]) })),
    actions: [{ label: 'Open Academy', action: 'openYouth', primary: true }],
  })
}

/** After a user match: a graduate's debut or first goal is worth a headline. */
export function academyMilestones(w: World, f: Fixture, r: MatchResult) {
  const club = w.clubs[w.userClubId]
  if (!club) return
  for (const st of r.players) {
    const p = w.players[st.id]
    if (!p || p.academyGrad !== club.id || p.clubId !== club.id || st.mins <= 0) continue
    const careerApps = p.career.reduce((a, c) => a + c.apps, 0) + Object.values(p.season).reduce((a, s) => a + s.apps, 0)
    const careerGoals = p.career.reduce((a, c) => a + c.goals, 0) + Object.values(p.season).reduce((a, s) => a + s.goals, 0)
    const opp = w.clubs[f.home === club.id ? f.away : f.home]
    if (careerApps === 1) {
      postNews(w, { headline: `Academy graduate ${p.name} makes his debut`, body: `${p.name}, promoted from the ${club.short} academy, made his first senior appearance against ${opp?.short}, playing ${st.mins} minutes.`, kind: 'youth', playerIds: [p.id], clubIds: [club.id], fixtureId: f.id, importance: 3, userRelated: true })
      p.morale = Math.min(100, p.morale + 8)
    }
    if (st.goals > 0 && careerGoals === st.goals) {
      postNews(w, { headline: `First senior goal for ${p.name}`, body: `Academy product ${p.name} scored his first goal for ${club.short}${st.goals > 1 ? ` (and added another)` : ''} against ${opp?.short}.`, kind: 'youth', playerIds: [p.id], clubIds: [club.id], fixtureId: f.id, importance: 3, userRelated: true })
    }
  }
}

/** Graduates currently in the first team. */
export function graduatesInSquad(w: World): Player[] {
  return rosterOf(w, w.userClubId).filter((p) => p.academyGrad === w.userClubId)
}
