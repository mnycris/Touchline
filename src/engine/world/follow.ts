// Following: players, clubs, managers, competitions and transfer stories the manager keeps an eye on. Nothing here
// sends messages: what he follows is easier to find again (search, the transfer centre) and its developments are
// gathered in one quiet feed (news → Following), with only the big ones reaching the latest-news drop-in.
import type { Follow, FollowKind, NewsItem, SearchRef, World } from '../../domain/types'
import { addDays, diffDays } from '../../domain/dates'
import { fmtMoney } from '../../domain/finance'
import { callName } from '../match/commentary'

const same = (a: { kind: string; id: number | string }, kind: string, id: number | string) => a.kind === kind && a.id === id

export function isFollowing(w: World, kind: FollowKind, id: number | string): boolean {
  return !!w.follows?.some((f) => same(f, kind, id))
}

/** Follow or unfollow; returns whether it is followed now. */
export function toggleFollow(w: World, kind: FollowKind, id: number | string): boolean {
  const list = (w.follows ||= [])
  const i = list.findIndex((f) => same(f, kind, id))
  if (i >= 0) { list.splice(i, 1); return false }
  list.unshift({ kind, id, since: w.date })
  return true
}

/** What still exists of what he follows (a transfer story runs its course, a player can be removed in Edit Mode). */
export function follows(w: World): Follow[] {
  return (w.follows || []).filter((f) => exists(w, f))
}

export function exists(w: World, r: { kind: string; id: number | string }): boolean {
  switch (r.kind) {
    case 'player': return !!w.players[r.id as number]
    case 'club': return !!w.clubs[r.id as number]
    case 'manager': return !!w.managers[r.id as number] && !w.managers[r.id as number].retired
    case 'comp': return Object.values(w.competitions).some((c) => c.key === r.id)
    case 'story': return !!w.market?.stories.some((s) => s.id === r.id)
    case 'news': return w.news.some((n) => n.id === r.id)
    case 'message': return w.inbox.some((m) => m.id === r.id)
    default: return true
  }
}

/** The ids he follows by kind, for quick membership tests. */
export function followSets(w: World) {
  const out = { player: new Set<number>(), club: new Set<number>(), manager: new Set<number>(), comp: new Set<string>(), story: new Set<number>() }
  for (const f of w.follows || []) (out[f.kind] as Set<number | string>).add(f.id)
  return out
}

// ---------------------------------------------------------------- recent searches
export function noteRecent(w: World, r: SearchRef) {
  const list = (w.recentSearch || []).filter((x) => !same(x, r.kind, r.id))
  list.unshift({ kind: r.kind, id: r.id })
  w.recentSearch = list.slice(0, 12)
}
export function clearRecent(w: World) { w.recentSearch = [] }

// ---------------------------------------------------------------- the Following feed
export interface FollowEvent {
  key: string
  date: string
  /** whom it is about: the avatar beside it */
  ref: { kind: FollowKind; id: number | string }
  type: 'news' | 'result' | 'performance' | 'transfer' | 'injury' | 'job'
  text: string
  sub?: string
  tone?: 'pos' | 'neg' | 'neu'
  newsId?: string
  fixtureId?: string
  storyId?: number
  importance: number
}

/** Who a news story is about, among the things he follows (the most specific first). */
export function newsFollowRef(w: World, n: NewsItem, sets = followSets(w)): FollowEvent['ref'] | undefined {
  const p = n.playerIds.find((id) => sets.player.has(id))
  if (p) return { kind: 'player', id: p }
  if (sets.manager.size) {
    for (const id of sets.manager) {
      const m = w.managers[id]
      if (!m) continue
      if (n.quote?.by === m.name || n.headline.includes(m.name) || (n.kind === 'manager' && m.clubId && n.clubIds.includes(m.clubId))) return { kind: 'manager', id }
    }
  }
  const c = n.clubIds.find((id) => sets.club.has(id)) ?? (n.quote && sets.club.has(n.quote.clubId) ? n.quote.clubId : undefined)
  if (c) return { kind: 'club', id: c }
  const key = n.compId ? w.competitions[n.compId]?.key : undefined
  if (key && sets.comp.has(key)) return { kind: 'comp', id: key }
  return undefined
}

/**
 * Recent developments for everything he follows, newest first: stories in the news, results and standout games,
 * transfer moves, injuries and job changes. Each happening appears once.
 */
export function followingFeed(w: World, days = 30, max = 80): FollowEvent[] {
  const sets = followSets(w)
  if (!w.follows?.length) return []
  const from = addDays(w.date, -days)
  const out: FollowEvent[] = []
  const seenFixture = new Set<string>()
  const transferDays = new Set<string>()

  // transfer stories: every step of a story he follows, and the serious ones about his players and clubs
  for (const s of w.market?.stories || []) {
    const who: FollowEvent['ref'] | undefined = sets.story.has(s.id) ? { kind: 'story', id: s.id }
      : sets.player.has(s.playerId) ? { kind: 'player', id: s.playerId }
        : sets.club.has(s.to) ? { kind: 'club', id: s.to } : sets.club.has(s.from) ? { kind: 'club', id: s.from } : undefined
    if (!who) continue
    // a club he follows is linked with players every week: only the real business, not the paper talk
    const serious = who.kind !== 'club' || s.stage !== 'rumour' || (s.reliability || 0) >= 4
    if (!serious) continue
    const p = w.players[s.playerId]
    s.log.forEach((l, i) => {
      if (l.date < from) return
      const done = l.stage === 'done', failed = l.stage === 'failed'
      out.push({
        key: `t${s.id}:${i}`, date: l.date, ref: who, type: 'transfer', storyId: s.id, text: l.note,
        sub: `${p ? callName(p.name) : 'Transfer'} · ${w.clubs[s.from]?.short || 'Free agent'} → ${w.clubs[s.to]?.short || '?'}${done && s.fee ? ` · ${fmtMoney(s.fee, { short: true })}` : ''}`,
        tone: done ? 'pos' : failed ? 'neg' : 'neu', importance: done ? 4 : failed ? 2 : l.stage === 'rumour' ? 1 : 3,
      })
      transferDays.add(`${s.playerId}:${l.date}`)
    })
  }

  // the news: anything about what he follows (transfer news is already told by its story)
  const toldGames = new Set<string>()
  for (const n of w.news) {
    if (n.date < from) break
    const ref = newsFollowRef(w, n, sets)
    if (!ref) continue
    if ((n.kind === 'transfer' || n.kind === 'rumour') && n.playerIds.some((id) => transferDays.has(`${id}:${n.date}`))) continue
    const f = n.fixtureId ? w.fixtures[n.fixtureId] : undefined
    if (f) { seenFixture.add(f.id); for (const id of n.playerIds) toldGames.add(`${f.id}:${id}`) }
    out.push({ key: `n${n.id}`, date: n.date, ref, type: n.kind === 'manager' ? 'job' : 'news', newsId: n.id, fixtureId: n.fixtureId, text: n.headline, sub: f?.result ? `${w.clubs[f.home]?.short} ${f.result.score[0]}–${f.result.score[1]} ${w.clubs[f.away]?.short} · ${w.competitions[f.compId]?.short || ''}` : undefined, importance: n.importance })
  }

  // results of the clubs he follows, and the games his players stood out in
  const playerClubs = new Set<number>()
  for (const id of sets.player) { const p = w.players[id]; if (p?.clubId) playerClubs.add(p.clubId) }
  const nt = w.intl?.nt || {}
  for (const id of sets.player) { const p = w.players[id]; const n = p ? nt[p.nation] : undefined; if (n) playerClubs.add(n) }
  if (sets.club.size || playerClubs.size) {
    for (const f of Object.values(w.fixtures)) {
      if (!f.played || !f.result || f.date < from) continue
      const club = sets.club.has(f.home) ? f.home : sets.club.has(f.away) ? f.away : undefined
      const comp = w.competitions[f.compId]
      const [h, a] = f.result.score
      const line = `${w.clubs[f.home]?.short} ${h}–${a} ${w.clubs[f.away]?.short}${f.result.pens ? ` (${f.result.pens[0]}–${f.result.pens[1]} pens)` : ''}`
      if (club && !seenFixture.has(f.id)) {
        const us = club === f.home ? h : a, them = club === f.home ? a : h
        const won = us > them || (us === them && !!f.result.pens && (club === f.home ? f.result.pens[0] > f.result.pens[1] : f.result.pens[1] > f.result.pens[0]))
        const lost = us < them || (us === them && !!f.result.pens && !won)
        out.push({ key: `r${f.id}`, date: f.date, ref: { kind: 'club', id: club }, type: 'result', fixtureId: f.id, text: line, sub: `${comp?.short || ''}${f.roundName ? ` · ${f.roundName}` : ''}`, tone: won ? 'pos' : lost ? 'neg' : 'neu', importance: 2 })
      }
      if (!playerClubs.has(f.home) && !playerClubs.has(f.away)) continue
      for (const x of f.result.players) {
        if (!sets.player.has(x.id) || !x.mins || toldGames.has(`${f.id}:${x.id}`)) continue
        const standout = x.goals > 0 || x.assists > 0 || x.rating >= 8 || x.red
        if (!standout) continue
        const p = w.players[x.id]
        const opp = w.clubs[x.side === 0 ? f.away : f.home]?.short
        const bits = [x.goals ? (x.goals === 1 ? 'scored' : x.goals === 2 ? 'scored twice' : `scored ${x.goals}`) : '', x.assists ? (x.assists === 1 ? 'set one up' : `set up ${x.assists}`) : ''].filter(Boolean)
        const text = x.red ? `${callName(p?.name || '')} was sent off against ${opp}` : bits.length ? `${callName(p?.name || '')} ${bits.join(' and ')} against ${opp}` : `${callName(p?.name || '')} starred against ${opp}`
        out.push({ key: `p${f.id}:${x.id}`, date: f.date, ref: { kind: 'player', id: x.id }, type: 'performance', fixtureId: f.id, text, sub: `${line} · rated ${x.rating.toFixed(1)}`, tone: x.red ? 'neg' : 'pos', importance: x.goals >= 2 || x.rating >= 8.5 ? 3 : 2 })
      }
    }
  }

  // injuries to the players he follows
  for (const id of sets.player) {
    const p = w.players[id]
    if (!p?.injury || p.injury.since < from) continue
    const weeks = Math.max(1, Math.round(diffDays(p.injury.until, p.injury.since) / 7))
    out.push({ key: `i${id}:${p.injury.since}`, date: p.injury.since, ref: { kind: 'player', id }, type: 'injury', text: `${callName(p.name)} is out injured: ${p.injury.type.toLowerCase()}`, sub: `${p.injury.severity} · about ${weeks} week${weeks > 1 ? 's' : ''}`, tone: 'neg', importance: p.injury.severity === 'Severe' || p.injury.severity === 'Serious' ? 3 : 2 })
  }

  // managers he follows taking a new job (sackings come through the news)
  for (const id of sets.manager) {
    const m = w.managers[id]
    if (!m?.appointed || m.appointed < from || !m.clubId) continue
    if (out.some((e) => e.ref.kind === 'manager' && e.ref.id === id && e.type === 'job' && e.date === m.appointed)) continue
    out.push({ key: `j${id}:${m.appointed}`, date: m.appointed, ref: { kind: 'manager', id }, type: 'job', text: `${m.name} takes charge of ${w.clubs[m.clubId]?.name}`, importance: 3, tone: 'neu' })
  }

  return out.sort((a, b) => b.date.localeCompare(a.date) || b.importance - a.importance).slice(0, max)
}

/** New developments since he last looked at the feed. */
export function followingUnseen(w: World): number {
  const seen = (w.flags.followSeen as string | undefined) || ''
  return followingFeed(w, 14).filter((e) => e.date > seen && e.importance >= 2).length
}
