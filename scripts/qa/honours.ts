// Trophies recorded the day they are won (supercups, cups, leagues), never twice; personal awards with real months;
// Manager of the Season when a league finishes; older saves brought up to date.
// npx tsx scripts/qa/honours.ts migrate <older save>
// npx tsx scripts/qa/honours.ts play <save> <until YYYY-MM-DD>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave } from '../../src/engine/world/migrate'
import { advance, afterMatch, worldRng } from '../../src/engine/world/advance'
import { createSim } from '../../src/engine/world/matchRunner'
import { careerSummary } from '../../src/engine/world/career'
import { diffDays } from '../../src/domain/dates'
import type { World } from '../../src/domain/types'

const [mode, file, until] = process.argv.slice(2)
const w: World = deserialize(fs.readFileSync(file))
let fails = 0
const ok = (c: boolean, what: string) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`) }
const isDate = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}/.test(d) && !Number.isNaN(Date.parse(d.slice(0, 10)))
const dupes = () => {
  const seen = new Set<string>(); let n = 0
  for (const c of Object.values(w.clubs)) for (const t of c.trophies || []) { const k = `${c.id}:${t.compKey}:${t.season}`; if (seen.has(k)) n++; seen.add(k) }
  const us = new Set<string>()
  for (const t of w.user.trophies) { const k = `${t.compKey}:${t.season}`; if (us.has(k)) n++; us.add(k) }
  return n
}
const awardsOk = () => w.user.awards.every((a) => !a.month || /^\d{4}-\d{2}$/.test(a.month))
const milestonesOk = () => careerSummary(w).milestones.every((m) => isDate(m.date))

if (mode === 'migrate') {
  const before = { trophies: w.user.trophies.length, awards: w.user.awards.map((a) => a.month).join(',') }
  const rep = migrateSave(w)
  console.log(`${w.date} · ${rep.applied.join('; ')}`)
  console.log(`     awards before: ${before.awards}`)
  console.log(`     awards after:  ${w.user.awards.map((a) => `${a.month}${a.compKey ? `/${a.compKey}` : ''}`).join(',')}`)
  ok(awardsOk(), 'every monthly award has a yyyy-mm month')
  ok(milestonesOk(), 'every milestone has a real date')
  const won = Object.values(w.competitions).filter((c) => c.season === w.season && c.status === 'finished' && c.winner && w.user.history.some((h) => h.clubId === c.winner))
  for (const c of won) ok(w.user.trophies.some((t) => t.compKey === c.key && t.season === c.season), `${c.name} ${c.season} won this season is in the cabinet (${w.user.trophies.find((t) => t.compKey === c.key && t.season === c.season)?.date || 'no date'})`)
  console.log(`     cabinet ${before.trophies} → ${w.user.trophies.length}: ${w.user.trophies.map((t) => `${t.compName} ${t.season}`).join(', ')}`)
  ok(dupes() === 0, 'no trophy recorded twice')
} else {
  migrateSave(w)
  const start = w.date
  const t0 = { user: w.user.trophies.length }
  let guard = 0
  const decided: string[] = []
  while (w.date < until && guard++ < 2000) {
    const r = advance(w, Math.max(1, Math.min(60, diffDays(until, w.date))))
    if (r.stop === 'match' && r.fixture) {
      const f = r.fixture
      const sim = createSim(w, f, true); sim.ctx.assistantSubs = true
      afterMatch(w, f, sim.runToEnd(), worldRng(w))
      const c = w.competitions[f.compId]
      // the day the manager's side won something, it is in the cabinet
      if (c && c.status === 'finished' && c.winner === w.userClubId && !decided.includes(c.id)) {
        decided.push(c.id)
        ok(w.user.trophies.some((t) => t.compKey === c.key && t.season === c.season && t.date === f.date), `${c.name} won on ${f.date}: in the cabinet that day`)
      }
    }
    for (const m of w.inbox) m.read = true
  }
  // every competition decided in the period is in its winner's honours, whoever won it
  const done = Object.values(w.competitions).filter((c) => c.status === 'finished' && c.season >= Number(start.slice(0, 4)) - 1 && (c.winner || c.format === 'league'))
  let missing = 0
  for (const c of done) {
    const win = c.winner ?? (c.table ? [...c.table].sort((a, b) => b.pts - a.pts)[0]?.clubId : undefined)
    if (win && w.clubs[win] && !w.clubs[win].trophies.some((t) => t.compKey === c.key && t.season === c.season)) { missing++; if (missing <= 5) console.log(`     missing: ${c.name} ${c.season} → ${w.clubs[win].short}`) }
  }
  ok(missing === 0, `all ${done.length} decided competitions are in their winners' honours`)
  const mots = w.awards.filter((a) => a.name.endsWith('Manager of the Season'))
  console.log(`     Manager of the Season: ${mots.map((a) => `${a.name.replace(' Manager of the Season', '')} ${a.season}: ${a.managerName} (${w.clubs[a.clubId!]?.short})`).join('; ') || 'none yet'}`)
  ok(dupes() === 0, 'no trophy recorded twice')
  ok(awardsOk() && milestonesOk(), 'awards and milestones dated')
  console.log(`     ${start} → ${w.date}: cabinet ${t0.user} → ${w.user.trophies.length}: ${w.user.trophies.map((t) => `${t.compName} ${t.season} (${t.date || '-'})`).join(', ')}`)
  console.log(`     personal awards: ${w.user.awards.map((a) => `${a.name}${a.month ? ` ${a.month}` : ` ${a.season}`}`).join('; ')}`)
}
console.log(fails ? `${fails} FAILED` : 'all ok')
process.exit(fails ? 1 : 0)
