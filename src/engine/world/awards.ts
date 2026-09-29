import type { Award, Competition, Player, World } from '../../domain/types'
import { addDays, ageOn, monthName, toDate } from '../../domain/dates'
import { postNews, sendInbox } from './messages'

function leagueComps(w: World): Competition[] {
  return Object.values(w.competitions).filter((c) => c.season === w.season && c.format === 'league' && (w.leagues[c.leagueId!]?.level ?? 9) <= 2 && ['England', 'Spain', 'Germany', 'Italy', 'France', 'Netherlands', 'Portugal'].includes(c.country) || c.season === w.season && c.format === 'league' && c.clubs.includes(w.userClubId))
}

/** Player & Manager of the Month for the month that just ended (called on the 1st). */
export function monthlyAwards(w: World) {
  const end = addDays(w.date, -1)
  const month = end.slice(0, 7)
  const mName = monthName(toDate(end).getUTCMonth())
  // one roundup story per month instead of a headline per award
  const winners: { comp: string; compId: string; own: boolean; playerId?: number; text: string; manager?: string }[] = []
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
      winners.push({ comp: comp.short, compId: comp.id, own: comp.clubs.includes(w.userClubId), playerId: p.id, text: `${p.name} (${w.clubs[p.clubId].short}) · ${e.g} G ${e.a} A` })
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
      if (pw) pw.manager = `${name} (${w.clubs[bc].short}, ${bp} pts)`
      if (isUser) {
        w.user.awards.push({ name: `${comp.short} Manager of the Month`, season: w.season, month: mName })
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
    body: winners.map((x) => `${x.comp}: ${x.text}${x.manager ? `; Manager of the Month ${x.manager}` : ''}.`).join(' '),
    kind: 'award', playerIds: winners.filter((x) => x.playerId).map((x) => x.playerId!), clubIds: [], compId: lead.compId, month,
    importance: mine ? 4 : lead.own ? 3 : 2, userRelated: !!mine,
  })
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
