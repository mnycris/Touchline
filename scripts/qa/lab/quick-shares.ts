// Lab: quick-sim scorer shares and per-position goals/shots/xG consistency. npx tsx scripts/qa/lab/quick-shares.ts <save> [matches]
import fs from 'node:fs'
import { deserialize } from '../../../src/services/saves'
import { simulateFixture } from '../../../src/engine/world/matchRunner'
const [file, nArg = '600'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const G = (pos: string) => pos === 'GK' ? 'GK' : pos === 'CB' ? 'CB' : /^(RB|LB|RWB|LWB)$/.test(pos) ? 'FB' : pos === 'CDM' ? 'DM' : pos === 'CM' ? 'CM' : pos === 'CAM' ? 'AM' : /^(RW|LW|RM|LM)$/.test(pos) ? 'W' : 'ST'
const unplayed = Object.values(w.fixtures).filter((f) => !f.played && !f.userInvolved && w.clubs[f.home] && w.clubs[f.away])
const sets = { club: unplayed.filter((f) => ['L13', 'L53', 'L19', 'L31'].includes(w.competitions[f.compId]?.key || '')).slice(0, Number(nArg)), intl: unplayed.filter((f) => w.clubs[f.home].national && w.clubs[f.away].national).slice(0, Number(nArg)) }
for (const [label, fx] of Object.entries(sets)) {
  const g: Record<string, number> = {}, sh: Record<string, number> = {}, xg: Record<string, number> = {}, mins: Record<string, number> = {}
  let goals = 0, og = 0, shots = 0, sot = 0, tsh = 0
  for (const f of fx) {
    const r = simulateFixture(w, f, false)
    for (const p of r.players) { const k = G(p.pos); sh[k] = (sh[k] || 0) + p.shots; xg[k] = (xg[k] || 0) + p.xg; mins[k] = (mins[k] || 0) + p.mins; shots += p.shots; sot += p.sot }
    tsh += r.stats[0].shots + r.stats[1].shots
    for (const e of r.events) {
      if (e.type === 'owngoal') { og++; goals++ }
      if (e.type !== 'goal' && e.type !== 'penGoal') continue
      const p = r.players.find((x) => x.id === e.player); const k = p ? G(p.pos) : '?'
      g[k] = (g[k] || 0) + 1; goals++
    }
  }
  const ks = ['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB']
  console.log(`${label}: ${fx.length} matches · ${(goals / fx.length).toFixed(2)} goals/m · player shots ${shots} vs team shots ${tsh} · sot ${((sot / shots) * 100).toFixed(0)}%`)
  console.log('  goals ' + ks.map((k) => `${k} ${Math.round(((g[k] || 0) / goals) * 100)}%`).join(' · ') + ` · OG ${Math.round((og / goals) * 100)}%`)
  console.log('  per 90 (shots/goals/xG) ' + ks.map((k) => `${k} ${((sh[k] / mins[k]) * 90).toFixed(1)}/${(((g[k] || 0) / mins[k]) * 90).toFixed(2)}/${((xg[k] / mins[k]) * 90).toFixed(2)}`).join(' · '))
}
