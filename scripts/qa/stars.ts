// Who produces over a season, on the full match engine: league seasons played out for the Premier League, LaLiga and
// the Bundesliga, then each league's top scorers and assisters, the stars' lines, how much of a team's goals its top
// scorer gets, goal and assist shares by position, and output per 90 by position and level.
//   npx tsx scripts/qa/stars.ts [seed] [leagues e.g. 13,53,19]
// Real reference (big five, 2022-25): top scorer's share of his team's league goals median ~27%, rarely over 40%;
// league golden boots 22-36, top assisters 12-20; goals by position ST ~39% W ~23% AM ~10% CM ~10% DM ~3% FB ~5%
// CB ~7%; assists ST ~16% W ~26% AM ~16% CM ~15% DM ~4% FB ~15% CB ~5%; per 90 for elite wide forwards ~0.45 goals
// and ~0.35 assists, elite strikers ~0.8 goals and ~0.15 assists; the best players rate 7.3-8.0 over a season.
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { Rng } from '../../src/domain/rng'
import { applyMatchResult, createSim } from '../../src/engine/world/matchRunner'
import type { Player } from '../../src/domain/types'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const seed = Number(process.argv[2] || 7)
const leagues = (process.argv[3] || '13,53,19').split(',').map(Number)
const w = createWorld(raw, {
  clubId: raw.clubs.find((c) => c.dbName === 'Arsenal FC')!.id,
  manager: { firstName: 'Test', lastName: 'Manager', nationality: 'England', dob: '1985-01-01', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } },
  settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' },
  seed,
} as any)
const rng = new Rng(seed)
const role = (x: string) => (x === 'GK' ? 'GK' : x === 'CB' ? 'CB' : /B$/.test(x) ? 'FB' : x === 'CDM' ? 'DM' : x === 'CM' ? 'CM' : x === 'CAM' ? 'AM' : /^(RW|LW|RM|LM)$/.test(x) ? 'W' : 'ST')
const ROLES = ['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB']
const per90 = (n: number, m: number) => (m ? ((n / m) * 90).toFixed(2) : '-')
let n = 0, goals = 0, hw = 0, dr = 0
const t0 = Date.now()
const comps = leagues.map((id) => w.competitions[`L${id}-2026`]).filter(Boolean)
for (const comp of comps) {
  for (const id of comp.fixtures) {
    const f = w.fixtures[id]
    const r = createSim(w, f, false).runToEnd()
    applyMatchResult(w, f, r, rng)
    n++; goals += r.score[0] + r.score[1]
    if (r.score[0] > r.score[1]) hw++; else if (r.score[0] === r.score[1]) dr++
    // (no injuries: every player's whole season is measured, so one run compares with another)
    for (const pid of r.players.map((x) => x.id)) { const p = w.players[pid]; p.fitness = Math.min(100, p.fitness + 30); p.injury = undefined }
  }
}
console.log(`${n} matches in ${((Date.now() - t0) / 1000).toFixed(0)} s · goals/m ${(goals / n).toFixed(2)} · H/D/A ${(hw / n * 100).toFixed(0)}/${(dr / n * 100).toFixed(0)}/${((n - hw - dr) / n * 100).toFixed(0)}%`)

type Row = { p: Player; g: number; a: number; m: number; apps: number; sh: number; xg: number; r: number; comp: string; club: number }
const rows: Row[] = []
for (const comp of comps) for (const p of Object.values(w.players)) {
  const s = p.season?.[comp.id]
  if (!s?.apps) continue
  rows.push({ p, g: s.goals, a: s.assists, m: s.mins, apps: s.apps, sh: s.shots, xg: s.xg, r: s.rated ? s.ratingSum / s.rated : 0, comp: comp.id, club: p.clubId })
}
const line = (x: Row) => `${x.p.name.padEnd(22)} ${String(x.p.ovr).padStart(2)} ${role(x.p.positions[0]).padEnd(2)} ${(w.clubs[x.club]?.short || '').padEnd(12)} ${String(x.apps).padStart(2)} apps ${String(x.g).padStart(2)} g ${String(x.a).padStart(2)} a  ${String(x.sh).padStart(3)} sh  xG ${x.xg.toFixed(1).padStart(4)}  ${x.r.toFixed(2)}  per 90: ${per90(x.g, x.m)} g ${per90(x.a, x.m)} a ${per90(x.sh, x.m)} sh`
for (const comp of comps) {
  const rs = rows.filter((x) => x.comp === comp.id)
  console.log(`\n== ${comp.name}: top scorers`)
  for (const x of [...rs].sort((a, b) => b.g - a.g).slice(0, 8)) console.log(line(x))
  console.log('   top assists')
  for (const x of [...rs].sort((a, b) => b.a - a.a).slice(0, 5)) console.log(line(x))
}
console.log('\n== the stars')
for (const x of rows.filter((x) => x.p.ovr >= 86 && x.p.positions[0] !== 'GK' && x.p.positions[0] !== 'CB').sort((a, b) => b.p.ovr - a.p.ovr)) console.log(line(x))

// concentration: a team's top scorer and top assister
const sh: number[] = [], ash: number[] = [], heavy: string[] = []
for (const comp of comps) for (const cid of comp.clubs) {
  const rs = rows.filter((x) => x.comp === comp.id && x.club === cid)
  const tg = rs.reduce((s, x) => s + x.g, 0), ta = rs.reduce((s, x) => s + x.a, 0)
  if (tg >= 20) {
    sh.push(Math.max(...rs.map((x) => x.g)) / tg)
    const top = rs.reduce((a, x) => (x.g > a.g ? x : a))
    if (top.g / tg > 0.45) heavy.push(`${top.p.name} ${top.g}/${tg} for ${w.clubs[cid]?.short} (${top.p.ovr} ${role(top.p.positions[0])}, team avg ${w.clubs[cid]?.squadAvg})`)
  }
  if (ta >= 15) ash.push(Math.max(...rs.map((x) => x.a)) / ta)
}
const q = (xs: number[], f: number) => xs.slice().sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))]
const pc = (x: number) => `${Math.round(x * 100)}%`
console.log(`\ntop scorer's share of team goals: median ${pc(q(sh, 0.5))} p90 ${pc(q(sh, 0.9))} max ${pc(q(sh, 1))} · top assister's share of team assists: median ${pc(q(ash, 0.5))} p90 ${pc(q(ash, 0.9))} max ${pc(q(ash, 1))}`)
if (heavy.length) console.log(`one-man teams (top scorer over 45%): ${heavy.join(' · ')}`)
const tot = (k: 'g' | 'a' | 'sh') => rows.reduce((s, x) => s + x[k], 0)
for (const [k, label] of [['g', 'goals  '], ['a', 'assists'], ['sh', 'shots  ']] as const) {
  const T = tot(k)
  console.log(`${label} by position: ${ROLES.map((r) => `${r} ${pc(rows.filter((x) => role(x.p.positions[0]) === r).reduce((s, x) => s + x[k], 0) / T)}`).join(' · ')}`)
}
console.log(`assisted goals ${pc(tot('a') / tot('g'))}`)
console.log('\nper 90 by position and level (900+ minutes)')
console.log('pos   level    n   goals assists shots rating')
for (const r of ROLES) for (const [lo, hi] of [[0, 76], [77, 80], [81, 84], [85, 99]]) {
  const xs = rows.filter((x) => role(x.p.positions[0]) === r && x.p.ovr >= lo && x.p.ovr <= hi && x.m >= 900)
  if (!xs.length) continue
  const m = xs.reduce((s, x) => s + x.m, 0)
  const S = (k: 'g' | 'a' | 'sh') => xs.reduce((s, x) => s + x[k], 0)
  console.log(`${r.padEnd(5)} ${`${lo}-${hi}`.padEnd(7)} ${String(xs.length).padStart(3)}   ${per90(S('g'), m).padStart(4)}  ${per90(S('a'), m).padStart(4)}   ${per90(S('sh'), m).padStart(4)}  ${(xs.reduce((s, x) => s + x.r * x.m, 0) / m).toFixed(2)}`)
}
