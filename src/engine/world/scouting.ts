import type { AttrKey, Player, Position, Prospect, Scout, World, YouthScout } from '../../domain/types'
import { A } from '../../domain/types'
import { Rng, clamp, hashString } from '../../domain/rng'
import { addDays, ageOn, iso, toDate } from '../../domain/dates'
import { POS_GROUP, RATING_WEIGHTS, POS_WEIGHT_KEY } from '../../domain/constants'
import { rawPosRating } from '../../domain/ratings'
import { formulaValue } from '../../domain/finance'
import { pickName, displayName, staffName } from '../../domain/names'
import { sendInbox, staffNames } from './messages'
import { academyOf, touchRoster } from './roster'

export const SCOUT_SLOTS = 5
export const YOUTH_SCOUT_SLOTS = 3

/** Days a scout needs for a full report on a player the club knows little about (from ~30% known). */
export function reportDays(s: Pick<Scout, 'experience' | 'judgement'>) {
  return Math.max(3, Math.ceil(70 / ((4 + s.experience * 2.2) * (1 + s.judgement * 0.05))))
}

// ---------------------------------------------------------------- knowledge
/** What the football world already knows about a player without sending anyone: the stars are no mystery, an
 *  established international in a big league is well documented, an unknown teenager abroad is a blank. */
export function publicKnowledge(w: World, p: Player): number {
  const club = w.clubs[p.clubId]
  const user = w.clubs[w.userClubId]
  const age = ageOn(p.dob, w.date)
  let f = p.ovr >= 86 ? 72 : p.ovr >= 82 ? 54 : p.ovr >= 78 ? 38 : p.ovr >= 74 ? 24 : 10
  f += (p.intlRep || 1) * 6
  f += (w.leagues[club?.leagueId]?.prestige || 3) * 2.5
  if (age <= 20) f *= 0.5
  else if (age <= 22) f *= 0.78
  if (user && p.nation === user.country) f += 8
  // familiar ground: his league, or the manager's own country
  if (club && user && club.leagueId === user.leagueId) f = Math.max(f + 12, 40)
  else if (club && user && club.country === user.country) f = Math.max(f + 6, 25)
  return clamp(Math.round(f), 0, 95)
}

export function knowledge(w: World, p: Player): number {
  if (p.clubId === w.userClubId) return 100
  return Math.max(w.transfers.knowledge[p.id] ?? 0, publicKnowledge(w, p))
}

export function potRange(w: World, p: Player): [number, number] {
  const k = knowledge(w, p)
  if (k >= 90) return [p.pot, p.pot]
  // how much is still unknown, and how much room there is left to grow at his age
  const age = ageOn(p.dob, w.date)
  const ageF = age >= 28 ? 0.3 : age >= 25 ? 0.55 : age >= 22 ? 0.85 : 1.15
  const width = Math.max(1, Math.round((1 - k / 100) * 11 * ageF)) + 1
  // the band sits around the truth, shifted a little (stable for the season) so it never gives the answer away
  const half = width / 2
  const off = ((hashString(`${p.id}:${w.season}`) % 1000) / 1000 - 0.5) * half
  const lo = clamp(Math.round(p.pot - half + off), p.ovr, 99)
  const hi = clamp(Math.round(p.pot + half + off), Math.max(lo, p.pot), 99)
  return [lo, hi]
}

export function attrsVisible(w: World, p: Player): 'all' | 'partial' | 'none' {
  const k = knowledge(w, p)
  return k >= 85 ? 'all' : k >= 40 ? 'partial' : 'none'
}

export function scoutCost(s: Scout | YouthScout) {
  return s.wage
}

/** Assign a scout to a specific player. */
export function scoutPlayer(w: World, scoutId: number, playerId: number) {
  const s = w.scouts.find((x) => x.id === scoutId)
  if (!s) return
  s.assignment = { kind: 'player', playerId, started: w.date, duration: 0, progress: knowledge(w, w.players[playerId]), foundIds: [playerId] }
  const t = w.transfers.targets[playerId]
  w.transfers.targets[playerId] = { playerId, added: t?.added || w.date, status: 'Scouting' }
}

export function scoutNetwork(w: World, scoutId: number, region: string, position: string, ageMax: number, focus: string, months: number) {
  const s = w.scouts.find((x) => x.id === scoutId)
  if (!s) return
  s.assignment = { kind: 'network', region, position, ageMax, focus, started: w.date, duration: months * 30, progress: 0, foundIds: [] }
}

export function dailyScouting(w: World, rng: Rng) {
  if (w.date.endsWith('-01')) refreshScoutPool(w, rng)
  for (const s of w.scouts) {
    const a = s.assignment
    if (!a) continue
    if (a.kind === 'player' && a.playerId) {
      const p = w.players[a.playerId]
      if (!p) { s.assignment = undefined; continue }
      // experience sets the pace, knowing the country helps, judgement sharpens what's seen
      const same = w.clubs[p.clubId]?.country === s.nationality || p.nation === s.nationality ? 1.5 : 1
      const gain = (4 + s.experience * 2.2) * same * (1 + s.judgement * 0.05)
      const k = clamp(knowledge(w, p) + gain, 0, 100)
      w.transfers.knowledge[p.id] = k
      a.progress = k
      if (k >= 100) {
        s.assignment = undefined
        const t = w.transfers.targets[p.id]
        if (t) t.status = 'Report Available'
        sendReport(w, s, p)
      }
    } else if (a.kind === 'network') {
      const elapsed = Math.round((toDate(w.date).getTime() - toDate(a.started).getTime()) / 86400000)
      a.progress = clamp(Math.round((elapsed / a.duration) * 100), 0, 100)
      if (elapsed > 0 && elapsed % 4 === 0) {
        const found = networkFind(w, s, rng)
        for (const p of found) {
          w.transfers.knowledge[p.id] = clamp(knowledge(w, p) + 30 + s.experience * 10, 0, 100)
          if (!a.foundIds.includes(p.id)) a.foundIds.push(p.id)
        }
        if (found.length) {
          sendInbox(w, {
            from: s.name, fromRole: 'Scout', category: 'Scouting', subject: `Scouting update: ${a.region}`,
            body: `I've identified ${found.length} player${found.length > 1 ? 's' : ''} matching your brief (${a.position}, U${a.ageMax}${a.focus && a.focus !== 'Any' ? `, ${a.focus}` : ''}): ${found.map((p) => p.name).join(', ')}.`,
            actions: [{ label: 'View Results', action: 'openScouting', payload: s.id, primary: true }],
          })
        }
      }
      if (elapsed >= a.duration) s.assignment = undefined
    }
  }
}

const REGION_GROUPS: Record<string, string[]> = {
  Scandinavia: ['Denmark', 'Norway', 'Sweden', 'Finland', 'Iceland'],
  'Eastern Europe': ['Poland', 'Czechia', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Serbia', 'Croatia', 'Ukraine', 'Russia', 'Slovenia', 'Bosnia and Herzegovina', 'Albania', 'North Macedonia', 'Montenegro', 'Kosovo', 'Georgia', 'Greece'],
  Africa: ['Nigeria', 'Ghana', 'Senegal', 'Cameroon', "Côte d'Ivoire", 'Mali', 'Morocco', 'Algeria', 'Tunisia', 'Egypt', 'Congo DR', 'Guinea', 'Gambia', 'Burkina Faso', 'South Africa', 'Angola', 'Zambia', 'Cabo Verde', 'Gabon', 'Togo', 'Benin', 'Kenya'],
  'South America': ['Brazil', 'Argentina', 'Uruguay', 'Colombia', 'Chile', 'Ecuador', 'Paraguay', 'Peru', 'Venezuela', 'Bolivia'],
}
const MAIN_REGIONS = new Set(['England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands', 'Belgium', 'Brazil', 'Argentina', ...Object.values(REGION_GROUPS).flat()])

export function inRegion(region: string, country: string, nation: string): boolean {
  if (!region || region === 'Anywhere') return true
  if (REGION_GROUPS[region]) return REGION_GROUPS[region].includes(country) || REGION_GROUPS[region].includes(nation)
  if (region === 'Rest of World') return !MAIN_REGIONS.has(country) && !MAIN_REGIONS.has(nation)
  return country === region || nation === region
}

function networkFind(w: World, s: Scout, rng: Rng): Player[] {
  const a = s.assignment!
  const pool = Object.values(w.players).filter((p) => {
    if (p.clubId === w.userClubId || p.academy) return false
    const club = w.clubs[p.clubId]
    const country = club?.country || p.nation
    if (!inRegion(a.region || 'Anywhere', country, p.nation)) return false
    if (a.position && a.position !== 'Any' && !matchesPosition(p, a.position)) return false
    if (a.ageMax && ageOn(p.dob, w.date) > a.ageMax) return false
    return true
  })
  const n = 1 + Math.floor(rng.next() * (1 + s.experience * 0.6))
  const userAvg = w.clubs[w.userClubId]?.squadAvg || 70
  const scored = pool.map((p) => {
    let v = p.pot * (0.6 + s.judgement * 0.08) + p.ovr * 0.4
    if (a.focus === 'High Potential') v += (p.pot - p.ovr) * 1.2
    if (a.focus === 'Ready Now') v += p.ovr >= userAvg - 2 ? 12 : -8
    if (a.focus === 'Bargain') v += (p.pot - p.value / 2e6) * 0.3 + (p.transferListed ? 8 : 0) + (p.contract.until <= w.season + 1 ? 6 : 0)
    return { p, s: v + rng.next() * (12 - s.judgement * 2) - (w.transfers.knowledge[p.id] || 0) * 0.1 }
  })
  scored.sort((x, y) => y.s - x.s)
  return scored.slice(0, n).map((x) => x.p)
}

export function matchesPosition(p: Player, pos: string): boolean {
  const g = POS_GROUP[p.positions[0]]
  if (pos === 'GK' || pos === 'DEF' || pos === 'MID' || pos === 'ATT') return g === pos
  if (pos === 'FB') return p.positions.some((x) => ['RB', 'LB', 'RWB', 'LWB'].includes(x))
  if (pos === 'W') return p.positions.some((x) => ['RW', 'LW', 'RM', 'LM'].includes(x))
  return p.positions.includes(pos as Position)
}

function sendReport(w: World, s: Scout, p: Player) {
  const [lo, hi] = potRange(w, p)
  const strengths = topAttrs(p, 3).map((k) => k).join(', ')
  const weak = bottomAttrs(p, 2).join(', ')
  const rec = p.pot >= 85 || p.ovr >= 82 ? 'An exceptional talent. I strongly recommend we make a move.' : p.pot >= 78 ? 'A very good player who would improve the squad.' : 'A useful squad option, but not a priority signing.'
  sendInbox(w, {
    from: s.name, fromRole: 'Scout', category: 'Scouting', subject: `Scout report: ${p.name}`,
    body: `Report complete on ${p.name} (${p.positions.join('/')}, ${ageOn(p.dob, w.date)}). Current rating ${p.ovr}, potential ${lo === hi ? lo : `${lo}–${hi}`}. Strengths: ${strengths}. Areas to improve: ${weak}. ${rec}`,
    actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id, primary: true }, { label: 'Make Offer', action: 'openOffer', payload: p.id }],
    playerId: p.id, image: { kind: 'player', id: p.id },
  })
}

const NICE: Partial<Record<AttrKey, string>> = { finishing: 'Finishing', sprintSpeed: 'Pace', acceleration: 'Acceleration', dribbling: 'Dribbling', vision: 'Vision', shortPassing: 'Passing', defAwareness: 'Defensive awareness', standingTackle: 'Tackling', heading: 'Aerial ability', strength: 'Strength', stamina: 'Stamina', longShots: 'Long shots', crossing: 'Crossing', composure: 'Composure', reactions: 'Reactions', interceptions: 'Interceptions', gkReflexes: 'Reflexes', gkDiving: 'Diving', gkPositioning: 'Positioning', gkHandling: 'Handling', ballControl: 'Ball control', agility: 'Agility', longPassing: 'Long passing', aggression: 'Aggression', jumping: 'Jumping' }
export function topAttrs(p: Player, n: number): string[] {
  const ws = RATING_WEIGHTS[POS_WEIGHT_KEY[p.positions[0]]]
  return (Object.keys(ws) as AttrKey[]).sort((a, b) => p.attrs[A[b]] - p.attrs[A[a]]).slice(0, n).map((k) => NICE[k] || k)
}
export function bottomAttrs(p: Player, n: number): string[] {
  const ws = RATING_WEIGHTS[POS_WEIGHT_KEY[p.positions[0]]]
  return (Object.keys(ws) as AttrKey[]).sort((a, b) => p.attrs[A[a]] - p.attrs[A[b]]).slice(0, n).map((k) => NICE[k] || k)
}

// ---------------------------------------------------------------- youth academy
export const PLAYER_TYPES = ['Any', 'Technically Gifted', 'Physically Strong', 'Attacker', 'Winger', 'Playmaker', 'Defensive Minded', 'Goalkeeper'] as const

const TALENT: Record<string, number> = { Brazil: 1.2, France: 1.2, Spain: 1.18, England: 1.12, Argentina: 1.15, Germany: 1.1, Portugal: 1.12, Netherlands: 1.08, Belgium: 1.05, Italy: 1.05, Uruguay: 1.02, Croatia: 1.0, Nigeria: 0.98, Senegal: 0.98, 'Côte d\'Ivoire': 0.97, Denmark: 0.97, Norway: 0.96, Japan: 0.95, Colombia: 0.98, Morocco: 0.98, Serbia: 0.96, 'United States': 0.93 }

export function sendYouthScout(w: World, scoutId: number, country: string, playerType: string, months: number) {
  const s = w.youthScouts.find((x) => x.id === scoutId)
  if (!s) return
  s.mission = { country, playerType, started: w.date, months, nextReport: firstOfNextMonth(w.date) }
}

function firstOfNextMonth(d: string) {
  const x = toDate(d)
  return iso(new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1, 12)))
}

export function dailyYouth(w: World, rng: Rng) {
  for (const s of w.youthScouts) {
    const m = s.mission
    if (!m || w.date < m.nextReport) continue
    const n = rng.int(1, 2 + (s.experience >= 4 ? 1 : 0))
    const found: Prospect[] = []
    for (let i = 0; i < n; i++) found.push(generateProspect(w, s, rng))
    w.prospects.push(...found)
    m.nextReport = firstOfNextMonth(addDays(m.nextReport, 1))
    const elapsedMonths = Math.round((toDate(w.date).getTime() - toDate(m.started).getTime()) / (30 * 86400000))
    if (elapsedMonths >= m.months) s.mission = undefined
    const staff = staffNames(w)
    sendInbox(w, {
      from: s.name, fromRole: 'Youth Scout', category: 'Youth', subject: `Youth scouting report: ${m.country}`,
      body: `I've found ${found.length} prospect${found.length > 1 ? 's' : ''} in ${m.country} worth your attention: ${found.map((p) => `${p.name} (${p.positions[0]}, ${p.age}) — POT ${p.potRange[0]}-${p.potRange[1]}`).join('; ')}.${s.mission ? '' : ' My assignment is now complete.'}`,
      actions: [{ label: 'View Prospects', action: 'openYouth', primary: true }],
    })
    void staff
  }
}

export function generateProspect(w: World, s: YouthScout, rng: Rng): Prospect {
  const m = s.mission!
  const nation = m.country
  const t = m.playerType
  const talent = TALENT[nation] ?? 0.9
  const pos: Position = t === 'Goalkeeper' ? 'GK' : t === 'Attacker' ? rng.pick(['ST', 'CF', 'ST'] as Position[]) : t === 'Winger' ? rng.pick(['RW', 'LW', 'RM', 'LM'] as Position[])
    : t === 'Playmaker' ? rng.pick(['CAM', 'CM'] as Position[]) : t === 'Defensive Minded' ? rng.pick(['CB', 'CB', 'CDM', 'RB', 'LB'] as Position[])
      : t === 'Physically Strong' ? rng.pick(['CB', 'ST', 'CDM'] as Position[]) : t === 'Technically Gifted' ? rng.pick(['CAM', 'RW', 'LW', 'CM'] as Position[])
        : rng.pick(['GK', 'CB', 'CB', 'RB', 'LB', 'CDM', 'CM', 'CM', 'CAM', 'RW', 'LW', 'ST'] as Position[])
  const age = rng.int(15, 17)
  const potMean = 63 + s.experience * 3.2 + (talent - 1) * 30 + (w.clubs[w.userClubId].youthRating - 5) * 0.8
  let pot = Math.round(clamp(rng.normal(potMean, 6.5), 55, 94))
  if (rng.next() < 0.02 + s.experience * 0.008) pot = clamp(pot + rng.int(6, 12), 70, 95) // wonderkid
  const ovr = Math.round(clamp(pot - rng.int(14, 26) - (17 - age) * 2, 40, 68))
  const attrs = generateAttrs(pos, ovr, t, rng)
  const trueOvr = Math.round(rawPosRating(attrs, pos))
  const err = Math.max(1, 7 - s.judgement)
  const name = pickName(w.namePools, nation, rng)
  const year = w.season + (w.date >= `${w.season}-07-01` ? 0 : -1) - age
  const dob = `${year}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`
  return {
    id: w.nextIds.player++, scoutId: s.id, name: displayName(name.first, name.last, nation), fullName: `${name.first} ${name.last}`, nation, age, dob,
    positions: [pos], ovrRange: [Math.max(35, trueOvr - err), trueOvr + err], potRange: [Math.max(trueOvr, pot - err - 1), Math.min(99, pot + err)],
    trueOvr, truePot: pot, attrs, foot: rng.next() < 0.26 ? 'L' : 'R', height: pos === 'GK' ? rng.int(183, 196) : rng.int(166, 190),
    weight: rng.int(58, 82), faceSeed: rng.int(1, 2 ** 30), value: formulaValue(trueOvr, pot, age, pos), found: w.date, playerType: t,
  }
}

function generateAttrs(pos: Position, ovr: number, type: string, rng: Rng): number[] {
  const a = new Array(34).fill(0).map(() => clamp(Math.round(rng.normal(ovr - 12, 7)), 20, 80))
  const ws = RATING_WEIGHTS[POS_WEIGHT_KEY[pos]]
  for (const k of Object.keys(ws) as AttrKey[]) a[A[k]] = clamp(Math.round(rng.normal(ovr + 2, 5)), 25, 85)
  const boost = (keys: AttrKey[], d: number) => keys.forEach((k) => { a[A[k]] = clamp(a[A[k]] + d, 20, 90) })
  if (type === 'Technically Gifted') boost(['dribbling', 'ballControl', 'agility', 'balance', 'curve'], 6)
  if (type === 'Physically Strong') boost(['strength', 'stamina', 'jumping', 'aggression'], 7)
  if (type === 'Winger') boost(['acceleration', 'sprintSpeed', 'crossing', 'dribbling'], 5)
  if (type === 'Playmaker') boost(['vision', 'shortPassing', 'longPassing'], 6)
  if (type === 'Defensive Minded') boost(['defAwareness', 'standingTackle', 'interceptions', 'slidingTackle'], 5)
  if (pos !== 'GK') for (const k of ['gkDiving', 'gkHandling', 'gkKicking', 'gkPositioning', 'gkReflexes'] as AttrKey[]) a[A[k]] = rng.int(6, 14)
  // calibrate towards target ovr
  const cur = rawPosRating(a, pos)
  const d = Math.round(ovr - cur)
  for (const k of Object.keys(ws) as AttrKey[]) a[A[k]] = clamp(a[A[k]] + d, 15, 92)
  return a
}

export function signProspect(w: World, prospectId: number): Player | undefined {
  const pr = w.prospects.find((x) => x.id === prospectId)
  if (!pr || pr.signed) return
  if (academyOf(w, w.userClubId).length >= 15) return
  pr.signed = true
  const p: Player = {
    id: pr.id, name: pr.name, fullName: pr.fullName, shortName: pr.name, nation: pr.nation, clubId: w.userClubId, positions: pr.positions,
    dob: pr.dob, height: pr.height, weight: pr.weight, foot: pr.foot, ovr: pr.trueOvr, pot: pr.truePot, ovrAdj: 0, attrs: pr.attrs,
    weakFoot: 2 + (pr.id % 3), skillMoves: 2 + (pr.id % 2), intlRep: 1, workRate: ['Medium', 'Medium'], bodyType: 'Lean', playstyles: [],
    playstylesPlus: [], value: pr.value, wage: 500,
    contract: { until: w.season + 3, wage: 500, role: 'Prospect', releaseClause: 0, signedOn: w.date },
    jersey: 0, realFace: false, faceSeed: pr.faceSeed, regen: true, academy: true, fitness: 95, sharpness: 50, morale: 75, formRatings: [],
    suspensions: [], yellowAccum: {}, joinedDate: w.date, trainingPlan: 'Balanced', devPlan: 'balanced', devProgress: 0,
    growthHistory: [{ date: w.date, ovr: pr.trueOvr }],
    hidden: { consistency: 45, professionalism: 40 + (pr.id % 50), injuryProne: 20 + (pr.id % 30), devRate: 0.9 + (pr.id % 40) / 100, adaptability: 50, bigMatch: 45, ambition: 50 + (pr.id % 40), loyalty: 60, temperament: 40 },
    season: {}, career: [],
  }
  w.players[p.id] = p
  w.prospects = w.prospects.filter((x) => x.id !== prospectId)
  touchRoster(w)
  return p
}

export function promoteYouth(w: World, playerId: number) {
  const p = w.players[playerId]
  if (!p || !p.academy) return
  p.academy = false
  p.contract = { ...p.contract, role: 'Prospect', wage: Math.max(1000, Math.round(p.ovr * p.ovr * 0.6 / 50) * 50), until: w.season + 4, signedOn: w.date }
  p.wage = p.contract.wage
  const used = new Set(Object.values(w.players).filter((q) => q.clubId === p.clubId && !q.academy).map((q) => q.jersey))
  let n = 30
  while (used.has(n)) n++
  p.jersey = n
  const f = (w.flags.youthPromoted ||= {})
  f[w.season] = (f[w.season] || 0) + 1
  p.academyGrad = p.clubId
  p.gradDate = w.date
  touchRoster(w)
}

export function hireScout(w: World, id: number, youth: boolean) {
  if (youth) {
    const i = w.youthScoutPool.findIndex((s) => s.id === id)
    if (i < 0 || w.youthScouts.length >= YOUTH_SCOUT_SLOTS) return false
    w.youthScouts.push(w.youthScoutPool.splice(i, 1)[0])
  } else {
    const i = w.scoutPool.findIndex((s) => s.id === id)
    if (i < 0 || w.scouts.length >= SCOUT_SLOTS) return false
    w.scouts.push(w.scoutPool.splice(i, 1)[0])
  }
  return true
}

/** Letting a scout go costs four weeks' wages; he goes back on the market. */
export function fireScout(w: World, id: number, youth: boolean) {
  const list = youth ? w.youthScouts : w.scouts
  const i = list.findIndex((s) => s.id === id)
  if (i < 0) return
  const s = list.splice(i, 1)[0]
  const pay = s.wage * 4
  const club = w.clubs[w.userClubId]
  if (club && pay) { club.finance.balance -= pay; club.finance.ledger.push({ date: w.date, label: `Released scout ${s.name}`, amount: -pay, kind: 'wages' }) }
  if ('assignment' in s) s.assignment = undefined
  ;(youth ? w.youthScoutPool : w.scoutPool).push(s as any)
}

/** Replace one scout with a candidate in one move (the new man starts without an assignment). */
export function replaceScout(w: World, oldId: number, newId: number, youth: boolean) {
  const pool = youth ? w.youthScoutPool : w.scoutPool
  if (!pool.some((s) => s.id === newId)) return false
  fireScout(w, oldId, youth)
  return hireScout(w, newId, youth)
}

/** The scouting market moves: now and then new candidates appear and some go elsewhere. */
export function refreshScoutPool(w: World, rng: Rng) {
  const nats = ['England', 'Spain', 'Germany', 'Italy', 'France', 'Brazil', 'Argentina', 'Portugal', 'Netherlands', 'Belgium', 'Norway', 'Denmark', 'Croatia', 'Uruguay', 'Colombia', 'Japan', 'United States', 'Nigeria', 'Senegal', "Côte d'Ivoire", 'Ghana', 'Morocco', 'Serbia', 'Poland', 'Sweden', 'Austria', 'Switzerland', 'Scotland', 'Türkiye', 'Mexico']
  const star = () => clamp(Math.round(rng.normal(2.8, 1.05)), 1, 5)
  const mk = (): Scout => {
    const nat = rng.pick(nats)
    const exp = star(), jud = star()
    return { id: w.nextIds.misc++, name: staffName(rng, w.namePools, nat), nationality: nat, experience: exp, judgement: jud, wage: Math.round((600 + (exp + jud) * 900 + rng.int(0, 600)) / 50) * 50, faceSeed: rng.int(1, 1e9) }
  }
  for (const pool of [w.scoutPool, w.youthScoutPool] as Scout[][]) {
    if (pool.length > 8 && rng.next() < 0.6) pool.splice(rng.int(0, pool.length - 1), 1)
    const add = rng.next() < 0.7 ? 2 : 1
    for (let k = 0; k < add; k++) pool.push(mk())
    while (pool.length > 14) pool.shift()
  }
}
