// History notes before matches and milestone news after them, checked against the save's own records.
// npx tsx scripts/qa/history.ts <save> <matches to play>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave } from '../../src/engine/world/migrate'
import { advance, afterMatch, worldRng } from '../../src/engine/world/advance'
import { createSim } from '../../src/engine/world/matchRunner'
import { historyNotes, underYou } from '../../src/engine/world/history'
import { storyLines } from '../../src/engine/world/storylines'
import { managedMatches } from '../../src/engine/world/career'
import { callName } from '../../src/engine/match/commentary'
import type { World } from '../../src/domain/types'

const w: World = deserialize(fs.readFileSync(process.argv[2]))
migrateSave(w)
const games = Number(process.argv[3] || 12)
let fails = 0, notes = 0
const ok = (c: boolean, what: string) => { if (!c) { fails++; console.log(`FAIL ${what}`) } }
const newsBefore = new Set(w.news.map((n) => n.id))
for (let g = 0; g < games; g++) {
  let r = advance(w, 30)
  let guard = 0
  while (r.stop !== 'match' && guard++ < 20) r = advance(w, 30)
  if (r.stop !== 'match' || !r.fixture) break
  const f = r.fixture
  const hs = historyNotes(w, f)
  notes += hs.length
  const comp = w.competitions[f.compId]
  console.log(`${f.date} ${w.clubs[f.home].short} v ${w.clubs[f.away].short} (${comp?.short} ${f.roundName})`)
  for (const n of hs) console.log(`   [${n.kind} ${n.weight}] ${n.text}`)
  // the claims, checked
  const ms = managedMatches(w)
  const mine = underYou(ms)
  for (const n of hs) {
    let m = n.text.match(/^Your (\d+)\w\w match as a manager/)
    if (m) ok(Number(m[1]) === ms.length + 1, `match count ${m[1]} vs ${ms.length + 1}`)
    m = n.text.match(/^A win would be your (\d+)\w\w as a manager/)
    if (m) ok(Number(m[1]) === ms.filter((x) => x.res === 'W').length + 1, `win count`)
    m = n.text.match(/one goal from (\d+) for you/)
    if (m && n.playerId) ok(mine.get(n.playerId)!.goals === Number(m[1]) - 1, `goals under you for ${n.playerId}`)
    m = n.text.match(/one goal from (\d+) this season/)
    if (m && n.playerId) ok(Object.values(w.players[n.playerId].season).reduce((a, s) => a + s.goals, 0) === Number(m[1]) - 1, `season goals for ${n.playerId}`)
    m = n.text.match(/^(.+) have won the last (\d+) meetings/)
    if (m) {
      const k = Number(m[2])
      const club = Object.values(w.clubs).find((c) => c.short === m![1])!
      const other = club.id === f.home ? f.away : f.home
      const meet = Object.values(w.fixtures).filter((x) => x.played && x.result && [x.home, x.away].includes(club.id) && [x.home, x.away].includes(other)).sort((a, b) => a.date.localeCompare(b.date)).slice(-k)
      ok(meet.length === k && meet.every((x) => { const [a, b] = x.result!.score; const gf = x.home === club.id ? a : b, ga = x.home === club.id ? b : a; return gf > ga || (gf === ga && !!x.result!.pens && (x.home === club.id ? x.result!.pens[0] > x.result!.pens[1] : x.result!.pens[1] > x.result!.pens[0])) }), `${club.short} won the last ${k}`)
    }
  }
  // the preview lines carry them, and never twice
  const lines = storyLines(w, f).map((l) => l.text)
  ok(new Set(lines).size === lines.length, 'no repeated storyline')
  const sim = createSim(w, f, true); sim.ctx.assistantSubs = true
  afterMatch(w, f, sim.runToEnd(), worldRng(w))
  for (const m of w.inbox) m.read = true
}
// other matches: no "you" in them
const others = Object.values(w.fixtures).filter((f) => !f.played && f.home !== w.userClubId && f.away !== w.userClubId && f.date <= w.date.slice(0, 8) + '28').slice(0, 300)
let otherNotes = 0
for (const f of others) for (const n of historyNotes(w, f)) { otherNotes++; ok(!/\byou(r)?\b/i.test(n.text), `"you" in another club's match: ${n.text}`) }
const fresh = w.news.filter((n) => !newsBefore.has(n.id) && n.kind === 'milestone' && n.userRelated)
console.log(`\n${notes} notes over ${games} matches; ${otherNotes} notes on ${others.length} other fixtures`)
for (const n of fresh) console.log(`   news: ${n.headline} · ${n.body}`)
console.log(fails ? `${fails} FAILED` : 'all ok')
void callName
process.exit(fails ? 1 : 0)
