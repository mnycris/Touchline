import type { Club, Competition, Player, Position, SlotRole, TeamSheet, TeamTactics, World } from '../../domain/types'
import { DEFAULT_TACTICS, FORMATIONS, POS_GROUP, VISION_TACTICS, formationOf } from '../../domain/constants'
import { A } from '../../domain/types'
import { bestRole, posRating } from '../../domain/ratings'
import { rosterOf } from '../world/roster'

export function squadOf(w: World, clubId: number): Player[] {
  return [...rosterOf(w, clubId)]
}

export function isSuspendedFor(p: Player, comp?: Competition): boolean {
  if (!p.suspensions.length) return false
  if (!comp) return p.suspensions.some((s) => s.scope === 'all')
  const scope = comp.format === 'league' ? 'league' : comp.format === 'uefa' ? 'continental' : 'cup'
  return p.suspensions.some((s) => s.scope === 'all' || (s.scope === scope && (!s.compId || s.compId === comp.key || s.compId === comp.id)))
}

export function isAvailable(w: World, p: Player, comp?: Competition): boolean {
  if (p.injury) return false
  if (isSuspendedFor(p, comp)) return false
  if (p.intlDuty) return false
  return true
}

function selectionScore(w: World, p: Player, pos: Position, rotate: number): number {
  let r = posRating(p, pos)
  const fit = p.fitness
  // a player who starts short of full fitness fades badly late on: freshness is worth real rating points
  if (fit < 95) r -= (95 - fit) * (0.24 + rotate * 0.2)
  r += (p.sharpness - 60) * 0.03
  return r
}

/** Greedy + local-swap optimisation of a formation's XI. */
export function pickXI(w: World, players: Player[], formationId: string, rotate = 0): number[] {
  const f = formationOf(formationId)
  const slots = f.slots
  // score every player once per distinct slot position
  const idx = new Map(players.map((p, i) => [p.id, i]))
  const table = new Map<Position, Float64Array>()
  for (const s of slots) {
    if (table.has(s.pos)) continue
    const arr = new Float64Array(players.length)
    players.forEach((p, i) => { arr[i] = (s.pos === 'GK') !== (p.positions[0] === 'GK') ? -1e9 : selectionScore(w, p, s.pos, rotate) })
    table.set(s.pos, arr)
  }
  const sc = (id: number, pos: Position) => table.get(pos)![idx.get(id)!]
  const order = slots.map((s, i) => i).sort((a, b) => priority(slots[a].pos) - priority(slots[b].pos))
  const used = new Set<number>()
  const xi: number[] = new Array(slots.length).fill(0)
  for (const i of order) {
    const arr = table.get(slots[i].pos)!
    let best = -1, bs = -1e8
    for (let k = 0; k < players.length; k++) {
      if (arr[k] > bs && !used.has(players[k].id)) { bs = arr[k]; best = k }
    }
    if (best >= 0) { xi[i] = players[best].id; used.add(players[best].id) }
  }
  // local improvement by swapping pairs of outfield slots
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = xi[i], b = xi[j]
        if (!a || !b) continue
        const cur = sc(a, slots[i].pos) + sc(b, slots[j].pos)
        const sw = sc(a, slots[j].pos) + sc(b, slots[i].pos)
        if (sw > cur + 0.5) { xi[i] = b; xi[j] = a }
      }
    }
    // try bench players into each slot
    const inXI = new Set(xi)
    for (let i = 1; i < slots.length; i++) {
      const cur = xi[i]
      const arr = table.get(slots[i].pos)!
      const curS = cur ? arr[idx.get(cur)!] : -1e9
      for (let k = 0; k < players.length; k++) {
        const p = players[k]
        if (inXI.has(p.id) || p.positions[0] === 'GK') continue
        if (arr[k] > curS + 0.5) {
          inXI.delete(cur)
          xi[i] = p.id
          inXI.add(p.id)
          break
        }
      }
    }
  }
  return xi
}

function priority(pos: Position) {
  const pr: Record<string, number> = { GK: 0, CB: 1, ST: 2, CDM: 3, RB: 4, LB: 4, CM: 5, CAM: 6, RW: 7, LW: 7, RM: 8, LM: 8, RWB: 4, LWB: 4, CF: 3 }
  return pr[pos] ?? 9
}

export function pickBench(w: World, players: Player[], xi: number[], size = 9): number[] {
  const rest = players.filter((p) => !xi.includes(p.id)).sort((a, b) => b.ovr - a.ovr)
  const bench: number[] = []
  const gk = rest.find((p) => p.positions[0] === 'GK')
  if (gk) bench.push(gk.id)
  const need = ['DEF', 'DEF', 'MID', 'MID', 'ATT', 'ATT']
  for (const g of need) {
    const p = rest.find((x) => !bench.includes(x.id) && POS_GROUP[x.positions[0]] === g)
    if (p && bench.length < size) bench.push(p.id)
  }
  for (const p of rest) if (bench.length < size && !bench.includes(p.id) && p.positions[0] !== 'GK') bench.push(p.id)
  return bench
}

export function defaultRoles(w: World, formationId: string, xi: number[]): SlotRole[] {
  const f = formationOf(formationId)
  return f.slots.map((s, i) => {
    const p = w.players[xi[i]]
    const role = p ? bestRole(p, s.pos) : ''
    return { role, focus: defaultFocus(role), instructions: {} }
  })
}

function defaultFocus(role: string) {
  if (/Playmaker|Ball-Playing|False 9/.test(role)) return role.includes('Deep') ? 'Build-Up' : 'Balanced'
  if (/Forward|Poacher|Shadow|Inside|Attacking/.test(role)) return 'Attack'
  if (/Holding|Centre-Half|Defender|Goalkeeper|Fullback/.test(role)) return 'Defend'
  return 'Balanced'
}

export function setPieceTakers(w: World, xi: number[]) {
  const ps = xi.map((id) => w.players[id]).filter(Boolean)
  const by = (f: (p: Player) => number) => [...ps].sort((a, b) => f(b) - f(a))[0]?.id || 0
  const captain = by((p) => p.intlRep * 6 + p.ovr + Math.min(33, ageYears(w, p)) * 0.8 + p.hidden.professionalism * 0.05)
  const vice = [...ps].filter((p) => p.id !== captain).sort((a, b) => b.intlRep * 6 + b.ovr - (a.intlRep * 6 + a.ovr))[0]?.id || 0
  return {
    captain, viceCaptain: vice,
    penalties: by((p) => p.attrs[A.penalties] + p.attrs[A.composure] * 0.3),
    freeKicks: by((p) => p.attrs[A.fkAccuracy] + p.attrs[A.curve] * 0.5),
    cornersL: by((p) => p.attrs[A.crossing] + p.attrs[A.curve] * 0.5),
    cornersR: by((p) => p.attrs[A.crossing] + p.attrs[A.curve] * 0.5 + (p.foot === 'R' ? 3 : 0)),
  }
}

function ageYears(w: World, p: Player) {
  return Number(w.date.slice(0, 4)) - Number(p.dob.slice(0, 4))
}

export function tacticsForManager(vision: string, formation: string): TeamTactics {
  const base = { ...DEFAULT_TACTICS, ...(VISION_TACTICS[vision] || {}) }
  if (formation.startsWith('5') || formation.startsWith('3')) base.width = Math.max(base.width, 60)
  return base
}

export function buildSheet(w: World, club: Club, formationId: string, tactics: TeamTactics, opts: { comp?: Competition; rotate?: number; id?: string; name?: string } = {}): TeamSheet {
  const squad = squadOf(w, club.id).filter((p) => isAvailable(w, p, opts.comp))
  const xi = pickXI(w, squad, formationId, opts.rotate || 0)
  const bench = pickBench(w, squad, xi)
  const sp = setPieceTakers(w, xi)
  return {
    id: opts.id || 'first', name: opts.name || 'First Team', formation: formationId, lineup: xi, bench,
    roles: defaultRoles(w, formationId, xi), tactics, ...sp,
  }
}

/** Refreshes an AI club's sheet before a match (injuries, fatigue, rotation for cups). */
export function aiMatchSheet(w: World, club: Club, comp?: Competition): TeamSheet {
  const mgr = w.managers[club.managerId]
  const formation = formationOf(mgr?.formation || '4-3-3 Holding').id
  const base = club.sheets.find((s) => s.id === club.activeSheet) || club.sheets[0]
  const tactics = base?.tactics || tacticsForManager(mgr?.vision || 'Balanced', formation)
  const rotate = comp && (comp.format === 'cup' && comp.key !== 'FACUP' ? 1 : comp.format === 'cup' ? 0.6 : 0)
  return buildSheet(w, club, formation, tactics, { comp, rotate: rotate || 0 })
}

/** Validate a user sheet against current availability; auto-fill gaps with the best alternative. */
export function validateSheet(w: World, club: Club, sheet: TeamSheet, comp?: Competition): { sheet: TeamSheet; issues: string[] } {
  const issues: string[] = []
  const f = formationOf(sheet.formation)
  const squad = squadOf(w, club.id)
  const avail = new Set(squad.filter((p) => isAvailable(w, p, comp)).map((p) => p.id))
  const lineup = [...sheet.lineup]
  const used = new Set<number>()
  for (let i = 0; i < f.slots.length; i++) {
    const id = lineup[i]
    if (id && avail.has(id) && !used.has(id)) { used.add(id); continue }
    const p = w.players[id]
    if (p) issues.push(`${p.name} is unavailable${p.injury ? ` (${p.injury.type})` : isSuspendedFor(p, comp) ? ' (suspended)' : ''}`)
    let best = 0, bs = -1e9
    for (const q of squad) {
      if (!avail.has(q.id) || used.has(q.id) || lineup.includes(q.id) && lineup.indexOf(q.id) !== i) continue
      if ((f.slots[i].pos === 'GK') !== (q.positions[0] === 'GK')) continue
      const s = posRating(q, f.slots[i].pos) - (100 - q.fitness) * 0.1
      if (s > bs) { bs = s; best = q.id }
    }
    lineup[i] = best
    if (best) used.add(best)
  }
  const bench = sheet.bench.filter((id) => avail.has(id) && !used.has(id))
  for (const p of squad.sort((a, b) => b.ovr - a.ovr)) {
    if (bench.length >= 9) break
    if (avail.has(p.id) && !used.has(p.id) && !bench.includes(p.id)) bench.push(p.id)
  }
  const out = { ...sheet, lineup, bench }
  if (!lineup.includes(out.captain)) Object.assign(out, { captain: setPieceTakers(w, lineup).captain })
  for (const k of ['penalties', 'freeKicks', 'cornersL', 'cornersR'] as const) {
    if (!lineup.includes(out[k])) out[k] = setPieceTakers(w, lineup)[k]
  }
  return { sheet: out, issues }
}

export { FORMATIONS }
