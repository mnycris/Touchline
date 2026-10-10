// Tactics Lab logic on a save: shapes for every phase, then setup A (the manager's tactics) against B (a change),
// paired matches. npx tsx scripts/qa/lab-compare.ts <save> '<B patch JSON>' [n=10] [style=balanced]
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { compareNotes, compareSetups, compareSources, createPractice, practiceOpponent, practiceSample, practiceShape, shapeFacts, SHAPE_PHASES, howLabel, type PracticeStyle } from '../../src/engine/world/practice'
const [file, patch = '{"lineHeight":80}', nn = '10', style = 'balanced'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const club = w.clubs[w.userClubId]
const A = { ...club.sheets.find((s) => s.id === club.activeSheet)!.tactics }
const B = { ...A, ...JSON.parse(patch) }
const opp = practiceOpponent(w, 'similar')
for (const ph of SHAPE_PHASES) {
  const t0 = performance.now()
  const sa = practiceShape(w, A, opp, style as PracticeStyle, ph.id), sb = practiceShape(w, B, opp, style as PracticeStyle, ph.id)
  console.log(`${ph.label.padEnd(18)} A ${shapeFacts(sa.dots, sa.ball, sa.inPoss).map((f) => `${f.label} ${f.value}`).join(' · ')}  |  B ${shapeFacts(sb.dots, sb.ball, sb.inPoss).map((f) => f.value).join(' · ')}  (${(performance.now() - t0).toFixed(0)}ms)`)
}
const run = (t: typeof A) => Array.from({ length: Number(nn) }, (_, i) => { const { sim } = createPractice(w, t, opp, style as PracticeStyle, 9000 + i * 7919); sim.runToEnd(); return practiceSample(sim) })
const t0 = Date.now()
const sa = run(A), sb = run(B)
console.log(`\n${club.short} vs a side like ${w.clubs[opp].short}, ${nn} paired matches each (${Date.now() - t0}ms)`)
const rows = compareSetups(sa, sb)
for (const r of rows) console.log(`${r.label.padEnd(30)} ${r.fmt(r.a).padStart(6)} ${r.fmt(r.b).padStart(6)}  ${r.diff >= 0 ? '+' : ''}${r.diff.toFixed(2).padStart(6)} ${r.verdict}${r.good === undefined ? '' : r.good ? ' (better)' : ' (worse)'}`)
const src = compareSources(sa, sb), srcA = compareSources(sa, sb, true)
console.log('chances', src.map((s) => `${howLabel(s.how)} ${s.a[1].toFixed(2)}→${s.b[1].toFixed(2)}`).join(' · '))
console.log('against', srcA.map((s) => `${howLabel(s.how)} ${s.a[1].toFixed(2)}→${s.b[1].toFixed(2)}`).join(' · '))
for (const n of compareNotes(rows, src, srcA)) console.log(' • ' + n)
