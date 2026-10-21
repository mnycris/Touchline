// What players produce over a season: the elite attackers' totals in all competitions, the big leagues' top scorers
// and assisters, and goals, assists and ratings per 90 by role and overall, set against real seasons.
//   npx tsx scripts/qa/season-stats.ts <save near the end of a season>
// Real reference (2022-25, all competitions unless said): elite strikers 30-45 goals (Kane 44, Mbappé 44, Haaland 30
// with 22 in the league); elite wide forwards 18-35 goals and 15-25 assists (Raphinha 34+22, Salah 34+23, Olise 20+23,
// Yamal 18+25); golden boots 22-36 in the league, top assisters 12-20; elite season ratings 7.3-8.0 (FotMob/Sofascore).
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import type { Player, StatLine, World } from '../../src/domain/types'

const w: World = deserialize(fs.readFileSync(process.argv[2]))
const club = (id: number) => w.clubs[id]
const isClubComp = (cid: string) => { const c = w.competitions[cid]; return !!c && !c.clubs.some((id) => club(id)?.national) }
function total(p: Player, only?: (cid: string) => boolean): StatLine & { comps: number } {
  const t = { apps: 0, starts: 0, subs: 0, mins: 0, goals: 0, assists: 0, cleanSheets: 0, yellows: 0, reds: 0, ratingSum: 0, rated: 0, motm: 0, shots: 0, sot: 0, xg: 0, saves: 0, conceded: 0, tackles: 0, keyPasses: 0, passes: 0, passesCompleted: 0, comps: 0 }
  for (const [cid, s] of Object.entries(p.season || {})) {
    if (!isClubComp(cid) || (only && !only(cid))) continue
    t.comps++
    for (const k of Object.keys(s) as (keyof StatLine)[]) (t as any)[k] += s[k] || 0
  }
  return t
}
const role = (p: Player) => { const x = p.positions[0]; return x === 'GK' ? 'GK' : x === 'CB' ? 'CB' : /B$/.test(x) ? 'FB' : x === 'CDM' || x === 'CM' ? 'CM' : x === 'CAM' ? 'AM' : /^(RW|LW|RM|LM)$/.test(x) ? 'W' : 'ST' }
const rt = (t: StatLine) => (t.rated ? (t.ratingSum / t.rated).toFixed(2) : '  - ')
const per90 = (n: number, mins: number) => (mins ? ((n / mins) * 90).toFixed(2) : '-')
const fmt = (p: Player, t: StatLine) => `${p.name.padEnd(22)} ${String(p.ovr).padStart(2)} ${role(p).padEnd(2)} ${(club(p.clubId)?.short || '').padEnd(12)} ${String(t.apps).padStart(2)} apps ${String(Math.round(t.mins)).padStart(4)}' ${String(t.goals).padStart(2)} g ${String(t.assists).padStart(2)} a  xG ${t.xg.toFixed(1).padStart(4)}  ${rt(t)}  g/90 ${per90(t.goals, t.mins)} a/90 ${per90(t.assists, t.mins)}`

console.log(`${w.date} · season ${w.season}/${(w.season + 1) % 100}`)
const players = Object.values(w.players).filter((p) => p.clubId && !club(p.clubId)?.national)

console.log('\n== elite attackers (85+), all club competitions')
for (const p of players.filter((x) => x.ovr >= 85 && ['ST', 'W', 'AM'].includes(role(x))).sort((a, b) => b.ovr - a.ovr)) console.log(fmt(p, total(p)))

const LEAGUES: [string, string][] = [['L13', 'Premier League'], ['L53', 'LaLiga'], ['L19', 'Bundesliga'], ['L31', 'Serie A'], ['L16', 'Ligue 1']]
for (const [key, name] of LEAGUES) {
  const comp = Object.values(w.competitions).find((c) => c.key === key && c.season === w.season)
  if (!comp) continue
  const inL = (cid: string) => cid === comp.id
  const rows = players.map((p) => ({ p, t: total(p, inL) })).filter((r) => r.t.apps)
  const played = Object.values(w.fixtures).filter((f) => f.compId === comp.id && f.played).length
  const all = Object.values(w.fixtures).filter((f) => f.compId === comp.id).length
  console.log(`\n== ${name} (${played}/${all} played) top scorers`)
  for (const r of [...rows].sort((a, b) => b.t.goals - a.t.goals).slice(0, 6)) console.log(fmt(r.p, r.t))
  console.log(`   top assists`)
  for (const r of [...rows].sort((a, b) => b.t.assists - a.t.assists).slice(0, 4)) console.log(fmt(r.p, r.t))
}

// per 90 by role and level, players with real minutes in the big five leagues' clubs
const big = new Set(Object.values(w.competitions).filter((c) => LEAGUES.some(([k]) => k === c.key) && c.season === w.season).flatMap((c) => c.clubs))
console.log('\n== per 90 by role and overall (big-five clubs, 900+ minutes, all club competitions)')
console.log('role  band     n   g/90  a/90  xG/90  rating')
for (const r of ['ST', 'W', 'AM', 'CM', 'FB', 'CB']) {
  for (const [lo, hi] of [[0, 74], [75, 79], [80, 83], [84, 86], [87, 99]]) {
    const ts = players.filter((p) => big.has(p.clubId) && role(p) === r && p.ovr >= lo && p.ovr <= hi).map((p) => total(p)).filter((t) => t.mins >= 900)
    if (!ts.length) continue
    const m = ts.reduce((a, t) => a + t.mins, 0)
    const s = (k: keyof StatLine) => ts.reduce((a, t) => a + (t[k] as number), 0)
    console.log(`${r.padEnd(5)} ${`${lo}-${hi}`.padEnd(7)} ${String(ts.length).padStart(3)}  ${per90(s('goals'), m).padStart(4)}  ${per90(s('assists'), m).padStart(4)}  ${per90(s('xg'), m).padStart(5)}  ${(s('ratingSum') / Math.max(1, s('rated'))).toFixed(2)}`)
  }
}
