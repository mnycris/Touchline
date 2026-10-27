// Calibrates the rating model's par: the rating points an average player earns per 90, part by part (goal threat,
// chance creation, passing, carrying, defending, duels, goalkeeping, discipline), in each position group and in each
// role there, goals and assists aside (those are what lift a performance above par). Every role gets measured: in each
// match two or three players a side are given another of their position's roles, so the rarer ones (the AI hardly
// ever picks a Shadow Striker) are seen in ordinary sides too. A role seen too little leans on its group's numbers.
// npx tsx scripts/qa/rating-par.ts [matches=1500] [--dry]  → writes src/engine/match/ratingPar.ts
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { RatingPart } from '../../src/domain/types'
import { ROLES, ROLE_GROUP, formationOf } from '../../src/domain/constants'
import { Rng } from '../../src/domain/rng'
import { createSim } from '../../src/engine/world/matchRunner'
import { mainSheet } from '../../src/engine/match/selection'
import { GAIN, PARTS, RG_LIST, RP, type RG } from '../../src/engine/match/rating'

const N = Number(process.argv.find((a) => /^\d+$/.test(a)) || 1500)
const DRY = process.argv.includes('--dry')
/** how many player-matches a role's own numbers count as against its group's */
const SHRINK = 40
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes('Arsenal'))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const fx = Object.values(w.fixtures).filter((f) => !f.userInvolved && ['L13', 'L53', 'L19', 'L31', 'L16'].includes(w.competitions[f.compId]?.key || '')).slice(0, N)
const rng = new Rng(77)
// per key (group, or group|role): summed per-90 parts and how many player-matches
const acc: Record<string, { n: number; s: number[] }> = {}
Object.assign(RP, { goal: 0, goalXgMul: 0, assist: 0 })
for (const f of fx) {
  // two or three players a side in another of their position's roles, for this match
  const restore: (() => void)[] = []
  for (const id of [f.home, f.away]) {
    const sheet = mainSheet(w.clubs[id])
    const slots = formationOf(sheet.formation).slots
    const k = 2 + Math.floor(rng.next() * 2)
    for (let j = 0; j < k; j++) {
      const i = 1 + Math.floor(rng.next() * 10)
      const defs = ROLES[ROLE_GROUP[slots[i].pos]] || []
      if (!defs.length || !sheet.roles[i]) continue
      const was = sheet.roles[i]
      const def = defs[Math.floor(rng.next() * defs.length)]
      sheet.roles[i] = { ...was, role: def.name, focus: def.focuses[0] }
      restore.push(() => { sheet.roles[i] = was })
    }
  }
  const sim: any = createSim(w, f, false, true)
  sim.runToEnd()
  for (const r of restore.reverse()) r()
  for (const s of sim.sides) for (const l of [...s.lps, ...s.bench]) {
    const mins = l.st.mins
    if (mins < 60) continue
    // players who spent (almost) the whole time in one group
    const g = (Object.entries(l.gm as Record<RG, number>).find(([, m]) => m >= mins * 0.9) || [])[0] as RG | undefined
    if (!g) continue
    const per90 = l.rc.map((v: number) => (v / GAIN[g] / mins) * 90)
    for (const key of [g, `${g}|${l.role}`]) {
      const e = (acc[key] ||= { n: 0, s: PARTS.map(() => 0) })
      e.n++
      per90.forEach((v: number, i: number) => { e.s[i] += v })
    }
  }
}
const mean = (key: string) => acc[key].s.map((v) => v / acc[key].n)
const out: Record<string, Record<string, number>> = {}
const r3 = (v: number) => Math.round(v * 1000) / 1000
console.log(`${fx.length} matches`)
for (const g of RG_LIST) {
  if (!acc[g]) continue
  const gm = mean(g)
  out[g] = Object.fromEntries(PARTS.map((p, i) => [p, r3(gm[i])]).filter(([, v]) => v))
  console.log(`${g.padEnd(32)} n=${String(acc[g].n).padStart(5)}  total ${gm.reduce((a, b) => a + b, 0).toFixed(2)}  ${PARTS.map((p, i) => `${p} ${gm[i].toFixed(2)}`).join(' ')}`)
  for (const key of Object.keys(acc).filter((k) => k.startsWith(`${g}|`)).sort()) {
    const n = acc[key].n, rm = mean(key)
    // a role seen a little leans on its group
    const v = rm.map((x, i) => (n * x + SHRINK * gm[i]) / (n + SHRINK))
    out[key] = Object.fromEntries(PARTS.map((p, i) => [p, r3(v[i])]).filter(([, x]) => x))
    console.log(`  ${key.padEnd(30)} n=${String(n).padStart(5)}  total ${v.reduce((a, b) => a + b, 0).toFixed(2)}  ${PARTS.map((p, i) => `${p} ${v[i].toFixed(2)}`).join(' ')}`)
  }
}
if (!DRY) {
  const body = Object.entries(out).map(([k, v]) => `  '${k}': { ${Object.entries(v).map(([p, x]) => `${p}: ${x}`).join(', ')} },`).join('\n')
  fs.writeFileSync('src/engine/match/ratingPar.ts', `// Generated by scripts/qa/rating-par.ts: the rating points an average player earns per 90, part by part, in each
// position group (key: the group) and in each role there (key: group|role), goals and assists aside.
import type { RatingPart } from '../../domain/types'

export const ROLE_PAR: Record<string, Partial<Record<RatingPart, number>>> = {
${body}
}
`)
  console.log('wrote src/engine/match/ratingPar.ts')
}
void (null as unknown as RatingPart)
