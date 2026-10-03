// Champions League (and other UEFA league phases) health check: fixtures per club, table vs results, knockout draw.
// npx tsx scripts/qa/ucl.ts <save> [UCL|UEL|UECL]
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { sortTable } from '../../src/engine/competitions/tables'
const [file, key = 'UCL'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
console.log('date', w.date, 'season', w.season)
const comp = Object.values(w.competitions).find((c) => c.key === key && c.season === w.season)!
if (!comp) { console.log('no comp'); process.exit(0) }
console.log(comp.id, comp.status, 'clubs', comp.clubs.length, 'fixtures', comp.fixtures.length, 'table rows', comp.table?.length)
const lp = comp.fixtures.map((id) => w.fixtures[id]).filter((f) => f && f.roundName.startsWith('League phase'))
const missing = comp.fixtures.filter((id) => !w.fixtures[id]).length
console.log('league-phase fixtures', lp.length, 'played', lp.filter((f) => f.played).length, 'missing ids', missing)
const per = new Map<number, { n: number; h: number; p: number; w: number; d: number; l: number; gf: number; ga: number }>()
for (const c of comp.clubs) per.set(c, { n: 0, h: 0, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 })
const byRound: Record<string, number> = {}
for (const f of lp) {
  byRound[f.roundName] = (byRound[f.roundName] || 0) + 1
  for (const [id, home] of [[f.home, true], [f.away, false]] as const) {
    const e = per.get(id); if (!e) { console.log('fixture club not in comp', id, f.id); continue }
    e.n++; if (home) e.h++
    if (f.played && f.result) { e.p++; const a = f.result.score[home ? 0 : 1], b = f.result.score[home ? 1 : 0]; e.gf += a; e.ga += b; if (a > b) e.w++; else if (a < b) e.l++; else e.d++ }
  }
}
console.log('per round', byRound)
const counts: Record<number, number> = {}
for (const e of per.values()) counts[e.n] = (counts[e.n] || 0) + 1
console.log('fixtures per club histogram', counts, 'home histogram', [...per.values()].reduce((a, e) => { a[e.h] = (a[e.h] || 0) + 1; return a }, {} as Record<number, number>))
// dates per round
const dates: Record<string, Set<string>> = {}
for (const f of lp) (dates[f.roundName] ||= new Set()).add(f.date)
console.log('dates', Object.fromEntries(Object.entries(dates).map(([k, v]) => [k, [...v].sort().join(',')])))
// table vs results
let mism = 0
for (const r of comp.table || []) {
  const e = per.get(r.clubId)
  if (!e) { console.log('table row for club not in comp', r.clubId); continue }
  if (r.p !== e.p || r.w !== e.w || r.d !== e.d || r.l !== e.l || r.gf !== e.gf || r.ga !== e.ga) { mism++; if (mism < 6) console.log('MISMATCH', w.clubs[r.clubId]?.short, JSON.stringify(r), JSON.stringify(e)) }
}
console.log('table mismatches', mism)
const t = sortTable(w, comp)
console.log('top/bottom', t.slice(0, 10).map((r, i) => `${i + 1}.${w.clubs[r.clubId]?.short} ${r.p}p ${r.pts}`).join(' | '))
console.log('…', t.slice(22, 26).map((r, i) => `${i + 23}.${w.clubs[r.clubId]?.short} ${r.p}p ${r.pts}`).join(' | '), '… last', t.slice(-2).map((r) => `${w.clubs[r.clubId]?.short} ${r.pts}`).join(' | '))
for (const r of comp.rounds) {
  const fx = r.fixtures.map((id) => w.fixtures[id])
  console.log('round', r.name, 'drawn', r.drawn, 'fixtures', fx.length, 'played', fx.filter((f) => f?.played).length, 'pool', r.pool?.length, 'winners', r.winners?.length, 'dates', [...new Set(fx.map((f) => f?.date))].join(','))
  if (r.drawn && r.name === 'Knockout play-offs') {
    const pos = new Map(t.map((x, i) => [x.clubId, i + 1]))
    console.log('  KPO pairs (pos)', fx.filter((f) => f.leg === 2).map((f) => `${pos.get(f.home)}v${pos.get(f.away)}`).join(' '))
  }
  if (r.drawn && r.name === 'Round of 16') {
    const pos = new Map(t.map((x, i) => [x.clubId, i + 1]))
    console.log('  R16 pairs (pos)', fx.filter((f) => f.leg === 2).map((f) => `${pos.get(f.home)}v${pos.get(f.away)}`).join(' '))
  }
}
// a sample club's fixtures
const me = comp.clubs.includes(w.userClubId) ? w.userClubId : comp.clubs[0]
console.log(w.clubs[me].short, lp.filter((f) => f.home === me || f.away === me).sort((a, b) => a.date.localeCompare(b.date)).map((f) => `${f.date} ${f.roundName.slice(-3)} ${w.clubs[f.home].short}-${w.clubs[f.away].short} ${f.played ? f.result?.score.join('-') : ''}`).join('\n  '))
