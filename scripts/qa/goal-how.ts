// Full engine: goals by situation and by the scorer's position in each situation, and where midfielders' shots
// come from. npx tsx scripts/qa/goal-how.ts <save> [matches]
// Real reference (big five): penalties ~9-10% of goals, corners ~8-10%, other set pieces ~6-8%, direct free kicks ~2%,
// own goals ~3%, open play ~68-72%.
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { createSim } from '../../src/engine/world/matchRunner'
const [file, nArg = '200'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const G = (pos: string) => pos === 'GK' ? 'GK' : pos === 'CB' ? 'CB' : /^(RB|LB|RWB|LWB)$/.test(pos) ? 'FB' : pos === 'CDM' ? 'DM' : pos === 'CM' ? 'CM' : pos === 'CAM' ? 'AM' : /^(RW|LW|RM|LM)$/.test(pos) ? 'W' : 'ST'
const fx = Object.values(w.fixtures).filter((f) => !f.played && !f.userInvolved && ['L13', 'L53', 'L19', 'L31'].includes(w.competitions[f.compId]?.key || '')).slice(0, Number(nArg))
const by: Record<string, Record<string, number>> = {}, shots: Record<string, Record<string, number>> = {}
// inside vs outside the box (shooting side's frame: the box starts 16.5m out, x > 84.3), per position
const zone: Record<string, { inS: number; inG: number; outS: number; outG: number }> = {}
let goals = 0
for (const f of fx) {
  const r = createSim(w, f, false, true).runToEnd()
  const posOf = (id?: number) => { const p = r.players.find((x) => x.id === id); return p ? G(p.pos) : '?' }
  for (const e of r.events) {
    const isShot = ['goal', 'penGoal', 'save', 'miss', 'woodwork', 'chance', 'penMiss'].includes(e.type) && e.player && (e.xg != null || e.type.startsWith('pen'))
    if (isShot && e.loc && !e.type.startsWith('pen')) {
      const x = e.side === 0 ? e.loc[0] : 100 - e.loc[0]
      const z = (zone[posOf(e.player)] ||= { inS: 0, inG: 0, outS: 0, outG: 0 })
      const scored = e.type === 'goal'
      if (x > 84.3) { z.inS++; if (scored) z.inG++ } else { z.outS++; if (scored) z.outG++ }
    }
    if (isShot) { const k = e.type.startsWith('pen') ? 'pen' : e.how || '?'; ((shots[k] ||= {})[posOf(e.player)] = ((shots[k] ||= {})[posOf(e.player)] || 0) + 1) }
    if (e.type === 'owngoal') { (by.own ||= {}).OG = (by.own.OG || 0) + 1; goals++; continue }
    if (e.type !== 'goal' && e.type !== 'penGoal') continue
    const k = e.type === 'penGoal' ? 'pen' : e.how || '?'
    const g = posOf(e.player)
    ;(by[k] ||= {})[g] = (by[k][g] || 0) + 1
    goals++
  }
}
console.log(`${fx.length} matches · ${(goals / fx.length).toFixed(2)} goals/match`)
const tot = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)
for (const [k, o] of Object.entries(by).sort((a, b) => tot(b[1]) - tot(a[1]))) {
  const n = tot(o)
  const st = shots[k] ? tot(shots[k]) : 0
  console.log(`${k.padEnd(9)} ${String(Math.round((n / goals) * 100)).padStart(3)}% of goals (${n}) · ${st} shots · by scorer: ${Object.entries(o).sort((a, b) => b[1] - a[1]).map(([g, v]) => `${g} ${Math.round((v / n) * 100)}%`).join(' ')}`)
}

let outG = 0, outS = 0, allG = 0
for (const z of Object.values(zone)) { outG += z.outG; outS += z.outS; allG += z.inG + z.outG }
console.log(`outside the box: ${outS} shots (${Math.round((outS / Math.max(1, outS + Object.values(zone).reduce((a, z) => a + z.inS, 0))) * 100)}% of shots) · ${outG} goals (${Math.round((outG / Math.max(1, allG)) * 100)}% of non-penalty goals) · conversion ${((outG / Math.max(1, outS)) * 100).toFixed(1)}%`)
for (const [g, z] of Object.entries(zone)) console.log(`  ${g.padEnd(3)} inside ${z.inS} shots ${z.inG} goals (${((z.inG / Math.max(1, z.inS)) * 100).toFixed(0)}%) · outside ${z.outS} shots ${z.outG} goals (${((z.outG / Math.max(1, z.outS)) * 100).toFixed(1)}%)`)
