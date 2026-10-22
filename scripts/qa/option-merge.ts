// Merges scripts/qa/option-fit.ts runs into src/engine/match/responseData.ts, and prints the tables with their
// uncertainty. Each option's effect is the ratio of its rate of chances (xG per minute played from the fork) to the
// rate with the set-up left alone, as a log; an effect within the noise is shrunk towards nothing (by β²/(β²+se²)), so
// the app never shows a difference the engine doesn't reliably make. Also prints how the touchline's forecast, as it
// stands, compared with how those matches ended.
// npx tsx scripts/qa/option-merge.ts <dir with match-*.json, kick-*.json, set-*.json> [--write]
import fs from 'node:fs'
import path from 'node:path'

type Cell = { n: number; f: number; a: number; m: number; ff: number; aa: number; mm: number; fm: number; am: number; poss: number; w: number; d: number; pw: number; pd: number; pm: number }
type Acc = Record<string, Record<string, Cell>>
const DIR = process.argv[2] || '.'
const WRITE = process.argv.includes('--write')
const zero = (): Cell => ({ n: 0, f: 0, a: 0, m: 0, ff: 0, aa: 0, mm: 0, fm: 0, am: 0, poss: 0, w: 0, d: 0, pw: 0, pd: 0, pm: 0 })
const plus = (x: Cell, y: Cell) => { for (const k of Object.keys(x) as (keyof Cell)[]) x[k] += y[k] ?? 0 }
function load(prefix: string): Acc {
  const out: Acc = {}
  for (const f of fs.readdirSync(DIR).filter((f) => f.startsWith(prefix) && f.endsWith('.json'))) {
    const a: Acc = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
    for (const st in a) for (const k in a[st]) plus(((out[st] ||= {})[k] ||= zero()), a[st][k])
  }
  return out
}
/** Pools 'state@minute' cells by a key function (e.g. by state alone). */
function pool(a: Acc, by: (st: string) => string | undefined): Acc {
  const out: Acc = {}
  for (const st in a) { const g = by(st); if (!g) continue; for (const k in a[st]) plus(((out[g] ||= {})[k] ||= zero()), a[st][k]) }
  return out
}
/** log of the rate (y per minute) and its variance, by the ratio estimator. */
function logRate(c: Cell, y: 'f' | 'a'): [number, number] {
  const n = c.n, ym = c[y] / n, mm = c.m / n, R = ym / mm
  const syy = c[y === 'f' ? 'ff' : 'aa'] / n - ym * ym, smm = c.mm / n - mm * mm, sym = c[y === 'f' ? 'fm' : 'am'] / n - ym * mm
  const v = (syy - 2 * R * sym + R * R * smm) / (n * mm * mm)
  return [Math.log(R), v / (R * R)]
}
interface Fx { f: number; a: number; sf: number; sa: number; dposs: number; n: number; dw: number; dl: number }
function effect(c: Cell, b: Cell): Fx {
  const [lf, vf] = logRate(c, 'f'), [lb, vb] = logRate(b, 'f'), [la, va] = logRate(c, 'a'), [lba, vba] = logRate(b, 'a')
  const l = (x: Cell) => (x.n - x.w - x.d) / x.n
  return { f: lf - lb, a: la - lba, sf: Math.sqrt(vf + vb), sa: Math.sqrt(va + vba), dposs: c.poss / c.n - b.poss / b.n, n: c.n, dw: c.w / c.n - b.w / b.n, dl: l(c) - l(b) }
}
const shrink = (b: number, se: number) => (b * b) / (b * b + se * se) * b
const r3 = (x: number) => Math.round(x * 1000) / 1000
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`
const mult = (x: number) => `×${Math.exp(x).toFixed(2)}`
function table(title: string, a: Acc, order?: string[]) {
  console.log(`\n${title}`)
  for (const st of order || Object.keys(a).sort()) {
    const b = a[st]?.none
    if (!b) continue
    console.log(`  ${st}: ${b.n} runs left alone · xG for ${(b.f / b.m * 90).toFixed(2)} against ${(b.a / b.m * 90).toFixed(2)} per 90 · won ${(b.w / b.n * 100).toFixed(0)}% lost ${((b.n - b.w - b.d) / b.n * 100).toFixed(0)}%`)
    for (const k of Object.keys(a[st]).filter((k) => k !== 'none')) {
      const e = effect(a[st][k], b)
      const sig = (x: number, s: number) => (Math.abs(x) > 2 * s ? '*' : ' ')
      console.log(`    ${k.padEnd(30)} for ${mult(e.f)}±${(e.sf * 100).toFixed(0)}%${sig(e.f, e.sf)} against ${mult(e.a)}±${(e.sa * 100).toFixed(0)}%${sig(e.a, e.sa)} · ball ${pct(e.dposs)}pts · won ${pct(e.dw)} lost ${pct(e.dl)}`)
    }
  }
}

// (the fit keys its cells '<state>@<minute>'; from kick-off that is 'kickoff@0', kept as 'kickoff')
const match = load('match-'), kick = pool(load('kick-'), (s) => s.split('@')[0]), sets = pool(load('set-'), (s) => s.split('@')[0])
// the forecast's score effects (scripts/qa/forecast-cal.ts): what came against the plain projection, by goal difference
// and minute, each minute pooled with its neighbours
type Fc = { n: number; pf: number; pa: number; f: number; a: number; w: number; d: number; pw: number; pd: number }
const fcs: Record<string, Fc> = {}
for (const f of fs.readdirSync(DIR).filter((f) => f.startsWith('fc-') && f.endsWith('.json'))) {
  const a: Record<string, Fc> = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
  for (const k in a) { const z = (fcs[k] ||= { n: 0, pf: 0, pa: 0, f: 0, a: 0, w: 0, d: 0, pw: 0, pd: 0 }); for (const q of Object.keys(z) as (keyof Fc)[]) z[q] += a[k][q] ?? 0 }
}
const CPS = [10, 20, 30, 40, 45, 55, 62, 70, 76, 82, 86]
const scoreFx: Record<string, [number, number, number][]> = {}
if (Object.keys(fcs).length) {
  // minute by minute: the chances made in a minute against the rate so far, by goal difference and five-minute spell,
  // each spell pooled with its neighbours (the late spells of a big lead are thin)
  console.log('\nScore effects: the chances in a minute against the rate so far, by goal difference and minute')
  const SP = Array.from({ length: 18 }, (_, k) => k * 5)
  for (const gd of [-3, -2, -1, 0, 1, 2, 3]) {
    const rows: [number, number, number][] = []
    SP.forEach((sp, i) => {
      const near = [SP[i - 1], sp, SP[i + 1]].map((m) => fcs[`i${gd}@${m}`]).filter(Boolean)
      const s = near.reduce((t, z) => ({ pf: t.pf + z.pf, pa: t.pa + z.pa, f: t.f + z.f, a: t.a + z.a, n: t.n + z.n }), { pf: 0, pa: 0, f: 0, a: 0, n: 0 })
      if (s.n < 400) return
      rows.push([sp + 2.5, r3(s.f / s.pf), r3(s.a / s.pa)])
    })
    if (rows.length) {
      scoreFx[String(gd)] = rows
      console.log(`  ${String(gd).padStart(2)}: ` + rows.map((r) => `${r[0]}' ×${r[1].toFixed(2)}/×${r[2].toFixed(2)}`).join('  '))
    }
  }
  console.log('\nThe forecast as shipped against how the matches ended (by goal difference and minute)')
  for (const gd of [-2, -1, 0, 1, 2]) for (const cp of CPS) {
    const z = fcs[`${gd}@${cp}`]
    if (!z || z.n < 100) continue
    const se = (p: number) => Math.sqrt((p * (1 - p)) / z.n) * 100
    console.log(`  ${String(gd).padStart(2)}@${String(cp).padEnd(3)} n ${String(z.n).padStart(5)} · win ${(z.pw / z.n * 100).toFixed(1)}% v ${(z.w / z.n * 100).toFixed(1)}±${se(z.w / z.n).toFixed(1)} · draw ${(z.pd / z.n * 100).toFixed(1)}% v ${(z.d / z.n * 100).toFixed(1)}±${se(z.d / z.n).toFixed(1)}`)
  }
}
const byState = pool(match, (s) => s.split('@')[0])
table('Shouts, by state (pooled over minutes 20, 45, 65, 78)', byState, ['losing', 'level', 'winning'])
table('Shouts, by state and minute', match)
table('From kick-off: attitudes and styles', kick)
table('From kick-off: each setting on its own', sets)

// the forecast as it stands (no change made) against how those matches ended
console.log('\nForecast check (the side left alone): forecast win/draw against actual, minutes expected against played')
for (const st of Object.keys(match).sort()) {
  const c = match[st].none
  if (!c || c.pw === 0) continue
  const se = (p: number) => Math.sqrt((p * (1 - p)) / c.n) * 100
  console.log(`  ${st.padEnd(12)} n ${String(c.n).padStart(5)} · win ${(c.pw / c.n * 100).toFixed(1)}% v ${(c.w / c.n * 100).toFixed(1)}±${se(c.w / c.n).toFixed(1)} · draw ${(c.pd / c.n * 100).toFixed(1)}% v ${(c.d / c.n * 100).toFixed(1)}±${se(c.d / c.n).toFixed(1)} · minutes ${(c.pm / c.n).toFixed(1)} v ${(c.m / c.n).toFixed(1)}`)
}

if (WRITE) {
  const runs = [match, kick, sets].reduce((s, a) => s + Object.values(a).reduce((t, x) => t + Object.values(x).reduce((u, c) => u + c.n, 0), 0), 0)
  const fx = (c: Cell, b: Cell): [number, number] => { const e = effect(c, b); return [r3(shrink(e.f, e.sf)), r3(shrink(e.a, e.sa))] }
  const shouts: Record<string, Record<string, [number, number]>> = { losing: {}, level: {}, winning: {} }
  for (const st of ['losing', 'level', 'winning']) for (const k in byState[st]) if (k !== 'none') (shouts[st] ||= {})[k.replace('shout:', '')] = fx(byState[st][k], byState[st].none)
  const kickoff: Record<string, [number, number]> = {}
  for (const k in kick.kickoff || {}) if (k !== 'none') kickoff[k] = fx(kick.kickoff[k], kick.kickoff.none)
  // per setting: a move per point (per step of attitude, per man in the box), up and down apart; a choice against
  // the club's own set-up (so a change from one choice to another is the difference of the two)
  const setting: Record<string, [number, number]> = {}
  const sk = sets.kickoff || {}
  for (const k in sk) {
    if (k === 'none') continue
    const m = /^(\w+)([+-]\d+)$/.exec(k)
    const [bf, ba] = fx(sk[k], sk.none)
    if (m) { const d = Math.abs(Number(m[2])); setting[`${m[1]}${Number(m[2]) > 0 ? '+' : '-'}`] = [r3(bf / d * 1000) / 1000, r3(ba / d * 1000) / 1000] }
    else setting[k] = [bf, ba]
  }
  // (pairs and triples of numbers on one line each)
  const fmt = (o: unknown) => JSON.stringify(o, null, 2).replace(/\n\s+(-?[\d.]+),\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\]/g, ' $1, $2, $3 ]').replace(/\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\]/g, ' $1, $2 ]').replace(/"(\w+)":/g, '$1:')
  const src = `// Generated by scripts/qa/option-merge.ts from ${runs.toLocaleString('en')} matches played out by the match engine (scripts/qa/option-fit.ts).
// Do not edit by hand: re-run the fit after changing the engine. Each pair is the log-multiplier on the rate of chances
// [for, against] from that moment on, against the same moment with the set-up left alone; effects within the noise are
// shrunk towards none.

/** Each shout, called from a few minutes in, by the score from the manager's side. */
export const SHOUT_FX: Record<'losing' | 'level' | 'winning', Record<string, [number, number]>> = ${fmt(shouts)}

/** From kick-off: each attitude ('attitude:<mentality>') and style of play ('style:<name>'), against the club's own set-up. */
export const KICKOFF_FX: Record<string, [number, number]> = ${fmt(kickoff)}

/**
 * From kick-off, each setting on its own: per point moved up ('pressing+') or down ('pressing-') for the sliders, per
 * man for players in the box, per step of attitude; for a choice ('buildUp=Long Ball'), against the club's own set-up.
 */
export const SETTING_FX: Record<string, [number, number]> = ${fmt(setting)}

/**
 * The forecast's score effects: by goal difference ('-3' … '3', from the side's own view), [minute, for, against]
 * multipliers on the rate of chances so far, minute by minute (a lead is sat on, a deficit chased).
 */
export const SCORE_FX: Record<string, [number, number, number][]> = ${fmt(scoreFx)}
`
  fs.writeFileSync('src/engine/match/responseData.ts', src)
  console.log(`\nwrote src/engine/match/responseData.ts (${runs} runs)`)
}
