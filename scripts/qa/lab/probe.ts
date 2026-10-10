// Side-split engine debug counters for one club under a tactics patch against a spread of opponents.
// PATCH='{"lineHeight":80}' npx tsx scripts/qa/lab/probe.ts [team=Brentford] [rounds=2]
import { freshWorld, play } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
const [team = 'Brentford', rounds = '2'] = process.argv.slice(2)
const patch = JSON.parse(process.env.PATCH || '{}')
const w = freshWorld()
const club = (n: string) => Object.values(w.clubs).find((c) => !c.national && (c.short === n || c.name.includes(n)))!
const T = club(team)
const opps = ['Arsenal', 'Man City', 'Liverpool', 'Chelsea', 'Newcastle', 'Aston Villa', 'Brighton', 'Fulham', 'Everton', 'Wolves', 'Burnley', 'Sunderland'].map(club).filter((c) => c.id !== T.id)
const tot: Record<string, number> = {}
let n = 0
for (let k = 0; k < Number(rounds); k++) for (const o of opps) for (const home of [true, false]) {
  const d: Record<string, number> = {}
  MatchSim.dbg = d
  play(w, home ? T.id : o.id, home ? o.id : T.id, 1000 + k * 31, { patch, patchSide: home ? 0 : 1, formation: process.env.FORM })
  const us = home ? 0 : 1
  for (const [key, v] of Object.entries(d)) {
    const m = /^s([01])\.(.*)$/.exec(key)
    if (!m) continue
    const k2 = (Number(m[1]) === us ? 'us.' : 'op.') + m[2]
    tot[k2] = (tot[k2] || 0) + v
  }
  n++
}
MatchSim.dbg = undefined as any
const f = (x: number) => x.toFixed(1)
for (const side of ['us', 'op']) {
  const g = (k: string) => (tot[`${side}.${k}`] || 0) / n
  const kinds = ['short', 'back', 'prog', 'long', 'switch', 'through', 'cutback']
  console.log(`${side}: passes`, kinds.map((k) => `${k} ${f(g('pass.' + k))} (${Math.round(g('passL.' + k) / (g('pass.' + k) || 1) * 100)}%)`).join(' · '), '| offside', f(g('offside')))
  console.log(`${side}: decisions x/10`, Array.from({ length: 10 }, (_, i) => f(g('zx' + i))).join(' '))
  console.log(`${side}: pressure  x/10`, Array.from({ length: 10 }, (_, i) => (g('prz' + i) / (g('zx' + i) || 1)).toFixed(2)).join(' '))
  const xs = [65, 70, 75, 80, 85, 90, 95]
  console.log(`${side}: shots by x`, xs.map((x) => `${x}:${f(g('shotx' + x))} xg${(g('sxg' + x) / (g('shotx' + x) || 1)).toFixed(3)} cr${(g('scr' + x) / (g('shotx' + x) || 1)).toFixed(1)} pr${(g('spr' + x) / (g('shotx' + x) || 1)).toFixed(2)}`).join(' '))
  const gs = ['CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST']
  console.log(`${side}: shots/xG by group`, gs.map((x) => `${x} ${f(g('gs.' + x))}/${g('gx.' + x).toFixed(2)}`).join(' '))
  const hs = Object.keys(tot).filter((k) => k.startsWith(side + '.shot.')).map((k) => k.slice(side.length + 6))
  console.log(`${side}: shots/xG by how`, hs.sort((a, b) => g('hx.' + b) - g('hx.' + a)).map((x) => `${x} ${f(g('shot.' + x))}/${g('hx.' + x).toFixed(2)}`).join(' '))
  console.log(`${side}: through race: sweep ${f(g('ro.sweep'))} win ${f(g('ro.win'))} at x ${(g('ro.x') / (g('ro.win') || 1)).toFixed(0)} 1v1 ${f(g('ro.1v1'))} shot≤4 ${f(g('ro.shot'))}`)
  console.log(`${side}: lost      x/10`, Array.from({ length: 10 }, (_, i) => f(g('lost' + i))).join(' '))
}
