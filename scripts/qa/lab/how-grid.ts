// Lab: shots, xG per shot and goals for each (position group, situation). npx tsx scripts/qa/lab/how-grid.ts <save> [matches] [group]
import fs from 'node:fs'
import { deserialize } from '../../../src/services/saves'
import { createSim } from '../../../src/engine/world/matchRunner'
const [file, nArg = '200', only] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const G = (pos: string) => pos === 'GK' ? 'GK' : pos === 'CB' ? 'CB' : /^(RB|LB|RWB|LWB)$/.test(pos) ? 'FB' : pos === 'CDM' ? 'DM' : pos === 'CM' ? 'CM' : pos === 'CAM' ? 'AM' : /^(RW|LW|RM|LM)$/.test(pos) ? 'W' : 'ST'
const fx = Object.values(w.fixtures).filter((f) => !f.played && !f.userInvolved && ['L13', 'L53', 'L19', 'L31'].includes(w.competitions[f.compId]?.key || '')).slice(0, Number(nArg))
const t: Record<string, { s: number; xg: number; g: number }> = {}
for (const f of fx) {
  const r = createSim(w, f, false).runToEnd()
  const pos = new Map(r.players.map((p) => [p.id, G(p.pos)]))
  for (const e of r.events) {
    if (!['goal', 'save', 'miss', 'woodwork', 'chance'].includes(e.type) || !e.player || e.xg == null) continue
    const k = `${pos.get(e.player)}.${e.how || '?'}`
    const o = (t[k] ||= { s: 0, xg: 0, g: 0 })
    o.s++; o.xg += e.xg; if (e.type === 'goal') o.g++
  }
}
for (const [k, o] of Object.entries(t).filter(([k]) => !only || k.startsWith(only + '.')).sort((a, b) => b[1].s - a[1].s).slice(0, 40)) console.log(`${k.padEnd(14)} shots ${(o.s / fx.length).toFixed(2).padStart(5)}/m  xG/shot ${(o.xg / o.s).toFixed(3)}  goals ${String(o.g).padStart(3)} (${((o.g / o.s) * 100).toFixed(0)}%)`)
