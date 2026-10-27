// Stoppage time as the match engine adds it: how much each half gets, how often it runs long, and what the long ones
// had in them. npx tsx scripts/qa/stoppage.ts [matches]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'

const N = Number(process.argv[2] || 400)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Brentford'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const comps = Object.values(w.competitions).filter((c) => c.format === 'league' && ['L13', 'L53', 'L19', 'L31', 'L16'].some((k) => c.key?.startsWith(k)))
const fxs = comps.flatMap((c) => c.fixtures.map((id) => w.fixtures[id])).filter((f) => f && !f.userInvolved).slice(0, N)
const h1: number[] = [], h2: number[] = []
const long: string[] = []
// second-half stoppage by the half's goals
const byGoals: Record<string, number[]> = {}
for (const f of fxs) {
  const sim: any = createSim(w, f, false, false)
  const r = sim.runToEnd()
  const ht = r.events.find((e: any) => e.type === 'ht'), ft = [...r.events].reverse().find((e: any) => e.type === 'ft' || e.type === 'et' || e.type === 'pens')
  const a1 = ht?.add || 0, a2 = ft?.add || 0
  h1.push(a1); h2.push(a2)
  const ev = r.events.filter((e: any) => e.min > 45 && e.min <= 90)
  const c = (t: string[]) => ev.filter((e: any) => t.includes(e.type)).length
  const g = c(['goal', 'penGoal', 'owngoal'])
  ;(byGoals[g >= 4 ? '4+' : String(g)] ||= []).push(a2)
  if (a2 >= 7) long.push(`+${a2}: goals ${g} subs ${c(['sub'])} cards ${c(['yellow', 'red', 'secondYellow'])} injuries ${c(['injury'])} pens ${c(['penalty'])} var ${c(['var'])}`)
}
const dist = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = xs.reduce((a, b) => a + b, 0) / xs.length
  const hist: Record<number, number> = {}
  for (const x of xs) hist[x] = (hist[x] || 0) + 1
  return `mean ${m.toFixed(1)} · median ${s[Math.floor(s.length / 2)]} · p90 ${s[Math.floor(s.length * 0.9)]} · max ${s[s.length - 1]} · ` + Object.entries(hist).map(([k, v]) => `${k}:${Math.round((v / xs.length) * 100)}%`).join(' ')
}
console.log(`${fxs.length} matches`)
console.log(`first half  ${dist(h1)}`)
console.log(`second half ${dist(h2)}`)
for (const [g, xs] of Object.entries(byGoals).sort()) console.log(`  second half with ${g} goals (${xs.length}): ${dist(xs)}`)
console.log(`second halves of 7+: ${long.length} (${Math.round((long.length / fxs.length) * 100)}%)`)
console.log(long.slice(0, 10).join('\n'))
