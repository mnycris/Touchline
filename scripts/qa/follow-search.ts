// Universal search and Following, headless: names found despite accents, typos, nicknames and two-word surnames;
// speed over the whole world; follows and recent searches kept in the save; the Following feed told once per event.
// npx tsx scripts/qa/follow-search.ts <save>
import fs from 'node:fs'
import { deserialize, serialize } from '../../src/services/saves'
import { search, warmSearch } from '../../src/ui/search'
import { followingFeed, followingUnseen, noteRecent, toggleFollow, isFollowing } from '../../src/engine/world/follow'
import type { World } from '../../src/domain/types'

const w: World = deserialize(fs.readFileSync(process.argv[2]))
let fails = 0
const ok = (cond: boolean, what: string) => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`) }
const top = (q: string) => { const r = search(w, q); return r.top || r.groups[0]?.hits[0] }
const name = (h?: { kind: string; id: number | string }) => !h ? '-' : h.kind === 'player' ? w.players[h.id as number].name : h.kind === 'club' ? w.clubs[h.id as number].name : h.kind === 'manager' ? (h.id === 'me' ? 'me' : w.managers[h.id as number].name) : String(h.id)
const best = (re: RegExp) => Object.values(w.players).filter((p) => re.test(p.name)).sort((a, b) => b.ovr - a.ovr)[0]

let t = performance.now(); warmSearch(w); console.log(`     index built in ${Math.round(performance.now() - t)} ms over ${Object.keys(w.players).length} players`)
// names as people type them
const cases: [string, (h?: { kind: string; id: number | string }) => boolean, string][] = []
const mbappe = best(/Mbapp/), ode = best(/degaard/), mac = best(/Mac Allister/), haaland = best(/Haaland/)
if (mbappe) cases.push(['mbape', (h) => h?.id === mbappe.id, mbappe.name])
if (ode) { cases.push(['odegaard', (h) => h?.id === ode.id, ode.name]); cases.push(['Ødegaard', (h) => h?.id === ode.id, ode.name]) }
if (mac) cases.push(['macallister', (h) => h?.id === mac.id, mac.name])
if (haaland) cases.push(['halaand', (h) => h?.id === haaland.id, haaland.name])
const spurs = Object.values(w.clubs).find((c) => /^Tottenham/.test(c.name))
if (spurs) cases.push(['spurs', (h) => h?.kind === 'club' && h.id === spurs.id, spurs.name])
cases.push(['ucl', (h) => h?.kind === 'comp' && h.id === 'UCL', 'Champions League'])
cases.push(['contracts', (h) => h?.kind === 'career' && h.id === 'contracts', 'Contracts screen'])
cases.push([`${w.user.firstName} ${w.user.lastName}`, (h) => h?.kind === 'manager' && h.id === 'me', 'the manager himself'])
for (const [q, test, want] of cases) { const h = top(q); ok(test(h), `"${q}" → ${name(h)} (want ${want})`) }

// speed: every query of a session, after the index is warm
const qs = ['a', 'ma', 'man', 'manc', 'manch', 'b', 'br', 'bru', 'brun', 'bruno', 'bruno g', 'sa', 'sak', 'saka', 'real m', 'kylian', 'mbape', 'odegard', 'premier', 'arteta', 'zzqx', 'contracts', 'liverpool', 'van d', 'de jong']
t = performance.now()
for (const q of qs) search(w, q)
const avg = (performance.now() - t) / qs.length
ok(avg < 45, `average query ${avg.toFixed(1)} ms over ${qs.length} keystrokes`)

// follows and recent searches live in the save
const p = Object.values(w.players).find((x) => x.clubId && x.ovr >= 80)!
const c = Object.values(w.clubs).find((x) => !x.national && x.id !== w.userClubId && x.reputation >= 80)!
toggleFollow(w, 'player', p.id); toggleFollow(w, 'club', c.id); toggleFollow(w, 'comp', 'UCL')
noteRecent(w, { kind: 'player', id: p.id }); noteRecent(w, { kind: 'club', id: c.id }); noteRecent(w, { kind: 'player', id: p.id })
const back = deserialize(serialize(w))
ok(isFollowing(back, 'player', p.id) && isFollowing(back, 'club', c.id) && isFollowing(back, 'comp', 'UCL'), `follows survive save and load (${back.follows?.length})`)
ok(back.recentSearch?.length === 2 && back.recentSearch[0].id === p.id, `recent searches: newest first, no repeats (${JSON.stringify(back.recentSearch)})`)
ok(!toggleFollow(w, 'club', c.id) && !isFollowing(w, 'club', c.id), 'unfollow')
toggleFollow(w, 'club', c.id)
ok(search(w, p.name.split(' ').pop()!).groups.concat(search(w, p.name.split(' ').pop()!).top ? [{ kind: 'player', hits: [search(w, p.name.split(' ').pop()!).top!], total: 1 }] : []).some((g) => g.hits.some((h) => h.id === p.id)), `a followed player is found by his surname (${p.name})`)

// the feed: once per happening, newest first
const feed = followingFeed(w, 60, 500)
const keys = new Set(feed.map((e) => e.key))
ok(keys.size === feed.length, `${feed.length} developments, no repeats`)
ok(feed.every((e, i) => i === 0 || feed[i - 1].date >= e.date), 'newest first')
const told = new Set(feed.filter((e) => e.newsId && e.fixtureId).flatMap((e) => w.news.find((n) => n.id === e.newsId)!.playerIds.map((id) => `${e.fixtureId}:${id}`)))
ok(!feed.some((e) => e.type === 'performance' && told.has(`${e.fixtureId}:${e.ref.id}`)), 'a game in the news is not told again as a performance')
const types = feed.reduce<Record<string, number>>((a, e) => { a[e.type] = (a[e.type] || 0) + 1; return a }, {})
console.log(`     by type: ${JSON.stringify(types)}`)
w.flags.followSeen = w.date
ok(followingUnseen(w) === 0, 'nothing unseen once looked at')

console.log(fails ? `${fails} FAILED` : 'all ok')
process.exit(fails ? 1 : 0)
