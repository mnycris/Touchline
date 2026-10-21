import type { Club, Competition, Player, Position, SlotRole, TeamSheet, TeamTactics, World } from '../../domain/types'
import { BENCH_SIZE, DEFAULT_TACTICS, FORMATIONS, MENTALITIES, POS_GROUP, ROLE_GROUP, ROLES, VISION_TACTICS, formationOf } from '../../domain/constants'
import { A } from '../../domain/types'
import { bestRole, posRating, roleFit } from '../../domain/ratings'
import { rosterOf } from '../world/roster'
import { nationalSquad } from '../world/international'

export function squadOf(w: World, clubId: number): Player[] {
  // a national team picks from the players it has called up
  if (w.clubs[clubId]?.national) return nationalSquad(w, clubId)
  return [...rosterOf(w, clubId)]
}

export function isSuspendedFor(p: Player, comp?: Competition): boolean {
  if (!p.suspensions.length) return false
  if (!comp) return p.suspensions.some((s) => s.scope === 'all')
  const scope = comp.format === 'league' ? 'league' : comp.format === 'uefa' ? 'continental' : comp.format === 'intl' ? 'intl' : 'cup'
  return p.suspensions.some((s) => s.scope === 'all' || (s.scope === scope && (!s.compId || s.compId === comp.key || s.compId === comp.id)))
}

export function isAvailable(w: World, p: Player, comp?: Competition): boolean {
  if (p.injury) return false
  if (isSuspendedFor(p, comp)) return false
  // away with his country: unavailable to his club, available to his national team
  if (p.intlDuty && comp?.format !== 'intl') return false
  return true
}

function selectionScore(w: World, p: Player, pos: Position, rotate: number): number {
  let r = posRating(p, pos)
  // managers trust a player where he has played: his main position first, a listed one nearly as much, and somewhere
  // he has never played only when he is clearly the better option (the rating already counts the attribute mismatch)
  if (p.positions[0] !== pos) r -= p.positions.includes(pos) ? 0.6 : 2.5
  const fit = p.fitness
  // a player who starts short of full fitness fades badly late on: freshness is worth real rating points
  if (fit < 95) r -= (95 - fit) * (0.24 + rotate * 0.2)
  r += (p.sharpness - 60) * 0.03
  return r
}

/**
 * The best XI for a formation: keeper by himself, then the ten outfield slots filled by an optimal assignment (the
 * Hungarian method) so that no swap or chain of moves between positions would make the side stronger.
 */
export function pickXI(w: World, players: Player[], formationId: string, rotate = 0): number[] {
  const f = formationOf(formationId)
  const slots = f.slots
  const xi: number[] = new Array(slots.length).fill(0)
  const gks = players.filter((p) => p.positions[0] === 'GK')
  const out = players.filter((p) => p.positions[0] !== 'GK')
  const gi = slots.findIndex((s) => s.pos === 'GK')
  if (gi >= 0 && gks.length) xi[gi] = gks.reduce((a, b) => (selectionScore(w, b, 'GK', rotate) > selectionScore(w, a, 'GK', rotate) ? b : a)).id
  const rows = slots.map((s, i) => i).filter((i) => slots[i].pos !== 'GK')
  if (!out.length) return xi
  // one score per distinct slot position
  const byPos = new Map<Position, number[]>()
  for (const i of rows) if (!byPos.has(slots[i].pos)) byPos.set(slots[i].pos, out.map((p) => selectionScore(w, p, slots[i].pos, rotate)))
  const n = Math.min(rows.length, out.length)
  const cost = (r: number, c: number) => -byPos.get(slots[rows[r]].pos)![c]
  const asg = assign(n, out.length, cost)
  for (let r = 0; r < n; r++) if (asg[r] >= 0) xi[rows[r]] = out[asg[r]].id
  return xi
}

/** Minimum-cost assignment of n rows to distinct columns of m ≥ n (Hungarian method with potentials, O(n²m)). */
function assign(n: number, m: number, cost: (r: number, c: number) => number): number[] {
  const INF = 1e18
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1)
  const p = new Int32Array(m + 1), way = new Int32Array(m + 1)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Float64Array(m + 1).fill(INF)
    const used = new Uint8Array(m + 1)
    do {
      used[j0] = 1
      const i0 = p[j0]
      let delta = INF, j1 = 0
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j]
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0 }
        if (minv[j] < delta) { delta = minv[j]; j1 = j }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1 } while (j0)
  }
  const res = new Array(n).fill(-1)
  for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1
  return res
}

export function pickBench(w: World, players: Player[], xi: number[], size = BENCH_SIZE): number[] {
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

/** Which unit a slot belongs to when roles are balanced against each other. */
const UNIT: Partial<Record<Position, string>> = { CB: 'CB', CDM: 'MID', CM: 'MID', CAM: 'AM', ST: 'FWD', CF: 'FWD', RM: 'WIDE', LM: 'WIDE', RW: 'WIDE', LW: 'WIDE' }
/** Roles a unit should not double up on (two holding men, two false nines, three stoppers ...). */
const SOLO = new Set(['Deep-Lying Playmaker', 'Holding', 'Centre-Half', 'False 9', 'Stopper', 'Classic 10', 'Target Forward'])
const DEEP = new Set(['Deep-Lying Playmaker', 'Holding', 'Centre-Half', 'Wide Half'])
const GOES = new Set(['Box-to-Box', 'Playmaker', 'Half-Winger'])

/**
 * Roles the way a manager hands them out: each player's best fit, balanced across his unit, so a midfield has one man
 * sitting and the others going, a back three has one stopper, and two forwards are not both dropping off.
 */
export function defaultRoles(w: World, formationId: string, xi: number[]): SlotRole[] {
  const f = formationOf(formationId)
  const roles: string[] = f.slots.map((s, i) => { const p = w.players[xi[i]]; return p ? bestRole(p, s.pos) : '' })
  const units = new Map<string, number[]>()
  f.slots.forEach((s, i) => { const u = UNIT[s.pos]; if (u && w.players[xi[i]]) { if (!units.has(u)) units.set(u, []); units.get(u)!.push(i) } })
  const hasAM = units.has('AM')
  for (const [u, idx] of units) {
    if (idx.length < 2) continue
    const opts = idx.map((i) => (ROLES[ROLE_GROUP[f.slots[i].pos]] || []).map((d) => ({ name: d.name, fit: roleFit(w.players[xi[i]], f.slots[i].pos, d.name).score })))
    let best: string[] = idx.map((i) => roles[i]), bs = -1e9
    const pick: string[] = []
    const walk = (k: number, sum: number) => {
      if (k === idx.length) {
        let pen = 0
        const count: Record<string, number> = {}
        for (const r of pick) count[r] = (count[r] || 0) + 1
        for (const [r, n] of Object.entries(count)) if (n > 1) pen += (SOLO.has(r) ? 0.3 : 0.06) * (n - 1)
        if (u === 'MID') {
          const deep = pick.filter((r) => DEEP.has(r)).length, goes = pick.filter((r) => GOES.has(r)).length
          if (deep === pick.length) pen += 0.25
          // a midfield three has one man sitting: a second holding role leaves nobody to carry it forward
          if (pick.length >= 3 && deep > 1) pen += 0.3 * (deep - 1)
          if (!hasAM && pick.length >= 2 && goes === 0) pen += 0.2
        }
        if (sum - pen > bs) { bs = sum - pen; best = [...pick] }
        return
      }
      for (const o of opts[k]) { pick.push(o.name); walk(k + 1, sum + o.fit); pick.pop() }
    }
    walk(0, 0)
    idx.forEach((i, k) => { roles[i] = best[k] })
  }
  return f.slots.map((s, i) => ({ role: roles[i], focus: defaultFocus(roles[i]), instructions: {} }))
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

/** How strong an XI is in a formation: the summed selection scores of its players in their slots. */
function xiScore(w: World, xi: number[], formationId: string, rotate: number): number {
  const f = formationOf(formationId)
  let t = 0
  xi.forEach((id, i) => { const p = w.players[id]; if (p && f.slots[i]) t += selectionScore(w, p, f.slots[i].pos, rotate) })
  return t
}

/**
 * The shape an AI manager actually sends out: his preferred formation, unless a variant of it (4-2-3-1 wide or narrow,
 * the 4-3-3s ...) clearly suits the players he has available better (a narrow 4-2-3-1 is no use with his best player a
 * right winger).
 */
export function aiFormation(w: World, squad: Player[], preferred: string, rotate = 0): string {
  const pref = formationOf(preferred)
  let best = pref.id, bs = -1e9
  for (const f of FORMATIONS) {
    if (f.family !== pref.family) continue
    const sc = xiScore(w, pickXI(w, squad, f.id, rotate), f.id, rotate) + (f.id === pref.id ? 4 : 0)
    if (sc > bs) { bs = sc; best = f.id }
  }
  return best
}

export function buildSheet(w: World, club: Club, formationId: string, tactics: TeamTactics, opts: { comp?: Competition; rotate?: number; id?: string; name?: string; flexible?: boolean } = {}): TeamSheet {
  const squad = squadOf(w, club.id).filter((p) => isAvailable(w, p, opts.comp))
  if (opts.flexible) formationId = aiFormation(w, squad, formationId, opts.rotate || 0)
  const xi = pickXI(w, squad, formationId, opts.rotate || 0)
  const bench = pickBench(w, squad, xi)
  const sp = setPieceTakers(w, xi)
  return {
    id: opts.id || 'first', name: opts.name || 'First Team', formation: formationId, lineup: xi, bench,
    roles: defaultRoles(w, formationId, xi), tactics, ...sp,
  }
}

/** Refreshes an AI club's sheet before a match (injuries, fatigue, rotation for cups). */
export function aiMatchSheet(w: World, club: Club, comp?: Competition, vs?: MatchUp): TeamSheet {
  const mgr = w.managers[club.managerId]
  const formation = formationOf(mgr?.formation || '4-3-3 Holding').id
  const base = club.sheets.find((s) => s.id === club.activeSheet) || club.sheets[0]
  let tactics = base?.tactics || tacticsForManager(mgr?.vision || 'Balanced', formation)
  if (vs) tactics = contextTactics(w, club, tactics, vs)
  const rotate = comp && (comp.format === 'cup' && comp.key !== 'FACUP' ? 1 : comp.format === 'cup' ? 0.6 : 0)
  return buildSheet(w, club, formation, tactics, { comp, rotate: rotate || 0, flexible: true })
}

/** The other side and where the game is played, for the AI manager's set-up (see contextTactics). */
export interface MatchUp { opp: number; venue: 'home' | 'away' | 'neutral' }

/** How far each kind of manager bends his usual game to the opponent (1: a pragmatist; low: a man of convictions). */
const BENDS: Record<string, number> = { Gegenpress: 0.45, Possession: 0.5, 'Park the Bus': 0.3, 'Counter-Attack': 0.8, Direct: 0.8, 'Wing Play': 0.8, Balanced: 1 }

/**
 * How an AI manager sets up for this particular game. Against a clearly stronger side, more so away from home, he
 * sits deeper, presses less and commits fewer men forward; against a clearly weaker one he pushes on. How far he
 * bends depends on his convictions: a pressing or possession coach mostly sticks to his game, a pragmatist adapts.
 * It is a starting point: during the match the state of the game moves him on from it.
 */
export function contextTactics(w: World, club: Club, t: TeamTactics, vs: MatchUp): TeamTactics {
  const opp = w.clubs[vs.opp]
  if (!opp) return t
  const edge = (club.squadAvg || 70) - (opp.squadAvg || 70) + (vs.venue === 'home' ? 1.5 : vs.venue === 'away' ? -1.5 : 0)
  let shift = edge < -2.5 ? -Math.min(2, (-edge - 2.5) / 4) : edge > 3.5 ? Math.min(1, (edge - 3.5) / 5) : 0
  shift *= BENDS[w.managers[club.managerId]?.vision || 'Balanced'] ?? 1
  if (Math.abs(shift) < 0.25) return t
  const m = Math.max(0, Math.min(MENTALITIES.length - 1, MENTALITIES.indexOf(t.mentality) + Math.round(shift)))
  const out: TeamTactics = {
    ...t,
    mentality: MENTALITIES[m],
    lineHeight: Math.round(Math.max(15, Math.min(85, t.lineHeight + shift * 7))),
    pressing: Math.round(Math.max(10, Math.min(95, t.pressing + shift * 7))),
    playersInBox: Math.max(2, Math.min(9, t.playersInBox + Math.round(shift * 0.8))),
  }
  // a side bracing itself does not engage high up the pitch
  if (shift <= -1 && (t.defApproach === 'High' || t.defApproach === 'Aggressive')) out.defApproach = 'Balanced'
  return out
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
    if (p) issues.push(!club.national && p.clubId !== club.id ? `${p.name} has left the club` : `${p.name} is unavailable${p.injury ? ` (${p.injury.type})` : isSuspendedFor(p, comp) ? ' (suspended)' : ''}`)
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
    if (bench.length >= BENCH_SIZE) break
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

/** The manager's main team sheet: the one chosen in Team Sheet and used unless a match has one of its own. */
export function mainSheet(club: Club): TeamSheet {
  return club.sheets.find((s) => s.id === club.activeSheet) || club.sheets[0]
}

/** The sheet the club plays a fixture with: one set for that match on its match day screen, else the main sheet. */
export function sheetFor(club: Club, fixtureId?: string): TeamSheet {
  return (fixtureId && club.matchSheets?.[fixtureId]) || mainSheet(club)
}

/**
 * Fill a sheet's empty places, and any held by a player no longer at the club, with the best of the squad for each
 * position (fit players first), then top the bench back up and keep the captain and set-piece takers in the XI. Returns
 * how many places in the XI it filled. \`gone\` is a player leaving now, not to be picked even if still on the books.
 */
export function fillGaps(w: World, club: Club, s: TeamSheet, gone?: number): number {
  const f = formationOf(s.formation)
  const squad = squadOf(w, club.id).filter((p) => p.id !== gone)
  const here = new Set(squad.map((p) => p.id))
  const used = new Set(s.lineup.filter((id) => here.has(id)))
  let filled = 0
  for (let i = 0; i < f.slots.length; i++) {
    if (here.has(s.lineup[i])) continue
    let best = 0, bs = -1e9
    for (const q of squad) {
      if (used.has(q.id) || (f.slots[i].pos === 'GK') !== (q.positions[0] === 'GK')) continue
      const v = posRating(q, f.slots[i].pos) - (isAvailable(w, q) ? 0 : 30) - (100 - q.fitness) * 0.1
      if (v > bs) { bs = v; best = q.id }
    }
    s.lineup[i] = best
    if (best) { used.add(best); filled++ }
  }
  s.bench = s.bench.filter((id) => here.has(id) && !used.has(id))
  // (the sheet is the squad the manager wants: someone away for now still makes it, after the fit players; the
  // kick-off checks stand in for whoever can't play on the day)
  const avail = (p: Player) => (isAvailable(w, p) ? 1 : 0)
  for (const p of [...squad].sort((a, b) => avail(b) - avail(a) || b.ovr - a.ovr)) {
    if (s.bench.length >= BENCH_SIZE) break
    if (!used.has(p.id) && !s.bench.includes(p.id)) s.bench.push(p.id)
  }
  const xi = s.lineup.filter(Boolean)
  const takers = setPieceTakers(w, xi)
  for (const k of ['captain', 'viceCaptain', 'penalties', 'freeKicks', 'cornersL', 'cornersR'] as const) {
    if (!xi.includes(s[k] as number)) (s as unknown as Record<string, number>)[k] = takers[k]
  }
  return filled
}

/** The match's own sheet, made from the main sheet the first time the match day screen changes something. */
export function matchSheetOf(club: Club, fixtureId: string): TeamSheet {
  const ms = (club.matchSheets ||= {})
  if (!ms[fixtureId]) ms[fixtureId] = { ...JSON.parse(JSON.stringify(mainSheet(club))), id: `match:${fixtureId}` }
  return ms[fixtureId]
}
