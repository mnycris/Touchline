// The touchline's and the team sheet's options, measured whole: each shout from a few minutes into a match (by game
// state, from the manager's side), and each attitude and style of play from kick-off, played out many times from the
// same moment as the side's set-up left alone. Writes sums (with squares, for the uncertainty) to a JSON file; several
// runs over different clubs are merged by scripts/qa/option-merge.ts into src/engine/match/responseData.ts.
// Also checks the touchline's forecast as it stands: what it said at each moment against how those matches ended.
// Mode 'settings': each setting of the tactics board moved on its own from kick-off (a step up and down, or each choice).
// npx tsx scripts/qa/option-fit.ts <match|kickoff|settings> <clubs,comma,separated> <fixtures per club> <runs> <out.json>
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { predictFixture } from '../../src/engine/match/predict'
import { liveOutlook, minutesLeft } from '../../src/engine/match/response'
import { MENTALITIES, VISION_TACTICS } from '../../src/domain/constants'
import type { TeamTactics } from '../../src/domain/types'
import { SHOUTS, applyShouts } from '../../src/ui/shouts'
import { presetTactics } from '../../src/ui/tacticsGuide'

const [MODE = 'match', CLUBS = 'Arsenal', K = '8', N = '8', OUT = '/tmp/option-fit.json'] = process.argv.slice(2)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
type Opt = { key: string; apply: (t: TeamTactics) => TeamTactics }
const mstep = (t: TeamTactics, d: number) => MENTALITIES[Math.max(0, Math.min(4, MENTALITIES.indexOf(t.mentality) + d))]
const num = (k: keyof TeamTactics, d: number, lo = 0, hi = 100): Opt => ({ key: `${String(k)}${d > 0 ? '+' : ''}${d}`, apply: (t) => ({ ...t, [k]: Math.max(lo, Math.min(hi, (t[k] as number) + d)) }) })
const pick = (k: keyof TeamTactics, v: string): Opt => ({ key: `${String(k)}=${v}`, apply: (t) => ({ ...t, [k]: v }) })
const SETTINGS: Opt[] = [
  { key: 'mentality+1', apply: (t) => ({ ...t, mentality: mstep(t, 1) }) }, { key: 'mentality-1', apply: (t) => ({ ...t, mentality: mstep(t, -1) }) },
  num('pressing', 15), num('pressing', -15), num('lineHeight', 12, 10, 95), num('lineHeight', -12, 10, 95),
  num('width', 20), num('width', -20), num('tempo', 15), num('tempo', -15), num('playersInBox', 1, 2, 9), num('playersInBox', -1, 2, 9),
  ...['Deep', 'Balanced', 'High', 'Aggressive'].map((v) => pick('defApproach', v)), ...['Short Passing', 'Balanced', 'Counter', 'Long Ball'].map((v) => pick('buildUp', v)),
  ...['Possession', 'Balanced', 'Direct Passing', 'Forward Runs'].map((v) => pick('chanceCreation', v)),
  { key: 'offsideTrap=on', apply: (t) => ({ ...t, offsideTrap: true }) }, { key: 'offsideTrap=off', apply: (t) => ({ ...t, offsideTrap: false }) },
]
const OPTS: Opt[] = MODE === 'match'
  ? SHOUTS.map((s) => ({ key: `shout:${s.id}`, apply: (t: TeamTactics) => applyShouts(t, [s.id]) }))
  : MODE === 'settings' ? SETTINGS
  : [...MENTALITIES.map((m) => ({ key: `attitude:${m}`, apply: (t: TeamTactics) => ({ ...t, mentality: m }) })),
     ...Object.keys(VISION_TACTICS).map((n) => ({ key: `style:${n}`, apply: (t: TeamTactics) => presetTactics(n, t) }))]
const MINS = MODE === 'match' ? [20, 45, 65, 78] : [0]
// per run: xG for (f) and against (a) and the minutes played from the fork (m), as sums with squares and products
// (ratio estimates with their uncertainty); the share of the ball; the result (w, d); and, for the side left alone,
// what the forecast said (pw, pd) and the minutes it expected (pm)
type Cell = { n: number; f: number; a: number; m: number; ff: number; aa: number; mm: number; fm: number; am: number; poss: number; w: number; d: number; pw: number; pd: number; pm: number }
const acc: Record<string, Record<string, Cell>> = {}
const add = (st: string, k: string, f: number, a: number, m: number, poss: number, res: number, pr?: [number, number, number]) => {
  const c = ((acc[st] ||= {})[k] ||= { n: 0, f: 0, a: 0, m: 0, ff: 0, aa: 0, mm: 0, fm: 0, am: 0, poss: 0, w: 0, d: 0, pw: 0, pd: 0, pm: 0 })
  c.n++; c.f += f; c.a += a; c.m += m; c.ff += f * f; c.aa += a * a; c.mm += m * m; c.fm += f * m; c.am += a * m; c.poss += poss
  if (res > 0) c.w++; else if (res === 0) c.d++
  if (pr) { c.pw += pr[0]; c.pd += pr[1]; c.pm += pr[2] }
}
const t0 = performance.now()
let runs = 0
for (const club of CLUBS.split(',')) {
  const cd = raw.clubs.find((c) => c.name === club) || raw.clubs.find((c) => c.name.includes(club))!
  const w = createWorld(raw, { clubId: cd.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
  const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(w.userClubId))!
  const fxs = Object.values(w.fixtures).filter((x) => x.userInvolved && x.compId === lg.id).sort((a, b) => a.date.localeCompare(b.date)).slice(0, Number(K))
  for (const f of fxs) {
    const us: 0 | 1 = f.home === w.userClubId ? 0 : 1, them = (1 - us) as 0 | 1
    const p = predictFixture(w, f)
    const prior: [number, number] = us === 0 ? [p.home.xg, p.away.xg] : [p.away.xg, p.home.xg]
    const base: any = createSim(w, f, true)
    for (const M of MINS) {
      while (!base.finished && (base.phase === 'pre' || base.minute < M)) base.step()
      if (base.finished) break
      const d = base.score[us] - base.score[them]
      const st = M === 0 ? 'kickoff' : d < 0 ? 'losing' : d > 0 ? 'winning' : 'level'
      const o0 = liveOutlook(base, us, prior)
      const pr: [number, number, number] = [o0.w, o0.d, minutesLeft(base)]
      const x0 = [base.sides[us].stats.xg, base.sides[them].stats.xg], s0 = [base.sides[us].led.sec, base.sides[them].led.sec]
      for (const o of [{ key: 'none', apply: (t: TeamTactics) => t }, ...OPTS]) for (let i = 0; i < Number(N); i++) {
        const c = base.fork(15485863 * (i + 1) + M * 7 + f.id.length)
        if (o.key !== 'none') c.setTactics(us, o.apply(c.sideTactics(us)), false)
        let played = 0
        while (!c.finished) { const ph = c.phase; c.step(); if (ph === '1H' || ph === '2H') played++ }
        runs++
        const su = c.sides[us].led.sec - s0[0], sv = c.sides[them].led.sec - s0[1]
        add(`${st}@${M}`, o.key, c.sides[us].stats.xg - x0[0], c.sides[them].stats.xg - x0[1], played, su / Math.max(1, su + sv), Math.sign(c.score[us] - c.score[them]), o.key === 'none' ? pr : undefined)
      }
    }
  }
}
console.error(`${MODE} ${CLUBS}: ${runs} runs, ${((performance.now() - t0) / runs).toFixed(1)} ms/run`)
fs.writeFileSync(OUT, JSON.stringify(acc))
