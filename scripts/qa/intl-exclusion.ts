// The game world's excluded national teams: kept out of competitive international football, with the competitions
// still whole (groups, fixtures, qualification, the tournament draw). npx tsx scripts/qa/intl-exclusion.ts <save> [until]
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave } from '../../src/engine/world/migrate'
import { advance, afterMatch, worldRng } from '../../src/engine/world/advance'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { EXCLUDED_NATIONS } from '../../src/engine/world/international'
import { diffDays } from '../../src/domain/dates'
import type { World } from '../../src/domain/types'

const w: World = deserialize(fs.readFileSync(process.argv[2]))
const until = process.argv[3]
let fails = 0
const ok = (c: boolean, what: string) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`) }
const before = Object.values(w.competitions).filter((c) => c.format === 'intl' && c.key !== 'INTF' && c.season === w.season).map((c) => `${c.key}: ${c.clubs.length} sides, ${c.fixtures.length} fixtures`)
migrateSave(w)
const out = new Set([...EXCLUDED_NATIONS].map((n) => w.intl?.nt[n]).filter(Boolean) as number[])
console.log(`${w.date} · excluded: ${[...EXCLUDED_NATIONS].join(', ')} · before: ${before.join('; ')}`)

function check(tag: string) {
  for (const c of Object.values(w.competitions)) {
    if (c.format !== 'intl' || c.key === 'INTF' || c.season < w.season - 1) continue
    const played = c.fixtures.some((id) => { const f = w.fixtures[id]; return f?.played && (out.has(f.home) || out.has(f.away)) })
    if (played) { console.log(`     ${c.key}-${c.season}: already played with an excluded side, finishes as drawn`); continue }
    ok(!c.clubs.some((id) => out.has(id)) && !Object.values(c.groups || {}).some((g) => g.some((id) => out.has(id))) && !(c.table || []).some((r) => out.has(r.clubId)), `${tag} ${c.key}-${c.season}: no excluded side (${c.clubs.length} sides)`)
    ok(c.fixtures.every((id) => !!w.fixtures[id]), `${tag} ${c.key}-${c.season}: every fixture exists (${c.fixtures.length})`)
    const sizes = Object.values(c.groups || {}).map((g) => g.length)
    if (sizes.length) ok(sizes.every((n) => n >= 3), `${tag} ${c.key}-${c.season}: groups of ${[...new Set(sizes)].sort().join('/')}`)
    const ids = new Set(c.fixtures.flatMap((id) => [w.fixtures[id]?.home, w.fixtures[id]?.away]))
    ok(![...ids].some((id) => id != null && out.has(id)), `${tag} ${c.key}-${c.season}: no fixture with an excluded side`)
  }
}
check('migrated')
// the excluded sides still play friendlies; their former opponents have games on the freed dates
const fr = Object.values(w.fixtures).filter((f) => !f.played && f.compId.startsWith('INTF') && (out.has(f.home) || out.has(f.away)))
console.log(`     friendlies ahead for the excluded sides: ${fr.length}`)

if (until) {
  let guard = 0
  while (w.date < until && guard++ < 3000) {
    const r = advance(w, Math.max(1, Math.min(60, diffDays(until, w.date))))
    if (r.stop === 'match' && r.fixture) afterMatch(w, r.fixture, simulateFixture(w, r.fixture), worldRng(w))
    for (const m of w.inbox) m.read = true
  }
  check(`by ${w.date}`)
  for (const c of Object.values(w.competitions).filter((x) => ['EURO', 'WC'].includes(x.key) && x.season >= w.season - 1)) {
    ok(!c.clubs.some((id) => out.has(id)), `${c.name} ${c.season} drawn: ${c.clubs.length} sides, none excluded`)
    ok(c.fixtures.length > 0 && c.fixtures.every((id) => !!w.fixtures[id]), `${c.name}: ${c.fixtures.length} fixtures, all exist`)
  }
}
console.log(fails ? `${fails} FAILED` : 'all ok')
process.exit(fails ? 1 : 0)
