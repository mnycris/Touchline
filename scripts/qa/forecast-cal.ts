// How a match goes on from a score and a minute, against the touchline's plain projection (the rate of chances so far,
// carried on): the side ahead sits deeper and the side behind pushes, so a plain projection over-rates a lead. Through
// many matches (the manager's side, as the touchline sees it) this records, minute by minute, the chances each side made
// in that minute against the rate so far, by goal difference and the time (keys 'i<gd>@<minute>'): the score effects
// the forecast plays the rest of a match out with (SCORE_FX in src/engine/match/responseData.ts, by
// scripts/qa/option-merge.ts). And at checkpoints (keys '<gd>@<minute>') what the forecast said against how it ended.
// npx tsx scripts/qa/forecast-cal.ts <clubs,comma,separated> <fixtures per club> <runs per fixture> <out.json>
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { predictFixture } from '../../src/engine/match/predict'
import { liveOutlook, liveRates, minutesLeft } from '../../src/engine/match/response'

const [CLUBS = 'Arsenal', K = '19', R = '10', OUT = '/tmp/forecast-cal.json'] = process.argv.slice(2)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const CPS = [10, 20, 30, 40, 45, 55, 62, 70, 76, 82, 86]
type Cell = { n: number; pf: number; pa: number; pm: number; f: number; a: number; m: number; w: number; d: number; pw: number; pd: number; og?: number; ogf?: number; oga?: number; gf?: number; ga?: number }
const acc: Record<string, Cell> = {}
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
    base.step()
    for (let i = 0; i < Number(R); i++) {
      const c = base.fork(7919 * (i + 1) + f.id.length * 31)
      const marks: { key: string; pf: number; pa: number; pm: number; x: [number, number]; pl: number; pw: number; pd: number; ogf: number; oga: number; g: [number, number] }[] = []
      // a minute of football, with the chances in it against the rate so far
      const step = () => {
        if (c.phase !== '1H' && c.phase !== '2H') { c.step(); return }
        const gd = Math.max(-3, Math.min(3, c.score[us] - c.score[them]))
        const key = `i${gd}@${Math.min(85, Math.floor(Math.max(0, c.minute) / 5) * 5)}`
        const [rf, ra] = liveRates(c, us, prior)
        const x0 = c.sides[us].stats.xg, y0 = c.sides[them].stats.xg
        c.step()
        const z = (acc[key] ||= { n: 0, pf: 0, pa: 0, pm: 0, f: 0, a: 0, m: 0, w: 0, d: 0, pw: 0, pd: 0 })
        z.n++; z.pf += rf; z.pa += ra; z.f += c.sides[us].stats.xg - x0; z.a += c.sides[them].stats.xg - y0
      }
      for (const cp of CPS) {
        while (!c.finished && (c.phase === 'HT' || c.minute < cp)) step()
        if (c.finished) break
        const gd = Math.max(-2, Math.min(2, c.score[us] - c.score[them]))
        const left = minutesLeft(c)
        const [rf, ra] = liveRates(c, us, prior)
        // (what the touchline would show: with the score effects in, see SCORE_FX)
        const o = liveOutlook(c, us, prior)
        marks.push({ key: `${gd}@${cp}`, pf: rf * left, pa: ra * left, pm: left, x: [c.sides[us].stats.xg, c.sides[them].stats.xg], pl: c.played, pw: o.w, pd: o.d, ogf: o.gf, oga: o.ga, g: [c.score[us], c.score[them]] })
      }
      while (!c.finished) step()
      runs++
      const res = Math.sign(c.score[us] - c.score[them])
      for (const k of marks) {
        const z = (acc[k.key] ||= { n: 0, pf: 0, pa: 0, pm: 0, f: 0, a: 0, m: 0, w: 0, d: 0, pw: 0, pd: 0 })
        z.n++; z.pf += k.pf; z.pa += k.pa; z.pm += k.pm; z.pw += k.pw; z.pd += k.pd
        z.ogf = (z.ogf || 0) + k.ogf; z.oga = (z.oga || 0) + k.oga; z.gf = (z.gf || 0) + c.score[us] - k.g[0]; z.ga = (z.ga || 0) + c.score[them] - k.g[1]
        z.f += c.sides[us].stats.xg - k.x[0]; z.a += c.sides[them].stats.xg - k.x[1]; z.m += c.played - k.pl
        if (res > 0) z.w++; else if (res === 0) z.d++
      }
    }
  }
}
console.error(`${CLUBS}: ${runs} matches, ${((performance.now() - t0) / runs).toFixed(1)} ms/match`)
fs.writeFileSync(OUT, JSON.stringify(acc))
