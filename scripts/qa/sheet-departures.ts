// Players who leave a club leave its team sheets: transfers, loans and their returns, releases, contracts running out
// at the end of a season; and saves from before 4.2 are repaired on load. npx tsx scripts/qa/sheet-departures.ts <save>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave } from '../../src/engine/world/migrate'
import { setPlayerClub } from '../../src/engine/world/roster'
import type { World } from '../../src/domain/types'

let fails = 0
const ok = (c: boolean, what: string) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`) }
const raw = fs.readFileSync(process.argv[2])
const stale = (w: World) => Object.values(w.clubs).filter((c) => !c.national).flatMap((c) => [...c.sheets, ...Object.values(c.matchSheets || {})].flatMap((s) => [...s.lineup, ...s.bench].filter((id) => id && w.players[id]?.clubId !== c.id).map((id) => `${c.short}:${w.players[id]?.name}`)))

const before: World = deserialize(raw)
const was = stale(before)
console.log(`     before repair: ${was.length} stale sheet entries${was.length ? ` (${was.slice(0, 6).join(', ')}${was.length > 6 ? '…' : ''})` : ''}`)
const w: World = deserialize(raw)
const rep = migrateSave(w)
ok(stale(w).length === 0, `after load: no player on a sheet of a club he has left (repairs counted: ${rep.repaired})`)
// national teams keep their call-ups
const nt = Object.values(w.clubs).find((c) => c.national && c.sheets[0]?.lineup.some(Boolean))
if (nt) ok(nt.sheets[0].lineup.filter(Boolean).length === Object.values(before.clubs[nt.id].sheets[0].lineup).filter(Boolean).length, `${nt.name}'s sheet keeps its call-ups`)

// every kind of move: the leaving club's sheets let him go, the others are untouched
const user = w.clubs[w.userClubId]
const sheet = user.sheets.find((s) => s.id === user.activeSheet)!
const [a, b] = sheet.lineup.filter(Boolean)
const other = Object.values(w.clubs).find((c) => !c.national && c.id !== user.id && c.sheets.length)!
setPlayerClub(w, w.players[a], other.id) // a transfer or a loan out
ok(!sheet.lineup.includes(a) && !user.sheets.some((s) => s.lineup.includes(a) || s.bench.includes(a)), `${w.players[a].name} moved to ${other.short}: off every ${user.short} sheet`)
setPlayerClub(w, w.players[b], 0) // a contract running out, a release
ok(!sheet.lineup.includes(b), `${w.players[b].name} a free agent: off the sheet, his slot open (${sheet.lineup.filter((x) => !x).length} open)`)
console.log(fails ? `${fails} FAILED` : 'all ok')
process.exit(fails ? 1 : 0)
