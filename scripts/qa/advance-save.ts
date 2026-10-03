// Plays an existing save forward headlessly (user matches auto-simulated) and writes it out.
// npx tsx scripts/qa/advance-save.ts <in> <out> <until YYYY-MM-DD>
import fs from 'node:fs'
import { deserialize, serialize } from '../../src/services/saves'
import { advance, afterMatch, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { diffDays } from '../../src/domain/dates'
const [inp, out, until] = process.argv.slice(2)
const w = deserialize(fs.readFileSync(inp))
const t0 = Date.now()
let guard = 0
while (w.date < until && guard++ < 5000) {
  const r = advance(w, Math.max(1, Math.min(400, Math.abs(diffDays(w.date, until)))))
  if (r.stop === 'match' && r.fixture) afterMatch(w, r.fixture, simulateFixture(w, r.fixture), worldRng(w))
  for (const m of w.inbox) m.read = true
}
fs.writeFileSync(out, serialize(w))
console.log(`${w.date} in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`)
