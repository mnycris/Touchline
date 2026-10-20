// Universal search: one index over the football world (players, clubs, managers, competitions, transfer stories, news)
// and the career itself (its places and messages). Names are folded (accents, ø/æ/ß, punctuation) and matched by
// the start of any name part, then as one run of letters ("macallister"), then with a typo or two.
import type { SearchKind, SearchRef, World } from '../domain/types'
import { seasonLabel } from '../domain/dates'
import { followSets } from '../engine/world/follow'

const FOLD: Record<string, string> = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i', ħ: 'h', ŋ: 'n' }
const SPECIAL = /[øæœßłđðþıħŋ]/g

/** Lower case, no accents, letters and digits separated by single spaces. */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(SPECIAL, (c) => FOLD[c]).replace(/['’`.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}
function foldChar(c: string): string {
  const f = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(SPECIAL, (x) => FOLD[x])
  if (/^['’`.]$/.test(f)) return ''
  return /^[a-z0-9]+$/.test(f) ? f : ' '
}

/** Where the query's words start words of a display name, in the name's own characters (for highlighting). */
export function matchRanges(text: string, words: string[]): [number, number][] {
  let f = ''
  const from: number[] = []
  for (let i = 0; i < text.length; i++) for (const ch of foldChar(text[i])) { f += ch; from.push(i) }
  const out: [number, number][] = []
  for (const t of words) {
    if (!t) continue
    for (let j = f.indexOf(t); j >= 0; j = f.indexOf(t, j + 1)) {
      if (j > 0 && f[j - 1] !== ' ') continue
      out.push([from[j], from[j + t.length - 1] + 1])
      break
    }
  }
  return out.sort((a, b) => a[0] - b[0])
}

interface Entry { kind: SearchKind; id: number | string; names: string[]; tokens: string[]; compact: string; abbr?: string }
export interface Hit { kind: SearchKind; id: number | string; score: number; fuzzy?: boolean }
export interface Results { q: string; words: string[]; top?: Hit; groups: { kind: SearchKind; hits: Hit[]; total: number }[] }

const entry = (kind: SearchKind, id: number | string, raw: (string | undefined)[], abbr?: string): Entry => {
  const names = [...new Set(raw.filter(Boolean).map((s) => fold(s!)).filter(Boolean))]
  // neighbouring parts run together too: "mac allister" is found as "macallister", "van dijk" as "vandijk"
  const tokens = [...new Set(names.flatMap((n) => { const t = n.split(' '); return [...t, ...t.slice(1).map((x, i) => t[i] + x)] }))]
  return { kind, id, names, tokens, compact: names.map((n) => n.replace(/ /g, '')).join('|'), abbr: abbr ? fold(abbr) : undefined }
}

// nicknames people actually type
const CLUB_ALIASES: [RegExp, string[]][] = [
  [/^tottenham/, ['spurs']], [/^(fc )?barcelona$/, ['barca']], [/^atletico (de )?madrid/, ['atleti']], [/^juventus/, ['juve']],
  [/^borussia dortmund/, ['bvb']], [/^paris saint germain|^paris sg|^psg/, ['psg', 'paris']], [/^manchester united/, ['man utd', 'man united']],
  [/^manchester city/, ['man city']], [/^(fc )?bayern/, ['bayern munich']], [/^(fc )?internazionale|^inter$/, ['inter milan']],
  [/^wolverhampton/, ['wolves']], [/^sporting( cp)?$/, ['sporting lisbon']], [/^olympique (de )?marseille/, ['om', 'marseille']],
  [/^olympique lyonnais/, ['ol', 'lyon']], [/^bayer (04 )?leverkusen/, ['leverkusen']], [/^real madrid/, ['madrid']],
  [/^newcastle united/, ['toon']], [/^west ham/, ['hammers']], [/^nottingham forest/, ['forest']], [/^rb leipzig/, ['leipzig']],
]

let stat: { w: World; key: string; entries: Entry[] } | undefined
let live: { w: World; key: string; entries: Entry[] } | undefined

function statKey(w: World) {
  let names = 0
  for (const id in w.clubs) names += w.clubs[id].name.length + w.clubs[id].short.length
  return `${Object.keys(w.players).length}:${w.nextIds.player}:${w.flags.rosterVersion || 0}:${names}:${Object.keys(w.managers).length}:${w.season}:${Object.keys(w.competitions).length}`
}

function staticEntries(w: World): Entry[] {
  const key = statKey(w)
  if (stat?.w === w && stat.key === key) return stat.entries
  const out: Entry[] = []
  for (const p of Object.values(w.players)) {
    // other clubs' academies are not part of the world he can see
    if (p.academy && p.clubId !== w.userClubId) continue
    out.push(entry('player', p.id, [p.name, p.fullName, p.shortName]))
  }
  for (const c of Object.values(w.clubs)) {
    const f = fold(c.name)
    const alias = CLUB_ALIASES.filter(([re]) => re.test(f)).flatMap(([, a]) => a)
    out.push(entry('club', c.id, [c.name, c.short, ...alias], c.abbr))
  }
  for (const m of Object.values(w.managers)) if (!m.retired) out.push(entry('manager', m.id, [m.name]))
  out.push(entry('manager', 'me', [`${w.user.firstName} ${w.user.lastName}`]))
  // one competition per key: this season's, or the latest there is
  const comps = new Map<string, (typeof w.competitions)[string]>()
  for (const c of Object.values(w.competitions)) { const cur = comps.get(c.key); if (!cur || c.season > cur.season) comps.set(c.key, c) }
  for (const c of comps.values()) out.push(entry('comp', c.key, [c.name, c.short, /^L\d+$/.test(c.key) ? undefined : c.key]))
  stat = { w, key, entries: out }
  return out
}

/** The career's own places: screens he might want without knowing where they live. */
export interface Place { id: string; title: string; sub: string; icon: string; kw: string; route?: { name: string; params?: unknown }; tab?: 'central' | 'squad' | 'transfers' | 'academy' | 'season'; squad?: boolean }
const PLACES: Place[] = [
  { id: 'tactics', title: 'Tactics', sub: 'Formation, roles and instructions', icon: 'tactics', kw: 'formation lineup line up team sheet instructions roles shape', route: { name: 'tactics' }, squad: true },
  { id: 'training', title: 'Training', sub: 'The week’s sessions and match preparation', icon: 'training', kw: 'schedule sessions sharpness', route: { name: 'training' }, squad: true },
  { id: 'development', title: 'Development', sub: 'Player growth and training plans', icon: 'development', kw: 'progress growth plans potential', route: { name: 'development' }, squad: true },
  { id: 'calendar', title: 'Calendar', sub: 'Fixtures and the season ahead', icon: 'calendar', kw: 'fixtures schedule dates matches', route: { name: 'calendar' } },
  { id: 'squadStatus', title: 'Squad status', sub: 'Roles, morale and fitness', icon: 'squad', kw: 'morale fitness roles playing time happiness', route: { name: 'squadStatus' }, squad: true },
  { id: 'contracts', title: 'Contracts', sub: 'Expiring deals and renewals', icon: 'contract', kw: 'renewals renew wages expiring', route: { name: 'contracts' }, squad: true },
  { id: 'scouting', title: 'Scouting', sub: 'Scouts, assignments and reports', icon: 'scout', kw: 'scouts reports network', route: { name: 'scouting' }, squad: true },
  { id: 'transferHistory', title: 'Transfer history', sub: 'Every deal you have done', icon: 'history', kw: 'signings sales deals bought sold', route: { name: 'transferHistory' } },
  { id: 'office', title: 'Office', sub: 'The board, objectives and finances', icon: 'office', kw: 'board objectives finances budget confidence money', route: { name: 'office' } },
  { id: 'manager', title: 'Your career', sub: 'Your record, trophies and history', icon: 'manager', kw: 'record trophies history profile me', route: { name: 'manager' } },
  { id: 'awards', title: 'Awards', sub: 'Monthly and season awards', icon: 'medal', kw: 'player of the month manager of the month', route: { name: 'awards' } },
  { id: 'jobs', title: 'Jobs', sub: 'Vacancies around the world', icon: 'board', kw: 'vacancies offers apply', route: { name: 'jobs' } },
  { id: 'fifa', title: 'World ranking', sub: 'National teams, FIFA-style', icon: 'globe', kw: 'fifa rankings nations international', route: { name: 'fifa' } },
  { id: 'inbox', title: 'Inbox', sub: 'Your messages', icon: 'inbox', kw: 'messages email mail', route: { name: 'inbox' } },
  { id: 'news', title: 'News', sub: 'Stories, and what you follow', icon: 'news', kw: 'stories headlines following followed', route: { name: 'news' } },
  { id: 'settings', title: 'Settings', sub: 'Career and app settings', icon: 'settings', kw: 'preferences save checkpoints options edit mode', route: { name: 'settings' } },
  { id: 'tab:transfers', title: 'Transfer centre', sub: 'The market, your targets and your business', icon: 'transfers', kw: 'market rumours shortlist targets bids', tab: 'transfers' },
  { id: 'tab:academy', title: 'Youth Academy', sub: 'Your academy and youth scouts', icon: 'academy', kw: 'youth prospects juniors', tab: 'academy', squad: true },
  { id: 'tab:season', title: 'Competitions', sub: 'Tables, cups and fixtures', icon: 'season', kw: 'tables standings league cups', tab: 'season' },
]

export function places(w: World): Place[] {
  const out = PLACES.filter((p) => !(p.squad && w.flags.unemployed))
  for (const a of [...w.archive].reverse()) out.push({ id: `review:${a.season}`, title: `${seasonLabel(a.season)} season review`, sub: 'How the season went', icon: 'trophy', kw: `review season ${a.season} ${a.season + 1}`, route: { name: 'seasonReview', params: { season: a.season } } })
  return out
}
export const placeById = (w: World, id: string) => places(w).find((p) => p.id === id)

function liveEntries(w: World): Entry[] {
  const key = `${w.date}:${w.news[0]?.id}:${w.news.length}:${w.market?.seq || 0}:${w.market?.stories.length || 0}:${w.inbox.length}:${w.archive.length}`
  if (live?.w === w && live.key === key) return live.entries
  const out: Entry[] = []
  for (const s of w.market?.stories || []) {
    const p = w.players[s.playerId]
    if (!p) continue
    const from = w.clubs[s.from], to = w.clubs[s.to]
    const e = entry('story', s.id, [p.name, p.fullName])
    e.tokens = [...new Set([...e.tokens, ...[from?.name, from?.short, to?.name, to?.short].filter(Boolean).flatMap((x) => fold(x!).split(' '))])]
    out.push(e)
  }
  for (const n of w.news.slice(0, 300)) { const e = entry('news', n.id, []); e.tokens = [...new Set(fold(n.headline).split(' '))]; out.push(e) }
  for (const p of places(w)) { const e = entry('career', p.id, [p.title]); e.tokens = [...new Set([...e.tokens, ...fold(p.kw).split(' ')])]; out.push(e) }
  for (const m of w.inbox.slice(0, 120)) { const e = entry('message', m.id, []); e.tokens = [...new Set(fold(`${m.subject} ${m.from}`).split(' '))]; out.push(e) }
  live = { w, key, entries: out }
  return out
}

/** Optimal string alignment distance, giving up once it is clearly more than `k`. */
function dist(a: string, b: string, k: number): number {
  if (Math.abs(a.length - b.length) > k) return k + 1
  let prev2: number[] = [], prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let low = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur.push(v)
      if (v < low) low = v
    }
    if (low > k) return k + 1
    prev2 = prev; prev = cur
  }
  return prev[b.length]
}

function exact(e: Entry, q: string, words: string[], qc: string): number {
  let best = 0
  for (const n of e.names) {
    if (n === q) return 1000
    if (n.startsWith(q)) best = Math.max(best, 860 - Math.min(40, n.length - q.length))
  }
  // every word is a whole part of the name ("saka" is M. Saka before Sakarias Opsahl)
  if (q.length >= 3 && words.every((t) => e.tokens.includes(t))) best = Math.max(best, 880)
  if (e.abbr && e.abbr === q) best = Math.max(best, 850)
  if (best) return best
  if (q.length < 2) return 0
  if (words.every((t) => e.tokens.some((x) => x.startsWith(t)))) return 800 + words.filter((t) => e.tokens.includes(t)).length * 25
  if (qc.length >= 4 && e.compact.includes(qc)) return 640
  return 0
}

function fuzzy(e: Entry, words: string[]): number {
  let total = 0
  for (const t of words) {
    const k = t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0
    let best = 9
    for (const x of e.tokens) {
      if (x.startsWith(t)) { best = 0; break }
      if (!k || x[0] !== t[0]) continue
      const d = Math.min(dist(t, x, k), x.length > t.length ? dist(t, x.slice(0, t.length), k) : 9)
      if (d < best) best = d
    }
    if (best > k) return 0
    total += best
  }
  // a slip costs less than a lesser player with the exact name gains: "mbape" still finds Mbappé first
  return total ? 760 - total * 60 : 0
}

const GROUP_ORDER: SearchKind[] = ['player', 'club', 'manager', 'comp', 'story', 'news', 'career', 'message']

/** Search the world. `kind` narrows it to one category; otherwise every category is ranked and grouped. */
export function search(w: World, raw: string, kind?: SearchKind, per = 5): Results {
  const q = fold(raw)
  const words = q ? q.split(' ') : []
  if (!q) return { q, words, groups: [] }
  const qc = q.replace(/ /g, '')
  const sets = followSets(w)
  const short = new Set(w.transfers.shortlist)
  const newsIdx = new Map(w.news.map((n, i) => [n.id, i]))
  const weight = (e: Entry): number => {
    switch (e.kind) {
      case 'player': {
        const p = w.players[e.id as number]
        return Math.max(0, Math.min(150, (p.ovr - 55) * 4)) + (p.clubId === w.userClubId ? 70 : 0) + (sets.player.has(p.id) ? 90 : 0) + (short.has(p.id) ? 25 : 0) - (p.clubId ? 0 : 10)
      }
      case 'club': {
        // standing in the game rather than raw reputation, which tops out for a lot of clubs
        const c = w.clubs[e.id as number]
        return Math.max(0, Math.min(75, ((c.squadAvg || 60) - 60) * 2.5)) + c.prestige.intl * 3 + c.prestige.domestic * 1.5 + (c.id === w.userClubId ? 80 : 0) + (sets.club.has(c.id) ? 90 : 0) - (c.national ? 10 : 0)
      }
      case 'manager': { if (e.id === 'me') return 160; const m = w.managers[e.id as number]; return m.reputation * 0.9 + (sets.manager.has(m.id) ? 90 : 0) + (m.clubId ? 0 : -20) }
      case 'comp': { const c = Object.values(w.competitions).find((x) => x.key === e.id); return (c ? (c.tier <= 1 ? 110 : c.tier === 2 ? 75 : 55) + (c.clubs.includes(w.userClubId) ? 30 : 0) : 0) + (sets.comp.has(e.id as string) ? 90 : 0) }
      case 'story': { const s = w.market?.stories.find((x) => x.id === e.id); return s ? (s.stage === 'done' ? 50 : s.stage === 'failed' ? 10 : 60) + Math.min(40, (s.fee || 0) / 2e6) + (sets.story.has(s.id) ? 90 : 0) : 0 }
      case 'news': { const i = newsIdx.get(e.id as string) ?? 300; const n = w.news[i]; return (n ? n.importance * 12 : 0) + Math.max(0, 60 - i / 3) }
      case 'career': return 90
      case 'message': return 20
    }
  }
  const pool = [...staticEntries(w), ...liveEntries(w)].filter((e) => !kind || e.kind === kind)
  const hits: Hit[] = []
  for (const e of pool) {
    const m = exact(e, q, words, qc)
    if (m) hits.push({ kind: e.kind, id: e.id, score: m + weight(e) })
  }
  // spelling slips: only when the exact pass is thin for this query
  if (q.length >= 4 && hits.filter((h) => h.kind !== 'news' && h.kind !== 'message').length < 8) {
    const found = new Set(hits.map((h) => `${h.kind}:${h.id}`))
    for (const e of pool) {
      if (e.kind === 'news' || e.kind === 'message' || found.has(`${e.kind}:${e.id}`)) continue
      const m = fuzzy(e, words)
      if (m) hits.push({ kind: e.kind, id: e.id, score: m + weight(e), fuzzy: true })
    }
  }
  const by = new Map<SearchKind, Hit[]>()
  for (const h of hits) { const a = by.get(h.kind); if (a) a.push(h); else by.set(h.kind, [h]) }
  const groups = [...by.entries()].map(([k, list]) => {
    list.sort((a, b) => b.score - a.score)
    // news reads newest first once it matches at all
    if (k === 'news') list.sort((a, b) => (newsIdx.get(a.id as string) ?? 0) - (newsIdx.get(b.id as string) ?? 0))
    return { kind: k, hits: list.slice(0, kind ? 60 : per), total: list.length, best: list[0].score }
  }).sort((a, b) => b.best - a.best || GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind))
  // the top hit: a strong match for something in the world itself
  const cand = groups.filter((g) => g.kind !== 'news' && g.kind !== 'message' && g.kind !== 'career').map((g) => g.hits[0]).sort((a, b) => b.score - a.score)[0]
  // (a near miss can be it too, when it stands clearly above everything else: "mbape")
  const next = cand ? groups.flatMap((g) => g.hits.slice(0, 2)).filter((h) => h !== cand && h.kind !== 'news' && h.kind !== 'message').sort((a, b) => b.score - a.score)[0] : undefined
  const top = !kind && cand && (cand.fuzzy ? cand.score >= 800 && cand.score - (next?.score || 0) >= 40 : cand.score >= 860) ? cand : undefined
  if (top) for (const g of groups) if (g.hits[0] === top) { g.hits = g.hits.slice(1); g.total-- }
  return { q, words, top, groups: groups.filter((g) => g.hits.length).map(({ kind: k, hits: h, total }) => ({ kind: k, hits: h, total })) }
}

/** A result as something to remember among the recent searches. */
export const refOf = (h: Pick<Hit, 'kind' | 'id'>): SearchRef => ({ kind: h.kind, id: h.id })

/** Build the index ahead of the first search. */
export function warmSearch(w: World) { staticEntries(w); liveEntries(w) }
