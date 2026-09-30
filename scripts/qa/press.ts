// Press conference coverage: builds pre- and post-match conferences for many clubs' fixtures in a save and reports
// how often each topic and follow-up comes up, plus any broken text. npx tsx scripts/qa/press.ts <save> [clubs=60]
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { pressQuestions, type PressQuestion } from '../../src/engine/world/press'
import { aiMatchSheet } from '../../src/engine/match/selection'
;(globalThis as { __pressDebug?: boolean }).__pressDebug = true
const [file, nClubs = '60'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const me = w.userClubId
const clubs = Object.values(w.clubs).filter((c) => c.leagueId && !c.national).sort((a, b) => b.reputation - a.reputation).slice(0, Number(nClubs))
const nts = Object.values(w.clubs).filter((c) => c.national).slice(0, 12)
const freq: Record<string, number> = {}, fol: Record<string, number> = {}
let confs = 0, qTotal = 0, optTotal = 0, bad = 0
const samples: Record<string, string[]> = {}
const check = (q: PressQuestion, where: string) => {
  const all = [q.text, ...q.options.map((o) => o.text)]
  for (const t of all) if (/undefined|NaN|null|\s{2}|\$\{|\[object/.test(t)) { bad++; console.log('BAD', where, q.topic, '|', t) }
}
for (const club of [...clubs, ...nts]) {
  w.userClubId = club.id
  // an AI club has no saved team sheet of its own: give it the one its manager would pick
  if (!club.sheets.length) { const sh = aiMatchSheet(w, club); club.sheets = [sh]; club.activeSheet = sh.id }
  const fx = Object.values(w.fixtures).filter((f) => f.home === club.id || f.away === club.id).sort((a, b) => a.date.localeCompare(b.date))
  const played = fx.filter((f) => f.played && f.result).slice(-14)
  const next = fx.filter((f) => !f.played).slice(0, 3)
  for (const [kind, list] of [['post', played], ['pre', next]] as const) {
    for (const f of list) {
      const qs = pressQuestions(w, kind, f.id)
      confs++
      for (const q of qs) {
        qTotal++; optTotal += q.options.length
        freq[`${kind}:${q.topic}`] = (freq[`${kind}:${q.topic}`] || 0) + 1
        ;(samples[`${kind}:${q.topic}`] ||= []).length < 2 && samples[`${kind}:${q.topic}`].push(`${club.short}: ${q.text}`)
        check(q, `${club.short} ${f.id}`)
        for (const o of q.options) if (o.followUp) {
          fol[o.followUp.topic] = (fol[o.followUp.topic] || 0) + 1
          check(o.followUp, `${club.short} ${f.id} follow`)
          ;(samples[`follow:${o.followUp.topic}:${o.tone}`] ||= []).length < 1 && samples[`follow:${o.followUp.topic}:${o.tone}`].push(`${o.text}  →  ${o.followUp.text}`)
          for (const o2 of o.followUp.options) if (o2.followUp && !o2.effect.promise) console.log('NESTED', o.followUp.topic)
        }
      }
    }
  }
}
w.userClubId = me
console.log(`${confs} conferences, ${qTotal} questions (${(qTotal / confs).toFixed(2)} per), ${(optTotal / qTotal).toFixed(2)} options per question, ${bad} bad strings`)
const rows = Object.entries(freq).sort((a, b) => b[1] - a[1])
console.log(`${rows.length} distinct topics used`)
for (const [k, v] of rows) console.log(String(v).padStart(5), k, '|', samples[k]?.[0])
console.log('\nfollow-up slots offered (one per option):')
for (const [k, v] of Object.entries(fol).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k)
if (process.env.SAMPLES) for (const [k, v] of Object.entries(samples).filter(([k]) => k.startsWith('follow:'))) console.log(k, '|', v[0])
