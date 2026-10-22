// What each touchline shout does to a match, in football terms: possession, shots and their quality, counters, where
// the ball is won and lost, box entries, xG and goals for and against, and the result. Each option is played from the
// minute given with the user's side set that way, over several fixtures and many runs on common luck (the same seeds
// for every option), so the differences are the shout's and not chance's.
// npx tsx scripts/qa/lever-lab.ts [runs per fixture] [from minute] [club]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { SHOUTS, applyShouts, type ShoutId } from '../../src/ui/shouts'
import { MENTALITIES } from '../../src/domain/constants'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 30), FROM = Number(process.argv[3] || 0), CLUB = process.argv[4] || 'Brentford'
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : undefined
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes(CLUB))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const fxs = Object.values(w.fixtures).filter((x) => x.userInvolved && w.competitions[x.compId]?.key?.startsWith('L13')).sort((a, b) => a.date.localeCompare(b.date)).slice(0, Number(process.env.FX || 4))
// custom options (env OPTS="name:key=+1,key2=-10;name2:..."): single settings moved on their own, to see which of a
// shout's parts does what (mentality moves in steps; numbers add; text replaces)
const custom: Record<string, (t: any) => any> = {}
for (const o of (process.env.OPTS || '').split(';').filter(Boolean)) {
  const [name, body] = o.split(':')
  const ch = body.split(',').map((x) => x.split('='))
  custom[name] = (t: any) => {
    const r = { ...t }
    for (const [k, v] of ch) {
      if (k === 'mentality') r.mentality = MENTALITIES[Math.max(0, Math.min(MENTALITIES.length - 1, MENTALITIES.indexOf(t.mentality) + Number(v)))]
      else if (/^[+-]?\d/.test(v)) r[k] = Math.max(0, Math.min(100, t[k] + Number(v)))
      else r[k] = v
    }
    return r
  }
}
const opts: string[] = (Object.keys(custom).length ? ['none', ...Object.keys(custom)] : ['none', ...SHOUTS.map((s) => s.id)]).filter((o) => !ONLY || o === 'none' || ONLY.includes(o))
type Acc = Record<string, number>
const HOWS = ['through', 'counter', 'cross', 'cutback', 'pass', 'box', 'long', 'solo', 'corner', 'freekick', 'pen', 'error']
const acc: Record<string, Acc> = Object.fromEntries(opts.map((o) => [o, {}]))
const add = (a: Acc, k: string, v: number) => { a[k] = (a[k] || 0) + v }
const t0 = performance.now()
let runs = 0
for (const f of fxs) {
  const base: any = createSim(w, f, true)
  const us: 0 | 1 = f.home === w.userClubId ? 0 : 1, them = (1 - us) as 0 | 1
  while (!base.finished && base.minute < FROM) base.step()
  const L0 = [structuredClone(base.sides[0].led), structuredClone(base.sides[1].led)]
  const S0 = [base.sides[0].stats.xg, base.sides[1].stats.xg]
  const g0 = [...base.score]
  for (const o of opts) for (let i = 0; i < N; i++) {
    const c = base.fork(7919 * (i + 1))
    if (custom[o]) c.setTactics(us, custom[o](c.sideTactics(us)), false)
    else if (o !== 'none') c.setTactics(us, applyShouts(c.sideTactics(us), [o as ShoutId]), false)
    while (!c.finished) c.step()
    runs++
    const a = acc[o]
    const lu = c.sides[us].led, lt = c.sides[them].led, u0 = L0[us], t0_ = L0[them]
    const d = (x: any, y: any, k: string) => (x[k] || 0) - (y[k] || 0)
    add(a, 'n', 1)
    add(a, 'poss', d(lu, u0, 'sec') / Math.max(1, d(lu, u0, 'sec') + d(lt, t0_, 'sec')))
    add(a, 'shF', d(lu, u0, 'shots')); add(a, 'shA', d(lt, t0_, 'shots'))
    add(a, 'xgF', c.sides[us].stats.xg - S0[us]); add(a, 'xgA', c.sides[them].stats.xg - S0[them])
    add(a, 'gF', c.score[us] - g0[us]); add(a, 'gA', c.score[them] - g0[them])
    add(a, 'ctrF', d(lu, u0, 'counters')); add(a, 'ctrA', d(lt, t0_, 'counters'))
    add(a, 'boxF', d(lu, u0, 'boxEntries')); add(a, 'boxA', d(lt, t0_, 'boxEntries'))
    add(a, 'wonHi', lu.won[2] - u0.won[2]); add(a, 'lostOwn', lu.lost[0] - u0.lost[0])
    add(a, 'ctrXgA', (lt.by.counter?.[1] || 0) - (t0_.by.counter?.[1] || 0))
    for (const h of HOWS) { add(a, 'A.' + h, (lt.by[h]?.[1] || 0) - (t0_.by[h]?.[1] || 0)); add(a, 'F.' + h, (lu.by[h]?.[1] || 0) - (u0.by[h]?.[1] || 0)) }
    const r = Math.sign(c.score[us] - c.score[them]); add(a, r > 0 ? 'W' : r < 0 ? 'L' : 'D', 1)
    add(a, 'energy', c.sides[us].on.reduce((s: number, l: any) => s + l.energy, 0) / c.sides[us].on.length)
  }
}
const m = (a: Acc, k: string) => (a[k] || 0) / a.n
const b = acc.none
console.log(`${fxs.length} fixtures × ${N} runs from ${FROM}' (${CLUB}) · ${((performance.now() - t0) / runs).toFixed(1)} ms/run`)
console.log('option   poss  shots F/A    xG F/A      xG/shot F/A   ctr F/A  ctrXgA  box F/A    wonHi lostOwn  goals F/A   W/D/L      energy')
for (const o of opts) {
  const a = acc[o]
  const f = (k: string, dp = 2) => m(a, k).toFixed(dp)
  const dlt = (k: string) => { const v = m(a, k) - m(b, k); return o === 'none' ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}` }
  console.log(`${o.padEnd(8)} ${(m(a, 'poss') * 100).toFixed(0).padStart(3)}%  ${f('shF', 1).padStart(4)}/${f('shA', 1).padEnd(5)} ${f('xgF')}/${f('xgA')} (${dlt('xgF').padStart(5)}/${dlt('xgA').padStart(5)})  ${(m(a, 'xgF') / Math.max(0.01, m(a, 'shF'))).toFixed(3)}/${(m(a, 'xgA') / Math.max(0.01, m(a, 'shA'))).toFixed(3)}  ${f('ctrF', 1)}/${f('ctrA', 1)}  ${f('ctrXgA')}   ${f('boxF', 1)}/${f('boxA', 1)}  ${f('wonHi', 1).padStart(4)}  ${f('lostOwn', 1).padStart(4)}    ${f('gF')}/${f('gA')}   ${(m(a, 'W') * 100).toFixed(0)}/${(m(a, 'D') * 100).toFixed(0)}/${(m(a, 'L') * 100).toFixed(0)}   ${f('energy', 0)}`)
}
console.log('\nxG by how it came  (F = ours, A = theirs)')
console.log('option   ' + HOWS.map((h) => h.slice(0, 7).padStart(8)).join(''))
for (const side of ['F', 'A']) for (const o of opts) {
  const a = acc[o]
  console.log(`${(side + ' ' + o).padEnd(9)}` + HOWS.map((h) => m(a, side + '.' + h).toFixed(2).padStart(8)).join(''))
}
