// Penalties over many matches: conversion by taker quality, the designated taker actually taking them, and named
// elite takers. Full engine and light sim. npx tsx scripts/qa/penalties.ts <save> [matches]
// Real reference (big five, 2015-25): ~77% scored overall; elite takers ~85-90% over a career; weak ones ~65-70%.
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { createSim, simulateFixture } from '../../src/engine/world/matchRunner'
import { takerQuality, penaltyChance, keeperQuality } from '../../src/engine/match/penalty'
import { A } from '../../src/domain/types'
const [file, nArg = '1500'] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(file))
const fx = Object.values(w.fixtures).filter((f) => !f.played && !f.userInvolved && w.clubs[f.home] && w.clubs[f.away] && !w.clubs[f.home].national).slice(0, Number(nArg))
const sheets0 = (m: string) => (m === 'full' ? '' : '(light sim: not checked) ')
const bucket = (q: number) => (q >= 86 ? 'elite 86+' : q >= 78 ? 'good 78-85' : q >= 70 ? 'average 70-77' : 'weak <70')
for (const mode of ['full', 'quick'] as const) {
  const by: Record<string, [number, number]> = {}
  let pens = 0, scored = 0, designated = 0, desigOn = 0, matches = 0
  const named: Record<string, [number, number]> = {}
  for (const f of fx) {
    const sim = mode === 'full' ? createSim(w, f, false) : undefined
    const r = sim ? sim.runToEnd() : simulateFixture(w, f, false)
    // the sheet the match was actually played with (AI clubs pick theirs on the day)
    const sheets = sim ? (sim as any).sides.map((s: any) => s.input.sheet) : undefined
    matches++
    for (const e of r.events) {
      if (e.type !== 'penGoal' && e.type !== 'penMiss') continue
      const p = w.players[e.player!]
      const q = takerQuality(p)
      const k = bucket(q)
      const o = (by[k] ||= [0, 0]); o[1]++; pens++
      if (e.type === 'penGoal') { o[0]++; scored++ }
      // was the designated taker on the pitch, and did he take it?
      const d = sheets?.[e.side as 0 | 1]?.penalties
      const st = r.players.find((x) => x.id === d)
      if (d && st && (st.subOn ?? 0) <= e.min && (st.subOff ?? 999) >= e.min && !(st.red)) { desigOn++; if (d === e.player) designated++ }
      if (p.attrs[A.penalties] >= 88) { const n = (named[p.name] ||= [0, 0]); n[1]++; if (e.type === 'penGoal') n[0]++ }
    }
  }
  console.log(`${mode}: ${matches} matches · ${(pens / matches).toFixed(2)} penalties/match · ${((scored / pens) * 100).toFixed(0)}% scored · ${sheets0(mode)}designated taker took ${designated}/${desigOn} when on the pitch`)
  for (const k of ['elite 86+', 'good 78-85', 'average 70-77', 'weak <70']) if (by[k]) console.log(`  ${k.padEnd(14)} ${by[k][0]}/${by[k][1]} = ${((by[k][0] / by[k][1]) * 100).toFixed(0)}%`)
  console.log('  takers with penalties 88+: ' + Object.entries(named).sort((a, b) => b[1][1] - a[1][1]).slice(0, 8).map(([n, [g, t]]) => `${n} ${g}/${t}`).join(' · '))
}
// the model itself for the save's best takers against a typical top-flight keeper (10,000 kicks each, analytic)
const keepers = Object.values(w.players).filter((p) => p.positions[0] === 'GK' && p.ovr >= 78)
const gAvg = keepers.reduce((a, p) => a + keeperQuality(p), 0) / Math.max(1, keepers.length)
const best = Object.values(w.players).filter((p) => p.positions[0] !== 'GK').sort((a, b) => takerQuality(b) - takerQuality(a)).slice(0, 6)
console.log(`model vs a typical top-flight keeper (quality ${gAvg.toFixed(0)}): ` + best.map((p) => `${p.name} ${(penaltyChance(takerQuality(p), p.attrs[A.composure], gAvg) * 100).toFixed(0)}%`).join(' · '))
const kane = Object.values(w.players).find((p) => p.name.includes('Kane') && p.attrs[A.penalties] > 85)
if (kane) console.log(`${kane.name}: penalties ${kane.attrs[A.penalties]}, composure ${kane.attrs[A.composure]} → ${(penaltyChance(takerQuality(kane), kane.attrs[A.composure], gAvg) * 100).toFixed(0)}% per kick (vs a 65-rated keeper ${(penaltyChance(takerQuality(kane), kane.attrs[A.composure], 65) * 100).toFixed(0)}%, vs an elite one ${(penaltyChance(takerQuality(kane), kane.attrs[A.composure], 88) * 100).toFixed(0)}%)`)
