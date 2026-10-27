// Where match ratings come from, by position group and role: per 90 minutes, how involved each kind of player is
// (touches, passes, chances made, shots, xG, defensive work) and which actions earn or cost his rating points, against
// his group's par. For checking that every role is simulated and rated fairly (a number 10 who is starved of the ball,
// or whose work the rating doesn't see, rates poorly whoever he is).
// npx tsx scripts/qa/rating-anatomy.ts [matches] [club filter for a club's own players, e.g. Barcelona]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { MatchSim } from '../../src/engine/match/engine'
import { GAIN, RP } from '../../src/engine/match/rating'

const N = Number(process.argv[2] || 120)
const ONLY = process.argv[3]
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Brentford'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
// the action each rating-point value belongs to (values shared by two actions read as both)
const NAME = new Map<number, string>()
for (const [k, v] of Object.entries(RP)) NAME.set(v, NAME.has(v) ? `${NAME.get(v)}/${k}` : k)
let cur: Map<any, Record<string, number>> = new Map()
const proto = MatchSim.prototype as any
const rp0 = proto.rp
proto.rp = function (l: any, v: number, part: string) {
  const r = (cur.get(l) || cur.set(l, {}).get(l))!
  const k = NAME.get(v) || (v > 0 ? 'other+' : 'other-')
  r[k] = (r[k] || 0) + v * GAIN[l.g as keyof typeof GAIN]
  return rp0.call(this, l, v, part)
}
type Acc = { n: number; mins: number; rating: number; rp: number; par: number; acts: Record<string, number>; st: Record<string, number> }
const by: Record<string, Acc> = {}
const add = (key: string, l: any, rating: number) => {
  const a = (by[key] ||= { n: 0, mins: 0, rating: 0, rp: 0, par: 0, acts: {}, st: {} })
  a.n++; a.mins += l.st.mins; a.rating += rating; a.rp += l.rp; a.par += l.pd
  for (const [k, v] of Object.entries(cur.get(l) || {})) a.acts[k] = (a.acts[k] || 0) + v
  for (const k of ['touches', 'passes', 'passesCompleted', 'keyPasses', 'shots', 'sot', 'goals', 'assists', 'xg', 'xa', 'dribbles', 'dribblesWon', 'tackles', 'interceptions', 'possLost', 'boxTouches']) a.st[k] = (a.st[k] || 0) + (l.st[k] || 0)
}
const comps = Object.values(w.competitions).filter((c) => c.format === 'league' && ['L13', 'L53', 'L19', 'L31', 'L16'].some((k) => c.key?.startsWith(k)))
const fxs = comps.flatMap((c) => c.fixtures.map((id) => w.fixtures[id])).filter((f) => f && !f.userInvolved && (!ONLY || [f.home, f.away].some((id) => w.clubs[id]?.name.includes(ONLY))))
let played = 0
for (const f of fxs) {
  if (played >= N) break
  cur = new Map()
  const sim: any = createSim(w, f, false, true)
  sim.runToEnd()
  played++
  for (const s of sim.sides) for (const l of [...s.lps, ...s.bench]) {
    if (l.st.mins < 60 || !l.st.started) continue
    if (ONLY && !w.clubs[s.input.clubId]?.name.includes(ONLY)) continue
    add(`${l.g}`, l, l.st.rating)
    add(`${l.g} · ${l.role}`, l, l.st.rating)
    if (ONLY) add(`${l.p.name} (${l.pos} ${l.role})`, l, l.st.rating)
  }
}
const per90 = (a: Acc, v: number) => (v / Math.max(1, a.mins)) * 90
const keys = Object.keys(by).sort()
console.log(`${played} matches${ONLY ? ` (${ONLY})` : ''} · starters with 60+ minutes · per 90`)
console.log('group · role'.padEnd(40), '  n  rating  pts  par  touch  pass%  keyP  shots  xG    xA   drib  tkl+int  lost')
for (const k of keys) {
  const a = by[k]
  if (a.n < 6) continue
  const s = (x: string) => per90(a, a.st[x] || 0)
  console.log(k.padEnd(40), String(a.n).padStart(4), (a.rating / a.n).toFixed(2).padStart(6), per90(a, a.rp).toFixed(2).padStart(5), per90(a, a.par).toFixed(2).padStart(5), s('touches').toFixed(0).padStart(6), `${Math.round((a.st.passesCompleted / Math.max(1, a.st.passes)) * 100)}%`.padStart(6), s('keyPasses').toFixed(1).padStart(5), s('shots').toFixed(1).padStart(6), s('xg').toFixed(2).padStart(5), s('xa').toFixed(2).padStart(5), s('dribbles').toFixed(1).padStart(5), (s('tackles') + s('interceptions')).toFixed(1).padStart(8), s('possLost').toFixed(1).padStart(5))
}
console.log('\nwhere the points come from (per 90), the biggest ten by size, for each position group')
for (const k of keys.filter((k) => !k.includes('·') && !k.includes('('))) {
  const a = by[k]
  const top = Object.entries(a.acts).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 10)
  console.log(`${k.padEnd(4)} ${top.map(([n, v]) => `${n} ${per90(a, v) >= 0 ? '+' : ''}${per90(a, v).toFixed(2)}`).join('  ')}`)
}
