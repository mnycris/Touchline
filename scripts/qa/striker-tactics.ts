// An elite striker in the manager's team under different tactics: his goals, shots and xG per 90, and the team's.
// npx tsx scripts/qa/striker-tactics.ts <save> [repeats]
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { createSim } from '../../src/engine/world/matchRunner'
const [file, R = '2'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const me = w.userClubId
const club = w.clubs[me]
const sheet = club.sheets.find((s) => s.id === club.activeSheet)!
const st = sheet.lineup.map((id) => w.players[id]).filter((p) => p && (p.positions[0] === 'ST' || p.positions[0] === 'CF')).sort((a, b) => b.ovr - a.ovr)[0]
console.log('striker', st.name, st.ovr, 'formation', sheet.formation, 'base tactics', JSON.stringify({ b: sheet.tactics.buildUp, c: sheet.tactics.chanceCreation, w: sheet.tactics.width, box: sheet.tactics.playersInBox, m: sheet.tactics.mentality }))
const fx = Object.values(w.fixtures).filter((f) => !f.played && (f.home === me || f.away === me) && w.competitions[f.compId]?.format === 'league').slice(0, 20)
const base = { ...sheet.tactics }
const variants: [string, Partial<typeof base>][] = [
  ['as set', {}], ['possession', { buildUp: 'Short Passing', chanceCreation: 'Possession', tempo: 35 }], ['direct', { buildUp: 'Long Ball', chanceCreation: 'Direct Passing', tempo: 75 }],
  ['counter', { buildUp: 'Counter', chanceCreation: 'Forward Runs', defApproach: 'Deep' }], ['wide + crosses', { width: 85, chanceCreation: 'Balanced', playersInBox: 6 }], ['narrow, few in box', { width: 25, playersInBox: 3 }],
  ['defensive', { mentality: 'Defensive' }], ['attacking', { mentality: 'Attacking', playersInBox: 6 }],
]
for (const [label, patch] of variants) {
  sheet.tactics = { ...base, ...patch } as typeof base
  let g = 0, sh = 0, xg = 0, mins = 0, tg = 0, n = 0, txg = 0
  for (let k = 0; k < Number(R); k++) for (const f of fx) {
    const s0 = w.meta.seed; w.meta.seed = s0 + k * 7919
    const r = createSim(w, f, true).runToEnd()
    w.meta.seed = s0
    const us = f.home === me ? 0 : 1
    const ps = r.players.find((p) => p.id === st.id)
    if (ps) { g += ps.goals; sh += ps.shots; xg += ps.xg; mins += ps.mins }
    tg += r.score[us]; txg += r.stats[us].xg; n++
  }
  const p90 = (v: number) => (mins ? (v / mins) * 90 : 0).toFixed(2)
  console.log(`${label.padEnd(20)} ${st.name}: ${p90(g)} goals/90 · ${p90(sh)} shots/90 · ${p90(xg)} xG/90 · team ${(tg / n).toFixed(2)} goals, ${(txg / n).toFixed(2)} xG · his share of team goals ${Math.round((g / Math.max(1, tg)) * 100)}%`)
}
sheet.tactics = base
// the striker's role in his slot
const slot = sheet.lineup.indexOf(st.id)
const baseRole = { ...sheet.roles[slot] }
for (const role of ['Advanced Forward', 'Poacher', 'Target Forward', 'False Nine', 'Pressing Forward', 'Complete Forward']) {
  sheet.roles[slot] = { ...baseRole, role, focus: 'Attack' }
  let g = 0, sh = 0, mins = 0, tg = 0
  for (let k = 0; k < Number(R); k++) for (const f of fx) {
    const s0 = w.meta.seed; w.meta.seed = s0 + k * 7919
    const r = createSim(w, f, true).runToEnd()
    w.meta.seed = s0
    const ps = r.players.find((p) => p.id === st.id)
    if (ps) { g += ps.goals; sh += ps.shots; mins += ps.mins }
    tg += r.score[f.home === me ? 0 : 1]
  }
  console.log(`role ${role.padEnd(18)} ${((g / mins) * 90).toFixed(2)} goals/90 · ${((sh / mins) * 90).toFixed(2)} shots/90 · share ${Math.round((g / Math.max(1, tg)) * 100)}%`)
}
sheet.roles[slot] = baseRole
