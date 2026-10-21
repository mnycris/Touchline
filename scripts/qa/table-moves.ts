// League tables' movement arrows: compared with the table before the latest matchday, which must be the real one;
// none at the start of a season. npx tsx scripts/qa/table-moves.ts <save>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave } from '../../src/engine/world/migrate'
import { previousPositions, sortTable, applyResultToTable, emptyRow } from '../../src/engine/competitions/tables'
import type { Competition, World } from '../../src/domain/types'

let fails = 0
const ok = (c: boolean, what: string) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`) }
const w: World = deserialize(fs.readFileSync(process.argv[2]))
migrateSave(w)
const md = (n: string) => Number(n.match(/(\d+)\s*$/)?.[1])
// rebuild a table from scratch up to (and not including) a matchday: the ground truth for "before the latest matchday"
function tableBefore(c: Competition, upTo: number) {
  const copy: Competition = { ...c, table: c.table!.map((r) => emptyRow(r.clubId, r.group)) }
  for (const id of c.fixtures) { const f = w.fixtures[id]; if (f?.played && f.result && !f.tieId && md(f.roundName) < upTo) applyResultToTable(copy, f) }
  return new Map(sortTable(w, copy).map((r, i) => [r.clubId, i + 1]))
}
let checked = 0
for (const c of Object.values(w.competitions).filter((c) => c.season === w.season && c.table?.length && (c.format === 'league' || c.format === 'uefa'))) {
  const prev = previousPositions(w, c)
  const last = Math.max(0, ...c.fixtures.map((id) => w.fixtures[id]).filter((f) => f?.played && !f.tieId).map((f) => md(f.roundName)).filter((n) => n > 0))
  if (last < 2) { ok(!prev, `${c.short}: matchday ${last}, no arrows`); continue }
  // postponed games from earlier matchdays played later are counted as already in: the truth rebuilt the same way
  const truth = tableBefore(c, last)
  const late = c.fixtures.map((id) => w.fixtures[id]).filter((f) => f?.played && !f.tieId && md(f.roundName) < last).length
  const same = !!prev && [...truth].every(([id, pos]) => prev.get(id) === pos)
  if (!same) {
    const diff = [...truth].filter(([id, pos]) => prev?.get(id) !== pos).slice(0, 3).map(([id, pos]) => `${w.clubs[id].short} ${prev?.get(id)} vs ${pos}`)
    console.log(`     ${c.short}: differs from a rebuild (${diff.join(', ')}); ${late} games from earlier matchdays`)
  }
  ok(same, `${c.short}: before matchday ${last}, every position matches a rebuild of the table`)
  checked++
  if (checked >= 8) break
}
// a fresh season: matchday 1 gives no arrows
const lg = Object.values(w.competitions).find((c) => c.season === w.season && c.format === 'league')!
const fresh: Competition = { ...lg, table: lg.table!.map((r) => emptyRow(r.clubId)), fixtures: lg.fixtures.filter((id) => md(w.fixtures[id].roundName) === 1) }
for (const id of fresh.fixtures) if (w.fixtures[id].played) applyResultToTable(fresh, w.fixtures[id])
ok(!previousPositions(w, fresh), `${lg.short} after matchday 1 only: no arrows`)
console.log(fails ? `${fails} FAILED` : 'all ok')
process.exit(fails ? 1 : 0)
