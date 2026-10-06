// Lab: where each group stands when the ball is in the final 22m, who has the ball there, and who shoots from what.
// npx tsx scripts/qa/lab/where.ts <save> [matches]
import fs from 'node:fs'
import { deserialize } from '../../../src/services/saves'
import { createSim } from '../../../src/engine/world/matchRunner'
import { MatchSim } from '../../../src/engine/match/engine'
const [file, nArg = '40'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const fx = Object.values(w.fixtures).filter((f) => !f.played && !f.userInvolved && ['L13', 'L53', 'L19', 'L31'].includes(w.competitions[f.compId]?.key || '')).slice(0, Number(nArg))
const P = MatchSim.prototype as any
const oLayout = P.layout, oAct = P.act, oShoot = P.shoot, oPass = P.pass, oCross = P.cross
const rec: Record<string, Record<string, number>> = {}
const bump = (g: string, k: string) => { const o = (rec[g] ||= {}); o[k] = (o[k] || 0) + 1 }
const S: Record<string, { n: number; x: number; box: number; open: number }> = {}
const car: Record<string, { ft: number; box: number }> = {}
const sh: Record<string, { n: number; xg: number; how: Record<string, number> }> = {}
let samples = 0
const inBox = (p: { x: number; y: number }) => p.x > 84.3 && p.y > 21 && p.y < 79
P.layout = function () {
  oLayout.call(this)
  const b = this.b
  if (b.x < 78) return
  samples++
  const X = this.sides[this.ps], Y = this.sides[1 - this.ps]
  for (const l of X.on) {
    if (l === this.car || l.g === 'GK') continue
    const s = (S[l.g] ||= { n: 0, x: 0, box: 0, open: 0 })
    s.n++; s.x += l.at.x
    if (inBox(l.at)) s.box++
    s.open += this.nearestD(Y.on, l.at)
  }
}
P.act = function () {
  const c = this.car
  if (c && c.on && this.b.x > 66) { const k = (car[c.g] ||= { ft: 0, box: 0 }); k.ft++; if (inBox(this.b)) k.box++ }
  return oAct.call(this)
}
P.shoot = function (c: any, ctx: any, how: string) {
  const x0 = c.st.xg
  const r = oShoot.call(this, c, ctx, how)
  const k = (sh[c.g] ||= { n: 0, xg: 0, how: {} })
  k.n++; k.xg += c.st.xg - x0; k.how[how] = (k.how[how] || 0) + 1
  return r
}
P.pass = function (c: any, r: any, kind: string, ...rest: any[]) {
  const res = oPass.call(this, c, r, kind, ...rest)
  if (this.car === r && this.ps === r.side && inBox(this.b)) bump(r.g, kind)
  return res
}
P.cross = function (c: any, ...rest: any[]) {
  const n0 = this.n
  const res = oCross.call(this, c, ...rest)
  const pa = this.chain.pass
  if (pa && pa.kind === 'cross' && pa.from === c && this.car && this.car !== c) bump(this.car.g, 'crossWon')
  return res
}
for (const f of fx) createSim(w, f, false, true).runToEnd()
const n = fx.length
console.log(`${n} matches · ${samples} layouts with the ball beyond x 78`)
const totSh = Object.values(sh).reduce((a, s) => a + s.n, 0), totXg = Object.values(sh).reduce((a, s) => a + s.xg, 0)
for (const g of ['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB']) {
  const s = S[g], k = car[g] || { ft: 0, box: 0 }, q = sh[g] || { n: 0, xg: 0, how: {} }
  if (!s) continue
  console.log(`${g.padEnd(3)} ×${(s.n / samples).toFixed(2)} x ${(s.x / s.n).toFixed(1)} · in box ${((s.box / s.n) * 100).toFixed(0)}% · opp ${(s.open / s.n).toFixed(1)}m | on ball past 66: ${(k.ft / n).toFixed(1)}/m (box ${(k.box / n).toFixed(1)}) | shots ${Math.round((q.n / totSh) * 100)}% xG ${Math.round((q.xg / totXg) * 100)}% xG/sh ${(q.xg / Math.max(1, q.n)).toFixed(3)} | ${Object.entries(q.how).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([h, v]) => `${h} ${Math.round((v / q.n) * 100)}`).join(' ')}`)
}
console.log('box receptions per match (both teams), by kind:')
for (const g of ['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB']) { const o = rec[g] || {}; console.log(`  ${g.padEnd(3)} ${Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / n).toFixed(2)}`).join(' · ')}`) }
