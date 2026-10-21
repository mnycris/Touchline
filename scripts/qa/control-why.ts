// Where the manager's side's chances come from under each set-up (and the opponent's): shots and xG per match by how
// the chance was made, read from the engine's calibration counters, as control.ts plays it.
//   npx tsx scripts/qa/control-why.ts [club=Manchester City] [--99] [--seeds=1] [--only=Possession,Counter-Attack]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { TeamTactics } from '../../src/domain/types'
import { DEFAULT_TACTICS, VISION_TACTICS } from '../../src/domain/constants'
import { createSim } from '../../src/engine/world/matchRunner'
import { mainSheet } from '../../src/engine/match/selection'
import { MatchSim } from '../../src/engine/match/engine'
import { computeOvr } from '../../src/domain/ratings'

const args = process.argv.slice(2)
const flag = (k: string) => args.find((a) => a.startsWith(`--${k}`))
const clubName = args.find((a) => !a.startsWith('--')) || 'Manchester City'
const seeds = Number(flag('seeds')?.split('=')[1] || 1)
const only = flag('only')?.split('=')[1]?.split(',')
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const rc = raw.clubs.find((c) => c.name === clubName) || raw.clubs.find((c) => c.name.includes(clubName))!
const w = createWorld(raw, { clubId: rc.id, manager: { firstName: 'T', lastName: 'M', nationality: 'England', dob: '1985-01-01', avatar: {} as any }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' }, seed: 7 } as any)
const club = w.clubs[w.userClubId]
if (flag('99')) for (const p of Object.values(w.players)) if (p.clubId === club.id) { p.attrs = p.attrs.map(() => 99); p.ovr = computeOvr(p) }
const sheet = mainSheet(club)
const league = Object.values(w.competitions).find((c) => c.format === 'league' && c.season === w.season && c.clubs.includes(club.id))!
const fixtures = league.fixtures.map((id) => w.fixtures[id]).filter((f) => f.home === club.id || f.away === club.id)
const HOWS = ['box', 'pass', 'through', 'cross', 'cutback', 'solo', 'counter', 'long', 'rebound', 'corner', 'freekick', 'error']
for (const name of Object.keys(VISION_TACTICS)) {
  if (only && !only.includes(name)) continue
  sheet.tactics = { ...DEFAULT_TACTICS, ...VISION_TACTICS[name] } as TeamTactics
  const me: Record<string, number> = {}, them: Record<string, number> = {}, other: Record<string, number> = {}, opp: Record<string, number> = {}
  const lostMe = [0, 0, 0], lostThem = [0, 0, 0]
  let n = 0, poss = 0, tilt = 0, own = 0, oTilt = 0, oOwn = 0, ctrMe = 0, ctrThem = 0, entries = 0, boxE = 0, spells = 0
  for (let s = 0; s < seeds; s++) {
    w.meta.seed = 7 + s * 101
    for (const f of fixtures) {
      const side = f.home === club.id ? 0 : 1
      MatchSim.dbg = {}
      const sim = createSim(w, f, true)
      sim.runToEnd()
      const d = MatchSim.dbg!
      for (const [k, v] of Object.entries(d)) {
        const pk = /^s([01])\.(pass|passL|pz|pzL|sz|sp|zx|prz)(.*)$/.exec(k)
        if (pk) { const t = Number(pk[1]) === side ? other : opp; t[pk[2] + pk[3]] = (t[pk[2] + pk[3]] || 0) + v; continue }
        const m = /^s([01])\.(shot|xg)\.(.+)$/.exec(k)
        if (!m) continue
        const tgt = Number(m[1]) === side ? me : them
        tgt[`${m[2]}.${m[3]}`] = (tgt[`${m[2]}.${m[3]}`] || 0) + v
      }
      const L = (sim as any).sides[side].led, O = (sim as any).sides[1 - side].led
      poss += (sim as any).sides[side].possSec / Math.max(1, (sim as any).sides[0].possSec + (sim as any).sides[1].possSec)
      for (let z = 0; z < 3; z++) { lostMe[z] += L.lost[z]; lostThem[z] += O.lost[z] }
      tilt += L.tFinal / Math.max(1, L.sec); own += L.tOwn / Math.max(1, L.sec); oTilt += O.tFinal / Math.max(1, O.sec); oOwn += O.tOwn / Math.max(1, O.sec)
      ctrMe += L.counters; ctrThem += O.counters; entries += L.entries[0] + L.entries[1] + L.entries[2]; boxE += L.boxEntries; spells += L.spells
      n++
    }
  }
  MatchSim.dbg = null
  const row = (t: Record<string, number>) => HOWS.map((h) => `${h} ${((t[`shot.${h}`] || 0) / n).toFixed(1)}/${((t[`xg.${h}`] || 0) / n).toFixed(2)}`).join('  ')
  const tot = (t: Record<string, number>, k: string) => (Object.entries(t).filter(([x]) => x.startsWith(k)).reduce((a, [, v]) => a + v, 0) / n)
  console.log(`== ${name}: poss ${Math.round(poss / n * 100)}% · counters ${(ctrMe / n).toFixed(1)} vs ${(ctrThem / n).toFixed(1)} · final-third entries ${(entries / n).toFixed(0)} · box entries ${(boxE / n).toFixed(0)} · spells ${(spells / n).toFixed(0)} · shots ${tot(me, 'shot.').toFixed(1)} xG ${tot(me, 'xg.').toFixed(2)} | against ${tot(them, 'shot.').toFixed(1)} / ${tot(them, 'xg.').toFixed(2)}`)
  console.log(`   balls lost own/mid/final third: us ${lostMe.map((v) => (v / n).toFixed(1)).join('/')} · them ${lostThem.map((v) => (v / n).toFixed(1)).join('/')}`)
  console.log(`   us   ${row(me)}`)
  console.log(`   them ${row(them)}`)
  const kinds = ['back', 'short', 'prog', 'long', 'switch', 'through', 'cutback', 'cross']
  const pt = kinds.reduce((a, k) => a + (other[`pass.${k}`] || 0), 0)
  console.log(`   time: own third ${Math.round(own / n * 100)}% final third ${Math.round(tilt / n * 100)}% · passes ${(pt / n).toFixed(0)}: ${kinds.map((k) => `${k} ${Math.round((other[`pass.${k}`] || 0) / pt * 100)}% (${Math.round((other[`passL.${k}`] || 0) / Math.max(1, other[`pass.${k}`] || 0) * 100)}%)`).join(' ')} · from zones ${[0, 1, 2].map((z) => `${Math.round((other[`pz${z}`] || 0) / n)}`).join('/')}`)
  const pt2 = kinds.reduce((a, k) => a + (opp[`pass.${k}`] || 0), 0)
  const ok2 = kinds.reduce((a, k) => a + (opp[`passL.${k}`] || 0), 0)
  console.log(`   them: own third ${Math.round(oOwn / n * 100)}% final third ${Math.round(oTilt / n * 100)}% · passes ${(pt2 / n).toFixed(0)} at ${Math.round(ok2 / Math.max(1, pt2) * 100)}% · long ${Math.round((opp['pass.long'] || 0) / Math.max(1, pt2) * 100)}% · spells from own third ${((opp.sz0 || 0) / n).toFixed(0)} (reach final ${Math.round((opp.sz0r66 || 0) / Math.max(1, opp.sz0 || 0) * 100)}%) middle ${((opp.sz1 || 0) / n).toFixed(0)} (reach final ${Math.round((opp.sz1r66 || 0) / Math.max(1, opp.sz1 || 0) * 100)}%)`)
  const prs = (t: Record<string, number>) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => (t[`zx${z}`] ? (t[`prz${z}`] / t[`zx${z}`]).toFixed(2) : '-')).join(' ')
  const acts = (t: Record<string, number>) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => Math.round((t[`zx${z}`] || 0) / n)).join(' ')
  console.log(`   pressure on the ball by tenth of the pitch (own goal → their goal): us ${prs(other)} | them ${prs(opp)}`)
  console.log(`   actions by tenth: us ${acts(other)} | them ${acts(opp)}`)
  console.log(`   spells from own third / middle / final: ${[0, 1, 2].map((z) => `${((other[`sz${z}`] || 0) / n).toFixed(0)} (reach final ${Math.round((other[`sz${z}r66`] || 0) / Math.max(1, other[`sz${z}`] || 0) * 100)}%, box-edge ${Math.round((other[`sz${z}r84`] || 0) / Math.max(1, other[`sz${z}`] || 0) * 100)}%, shot ${Math.round((other[`szShot${z}`] || 0) / Math.max(1, other[`sz${z}`] || 0) * 100)}%)`).join(' · ')}`)
}
