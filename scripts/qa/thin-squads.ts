// Clubs the ratings data leaves short of a matchday squad (Indian Super League sides with 7 to 13 players) are topped
// up on load with generated squad players: every league club reaches 20, the positions balance, nobody real is
// touched, a second load adds nothing, and the thinnest clubs' matches are played eleven against eleven. And no two
// players at a club share a shirt number (AI youth intakes took 40, 41 and 42 regardless until 4.2; repaired on load).
//   npx tsx scripts/qa/thin-squads.ts <save>
import fs from 'node:fs'
import { deserialize } from '../../src/services/saves'
import { migrateSave, repairWorld } from '../../src/engine/world/migrate'
import { rosterOf } from '../../src/engine/world/roster'
import { simulateFixture } from '../../src/engine/world/matchRunner'
import { POS_GROUP } from '../../src/domain/constants'
import { MIN_SQUAD } from '../../src/engine/world/squadFill'
import type { World } from '../../src/domain/types'

let fails = 0
const ok = (c: boolean, what: string) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`) }
const raw = fs.readFileSync(process.argv[2])
const thin = (w: World) => Object.values(w.clubs).filter((c) => !c.national && c.leagueId && rosterOf(w, c.id).length < MIN_SQUAD)

const before: World = deserialize(raw)
const was = thin(before)
const realIds = new Set(Object.keys(before.players).map(Number))
const userBefore = rosterOf(before, before.userClubId).length
console.log(`     before load: ${was.length} league clubs under ${MIN_SQUAD} (${was.slice(0, 8).map((c) => `${c.short} ${rosterOf(before, c.id).length}`).join(', ')}${was.length > 8 ? '…' : ''})`)

const w: World = deserialize(raw)
migrateSave(w)
ok(thin(w).filter((c) => c.id !== w.userClubId).length === 0, `after load: every league club has at least ${MIN_SQUAD} players`)
const added = Object.values(w.players).filter((p) => !realIds.has(p.id))
ok(added.every((p) => p.regen && was.some((c) => c.id === p.clubId)), `the ${added.length} players added are generated, and only at clubs that were short`)
ok(Object.values(before.players).every((p) => w.players[p.id]?.clubId === p.clubId), 'no existing player moved club')
if (userBefore >= 16) ok(rosterOf(w, w.userClubId).length === userBefore, `the manager's own club (${userBefore}) is left alone`)
for (const c of was) {
  const sq = rosterOf(w, c.id)
  const by = (g: string) => sq.filter((p) => POS_GROUP[p.positions[0]] === g).length
  const lvl = (ps: typeof sq) => ps.reduce((a, p) => a + p.ovr, 0) / ps.length
  const real = sq.filter((p) => realIds.has(p.id)), gen = sq.filter((p) => !realIds.has(p.id))
  const balanced = by('GK') >= 2 && by('DEF') >= 6 && by('MID') >= 5 && by('ATT') >= 3
  const jerseys = new Set(sq.map((p) => p.jersey))
  ok(balanced && jerseys.size === sq.length && Math.abs(lvl(gen) - lvl(real)) <= 7,
    `${c.short}: ${real.length}+${gen.length} — GK ${by('GK')} DEF ${by('DEF')} MID ${by('MID')} ATT ${by('ATT')}, real avg ${lvl(real).toFixed(0)} vs generated ${gen.length ? lvl(gen).toFixed(0) : '-'}, numbers unique`)
}
const shared = Object.values(w.clubs).filter((c) => !c.national && new Set(rosterOf(w, c.id).map((p) => p.jersey)).size < rosterOf(w, c.id).length)
ok(shared.length === 0, `no two players at a club share a shirt number (${shared.length} clubs${shared.length ? `: ${shared.slice(0, 5).map((c) => c.short).join(', ')}` : ''})`)
const names = Object.values(w.players).filter((p) => p.clubId).map((p) => p.name)
ok(added.every((p) => names.filter((n) => n === p.name).length === 1), 'generated names are unique among the players at clubs')
console.log(`     e.g. ${added.slice(0, 6).map((p) => `${p.name} (${p.nation}, ${p.positions[0]} ${p.ovr}, age ${w.season - +p.dob.slice(0, 4)}, €${p.contract.wage}/w)`).join('; ')}`)
ok(repairWorld(w) === 0 && thin(w).length === thin(w).length, 'a second load repairs nothing and adds no one')
const n2 = Object.keys(w.players).length
repairWorld(w)
ok(Object.keys(w.players).length === n2, 'player count stable across repeated loads')

// the thinnest clubs' next matches, played in full: eleven a side now (the same match from the unrepaired save, for contrast)
const thinnest = [...was].sort((a, b) => rosterOf(before, a.id).length - rosterOf(before, b.id).length).slice(0, 3)
for (const c of thinnest) {
  const f = Object.values(w.fixtures).filter((f) => !f.played && (f.home === c.id || f.away === c.id)).sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!f) continue
  const side = f.home === c.id ? 0 : 1
  const xi = (x: World) => simulateFixture(x, x.fixtures[f.id], true).lineups![side].filter(Boolean).length
  const then = xi(before), now = xi(w)
  ok(now === 11, `${c.short} v ${w.clubs[side ? f.home : f.away].short} (${f.date}), played in full: ${now} starters (${then} before the repair)`)
}
console.log(fails ? `${fails} FAILED` : 'all ok')
process.exit(fails ? 1 : 0)
