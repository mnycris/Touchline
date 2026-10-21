// Squads too thin to play. The ratings data licenses only a handful of players at some clubs (several Indian Super
// League sides have 7 to 13), and a club can't field a side, let alone a bench, with that. Such a club is topped up
// with generated squad players, the way the academy generates its youngsters: names from its country, a balance of
// positions, a level a little under the club's own. They are marked as generated (regen) like academy players, and
// only clubs short of a matchday squad get them; clubs with a real squad are never touched.
import type { Player, Position, World } from '../../domain/types'
import { Rng, clamp, hashString } from '../../domain/rng'
import { POS_GROUP } from '../../domain/constants'
import { rawPosRating } from '../../domain/ratings'
import { formulaValue } from '../../domain/finance'
import { generateName, namesInUse } from '../../domain/names'
import { generateAttrs } from './scouting'
import { rosterOf, touchRoster } from './roster'
import { sendInbox } from './messages'

/** A full matchday squad: the XI and nine on the bench. */
export const MIN_SQUAD = 20
// what a thin squad is short of first: two keepers, then a back line, a midfield and a forward line to pick from
const NEED: [keyof typeof GROUP_POS, number][] = [['GK', 2], ['DEF', 7], ['MID', 6], ['ATT', 4]]
const GROUP_POS = { GK: ['GK'], DEF: ['CB', 'CB', 'RB', 'LB', 'CB'], MID: ['CM', 'CDM', 'CAM', 'CM', 'RM', 'LM'], ATT: ['ST', 'RW', 'LW', 'ST'] } as const

/** Below this the manager's own club can't name a matchday squad at all, and is topped up even mid-career. */
const USER_FLOOR = 16

/**
 * Top up every league club short of a matchday squad. The manager's own club is theirs to build: it is topped up when a
 * career starts there, and later only if it falls below what a matchday needs (they are told who was registered).
 * Returns how many players were added.
 */
export function fillThinSquads(w: World, rng?: Rng, opts: { start?: boolean } = {}): number {
  const r = rng || new Rng(hashString(`${w.meta?.id || ''}:${w.date}:fill`))
  let added = 0
  let taken: Set<string> | undefined
  for (const c of Object.values(w.clubs)) {
    if (c.national || !c.leagueId) continue
    const squad = rosterOf(w, c.id)
    if (squad.length >= MIN_SQUAD) continue
    const mine = c.id === w.userClubId
    if (mine && !opts.start && squad.length >= USER_FLOOR) continue
    const before = squad.length
    taken ||= namesInUse(Object.values(w.players))
    const count = (g: string) => squad.filter((p) => POS_GROUP[p.positions[0]] === g).length
    const have: Record<string, number> = { GK: count('GK'), DEF: count('DEF'), MID: count('MID'), ATT: count('ATT') }
    const avg = squad.length ? squad.reduce((a, p) => a + p.ovr, 0) / squad.length : c.squadAvg || 55
    // made-up numbers mid-career are fringe players, well short of the side (never a free way to strengthen it)
    const level = mine && !opts.start ? Math.min(avg - 10, 66) : avg
    const wages = squad.map((p) => p.contract.wage).filter((x) => x > 0).sort((a, b) => a - b)
    const wage = Math.max(500, Math.round((wages[Math.floor(wages.length / 2)] || 2000) * 0.6 / 50) * 50)
    const nation = c.country
    const used = new Set(squad.map((p) => p.jersey))
    while (rosterOf(w, c.id).length < MIN_SQUAD) {
      // the position group furthest below what a squad needs, then the thinnest overall
      const g = [...NEED].sort((a, b) => (have[a[0]] - a[1]) - (have[b[0]] - b[1]))[0][0]
      const slots = GROUP_POS[g]
      const pos = slots[have[g] % slots.length] as Position
      const p = makeSquadPlayer(w, c.id, nation, pos, level, wage, r, taken)
      let n = g === 'GK' ? 13 : 21
      while (used.has(n)) n++
      used.add(n)
      p.jersey = n
      w.players[p.id] = p
      touchRoster(w)
      have[g]++
      added++
    }
    if (mine && !opts.start) {
      const fresh = rosterOf(w, c.id).slice(before)
      sendInbox(w, {
        from: 'Club Secretary', fromRole: 'Administration', category: 'Squad', subject: 'Squad numbers made up',
        body: `We were down to ${before} registered players, short of a matchday squad, so the club has registered ${fresh.length} squad players to make up the numbers: ${fresh.map((p) => `${p.name} (${p.positions[0]}, ${p.ovr})`).join(', ')}. Sign players of your own to replace them whenever you like.`,
        actions: [{ label: 'View Squad', action: 'openSquad', primary: true }], clubId: c.id,
      })
    }
  }
  return added
}

function makeSquadPlayer(w: World, clubId: number, nation: string, pos: Position, level: number, wage: number, rng: Rng, taken: Set<string>): Player {
  const age = clamp(Math.round(rng.normal(25, 4)), 18, 33)
  // squad players, not stars: around the club's level, never well above it
  const ovr = Math.round(clamp(rng.normal(level - 3, 3), Math.max(40, level - 12), Math.min(80, level + 1)))
  const pot = Math.round(clamp(ovr + Math.max(0, (24 - age) * 1.4) + rng.int(0, 3), ovr, 85))
  const attrs = generateAttrs(pos, ovr, 'Balanced', rng)
  const trueOvr = Math.round(rawPosRating(attrs, pos))
  const name = generateName(w.namePools, nation, rng, taken)
  const year = w.season + (w.date >= `${w.season}-07-01` ? 0 : -1) - age
  const id = w.nextIds.player++
  const value = formulaValue(trueOvr, pot, age, pos)
  return {
    id, name: name.display, fullName: name.full, shortName: name.display, nation, clubId, positions: [pos],
    dob: `${year}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
    height: pos === 'GK' ? rng.int(182, 195) : rng.int(167, 190), weight: rng.int(62, 86), foot: rng.next() < 0.25 ? 'L' : 'R',
    ovr: trueOvr, pot: Math.max(pot, trueOvr), ovrAdj: 0, attrs, weakFoot: 2 + (id % 3), skillMoves: 2 + (id % 2), intlRep: 1,
    workRate: ['Medium', 'Medium'], bodyType: 'Normal', playstyles: [], playstylesPlus: [], value, wage,
    contract: { until: w.season + rng.int(1, 3), wage, role: 'Rotation', releaseClause: 0, signedOn: w.date },
    jersey: 0, realFace: false, faceSeed: rng.int(1, 2 ** 30), regen: true, fitness: 95, sharpness: 70, morale: 65, formRatings: [],
    suspensions: [], yellowAccum: {}, joinedDate: w.date, trainingPlan: 'Balanced', devPlan: 'balanced', devProgress: 0,
    growthHistory: [{ date: w.date, ovr: trueOvr }],
    hidden: { consistency: 50, professionalism: 45 + (id % 40), injuryProne: 20 + (id % 30), devRate: 0.9 + (id % 30) / 100, adaptability: 50, bigMatch: 45, ambition: 45 + (id % 40), loyalty: 55, temperament: 45 },
    season: {}, career: [],
  }
}
