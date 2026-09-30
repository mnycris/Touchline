// Edit Mode script checks: AUTO moments, the penalty card, and the feel dials over many matches.
// npx tsx scripts/qa/script-feel.ts [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { MatchScript } from '../../src/domain/types'
import { createSim } from '../../src/engine/world/matchRunner'

const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const N = Number(process.argv[2] || 80)
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 3 })
const fx = Object.values(w.fixtures).filter((f) => ['L13', 'L53', 'L19'].includes(w.competitions[f.compId]?.key || '') && !f.userInvolved).slice(0, N)
const run = (f: any, sc?: any) => { (w as any).scripts = sc ? { [f.id]: sc } : {}; const r = createSim(w, f, false, true).runToEnd(); (w as any).scripts = {}; return r }
// 1. moments on AUTO
{
  const f = fx[0]
  const r = run(f, { events: [{ id: 'g', kind: 'goal', side: 0, player: 0, assist: -1, min: 30 }, { id: 'p', kind: 'pen', side: 1, player: 0, min: 60, pen: 'goal', card: 'red' }, { id: 'y', kind: 'yellow', side: 0, player: 0, min: 75 }] })
  const at = (m: number) => r.events.filter((e) => e.min === m && e.type !== 'chance' && e.type !== 'info' && e.type !== 'play').map((e) => `${e.type}:${w.players[e.player || 0]?.name || '-'}${e.player2 ? `/${w.players[e.player2]?.name}` : ''}`)
  console.log('30\'', at(30).join(' '), '\n60\'', at(60).join(' '), '\n75\'', at(75).join(' '))
}
// 2. the feel dials
const agg = (sc?: MatchScript) => { let g = 0, y = 0, r_ = 0, late = 0; for (const f of fx) { const r = run(f, sc); g += r.score[0] + r.score[1]; y += r.events.filter((e) => e.type === 'yellow').length; r_ += r.events.filter((e) => e.type === 'red' || e.type === 'secondYellow').length; late += r.events.filter((e) => (e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal') && e.min >= 80).length } return `goals ${(g / fx.length).toFixed(2)} (80'+ ${(late / fx.length).toFixed(2)}) · yellows ${(y / fx.length).toFixed(2)} · reds ${(r_ / fx.length).toFixed(2)}` }
console.log('normal     ', agg())
console.log('tight      ', agg({ goals: -1 }))
console.log('open       ', agg({ goals: 1 }))
console.log('goal-fest  ', agg({ goals: 2 }))
console.log('calm       ', agg({ temper: -1 }))
console.log('heated     ', agg({ temper: 1 }))
console.log('late drama ', agg({ late: true }))
// 3. stars: the home side's best three rate higher
{
  let base = 0, star = 0, n = 0
  for (const f of fx.slice(0, 40)) {
    const a = run(f), b = run(f, { stars: 'home' })
    const top = (r: any) => r.players.filter((p: any) => p.side === 0 && p.started && p.pos !== 'GK').map((p: any) => ({ p, ovr: w.players[p.id].ovr })).sort((x: any, y: any) => y.ovr - x.ovr).slice(0, 3)
    for (const x of top(a)) base += x.p.rating
    for (const x of top(b)) star += x.p.rating
    n += 3
  }
  console.log(`stars (home best three): rating ${(base / n).toFixed(2)} → ${(star / n).toFixed(2)}`)
}
