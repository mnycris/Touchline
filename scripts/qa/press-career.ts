// Plays a save forward and holds both press conferences around every match of the manager's team, answering at random
// (follow-ups included), so the question bank is exercised the way the game uses it: before kick-off on match day and
// straight after the final whistle, with what was said before the game remembered after it.
// npx tsx scripts/qa/press-career.ts <save> <until YYYY-MM-DD> [seed]
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { advance, afterMatch, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { pressQuestions, applyPress, type PressQuestion } from '../../src/engine/world/press'
import { diffDays } from '../../src/domain/dates'
import { Rng } from '../../src/domain/rng'
;(globalThis as { __pressDebug?: boolean }).__pressDebug = true
const [file, until = '2027-05-31', seed = '7'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const rng = new Rng(Number(seed))
const freq: Record<string, number> = {}
let confs = 0, asked = 0, follows = 0
const log: string[] = []
function hold(kind: 'pre' | 'post', fid: string) {
  let qs: PressQuestion[] = pressQuestions(w, kind, fid)
  const answers: Record<string, string> = {}
  confs++
  const f = w.fixtures[fid]
  log.push(`\n== ${kind.toUpperCase()} ${f.date} ${w.clubs[f.home].short} ${f.result ? `${f.result.score[0]}-${f.result.score[1]}` : 'v'} ${w.clubs[f.away].short} (${f.roundName})`)
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i]
    const o = q.options[Math.floor(rng.next() * q.options.length)]
    answers[q.id] = o.id
    asked++
    freq[`${kind}:${q.topic}`] = (freq[`${kind}:${q.topic}`] || 0) + 1
    if (q.topic.endsWith('-follow')) follows++
    log.push(`  ${q.topic.endsWith('-follow') ? '   ↳ ' : ''}Q [${q.topic}] ${q.text}\n  ${q.topic.endsWith('-follow') ? '     ' : ''}A (${o.tone}) ${o.text}`)
    if (o.followUp) qs = [...qs.slice(0, i + 1), o.followUp, ...qs.slice(i + 1)]
  }
  const out = applyPress(w, kind, fid, qs, answers)
  log.push(`  → ${out.join(' · ')}`)
}
let guard = 0
while (w.date < until && guard++ < 3000) {
  const r = advance(w, Math.max(1, Math.min(400, Math.abs(diffDays(w.date, until)))))
  if (r.stop === 'match' && r.fixture) {
    hold('pre', r.fixture.id)
    afterMatch(w, r.fixture, simulateFixture(w, r.fixture), worldRng(w))
    hold('post', r.fixture.id)
  }
  for (const m of w.inbox) m.read = true
}
console.log(`${confs} conferences, ${asked} questions (${(asked / confs).toFixed(2)} per, ${follows} follow-ups)`)
for (const [k, v] of Object.entries(freq).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k)
fs.writeFileSync(process.env.LOG || '/dev/null', log.join('\n'))
