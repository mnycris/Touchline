// One tactical setting taken apart: a club's league season run at two or more values of it (everything else as the
// career starts), on the same luck, read off the engine's own ledger. Where the ball is won and lost, counters for and
// against, entries and time in the final third, and the chances by how they came, ours and theirs. Shows which side of
// a trade-off a setting pays and which it collects.
// npx tsx scripts/qa/lever-anatomy.ts <club> <key> <value> <value> [...]   e.g. Barcelona lineHeight 75 45
// env R=repeats (default 4); text values (mentality, buildUp ...) are taken as they are. The key `formation` moves the
// career XI into each shape the way the Tactics screen does (roles reset to their defaults).
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import type { TeamSheet } from '../../src/domain/types'
import { createSim } from '../../src/engine/world/matchRunner'
import type { Ledger } from '../../src/engine/match/ledger'
import type { Player } from '../../src/domain/types'
import { defaultRoles } from '../../src/engine/match/selection'
import { formationOf } from '../../src/domain/constants'
import { posRating } from '../../src/domain/ratings'

// as the Tactics screen's formation picker (ui/screens/Match.tsx assignToFormation)
function assign(players: Player[], formationId: string): number[] {
  const f = formationOf(formationId)
  const left = [...players]
  const out: number[] = new Array(f.slots.length).fill(0)
  const order = f.slots.map((_, i) => i).sort((a, b) => (f.slots[a].pos === 'GK' ? -1 : 0) - (f.slots[b].pos === 'GK' ? -1 : 0))
  for (const i of order) {
    let best = -1, bs = -1e9
    left.forEach((p, k) => {
      if ((f.slots[i].pos === 'GK') !== (p.positions[0] === 'GK') && left.some((q) => (f.slots[i].pos === 'GK') === (q.positions[0] === 'GK'))) return
      const s = posRating(p, f.slots[i].pos)
      if (s > bs) { bs = s; best = k }
    })
    if (best >= 0) { out[i] = left[best].id; left.splice(best, 1) }
  }
  return out.filter(Boolean)
}

const [CLUB = 'Barcelona', KEY = 'lineHeight', ...VALS] = process.argv.slice(2)
const R = Number(process.env.R || 4)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes(CLUB))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as never, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as never, seed: 11 })
w.flags.assistantSubs = true
const club = w.clubs[w.userClubId]
const comp = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club.id))!
const fxs = comp.fixtures.map((id) => w.fixtures[id]).filter((x) => x.home === club.id || x.away === club.id)
const base: TeamSheet = JSON.parse(JSON.stringify(club.sheets[0]))
console.log(`${club.name}: ${KEY} ${VALS.join(' vs ')} (career set-up ${JSON.stringify(base.tactics)}), ${fxs.length * R} matches each`)

const add = (a: Record<string, number>, k: string, v: number) => { a[k] = (a[k] || 0) + v }
for (const val of VALS) {
  const v = /^[-+]?\d+(\.\d+)?$/.test(val) ? Number(val) : val
  const lineup = KEY === 'formation' ? assign(base.lineup.map((id) => w.players[id]), String(v)) : base.lineup
  const sheet: TeamSheet = KEY === 'formation' ? { ...base, formation: String(v), lineup, roles: defaultRoles(w, String(v), lineup) } : { ...base, tactics: { ...base.tactics, [KEY]: v } }
  const m: Record<string, number> = {}
  const byUs: Record<string, [number, number]> = {}, byThem: Record<string, [number, number]> = {}
  let n = 0
  for (let k = 0; k < R; k++) for (const fx of fxs) {
    w.meta.seed = 9000 + k * 173
    club.sheets[0] = sheet
    const us = fx.home === club.id ? 0 : 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim: any = createSim(w, fx, true, false)
    const r = sim.runToEnd()
    n++
    add(m, 'pts', r.score[us] > r.score[1 - us] ? 3 : r.score[us] === r.score[1 - us] ? 1 : 0)
    add(m, 'gf', r.score[us]); add(m, 'ga', r.score[1 - us])
    const a: Ledger = sim.sides[us].led, b: Ledger = sim.sides[1 - us].led
    add(m, 'poss', r.stats[us].possession)
    add(m, 'xgF', a.xg); add(m, 'xgA', b.xg); add(m, 'shF', a.shots); add(m, 'shA', b.shots)
    for (let i = 0; i < 3; i++) { add(m, `won${i}`, a.won[i]); add(m, `lost${i}`, a.lost[i]) }
    add(m, 'quickWon', a.quickWon); add(m, 'ctrF', a.counters); add(m, 'ctrA', b.counters)
    add(m, 'entF', a.entries[0] + a.entries[1] + a.entries[2]); add(m, 'entA', b.entries[0] + b.entries[1] + b.entries[2])
    add(m, 'boxF', a.boxEntries); add(m, 'boxA', b.boxEntries)
    add(m, 'tFinF', a.tFinal); add(m, 'tFinA', b.tFinal); add(m, 'secF', a.sec); add(m, 'secA', b.sec)
    add(m, 'longF', a.long); add(m, 'longOkF', a.longOk); add(m, 'passF', a.passes); add(m, 'passOkF', a.passesOk)
    add(m, 'thrA', b.through); add(m, 'thrOkA', b.throughOk)
    for (const [kk, [s, x]] of Object.entries(a.by)) { const t = (byUs[kk] ||= [0, 0]); t[0] += s; t[1] += x }
    for (const [kk, [s, x]] of Object.entries(b.by)) { const t = (byThem[kk] ||= [0, 0]); t[0] += s; t[1] += x }
  }
  const f = (k: string, d = 2) => (m[k] / n).toFixed(d)
  const by = (o: Record<string, [number, number]>) => Object.entries(o).sort((x, y) => y[1][1] - x[1][1]).slice(0, 7).map(([kk, [s, x]]) => `${kk} ${(s / n).toFixed(1)}/${(x / n).toFixed(2)}`).join(', ')
  console.log(`\n${KEY} ${val}: ppg ${f('pts')} · goals ${f('gf')}-${f('ga')} · xG ${f('xgF')}-${f('xgA')} · shots ${f('shF', 1)}-${f('shA', 1)} · poss ${f('poss', 0)}%`)
  console.log(`  ball won own/mid/final ${f('won0', 1)}/${f('won1', 1)}/${f('won2', 1)} (within 8s ${f('quickWon', 1)}) · lost own/mid/final ${f('lost0', 1)}/${f('lost1', 1)}/${f('lost2', 1)}`)
  console.log(`  counters for ${f('ctrF', 1)} against ${f('ctrA', 1)} · final-third entries ${f('entF', 1)}-${f('entA', 1)} · box entries ${f('boxF', 1)}-${f('boxA', 1)} · seconds in the final third ${f('tFinF', 0)}-${f('tFinA', 0)} of ${f('secF', 0)}-${f('secA', 0)} on the ball`)
  console.log(`  passes ${f('passF', 0)} (${((m.passOkF / m.passF) * 100).toFixed(0)}%) · long ${f('longF', 1)} (${((m.longOkF / Math.max(1, m.longF)) * 100).toFixed(0)}%) · their through balls ${f('thrA', 1)} (${((m.thrOkA / Math.max(1, m.thrA)) * 100).toFixed(0)}% found)`)
  console.log(`  our chances (shots/xG per match): ${by(byUs)}`)
  console.log(`  theirs: ${by(byThem)}`)
}
