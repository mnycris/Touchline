// Which part of a tactical preset does the work: from Balanced, each of the preset's settings alone, then the whole
// preset, over a season of the club's league fixtures (played as the user plays them, as control.ts does).
//   npx tsx scripts/qa/ablate.ts [club=Brentford] [preset=Gegenpress] [--seeds=2] [--keys=pressing,defApproach]
// (--keys: only those settings alone, besides Balanced and the whole preset)
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { TeamTactics } from '../../src/domain/types'
import { DEFAULT_TACTICS, VISION_TACTICS } from '../../src/domain/constants'
import { createSim } from '../../src/engine/world/matchRunner'
import { mainSheet } from '../../src/engine/match/selection'

const args = process.argv.slice(2)
const flag = (k: string) => args.find((a) => a.startsWith(`--${k}`))
const pos = args.filter((a) => !a.startsWith('--'))
const clubName = pos[0] || 'Brentford'
const preset = pos[1] || 'Gegenpress'
const seeds = Number(flag('seeds')?.split('=')[1] || 2)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const rc = raw.clubs.find((c) => c.name === clubName) || raw.clubs.find((c) => c.name.includes(clubName))!
const w = createWorld(raw, { clubId: rc.id, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: {} as any }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' }, seed: 7 } as any)
const club = w.clubs[w.userClubId]
const sheet = mainSheet(club)
const league = Object.values(w.competitions).find((c) => c.format === 'league' && c.season === w.season && c.clubs.includes(club.id))!
const fixtures = league.fixtures.map((id) => w.fixtures[id]).filter((f) => f.home === club.id || f.away === club.id)
const P = VISION_TACTICS[preset] as Partial<TeamTactics>
const keys = flag('keys')?.split('=')[1]?.split(',')
const runs: [string, Partial<TeamTactics>][] = [['Balanced', {}], ...Object.entries(P).filter(([k]) => !keys || keys.includes(k)).map(([k, v]) => [`only ${k}=${v}`, { [k]: v }] as [string, Partial<TeamTactics>]), [`all of ${preset}`, P]]
console.log(`${club.name} · ${fixtures.length} fixtures × ${seeds} seeds`)
console.log('set-up                              pts/g   GF   GA   xGF  xGA  poss  mom+%')
for (const [name, t] of runs) {
  sheet.tactics = { ...DEFAULT_TACTICS, ...t } as TeamTactics
  let n = 0, pts = 0, gf = 0, ga = 0, xf = 0, xa = 0, poss = 0, momPos = 0
  for (let s = 0; s < seeds; s++) {
    w.meta.seed = 7 + s * 101
    for (const f of fixtures) {
      const side = f.home === club.id ? 0 : 1
      const r = createSim(w, f, true).runToEnd()
      const [a, b] = side === 0 ? r.score : [r.score[1], r.score[0]]
      n++; pts += a > b ? 3 : a === b ? 1 : 0; gf += a; ga += b
      xf += r.stats[side].xg; xa += r.stats[1 - side].xg; poss += r.stats[side].possession
      const m = (r.mom || []).map(([, v]) => (side === 0 ? v : -v))
      if (m.length) momPos += m.filter((v) => v > 0.15).length / m.length
    }
  }
  const f2 = (x: number) => (x / n).toFixed(2).padStart(5)
  console.log(`${name.padEnd(34)} ${f2(pts)} ${f2(gf)} ${f2(ga)} ${f2(xf)} ${f2(xa)}  ${Math.round(poss / n)}%   ${Math.round((momPos / n) * 100)}%`)
}
