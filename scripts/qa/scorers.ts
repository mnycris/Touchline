// Who scores: share of goals by position (the slot played), full engine vs quick sim, club and international
// matches, against real top-flight shares. npx tsx scripts/qa/scorers.ts <save> [matches]
// Real reference (big five, 2018-24, by position played): strikers ~38%, wingers/wide mids ~22%, attacking mids ~11%,
// central/defensive mids ~13%, full-backs ~5%, centre-backs ~8%, own goals ~3%.
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { createSim, simulateFixture } from '../../src/engine/world/matchRunner'
const [file, nArg = '150'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const N = Number(nArg)
const G = (pos: string) => pos === 'GK' ? 'GK' : pos === 'CB' ? 'CB' : /^(RB|LB|RWB|LWB)$/.test(pos) ? 'FB' : pos === 'CDM' ? 'DM' : pos === 'CM' ? 'CM' : pos === 'CAM' ? 'AM' : /^(RW|LW|RM|LM)$/.test(pos) ? 'W' : 'ST'
const ORDER = ['ST', 'W', 'AM', 'CM', 'DM', 'FB', 'CB', 'GK', 'OG']
function measure(label: string, fx: typeof w.fixtures[string][], mode: 'full' | 'quick') {
  const c: Record<string, number> = {}, shots: Record<string, number> = {}, xg: Record<string, number> = {}
  let goals = 0, matches = 0, allShots = 0, allXg = 0
  for (const f of fx) {
    const r = mode === 'full' ? createSim(w, f, false, true).runToEnd() : simulateFixture(w, f, false)
    matches++
    for (const p of r.players) { const g = G(p.pos); shots[g] = (shots[g] || 0) + p.shots; xg[g] = (xg[g] || 0) + p.xg; allShots += p.shots; allXg += p.xg }
    for (const e of r.events) {
      if (e.type === 'owngoal') { c.OG = (c.OG || 0) + 1; goals++; continue }
      if (e.type !== 'goal' && e.type !== 'penGoal') continue
      const st = r.players.find((p) => p.id === e.player)
      const g = st ? G(st.pos) : '?'
      c[g] = (c[g] || 0) + 1; goals++
    }
  }
  const pct = ORDER.map((k) => `${k} ${Math.round(((c[k] || 0) / Math.max(1, goals)) * 100)}%`).join(' · ')
  console.log(`${label.padEnd(26)} ${mode.padEnd(5)} ${String(matches).padStart(4)} matches · ${(goals / matches).toFixed(2)} goals/match · ${pct}`)
  if (allShots) console.log(`${''.padEnd(32)} shots: ${ORDER.slice(0, 7).map((k) => `${k} ${Math.round(((shots[k] || 0) / allShots) * 100)}%`).join(' · ')}   xG: ${ORDER.slice(0, 7).map((k) => `${k} ${Math.round(((xg[k] || 0) / allXg) * 100)}%`).join(' · ')}   goals/xG: ${ORDER.slice(0, 7).map((k) => `${k} ${((c[k] || 0) / Math.max(0.01, xg[k] || 0)).toFixed(2)}`).join(' · ')}`)
}
const unplayed = Object.values(w.fixtures).filter((f) => !f.played && !f.userInvolved && w.clubs[f.home] && w.clubs[f.away])
const club = unplayed.filter((f) => ['L13', 'L53', 'L19', 'L31'].includes(w.competitions[f.compId]?.key || '')).slice(0, N)
const intl = unplayed.filter((f) => w.clubs[f.home].national && w.clubs[f.away].national).slice(0, N)
for (const mode of ['full', 'quick'] as const) measure('big-five club league', club, mode)
for (const mode of ['full', 'quick'] as const) measure('international', intl, mode)
