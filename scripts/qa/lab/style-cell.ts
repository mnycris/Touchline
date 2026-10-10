// One style pairing in detail (home style v away style over mixed PL fixtures): per-side shots, how, passes, territory.
// npx tsx scripts/qa/lab/style-cell.ts possess possess [n=30]   (PATCH='{"lineHeight":50}' changes both sides)
import { freshWorld, play } from '../engine-lab'
import { MatchSim } from '../../../src/engine/match/engine'
import { viewOf } from '../../../src/engine/match/ledger'
import type { TeamTactics } from '../../../src/domain/types'
const [hk, ak, nn = '30'] = process.argv.slice(2)
const N = Number(nn)
const w = freshWorld()
const pl = Object.values(w.competitions).find((c) => c.format === 'league' && c.name.includes('Premier'))!
const styles = new Map<string, TeamTactics>()
for (const c of Object.values(w.clubs)) {
  if (c.national || !c.sheets?.length) continue
  const t = c.sheets.find((s) => s.id === c.activeSheet)!.tactics
  const k = t.buildUp === 'Short Passing' ? 'possess' : t.defApproach === 'Aggressive' ? 'press' : t.buildUp === 'Counter' ? 'counter' : t.buildUp === 'Long Ball' ? (t.defApproach === 'Deep' ? 'lowblock' : 'direct') : 'balanced'
  if (!styles.has(k)) styles.set(k, { ...t })
}
// PATCH='{...}' applies to both sides on top of their styles
if (process.env.PATCH) for (const [k, t] of styles) styles.set(k, { ...t, ...JSON.parse(process.env.PATCH) })
const tot: Record<string, number> = {}
const put = (k: string, v: number) => { tot[k] = (tot[k] || 0) + v }
for (let i = 0; i < N; i++) {
  const h = pl.clubs[i % pl.clubs.length], a = pl.clubs[(i * 7 + 5) % pl.clubs.length]
  if (h === a) continue
  const H = w.clubs[h], A = w.clubs[a]
  const keep = [H, A].map((c) => c.sheets.map((sh) => sh.tactics))
  H.sheets.forEach((sh) => { sh.tactics = { ...styles.get(hk)! } })
  A.sheets.forEach((sh) => { sh.tactics = { ...styles.get(ak)! } })
  const d: Record<string, number> = {}
  MatchSim.dbg = d
  const { r, sim } = play(w, h, a, 700 + i)
  MatchSim.dbg = null
  ;[H, A].forEach((c, k) => c.sheets.forEach((sh, j) => { sh.tactics = keep[k][j] }))
  for (const s of [0, 1] as const) {
    const v = viewOf(sim!.ledger(s), sim!.ledger((1 - s) as 0 | 1), 90) as any
    for (const k of ['poss', 'passes', 'passAcc', 'spell', 'fwdShare', 'longShare', 'entries', 'boxEntries', 'tilt', 'shots', 'xg', 'counters', 'wonHigh', 'lostOwn', 'lostMid', 'lostFinal']) put(`${s}.${k}`, v[k])
    for (const [k, [n, x]] of Object.entries(v.by as Record<string, [number, number]>)) { put(`${s}.by.${k}`, n); put(`${s}.bx.${k}`, x) }
    put(`${s}.goals`, r.score[s])
    for (let z = 0; z < 10; z++) { put(`${s}.zx${z}`, d[`s${s}.zx${z}`] || 0); put(`${s}.prz${z}`, d[`s${s}.prz${z}`] || 0) }
    for (const x of [65, 70, 75, 80, 85, 90, 95]) for (const q of ['shotx', 'sxg', 'scr', 'spr']) put(`${s}.${q}${x}`, d[`s${s}.${q}${x}`] || 0)
    for (const k of ['pass.through', 'passL.through', 'pass.long', 'passL.long', 'ro.win', 'ro.1v1', 'ro.x', 'offside', 'pass.prog', 'passL.prog', 'pass.back', 'pass.short']) put(`${s}.d.${k}`, d[`s${s}.${k}`] ?? 0)
  }
}
const g = (k: string) => (tot[k] || 0) / N
for (const s of [0, 1]) {
  const f = (k: string, dp = 1) => g(`${s}.${k}`).toFixed(dp)
  console.log(`${s ? ak : hk}: goals ${f('goals')} shots ${f('shots')} xg ${f('xg', 2)} poss ${(g(`${s}.poss`) * 100).toFixed(0)}% passes ${f('passes', 0)} (${(g(`${s}.passAcc`) * 100).toFixed(0)}%) spell ${f('spell')} fwd ${(g(`${s}.fwdShare`) * 100).toFixed(0)}% long ${(g(`${s}.longShare`) * 100).toFixed(0)}% entries ${f('entries')} box ${f('boxEntries')} tilt ${(g(`${s}.tilt`) * 100).toFixed(0)}% counters ${f('counters')} wonHigh ${f('wonHigh')} lost o/m/f ${f('lostOwn')}/${f('lostMid')}/${f('lostFinal')}`)
  console.log('   dbg', ['pass.through', 'passL.through', 'pass.long', 'passL.long', 'ro.win', 'ro.1v1', 'ro.x', 'offside', 'pass.prog', 'passL.prog', 'pass.back', 'pass.short'].map((k) => `${k} ${f('d.' + k)}`).join(' '))
  console.log('   shots by x', [65, 70, 75, 80, 85, 90, 95].map((x) => `${x}:${f('shotx' + x)} xg${(g(`${s}.sxg${x}`) / (g(`${s}.shotx${x}`) || 1)).toFixed(2)} cr${(g(`${s}.scr${x}`) / (g(`${s}.shotx${x}`) || 1)).toFixed(1)}`).join(' '))
  console.log('   pressure x/10', Array.from({ length: 10 }, (_, z) => (g(`${s}.prz${z}`) / (g(`${s}.zx${z}`) || 1)).toFixed(2)).join(' '))
  console.log('   decisions x60+', [6, 7, 8, 9].map((z) => f('zx' + z, 0)).join(' '), '| by', Object.keys(tot).filter((k) => k.startsWith(`${s}.by.`)).map((k) => k.slice(5)).sort((a, b) => g(`${s}.by.${b}`) - g(`${s}.by.${a}`)).map((k) => `${k} ${f('by.' + k)}/${f('bx.' + k, 2)}`).join(' '))
}
