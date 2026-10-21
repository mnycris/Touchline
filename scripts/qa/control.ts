// How much control the manager's side has, played as the user plays it (the user's sheet and tactics, the opponent's AI
// set-up and the difficulty edge): a season of league fixtures under each tactical set-up, reporting results, the ball,
// momentum, chances both ways and how often the game was comfortable.
//   npx tsx scripts/qa/control.ts [club=Manchester City] [--99] [--seeds=2] [--only=Possession,Balanced]
// --99 turns every player in the squad into a 99 (all attributes 99), the "fully 99-rated team" test.
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { TeamTactics } from '../../src/domain/types'
import { DEFAULT_TACTICS, VISION_TACTICS } from '../../src/domain/constants'
import { createSim } from '../../src/engine/world/matchRunner'
import { mainSheet } from '../../src/engine/match/selection'
import { computeOvr } from '../../src/domain/ratings'

const args = process.argv.slice(2)
const flag = (k: string) => args.find((a) => a.startsWith(`--${k}`))
const clubName = args.find((a) => !a.startsWith('--')) || 'Manchester City'
const seeds = Number(flag('seeds')?.split('=')[1] || 2)
const only = flag('only')?.split('=')[1]?.split(',')
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const rc = raw.clubs.find((c) => c.name === clubName) || raw.clubs.find((c) => c.name.includes(clubName))!
const w = createWorld(raw, {
  clubId: rc.id,
  manager: { firstName: 'Test', lastName: 'Manager', nationality: 'England', dob: '1985-01-01', avatar: {} as any },
  settings: { difficulty: (flag('difficulty')?.split('=')[1] as any) || 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' },
  seed: 7,
} as any)
const club = w.clubs[w.userClubId]
// --subs: the assistant makes the substitutions in the user's matches (the Assistant subs setting)
if (flag('subs')) w.flags.assistantSubs = true
if (flag('99')) for (const p of Object.values(w.players)) if (p.clubId === club.id) { p.attrs = p.attrs.map(() => 99); p.ovr = computeOvr(p); p.fitness = 100; p.sharpness = 100; p.morale = 90 }
const sheet = mainSheet(club)
const league = Object.values(w.competitions).find((c) => c.format === 'league' && c.season === w.season && c.clubs.includes(club.id))!
const fixtures = league.fixtures.map((id) => w.fixtures[id]).filter((f) => f.home === club.id || f.away === club.id)
const setups: [string, TeamTactics][] = Object.keys(VISION_TACTICS).map((n) => [n, { ...DEFAULT_TACTICS, ...VISION_TACTICS[n] } as TeamTactics])
setups.push(['Possession + Attacking', { ...DEFAULT_TACTICS, ...VISION_TACTICS.Possession, mentality: 'Attacking' } as TeamTactics])
setups.push(['Possession + Defensive', { ...DEFAULT_TACTICS, ...VISION_TACTICS.Possession, mentality: 'Defensive' } as TeamTactics])
console.log(`${club.name} (squad ${club.squadAvg}${flag('99') ? ', all 99' : ''}) · ${fixtures.length} league fixtures × ${seeds} seeds · ${sheet.formation} · ${w.settings.difficulty}`)
console.log('set-up                     W   D   L    GF   GA   xGF  xGA  shF  shA  poss  mom  mom+%  comfy')
const pc = (x: number) => `${Math.round(x * 100)}`.padStart(3)
// (and the AI running the club itself: its own sheet, its set-up for each opponent, its substitutions)
setups.unshift(['AI manages the club', DEFAULT_TACTICS])
for (const [name, tactics] of setups) {
  if (only && !only.includes(name)) continue
  const ai = name === 'AI manages the club'
  sheet.tactics = { ...tactics }
  let n = 0, W = 0, D = 0, gf = 0, ga = 0, xf = 0, xa = 0, sf = 0, sa = 0, poss = 0, mom = 0, momPos = 0, comfy = 0
  for (let s = 0; s < seeds; s++) {
    w.meta.seed = 7 + s * 101
    for (const f of fixtures) {
      const side = f.home === club.id ? 0 : 1
      const r = createSim(w, f, !ai).runToEnd()
      const me = r.stats[side], them = r.stats[1 - side]
      const [a, b] = side === 0 ? r.score : [r.score[1], r.score[0]]
      n++; if (a > b) W++; else if (a === b) D++
      gf += a; ga += b; xf += me.xg; xa += them.xg; sf += me.shots; sa += them.shots; poss += me.possession
      const m = (r.mom || []).map(([, v]) => (side === 0 ? v : -v))
      if (m.length) { mom += m.reduce((x, y) => x + y, 0) / m.length; momPos += m.filter((v) => v > 0.15).length / m.length }
      if (me.xg - them.xg > 1 && a > b) comfy++
    }
  }
  const f2 = (x: number) => (x / n).toFixed(2).padStart(4)
  console.log(`${name.padEnd(24)} ${pc(W / n)} ${pc(D / n)} ${pc((n - W - D) / n)}   ${f2(gf)} ${f2(ga)}  ${f2(xf)} ${f2(xa)}  ${(sf / n).toFixed(1).padStart(4)} ${(sa / n).toFixed(1).padStart(4)}   ${(poss / n).toFixed(0).padStart(3)}% ${(mom / n).toFixed(2).padStart(5)}  ${pc(momPos / n)}%  ${pc(comfy / n)}%`)
}
