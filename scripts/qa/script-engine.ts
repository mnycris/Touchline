// Edit Mode match scripting, headless: scripted facts must appear exactly; everything else stays simulated.
// npx tsx scripts/qa/script-engine.ts [fixtures]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { MatchScript } from '../../src/domain/types'
import { simulateFixture, sideInput } from '../../src/engine/world/matchRunner'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs[0].id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: { skin: 2, hair: 1, hairColor: 1, beard: 0, eyes: 0, brows: 0, glasses: 0, outfit: 'Suit', outfitColor: '#111', tie: true } } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, seed: 7 })
const N = Number(process.argv[2] || 12)
const fx = Object.values(w.fixtures).filter((f) => !f.played && !f.userInvolved && w.competitions[f.compId]?.format === 'league').slice(0, N)
let ok = 0, bad = 0
const targets: [number, number][] = [[3, 1], [0, 0], [1, 4], [2, 2], [5, 0], [1, 0]]
for (const [i, f] of fx.entries()) {
  const comp = w.competitions[f.compId]
  const H = sideInput(w, f.home, comp, false), A = sideInput(w, f.away, comp, false)
  const hx = H.sheet.lineup, ax = A.sheet.lineup
  const st = hx[10], cam = hx[8], cb = hx[3], ast = ax[10], agk = ax[0]
  const score = targets[i % targets.length]
  const script: MatchScript = {
    bias: (i % 5 - 2) as any,
    score,
    events: [
      ...(score[0] >= 1 ? [{ id: 'g1', kind: 'goal' as const, side: 0 as const, player: st, assist: cam, min: 23 }] : []),
      ...(score[1] >= 1 ? [{ id: 'p1', kind: 'pen' as const, side: 1 as const, player: ast, min: 61, pen: 'goal' as const, spot: 'BL' as const, dive: 'R' as const }] : [{ id: 'p2', kind: 'pen' as const, side: 1 as const, player: ast, min: 61, pen: 'saved' as const }]),
      { id: 'y1', kind: 'yellow' as const, side: 0 as const, player: cb, min: 40 },
      { id: 'r1', kind: 'red' as const, side: 1 as const, player: ax[4], min: 75 },
      ...(score[0] >= 2 ? [{ id: 'g2', kind: 'goal' as const, side: 0 as const, player: st, min: 90, add: 3 }] : []),
    ],
    form: { [st]: 2, [agk]: -2 },
  }
  ;(w.scripts ||= {})[f.id] = script
  const r = simulateFixture(w, f)
  const evs = r.events
  const has = (fn: (e: typeof evs[number]) => boolean) => evs.some(fn)
  const checks: [string, boolean][] = [
    ['score', r.score[0] === score[0] && r.score[1] === score[1]],
    ['g1', score[0] < 1 || has((e) => e.type === 'goal' && e.player === st && e.player2 === cam && e.min === 23)],
    ['pen', has((e) => (e.type === 'penGoal' || e.type === 'penMiss') && e.player === ast && e.min === 61 && (score[1] >= 1 ? e.type === 'penGoal' : e.type === 'penMiss'))],
    ['yellow', has((e) => (e.type === 'yellow' || e.type === 'secondYellow') && e.player === cb && e.min === 40)],
    ['red', has((e) => (e.type === 'red' || e.type === 'secondYellow') && e.player === ax[4] && e.min === 75) || !r.players.find((p) => p.id === ax[4])?.mins],
    ['g2', score[0] < 2 || has((e) => e.type === 'goal' && e.player === st && e.min === 90 && e.add === 3)],
  ]
  const failed = checks.filter((c) => !c[1]).map((c) => c[0])
  const stp = r.players.find((p) => p.id === st), gkp = r.players.find((p) => p.id === agk)
  console.log(`${w.clubs[f.home].short} ${r.score[0]}-${r.score[1]} ${w.clubs[f.away].short}  target ${score.join('-')}  shots ${r.stats[0].shots}-${r.stats[1].shots} xg ${r.stats[0].xg}-${r.stats[1].xg} poss ${r.stats[0].possession}  st rating ${stp?.rating} gk rating ${gkp?.rating}  ${failed.length ? 'FAIL ' + failed.join(',') : 'ok'}  edited=${f.edited} scriptLeft=${!!w.scripts[f.id]}`)
  if (failed.includes("pen")) console.log(evs.filter((e) => e.min >= 58 && e.min <= 64 && e.type !== "info").map((e) => `${e.min} ${e.type} ${e.player} ${e.player2 || ""}`).join(" | "), "taker", ast, "onpitch?", r.players.find((p) => p.id === ast))
  failed.length ? bad++ : ok++
}
console.log({ ok, bad })
