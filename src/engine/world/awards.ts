import type { Award, Competition, Player, World } from '../../domain/types'
import { addDays, ageOn, monthName, toDate } from '../../domain/dates'
import { clamp } from '../../domain/rng'
import { ordinalOf } from '../../domain/words'
import { sortTable } from '../competitions/tables'
import { postNews, sendInbox } from './messages'

/** The leagues with monthly and season awards: the top two divisions of the big nations, and the manager's own. */
const awardsLeague = (w: World, c: Competition) => c.format === 'league' && (((w.leagues[c.leagueId!]?.level ?? 9) <= 2 && ['England', 'Spain', 'Germany', 'Italy', 'France', 'Netherlands', 'Portugal'].includes(c.country)) || c.clubs.includes(w.userClubId))
function leagueComps(w: World): Competition[] {
  return Object.values(w.competitions).filter((c) => c.season === w.season && awardsLeague(w, c))
}

/** Player & Manager of the Month for the month that just ended (called on the 1st). */
export function monthlyAwards(w: World) {
  const end = addDays(w.date, -1)
  const month = end.slice(0, 7)
  const mName = monthName(toDate(end).getUTCMonth())
  // one roundup story per month instead of a headline per award
  const winners: { comp: string; compId: string; own: boolean; playerId?: number; g: number; a: number; manager?: { name: string; club: string; pts: number } }[] = []
  for (const comp of leagueComps(w)) {
    const fx = comp.fixtures.map((id) => w.fixtures[id]).filter((f) => f.played && f.date.startsWith(month))
    if (fx.length < comp.clubs.length) continue
    const score = new Map<number, { s: number; n: number; g: number; a: number }>()
    const pts = new Map<number, number>()
    for (const f of fx) {
      const r = f.result!
      const [h, a] = r.score
      pts.set(f.home, (pts.get(f.home) || 0) + (h > a ? 3 : h === a ? 1 : 0))
      pts.set(f.away, (pts.get(f.away) || 0) + (a > h ? 3 : h === a ? 1 : 0))
      if (r.players.length) {
        for (const pl of r.players) {
          if (!pl.mins) continue
          const e = score.get(pl.id) || { s: 0, n: 0, g: 0, a: 0 }
          e.s += pl.rating; e.n++; e.g += pl.goals; e.a += pl.assists
          score.set(pl.id, e)
        }
      } else {
        for (const ev of r.events) {
          if (ev.type === 'goal' || ev.type === 'penGoal') {
            const e = score.get(ev.player!) || { s: 0, n: 0, g: 0, a: 0 }
            e.g++; score.set(ev.player!, e)
            if (ev.player2) { const b = score.get(ev.player2) || { s: 0, n: 0, g: 0, a: 0 }; b.a++; score.set(ev.player2, b) }
          }
        }
      }
    }
    let best: number | undefined, bs = -1
    for (const [id, e] of score) {
      const avg = e.n ? e.s / e.n : 6.8
      const v = (e.n >= 2 || !e.n ? avg : avg - 0.5) * 3 + e.g * 1.5 + e.a * 0.9
      if (v > bs && w.players[id]?.clubId && comp.clubs.includes(w.players[id].clubId)) { bs = v; best = id }
    }
    if (best) {
      const p = w.players[best]
      const e = score.get(best)!
      const award: Award = { id: `a${w.nextIds.misc++}`, name: `${comp.short} Player of the Month`, season: w.season, month, compKey: comp.key, playerId: p.id, clubId: p.clubId }
      w.awards.push(award)
      winners.push({ comp: comp.short, compId: comp.id, own: comp.clubs.includes(w.userClubId), playerId: p.id, g: e.g, a: e.a })
      if (p.clubId === w.userClubId) p.morale = Math.min(100, p.morale + 6)
    }
    // Manager of the Month
    let bc = 0, bp = -1
    for (const [c, v] of pts) if (v > bp) { bp = v; bc = c }
    if (bc) {
      const isUser = bc === w.userClubId
      const name = isUser ? `${w.user.firstName} ${w.user.lastName}` : w.managers[w.clubs[bc].managerId]?.name || ''
      w.awards.push({ id: `a${w.nextIds.misc++}`, name: `${comp.short} Manager of the Month`, season: w.season, month, compKey: comp.key, clubId: bc, managerName: name })
      const pw = winners.find((x) => x.compId === comp.id)
      if (pw) pw.manager = { name, club: w.clubs[bc].short, pts: bp }
      if (isUser) {
        w.user.awards.push({ name: `${comp.short} Manager of the Month`, season: w.season, month, compKey: comp.key, clubId: bc })
        w.user.reputation = Math.min(100, w.user.reputation + 2)
        sendInbox(w, { from: comp.name, fromRole: 'Competition', category: 'Competitions', subject: `Manager of the Month: ${mName}`, body: `Congratulations! You have been named ${comp.short} Manager of the Month for ${mName} after collecting ${bp} points.`, actions: [], compId: comp.id, image: { kind: 'comp', id: comp.logoKey || comp.key } })
      }
    }
  }
  if (!winners.length) return
  winners.sort((a, b) => Number(b.own) - Number(a.own))
  const lead = winners[0]
  const leadP = lead.playerId ? w.players[lead.playerId] : undefined
  const mine = winners.find((x) => x.playerId && w.players[x.playerId]?.clubId === w.userClubId)
  postNews(w, {
    headline: mine ? `${w.players[mine.playerId!].name} is ${mine.comp} Player of the Month` : leadP ? `${mName} awards: ${leadP.name} named ${lead.comp} Player of the Month` : `${mName} awards`,
    body: awardsBody(w, winners, mName),
    kind: 'award', playerIds: winners.filter((x) => x.playerId).map((x) => x.playerId!), clubIds: [], compId: lead.compId, month,
    importance: mine ? 4 : lead.own ? 3 : 2, userRelated: !!mine,
  })
}

/** The monthly roundup in sentences: the lead winner and what he did, his league's manager, then the others briefly. */
function awardsBody(w: World, winners: { comp: string; playerId?: number; g: number; a: number; manager?: { name: string; club: string; pts: number } }[], mName: string) {
  const did = (g: number, a: number) => (g && a ? `${g} goal${g > 1 ? 's' : ''} and ${a} assist${a > 1 ? 's' : ''}` : g ? `${g} goal${g > 1 ? 's' : ''}` : a ? `${a} assist${a > 1 ? 's' : ''}` : 'a run of top-class performances')
  const who = (id: number) => `${w.players[id].name} (${w.clubs[w.players[id].clubId]?.short})`
  const [lead, ...rest] = winners.filter((x) => x.playerId && w.players[x.playerId])
  if (!lead) return `The ${mName} awards have been handed out.`
  const out = [`${who(lead.playerId!)} takes the ${lead.comp} award for ${mName} with ${did(lead.g, lead.a)}.`]
  if (lead.manager) out.push(`${lead.manager.name} is Manager of the Month after ${lead.manager.pts} points with ${lead.manager.club}.`)
  if (rest.length) out.push(`Elsewhere: ${rest.map((x) => `${who(x.playerId!)} in the ${x.comp}`).join(', ')}.`)
  return out.join(' ')
}

/**
 * Manager of the Season, named when a league finishes: usually the champions' manager, unless someone took a side far
 * above where its squad would put it. He must have been in charge from before halfway to the end.
 */
export function managerOfTheSeason(w: World, comp: Competition) {
  if (!awardsLeague(w, comp) || w.awards.some((a) => a.compKey === comp.key && a.season === comp.season && a.name.endsWith('Manager of the Season'))) return
  const table = sortTable(w, comp)
  const fx = comp.fixtures.map((id) => w.fixtures[id]).filter((f) => f?.played).sort((a, b) => a.date.localeCompare(b.date))
  if (!table.length || !fx.length) return
  const mid = fx[Math.floor(fx.length / 2)].date, end = fx[fx.length - 1].date
  const expected = [...comp.clubs].sort((a, b) => (w.clubs[b]?.squadAvg || 0) - (w.clubs[a]?.squadAvg || 0))
  let best: { clubId: number; user: boolean; name: string; pos: number; pts: number } | undefined, bs = -Infinity
  table.forEach((r, i) => {
    const pos = i + 1
    const user = w.user.history.some((h) => h.clubId === r.clubId && h.from <= mid && (!h.to || h.to >= end))
    const m = user ? undefined : w.managers[w.clubs[r.clubId]?.managerId]
    if (!user && (!m || (m.appointed && m.appointed > mid))) return
    const over = expected.indexOf(r.clubId) + 1 - pos
    // the champions' manager as a rule; a side far above its means (a promoted club in the top four) can take it
    const s = over * 0.6 + (pos === 1 ? 8 : pos <= 4 ? 1.5 : 0) + (comp.rules.promo && pos <= comp.rules.promo ? 2 : 0) + (r.pts / Math.max(1, r.p)) * 2
    if (s > bs) { bs = s; best = { clubId: r.clubId, user, name: user ? `${w.user.firstName} ${w.user.lastName}` : m!.name, pos, pts: r.pts } }
  })
  if (!best) return
  const name = `${comp.short} Manager of the Season`
  const club = w.clubs[best.clubId]
  w.awards.push({ id: `a${w.nextIds.misc++}`, name, season: comp.season, compKey: comp.key, clubId: best.clubId, managerName: best.name })
  const how = best.pos === 1 ? `leading ${club.name} to the title with ${best.pts} points` : `taking ${club.name} to ${ordinalOf(best.pos)} place with ${best.pts} points`
  if (best.user) {
    w.user.awards.push({ name, season: comp.season, compKey: comp.key, clubId: best.clubId })
    w.user.reputation = clamp(w.user.reputation + 4, 1, 100)
    sendInbox(w, { from: comp.name, fromRole: 'Competition', category: 'Competitions', subject: name, body: `Congratulations! You have been named ${name} for ${how}.`, actions: [], compId: comp.id, image: { kind: 'comp', id: comp.logoKey || comp.key } })
  }
  if (best.user || (w.leagues[comp.leagueId!]?.prestige || 0) >= 8) {
    postNews(w, { headline: `${best.name} named ${name}`, body: `${best.name} is the ${name} for ${how}.`, kind: 'award', playerIds: [], clubIds: [best.clubId], compId: comp.id, importance: best.user ? 4 : 2, userRelated: best.user })
  }
}

export function seasonAwards(w: World) {
  const out: Award[] = []
  const comps = Object.values(w.competitions).filter((c) => c.season === w.season && (c.format === 'league' || c.format === 'uefa'))
  for (const comp of comps) {
    const ps = Object.values(w.players).filter((p) => p.season[comp.id]?.apps)
    if (!ps.length) continue
    const line = (p: Player) => p.season[comp.id]
    const minApps = comp.format === 'uefa' ? 6 : Math.round((comp.clubs.length - 1) * 2 * 0.55)
    const avg = (p: Player) => line(p).rated ? line(p).ratingSum / line(p).rated : 0
    const bestBy = (f: (p: Player) => number, filter: (p: Player) => boolean = () => true) => ps.filter(filter).sort((a, b) => f(b) - f(a))[0]
    const pots = bestBy((p) => avg(p) * 10 + line(p).goals * 0.6 + line(p).assists * 0.4 + line(p).motm * 0.5, (p) => line(p).apps >= minApps)
    const young = bestBy((p) => avg(p) * 10 + line(p).goals * 0.5 + line(p).assists * 0.3, (p) => line(p).apps >= minApps * 0.6 && ageOn(p.dob, w.date) <= 21)
    const boot = bestBy((p) => line(p).goals * 100 - line(p).mins / 1000)
    const glove = bestBy((p) => line(p).cleanSheets * 100 - line(p).conceded, (p) => p.positions[0] === 'GK')
    const play = bestBy((p) => line(p).assists * 100 + line(p).keyPasses)
    const add = (name: string, p?: Player, value?: number) => {
      if (!p) return
      out.push({ id: `a${w.nextIds.misc++}`, name: `${comp.short} ${name}`, season: w.season, compKey: comp.key, playerId: p.id, clubId: p.clubId, value })
    }
    add('Player of the Season', pots)
    add('Young Player of the Season', young)
    add('Golden Boot', boot, boot ? line(boot).goals : 0)
    add('Golden Glove', glove, glove ? line(glove).cleanSheets : 0)
    add('Playmaker of the Season', play, play ? line(play).assists : 0)
    comp.stats = {
      topScorers: ps.sort((a, b) => line(b).goals - line(a).goals).slice(0, 10).map((p) => [p.id, line(p).goals]),
      topAssists: ps.sort((a, b) => line(b).assists - line(a).assists).slice(0, 10).map((p) => [p.id, line(p).assists]),
      cleanSheets: ps.filter((p) => p.positions[0] === 'GK').sort((a, b) => line(b).cleanSheets - line(a).cleanSheets).slice(0, 10).map((p) => [p.id, line(p).cleanSheets]),
    }
  }
  w.awards.push(...out)
  for (const a of out) {
    if (a.playerId && w.players[a.playerId]?.clubId === w.userClubId && /Player of the Season|Golden Boot/.test(a.name)) {
      postNews(w, { headline: `${w.players[a.playerId].name} wins ${a.name}`, body: `${w.players[a.playerId].name} has been named ${a.name} for ${w.season}/${(w.season + 1) % 100}.`, kind: 'award', playerIds: [a.playerId], clubIds: [a.clubId!], importance: 4, userRelated: true })
    }
  }
  return out
}
