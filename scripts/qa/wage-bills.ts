// wageBills (every club in one pass) against wageBill (one club at a time) on a save: they must agree for every club,
// loans included. npx tsx scripts/qa/wage-bills.ts <save.touchline>
import fs from 'node:fs'
import { gunzipSync, strFromU8 } from 'fflate'
import type { World } from '../../src/domain/types'
import { wageBill, wageBills } from '../../src/engine/world/roster'
const w: World = JSON.parse(strFromU8(gunzipSync(new Uint8Array(fs.readFileSync(process.argv[2])))))
let t = performance.now()
const all = wageBills(w)
const tAll = performance.now() - t
t = performance.now()
let diff = 0, loans = 0, worst = 0
for (const c of Object.values(w.clubs)) {
  const a = wageBill(w, c.id), b = all.get(c.id) || 0
  if (a !== b) { diff++; worst = Math.max(worst, Math.abs(a - b)) }
}
const tOne = performance.now() - t
for (const p of Object.values(w.players)) if (p.loan) loans++
console.log(`${Object.keys(w.clubs).length} clubs, ${loans} players on loan: ${diff} differ (worst by ${worst}); all at once ${tAll.toFixed(0)} ms, one by one ${tOne.toFixed(0)} ms`)
