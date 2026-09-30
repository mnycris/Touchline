// News articles: a short, polished football report for any news item, written from the world state at read time
// (the result, the table, the player's numbers, the fee) with phrasing picked deterministically per story, so it reads
// the same every time you open it but differs from story to story.
import type { Club, Fixture, MatchEvent, NewsItem, Player, World } from '../../domain/types'
import { hashString } from '../../domain/rng'
import { ageOn, fmtDate, weekday } from '../../domain/dates'
import { fmtMoney } from '../../domain/finance'
import { sortTable } from '../competitions/tables'
import { callName } from '../match/commentary'

export interface Article {
  kicker: string
  headline: string
  lede: string
  paras: string[]
  facts: [string, string][]
  hero: { kind: 'player' | 'club' | 'comp' | 'none'; id?: number | string }
  fixtureId?: string
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
const isGoal = (e: MatchEvent) => e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal'

/** Split into sentences without breaking on initials ("M. Kudus") or common abbreviations. */
export function sentences(text: string): string[] {
  const out: string[] = []
  let start = 0
  const re = /[.!?]["')]?\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const before = text.slice(start, m.index)
    const lastWord = before.split(/\s+/).pop() || ''
    const next = text[m.index + m[0].length] || ''
    if (/^[A-Z]$/.test(lastWord) || /^(Jr|Sr|St|Dr|vs|Mr|No)$/i.test(lastWord) || !/[A-Z0-9"'(]/.test(next)) continue
    out.push(text.slice(start, m.index + m[0].length).trim())
    start = m.index + m[0].length
  }
  const rest = text.slice(start).trim()
  if (rest) out.push(rest)
  return out
}

/** Deterministic phrase picker for one story. */
function picker(id: string) {
  let k = 0
  return <T,>(arr: T[]): T => arr[hashString(`${id}:${k++}`) % arr.length]
}

export function articleFor(w: World, n: NewsItem): Article {
  const pick = picker(n.id)
  const comp = n.compId ? w.competitions[n.compId] : undefined
  const kickerBase = { transfer: 'Transfer', rumour: 'Transfer rumour', result: 'Match report', injury: 'Injury news', manager: 'Manager', record: 'Record', milestone: 'Milestone', youth: 'Youth', contract: 'Contract', title: 'Champions', relegation: 'Relegation', award: 'Awards', board: 'Board', preview: 'Preview' }[n.kind] || 'News'
  const kicker = [kickerBase, comp?.short].filter(Boolean).join(' · ')
  const base: Article = { kicker, headline: n.headline, lede: n.body, paras: [], facts: [], hero: n.playerIds[0] ? { kind: 'player', id: n.playerIds[0] } : n.clubIds[0] ? { kind: 'club', id: n.clubIds[0] } : { kind: 'none' } }
  const f = n.fixtureId ? w.fixtures[n.fixtureId] : undefined
  if (n.kind === 'result' && f?.result) return resultArticle(w, n, f, base, pick)
  if (n.kind === 'transfer' && n.playerIds[0]) return transferArticle(w, n, base, pick)
  if (n.kind === 'injury' && n.playerIds[0]) return injuryArticle(w, n, base, pick)
  if ((n.kind === 'manager' || n.kind === 'title' || n.kind === 'relegation') && n.clubIds[0] && !n.quote) return clubArticle(w, n, base, pick)
  if (n.quote) return quoteArticle(w, n, base, pick)
  if (n.kind === 'award' && n.month) {
    const mine = n.playerIds.map((id) => w.players[id]).find((p) => p?.clubId === w.userClubId)
    const [y, m] = n.month.split('-').map(Number)
    const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
    base.lede = mine ? `${mine.name} has been named Player of the Month for ${monthName}, capping a superb few weeks.` : pick([`The ${monthName} awards are in across the leagues.`, `Who shone in ${monthName}? The monthly awards have been handed out.`, `${monthName}'s standout players and managers have been recognised.`])
    base.paras = []
    base.hero = mine ? { kind: 'player', id: mine.id } : n.playerIds[0] ? { kind: 'player', id: n.playerIds[0] } : base.hero
    return base
  }
  // default: the body as the story, with the player's or club's context
  const p = n.playerIds[0] ? w.players[n.playerIds[0]] : undefined
  if (p) base.facts = playerFacts(w, p)
  const sents = sentences(n.body)
  base.lede = sents[0] || n.body
  base.paras = sents.length > 1 ? [sents.slice(1).join(' ')] : []
  return base
}

function playerFacts(w: World, p: Player): [string, string][] {
  const club = w.clubs[p.clubId]
  const lines = Object.values(p.season)
  const apps = lines.reduce((a, s) => a + s.apps, 0), goals = lines.reduce((a, s) => a + s.goals, 0), assists = lines.reduce((a, s) => a + s.assists, 0)
  const out: [string, string][] = [['Club', club?.name || 'Free agent'], ['Age', String(ageOn(p.dob, w.date))], ['Position', p.positions.join(' / ')], ['Overall', String(p.ovr)], ['Value', fmtMoney(p.value)]]
  if (apps) out.push(['This season', `${apps} apps · ${goals} G · ${assists} A`])
  return out
}

function tableLine(w: World, clubId: number, compId?: string, asOf?: string): string {
  // the table only belongs in a story that is still current
  if (asOf && (Date.parse(w.date) - Date.parse(asOf)) / 86400000 > 4) return ''
  const comp = compId ? w.competitions[compId] : undefined
  if (!comp || comp.format !== 'league' || !comp.table?.length) return ''
  const t = sortTable(w, comp)
  const i = t.findIndex((r) => r.clubId === clubId)
  if (i < 0) return ''
  const row = t[i]
  const name = w.clubs[clubId]?.short
  if (row.p < 3) return ''
  if (i === 0) {
    const gap = row.pts - (t[1]?.pts ?? row.pts)
    return gap > 0 ? `${name} sit top of the table, ${gap} point${gap === 1 ? '' : 's'} clear.` : `${name} are top on goal difference.`
  }
  const leader = t[0]
  const behind = leader.pts - row.pts
  const zone = comp.rules.rele && i >= t.length - comp.rules.rele
  return zone ? `${name} are ${ordinal(i + 1)}, in the relegation places.` : `${name} are ${ordinal(i + 1)}, ${behind} point${behind === 1 ? '' : 's'} behind leaders ${w.clubs[leader.clubId]?.short}.`
}

function resultArticle(w: World, n: NewsItem, f: Fixture, a: Article, pick: ReturnType<typeof picker>): Article {
  const r = f.result!
  const home = w.clubs[f.home], away = w.clubs[f.away]
  const [h, g] = r.score
  const win = h > g ? home : g > h ? away : undefined
  const lose = win ? (win === home ? away : home) : undefined
  const venue = f.venue || (f.neutral ? 'a neutral venue' : home.stadium)
  const day = WEEKDAY[weekday(f.date)]
  const goals = r.events.filter(isGoal)
  const scorer = (e: MatchEvent) => callName(w.players[e.player || 0]?.name || '')
  a.fixtureId = f.id
  a.hero = { kind: 'club', id: win?.id ?? f.home }
  if (win && lose) {
    const verb = Math.abs(h - g) >= 3 ? pick(['swept aside', 'thrashed', 'overwhelmed', 'ran riot against']) : Math.abs(h - g) === 2 ? pick(['beat', 'saw off', 'got the better of', 'were too strong for']) : pick(['edged', 'narrowly beat', 'held on to beat', 'squeezed past'])
    a.lede = `${win.name} ${verb} ${lose.name} ${Math.max(h, g)}-${Math.min(h, g)} at ${venue} on ${day}${r.pens ? `, winning ${Math.max(...r.pens)}-${Math.min(...r.pens)} on penalties` : ''}.`
  } else {
    a.lede = `${home.name} and ${away.name} ${pick(['shared the points', 'had to settle for a point each', 'could not be separated'])} in a ${h}-${g} draw at ${venue} on ${day}.`
  }
  // the goals, in order, with the moments that decided it
  if (goals.length) {
    const first = goals[0]
    const firstSide = first.side === 0 ? home : away
    const parts: string[] = [`${scorer(first)} ${first.type === 'penGoal' ? 'converted a penalty' : first.type === 'owngoal' ? 'turned into his own net' : pick(['opened the scoring', 'struck first', 'broke the deadlock'])} for ${first.type === 'owngoal' ? (first.side === 0 ? home.short : away.short) : firstSide.short} after ${first.min} minutes`]
    const rest = goals.slice(1)
    if (rest.length) {
      const names = rest.map((e) => `${scorer(e)} (${e.min}'${e.type === 'penGoal' ? ', pen' : e.type === 'owngoal' ? ', og' : ''})`)
      parts.push(`${rest.length === 1 ? 'and' : 'before'} ${names.join(', ')} ${rest.length === 1 ? 'added the other' : 'completed the scoring'}`)
    }
    a.paras.push(`${parts.join(', ')}.`)
    const decider = win && goals.filter((e) => (e.side === 0 ? home : away) === win).slice(-1)[0]
    if (decider && decider.min >= 85 && Math.abs(h - g) === 1) a.paras.push(`${pick(['The winner came late', 'It was settled at the death', 'The decisive moment arrived late on'])}: ${scorer(decider)}'s goal in the ${ordinal(decider.min)} minute ${pick(['sent the away end wild', 'broke hearts', 'settled a tense contest'])}.`.replace('the away end', win === away ? 'the away end' : 'the home crowd'))
  } else a.paras.push(pick(['Neither side found a way through in a cagey contest.', 'Chances were at a premium and the keepers were rarely troubled.', 'Both defences held firm throughout.']))
  const reds = r.events.filter((e) => e.type === 'red' || e.type === 'secondYellow')
  for (const e of reds.slice(0, 2)) a.paras.push(`${scorer(e)} was sent off ${e.type === 'secondYellow' ? 'for a second booking' : ''} in the ${ordinal(e.min)} minute, leaving ${e.side === 0 ? home.short : away.short} with ten men.`.replace('  ', ' '))
  const miss = r.events.find((e) => e.type === 'penMiss')
  if (miss) a.paras.push(`${scorer(miss)} ${pick(['missed from the spot', 'saw a penalty saved', 'failed to convert a penalty'])} in the ${ordinal(miss.min)} minute.`)
  if (r.motm) {
    const m = w.players[r.motm], st = r.players.find((x) => x.id === r.motm)
    if (m) a.paras.push(`${m.name} was named Player of the Match${st ? ` with a rating of ${st.rating.toFixed(1)}` : ''}.`)
  }
  const tl = [tableLine(w, f.home, f.compId, n.date), tableLine(w, f.away, f.compId, n.date)].filter(Boolean)
  if (tl.length) a.paras.push(tl.join(' '))
  const s = r.stats
  if (s?.[0]) a.facts = [['Possession', `${s[0].possession}% – ${s[1].possession}%`], ['Shots (on target)', `${s[0].shots} (${s[0].sot}) – ${s[1].shots} (${s[1].sot})`], ['xG', `${s[0].xg.toFixed(2)} – ${s[1].xg.toFixed(2)}`], ['Attendance', r.attendance.toLocaleString('en-GB')]]
  return a
}

function transferArticle(w: World, n: NewsItem, a: Article, pick: ReturnType<typeof picker>): Article {
  const p = w.players[n.playerIds[0]]
  if (!p) return a
  const to = w.clubs[n.clubIds[0]], from = n.clubIds[1] ? w.clubs[n.clubIds[1]] : undefined
  const age = ageOn(p.dob, w.date)
  const last = p.career[p.career.length - 1]
  const fee = n.fee ?? w.transfers.history.slice().reverse().find((h) => h.playerId === p.id && h.to === to?.id)?.fee ?? 0
  a.hero = { kind: 'player', id: p.id }
  const first = sentences(n.body)[0]
  a.lede = first || n.body
  const profile = age <= 21 ? pick([`At ${age}, ${callName(p.name)} is one of the more highly rated young ${p.positions[0] === 'GK' ? 'goalkeepers' : 'players'} around`, `The ${age}-year-old is seen as a long-term investment`]) : age >= 31 ? pick([`At ${age}, ${callName(p.name)} brings experience rather than a long-term project`, `The ${age}-year-old is a short-term signing to strengthen the squad now`]) : pick([`${callName(p.name)} arrives at ${age}, at the peak of his career`, `The ${age}-year-old should go straight into contention for a starting place`])
  a.paras.push(`${profile}.`)
  if (last && last.apps) a.paras.push(`Last season he made ${last.apps} appearances${last.goals ? `, scoring ${last.goals}` : ''}${last.assists ? ` and providing ${last.assists} assist${last.assists === 1 ? '' : 's'}` : ''}${last.ratingAvg ? ` with an average rating of ${last.ratingAvg.toFixed(2)}` : ''}.`)
  if (fee && p.value) {
    const ratio = fee / p.value
    a.paras.push(ratio > 1.25 ? pick([`The fee is well above his estimated market value of ${fmtMoney(p.value)}, a sign of how much ${to?.short} wanted him.`, `${to?.short} paid a premium: his market value is estimated at ${fmtMoney(p.value)}.`]) : ratio < 0.8 ? pick([`At well under his estimated ${fmtMoney(p.value)} value, it looks like a shrewd piece of business.`, `${to?.short} have landed him for less than his estimated value of ${fmtMoney(p.value)}.`]) : `The fee is broadly in line with his estimated market value of ${fmtMoney(p.value)}.`)
  }
  const lost = from?.transferPolicy?.lost?.find((l) => l.id === p.id)
  if (from && lost) a.paras.push(`${from.short} will now look to replace ${pick(['a key member of their side', 'one of their regular starters', 'an important player'])}.`)
  a.facts = [['From', from?.name || 'Free agent'], ['To', to?.name || ''], ['Fee', fee ? fmtMoney(fee) : 'Free'], ['Age', String(age)], ['Position', p.positions.join(' / ')], ['Contract', p.contract.until ? `Until ${p.contract.until + 1}` : '–']]
  return a
}

function injuryArticle(w: World, n: NewsItem, a: Article, pick: ReturnType<typeof picker>): Article {
  const p = w.players[n.playerIds[0]]
  if (!p) return a
  const club = w.clubs[p.clubId]
  a.hero = { kind: 'player', id: p.id }
  if (p.injury) {
    const until = p.injury.until
    const missed = Object.values(w.fixtures).filter((f) => !f.played && (f.home === p.clubId || f.away === p.clubId) && f.date >= w.date && f.date < until).length
    a.paras.push(`${pick(['He is expected back around', 'The club expect him to return around', 'Medical staff are targeting a return around'])} ${fmtDate(until, 'long')}${missed ? `, which could rule him out of ${missed} match${missed === 1 ? '' : 'es'}` : ''}.`)
    a.facts = [['Injury', p.injury.type], ['Expected return', fmtDate(until, 'long')], ...(missed ? [['Matches at risk', String(missed)] as [string, string]] : [])]
  }
  a.facts.push(...playerFacts(w, p).filter(([k]) => k !== 'Club' && k !== 'Value'))
  if (club) a.paras.push(tableLine(w, club.id, Object.values(w.competitions).find((c) => c.season === w.season && c.format === 'league' && c.clubs.includes(club.id))?.id, n.date) || '')
  a.paras = a.paras.filter(Boolean)
  return a
}

function clubArticle(w: World, n: NewsItem, a: Article, pick: ReturnType<typeof picker>): Article {
  const club = w.clubs[n.clubIds[0]] as Club | undefined
  if (!club) return a
  a.hero = { kind: 'club', id: club.id }
  const lg = Object.values(w.competitions).find((c) => c.season === w.season && c.format === 'league' && c.clubs.includes(club.id))
  const row = lg?.table?.find((r) => r.clubId === club.id)
  const recent = (Date.parse(w.date) - Date.parse(n.date)) / 86400000 <= 4
  const tl = tableLine(w, club.id, lg?.id, n.date)
  const sents = sentences(n.body)
  a.lede = sents[0] || n.body
  if (sents.length > 1) a.paras.push(sents.slice(1).join(' '))
  if (tl) a.paras.push(tl)
  if (recent && row && row.form?.length) a.paras.push(`${pick(['Recent form', 'Their last five', 'Form going into the next game'])}: ${row.form.slice(-5).join(' ')}.`)
  if (recent && row) a.facts = [['Played', String(row.p)], ['Record', `${row.w}W ${row.d}D ${row.l}L`], ['Goals', `${row.gf}–${row.ga}`], ['Points', String(row.pts)]]
  return a
}

function quoteArticle(w: World, n: NewsItem, a: Article, pick: ReturnType<typeof picker>): Article {
  const q = n.quote!
  a.hero = { kind: 'club', id: q.clubId }
  a.lede = sentences(n.body)[0] || n.body
  a.paras.push(`"${q.text}"`)
  // the body often carries the quote itself: don't print it twice
  const core = q.text.replace(/["“”]/g, '').trim().slice(0, 40)
  const rest = sentences(n.body).slice(1).join(' ')
  if (rest && !rest.replace(/["“”]/g, '').includes(core)) a.paras.push(rest)
  a.paras.push(`${pick(['The comments are likely to come up again', 'Those words will not have gone unnoticed', 'Expect the subject to be raised again'])} when the sides next meet.`)
  const f = n.fixtureId ? w.fixtures[n.fixtureId] : undefined
  if (f?.result) { a.fixtureId = f.id; a.facts = [['Result', `${w.clubs[f.home]?.short} ${f.result.score[0]}–${f.result.score[1]} ${w.clubs[f.away]?.short}`], ['Speaker', q.by]] }
  return a
}
