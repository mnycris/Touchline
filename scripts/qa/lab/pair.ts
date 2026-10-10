// Side-split engine counters for one fixture repeated with different seeds (home side = "us").
// npx tsx scripts/qa/lab/pair.ts Bayern Heidenheim [n=40]
import { freshWorld, play } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
const [hn, an, nn = '40'] = process.argv.slice(2)
const w = freshWorld()
const club = (n: string) => Object.values(w.clubs).find((c) => !c.national && (c.short === n || c.name.includes(n)))!
const H = club(hn), Aw = club(an)
const tot: Record<string, number> = {}
const N = Number(nn)
let gh = 0, ga = 0
for (let i = 0; i < N; i++) {
  const d: Record<string, number> = {}
  MatchSim.dbg = d
  const { r } = play(w, H.id, Aw.id, 5000 + i, process.env.PATCH_A ? { patch: JSON.parse(process.env.PATCH_A), patchSide: 1 } : {})
  gh += r.score[0]; ga += r.score[1]
  for (const [k, v] of Object.entries(d)) { const m = /^s([01])\.(.*)$/.exec(k); if (m) { const k2 = (m[1] === '0' ? 'h.' : 'a.') + m[2]; tot[k2] = (tot[k2] || 0) + v } }
}
MatchSim.dbg = null
const f = (x: number) => x.toFixed(1)
console.log(`${H.short} ${f(gh / N)} - ${f(ga / N)} ${Aw.short}`)
for (const side of ['h', 'a']) {
  const g = (k: string) => (tot[`${side}.${k}`] || 0) / N
  const kinds = ['short', 'back', 'prog', 'long', 'switch', 'through', 'cutback']
  console.log(`${side}: passes`, kinds.map((k) => `${k} ${f(g('pass.' + k))} (${Math.round(g('passL.' + k) / (g('pass.' + k) || 1) * 100)}%)`).join(' · '))
  console.log(`${side}: decisions x/10`, Array.from({ length: 10 }, (_, i) => f(g('zx' + i))).join(' '))
  console.log(`${side}: pressure  x/10`, Array.from({ length: 10 }, (_, i) => (g('prz' + i) / (g('zx' + i) || 1)).toFixed(2)).join(' '))
  const xs = [65, 70, 75, 80, 85, 90, 95]
  console.log(`${side}: shots by x`, xs.map((x) => `${x}:${f(g('shotx' + x))} xg${(g('sxg' + x) / (g('shotx' + x) || 1)).toFixed(3)} cr${(g('scr' + x) / (g('shotx' + x) || 1)).toFixed(1)} pr${(g('spr' + x) / (g('shotx' + x) || 1)).toFixed(2)}`).join(' '))
  const hs = Object.keys(tot).filter((k) => k.startsWith(side + '.shot.')).map((k) => k.slice(side.length + 6))
  console.log(`${side}: shots/xG by how`, hs.sort((a, b) => g('hx.' + b) - g('hx.' + a)).map((x) => `${x} ${f(g('shot.' + x))}/${g('hx.' + x).toFixed(2)}`).join(' '))
  console.log(`${side}: lost x/10`, Array.from({ length: 10 }, (_, i) => f(g('lost' + i))).join(' '))
}
