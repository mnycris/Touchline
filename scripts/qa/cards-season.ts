// Card rates in a played save by kind of competition, and bookings per player over the season (big five regulars).
// npx tsx scripts/qa/cards-season.ts <save>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { createSim, simulateFixture } from '../../src/engine/world/matchRunner'
const w = deserialize(fs.readFileSync(process.argv[2]))
// played matches in the save as they really happened, by kind of competition
const rows: Record<string, { n: number; y: number; r: number; full: number }> = {}
for (const f of Object.values(w.fixtures)) {
  if (!f.played || !f.result) continue
  const c = w.competitions[f.compId]
  const k = `${c?.format}${c?.intl ? ':' + c.intl.kind : ''}${f.userInvolved ? ' (yours)' : ''}`
  const e = (rows[k] ||= { n: 0, y: 0, r: 0, full: 0 })
  e.n++; e.y += f.result.stats[0].yellows + f.result.stats[1].yellows; e.r += f.result.stats[0].reds + f.result.stats[1].reds
  if (f.result.detail === 'full') e.full++
}
for (const [k, e] of Object.entries(rows).sort((a, b) => b[1].n - a[1].n)) console.log(k.padEnd(28), String(e.n).padStart(5), 'yellows/match', (e.y / e.n).toFixed(2), 'reds', (e.r / e.n).toFixed(3), 'full-detail', e.full)
// per player: yellows this season (league comps of the big five) vs appearances
const per: { name: string; club: string; y: number; apps: number; agg: number; pos: string }[] = []
for (const p of Object.values(w.players)) {
  let y = 0, apps = 0
  for (const [cid, s] of Object.entries(p.season)) { const c = w.competitions[cid]; if (c?.format === 'league' && ['L13', 'L53', 'L19', 'L31', 'L16'].includes(c.key)) { y += s.yellows; apps += s.apps } }
  if (apps >= 10) per.push({ name: p.name, club: w.clubs[p.clubId]?.short || '', y, apps, agg: p.attrs ? (p as any).attrs[23] ?? 0 : 0, pos: p.positions[0] })
}
per.sort((a, b) => b.y - a.y)
const hist: Record<string, number> = {}
for (const x of per) { const k = x.y >= 15 ? '15+' : x.y >= 10 ? '10-14' : x.y >= 5 ? '5-9' : '0-4'; hist[k] = (hist[k] || 0) + 1 }
console.log('big-five regulars (10+ apps): yellows this season', hist, 'top:', per.slice(0, 8).map((x) => `${x.name} (${x.club}, ${x.pos}) ${x.y} in ${x.apps}`).join('; '))
const me = w.userClubId
console.log('your squad:', per.filter((x) => x.club === w.clubs[me].short).map((x) => `${x.name} ${x.y}/${x.apps}`).join(', '))
