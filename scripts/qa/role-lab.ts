// One player, one slot, different roles: how involved he is (touches, chances made, shots, xG), how he rates, and what
// it does to his team, over many league matches on the same luck. For checking that every role plays its part.
// npx tsx scripts/qa/role-lab.ts <club> <player name> <formation> <slot label> <roles comma-separated> [matches=60]
import fs from 'node:fs'
import { createWorld } from '../../src/data/createWorld'
import type { RawDb } from '../../src/data/rawTypes'
import { createSim } from '../../src/engine/world/matchRunner'
import { buildSheet, defaultRoles } from '../../src/engine/match/selection'
import { formationOf } from '../../src/domain/constants'
import { MatchSim } from '../../src/engine/match/engine'
import { GAIN, RP } from '../../src/engine/match/rating'

// where his rating points come from: each award by the line of the engine that made it (the RP terms named there)
const SRC = fs.readFileSync('src/engine/match/engine.ts', 'utf8').split('\n')
const label = (n: number) => {
  const m = SRC[n - 1]?.match(/this\.rp\([^,]+,\s*([^)]*(?:\([^)]*\))?[^)]*)\)/)
  return `${(m ? m[1] : SRC[n - 1]?.trim() || '?').replace(/RP\./g, '').replace(/\s+/g, ' ').slice(0, 42)} @${n}`
}
let subject: any = null
let acts: Record<string, number> = {}
const proto = MatchSim.prototype as any
const rp0 = proto.rp
proto.rp = function (l: any, v: number, part: string) {
  if (l.p.id === subject) {
    const at = Number(new Error().stack?.split('\n')[2]?.match(/engine\.ts:(\d+)/)?.[1] || 0)
    const k = label(at)
    acts[k] = (acts[k] || 0) + v * GAIN[l.g as keyof typeof GAIN]
  }
  return rp0.call(this, l, v, part)
}
void RP

const [CLUB = 'Barcelona', WHO = 'Fermín', FORM = '4-2-3-1 Narrow', SLOT = 'RCAM', ROLES = 'Shadow Striker,Playmaker,Classic 10', NM = '60'] = process.argv.slice(2)
const raw: RawDb = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'))
const w = createWorld(raw, { clubId: raw.clubs.find((c) => c.name.includes(CLUB))!.id, manager: { firstName: 'A', lastName: 'B', nationality: 'England', dob: '1984-03-02', avatar: {} } as any, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: false, aiTransfers: true, startingBudget: 'Default' } as any, seed: 11 })
const club = w.clubs[w.userClubId]
const f = formationOf(FORM)
const si = f.slots.findIndex((s) => s.label === SLOT)
const pl = Object.values(w.players).find((p) => p.clubId === club.id && p.name.includes(WHO))!
const base = buildSheet(w, club, FORM, club.sheets[0].tactics)
// the player in the slot (swapped with whoever had it)
const at = base.lineup.indexOf(pl.id)
if (at >= 0) base.lineup[at] = base.lineup[si]; else base.bench = base.bench.filter((id) => id !== pl.id)
base.lineup[si] = pl.id
base.roles = defaultRoles(w, FORM, base.lineup)
console.log(`${club.name} ${FORM}: ${base.lineup.map((id, i) => `${f.slots[i].label} ${w.players[id].name.split(' ').pop()}${i === si ? '*' : ''}`).join(', ')}`)
const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(club.id))!
const fxs = lg.fixtures.map((id) => w.fixtures[id]).filter((x) => x.home === club.id || x.away === club.id)
const N = Number(NM)
console.log('role'.padEnd(20), 'rating  touch  keyP  shots  xG    xA   boxT  W%   team xG for/against')
subject = pl.id
const breakdown: string[] = []
for (const role of ROLES.split(',')) {
  acts = {}
  const sheet = { ...base, roles: base.roles.map((r, i) => (i === si ? { ...r, role, focus: r.focus } : r)) }
  club.sheets = [{ ...sheet, id: 'first' }]; club.activeSheet = 'first'
  let n = 0, rating = 0, touch = 0, kp = 0, sh = 0, xg = 0, xa = 0, bt = 0, won = 0, tf = 0, ta = 0, mins = 0
  for (let i = 0; i < N; i++) {
    const fx = fxs[i % fxs.length]
    w.meta.seed = 1000 + i
    const sim: any = createSim(w, fx, true, true)
    sim.runToEnd()
    const us = fx.home === club.id ? 0 : 1
    const l = sim.sides[us].lps.find((x: any) => x.p.id === pl.id) || sim.sides[us].bench.find((x: any) => x.p.id === pl.id)
    if (!l || !l.st.started) continue
    n++; mins += l.st.mins; rating += l.st.rating; touch += l.st.touches; kp += l.st.keyPasses; sh += l.st.shots; xg += l.st.xg; xa += l.st.xa; bt += l.st.boxTouches
    if (sim.score[us] > sim.score[1 - us]) won++
    tf += sim.sides[us].stats.xg; ta += sim.sides[1 - us].stats.xg
  }
  const p9 = (v: number) => (v / Math.max(1, mins)) * 90
  breakdown.push(`${role} (total ${p9(Object.values(acts).reduce((a, b) => a + b, 0)).toFixed(2)}):\n` + Object.entries(acts).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 14).map(([k, v]) => `    ${k.padEnd(50)} ${p9(v) >= 0 ? '+' : ''}${p9(v).toFixed(3)}`).join('\n'))
  console.log(role.padEnd(20), (rating / n).toFixed(2).padStart(6), p9(touch).toFixed(0).padStart(6), p9(kp).toFixed(1).padStart(5), p9(sh).toFixed(1).padStart(6), p9(xg).toFixed(2).padStart(5), p9(xa).toFixed(2).padStart(5), p9(bt).toFixed(1).padStart(5), `${Math.round((won / n) * 100)}%`.padStart(4), `   ${(tf / n).toFixed(2)} / ${(ta / n).toFixed(2)}`)
}
console.log('\nwhere his points come from (per 90, the biggest twelve)')
for (const b of breakdown) console.log(b)
