import type { AvatarConfig, CareerSettings, Club, LeagueDef, Manager, Player, Position, Scout, SquadRole, World, YouthScout } from '../domain/types'
import { SAVE_SCHEMA } from '../engine/world/migrate'
import { Rng, clamp, hashString } from '../domain/rng'
import { rawPosRating } from '../domain/ratings'
import { clubBudget, dynamicValue, roundValue } from '../domain/finance'
import { ageOn } from '../domain/dates'
import { formationOf, POS_GROUP } from '../domain/constants'
import { staffName } from '../domain/names'
import { buildSheet, squadOf, tacticsForManager } from '../engine/match/selection'
import { setupSeason } from '../engine/competitions/setupSeason'
import type { RawDb } from './rawTypes'

export interface NewCareerOptions {
  clubId: number
  manager: { firstName: string; lastName: string; nationality: string; dob: string; avatar: AvatarConfig; realManager?: string; avatarColor?: string; style?: string }
  settings: CareerSettings
  saveName?: string
  seed?: number
  /** Edit Mode save: permanent, marked with a pencil */
  editMode?: boolean
}

const h01 = (s: string) => (hashString(s) % 100000) / 100000

export function buildPlayer(row: any[], fields: string[], start: string): Player {
  const o: Record<string, any> = {}
  fields.forEach((f, i) => { o[f] = row[i] })
  const id = o.id as number
  const positions = String(o.positions).split('|').filter(Boolean) as Position[]
  const attrs = o.attrs as number[]
  const ovrAdj = o.ovr - rawPosRating(attrs, positions[0])
  const age = ageOn(o.dob, start)
  const wr = String(o.workRate || '').split('/').map((x: string) => x.trim())
  const grp = POS_GROUP[positions[0]]
  const workRate: [string, string] = wr.length === 2 && wr[0] ? [wr[0], wr[1]] : grp === 'ATT' ? ['High', 'Low'] : grp === 'DEF' ? ['Medium', 'High'] : grp === 'GK' ? ['Medium', 'Medium'] : ['High', 'Medium']
  const ps = String(o.playstyles || '').split(',').map((s: string) => s.trim()).filter(Boolean)
  const pp = String(o.playstylesPlus || '').split(',').map((s: string) => s.trim().replace(/\s*\+$/, '')).filter(Boolean)
  const r = (k: string) => h01(`${id}:${k}`)
  const prime = age >= 25 && age <= 31
  const hidden = {
    consistency: Math.round(clamp(45 + (o.ovr - 60) * 0.9 + (prime ? 8 : 0) + r('c') * 25 - 10, 25, 97)),
    professionalism: Math.round(35 + r('p') * 60),
    injuryProne: Math.round(ps.includes('Injury prone') ? 78 + r('i') * 18 : 8 + r('i') * 52),
    devRate: Math.round((0.75 + r('d') * 0.55 + (o.pot - o.ovr > 10 ? 0.1 : 0)) * 100) / 100,
    adaptability: Math.round(30 + r('a') * 65),
    bigMatch: Math.round(clamp(40 + o.intlRep * 8 + r('b') * 25, 20, 98)),
    ambition: Math.round(30 + r('m') * 65),
    loyalty: Math.round(ps.includes('One club player') ? 96 : 20 + r('l') * 70),
    temperament: Math.round(clamp(attrs[20] * 0.6 + r('t') * 40, 10, 99)),
  }
  const p: Player = {
    id, name: o.name, fullName: o.fullName, shortName: o.shortName, nation: o.nation, clubId: o.clubId, positions,
    dob: o.dob, height: o.height, weight: o.weight, foot: o.leftFoot ? 'L' : 'R', ovr: o.ovr, pot: Math.max(o.pot, o.ovr),
    ovrAdj, attrs: [...attrs], weakFoot: o.weakFoot || 3, skillMoves: o.skillMoves || 2, intlRep: o.intlRep || 1, workRate,
    bodyType: o.bodyType || '', playstyles: ps.filter((s) => s !== 'Injury prone' || true), playstylesPlus: pp,
    value: o.value || 0, wage: o.wage || 500,
    contract: { until: o.contractUntil || 0, wage: o.wage || 500, role: 'Rotation', releaseClause: o.releaseClause || 0, signedOn: o.joined || '2025-07-01' },
    jersey: o.jersey || 0, realFace: !!o.realFace,
    fitness: Math.round(88 + r('f') * 12), sharpness: Math.round(48 + r('s') * 22), morale: Math.round(62 + r('mo') * 18),
    formRatings: [], suspensions: [], yellowAccum: {}, joinedDate: o.joined || undefined, trainingPlan: 'Balanced',
    devPlan: 'balanced', devProgress: Math.round(r('dp') * 40), growthHistory: [{ date: start, ovr: o.ovr }], hidden,
    season: {}, career: [], nationalCaps: o.nationPosition ? Math.round(10 + r('caps') * 60) : 0,
  }
  return p
}

function assignRolesAndNumbers(w: World, club: Club) {
  const squad = squadOf(w, club.id).sort((a, b) => b.ovr - a.ovr)
  squad.forEach((p, i) => {
    const age = ageOn(p.dob, w.date)
    let role: SquadRole = i < 3 ? 'Crucial' : i < 9 ? 'Important' : i < 16 ? 'Rotation' : 'Sparingly'
    if (age <= 21 && p.pot - p.ovr >= 7 && i >= 9) role = 'Prospect'
    p.contract.role = role
  })
  const used = new Set<number>()
  const clash = new Set<number>()
  for (const p of squad) {
    if (p.jersey > 0 && p.jersey < 100) { if (used.has(p.jersey)) clash.add(p.id); else used.add(p.jersey) }
  }
  const prefs: Record<string, number[]> = {
    GK: [1, 13, 25, 31, 12, 30, 40], DEF: [2, 3, 4, 5, 6, 12, 15, 16, 22, 23, 24, 26, 27, 28, 32, 33, 35],
    MID: [8, 6, 10, 14, 16, 17, 18, 20, 21, 25, 29, 34, 36, 38], ATT: [9, 7, 11, 19, 10, 14, 17, 18, 20, 29, 39, 47],
  }
  for (const p of squad) {
    if (p.jersey > 0 && p.jersey < 100 && !clash.has(p.id)) continue
    const g = POS_GROUP[p.positions[0]]
    let n = prefs[g].find((x) => !used.has(x))
    if (!n) { n = 30; while (used.has(n)) n++ }
    used.add(n)
    p.jersey = n
  }
}

export function genManager(w: World, rng: Rng, nation: string, id: number, clubId: number, rep: number): Manager {
  const name = staffName(rng, w.namePools, nation)
  const vis = ['Balanced', 'Possession', 'Counter-Attack', 'Gegenpress', 'Direct', 'Park the Bus', 'Wing Play']
  const forms = ['4-2-3-1 Wide', '4-3-3 Holding', '4-4-2 Flat', '4-3-3 Attack', '3-5-2', '4-1-4-1', '5-3-2', '3-4-2-1', '4-4-2 Holding']
  return {
    id, name, nationality: nation, age: rng.int(38, 62), clubId, formation: rng.pick(forms), vision: rng.pick(vis),
    reputation: Math.round(clamp(rep + rng.int(-10, 5), 10, 85)), real: false, faceSeed: rng.int(1, 1e9),
    record: { p: 0, w: 0, d: 0, l: 0 }, trophies: 0,
  }
}

function mainNation(w: World, country: string) {
  if (w.nations[country]) return country
  const map: Record<string, string> = { 'Republic of Ireland': 'Republic of Ireland', 'Korea Republic': 'Korea Republic', 'China PR': 'China PR', Czechia: 'Czechia' }
  return map[country] || country
}

export function createWorld(raw: RawDb, opts: NewCareerOptions): World {
  const seed = opts.seed ?? (Date.now() & 0x7fffffff)
  const rng = new Rng(seed)
  const start = raw.startDate
  const w: World = {
    meta: { version: SAVE_SCHEMA, id: `career-${seed.toString(36)}`, created: new Date().toISOString(), seed, saveName: opts.saveName || '', playTimeMin: 0, ...(opts.editMode ? { editMode: true } : {}) },
    date: start, season: 2026, seasonStart: start, seasonEnd: '2027-06-30', rng: seed, settings: opts.settings,
    user: {
      firstName: opts.manager.firstName, lastName: opts.manager.lastName, nationality: opts.manager.nationality, dob: opts.manager.dob,
      avatar: opts.manager.avatar, reputation: 45, clubId: opts.clubId, history: [], trophies: [], awards: [], jobOffers: [], rating: 50,
      realManager: opts.manager.realManager, avatarColor: opts.manager.avatarColor, style: opts.manager.style,
    },
    userClubId: opts.clubId,
    market: { stories: [], seq: 1 },
    nations: Object.fromEntries(raw.nations.map((n) => [n.name, n])),
    leagues: {}, clubs: {}, players: {}, managers: {}, competitions: {}, fixtures: {}, windows: [], intlBreaks: [],
    transfers: { offers: {}, history: [], shortlist: [], targets: {}, knowledge: {} },
    scouts: [], scoutPool: [], youthScouts: [], youthScoutPool: [], prospects: [], inbox: [], news: [],
    board: { objectives: [], confidence: { 'Domestic Success': 70, 'Continental Success': 70, Financial: 70, 'Brand Exposure': 70, 'Youth Development': 70 }, overall: 70, warnings: 0 },
    promises: [], conversations: [], awards: [], archive: [], records: {}, namePools: raw.namePools,
    nextIds: { player: 9_000_000, manager: 1, msg: 1, news: 1, offer: 1, misc: 1 }, flags: { valueCalibV1: true },
  }
  for (const lg of raw.leagues) w.leagues[lg.id] = { ...lg } as LeagueDef
  for (const row of raw.players) {
    const p = buildPlayer(row, raw.playerFields, start)
    w.players[p.id] = p
  }
  // ---- clubs
  const leagueRank: Record<number, number[]> = {}
  for (const c of raw.clubs) if (c.leagueId) (leagueRank[c.leagueId] ||= []).push(c.id)
  const avgOf = new Map(raw.clubs.map((c) => [c.id, c.squadAvg]))
  for (const ids of Object.values(leagueRank)) ids.sort((a, b) => (avgOf.get(b) || 0) - (avgOf.get(a) || 0))
  for (const rc of raw.clubs) {
    const lg = w.leagues[rc.leagueId]
    const ranks = leagueRank[rc.leagueId] || [rc.id]
    const rank = ranks.indexOf(rc.id)
    const n = Math.max(2, ranks.length)
    const intl = clamp(Math.round((rc.squadAvg - 59.5) / 2.25), 1, 10)
    const dom = lg ? clamp(Math.round(2 + 8 * (1 - rank / (n - 1)) * (0.75 + lg.prestige * 0.025)), 1, 10) : clamp(intl + 1, 1, 10)
    const budget = clubBudget(rc.squadValue, lg, intl)
    const hist = raw.history[String(rc.leagueId)]
    const lastPos = hist ? hist.findIndex((r) => r.clubId === rc.id) + 1 || undefined : undefined
    const club: Club = {
      id: rc.id, name: rc.name, short: rc.short, abbr: rc.abbr, dbName: rc.dbName, leagueId: rc.leagueId, country: rc.country,
      stadium: rc.stadium, capacity: rc.capacity || Math.round(4000 + rc.squadAvg * 120), city: rc.city, founded: rc.founded,
      kit: rc.kit, theme: rc.theme, badge: rc.badge, sofifaTeamId: rc.sofifaTeamId, rivals: rc.rivals,
      prestige: { domestic: dom, intl }, managerId: 0, sheets: [], activeSheet: 'first', squadAvg: rc.squadAvg,
      reputation: clamp(Math.round(rc.squadAvg * 1.9 - 72 + (lg?.prestige || 4) * 2.2), 5, 100),
      youthRating: clamp(Math.round(intl * 0.55 + 2 + rng.next() * 3), 1, 10),
      finance: {
        balance: roundValue(budget * 1.4 + rc.wageBill * 18), transferBudget: budget,
        wageBudget: Math.round(rc.wageBill * (1.04 + rng.next() * 0.1)), revenueSeason: 0, expensesSeason: 0, ledger: [],
      },
      trophies: [], lastSeasonPos: lastPos && lastPos > 0 ? lastPos : undefined,
    }
    w.clubs[club.id] = club
  }
  // ---- managers
  for (const rc of raw.clubs) {
    const club = w.clubs[rc.id]
    const id = w.nextIds.manager++
    let m: Manager
    if (rc.manager) {
      m = { id, name: rc.manager.name, nationality: rc.manager.nationality, age: rc.manager.age, clubId: club.id,
        formation: formationOf(rc.manager.formation).id, vision: rc.manager.vision, reputation: clamp(club.reputation + 5, 20, 99),
        real: true, faceSeed: hashString(rc.manager.name), record: { p: 0, w: 0, d: 0, l: 0 }, trophies: 0, appointed: '2025-07-01' }
    } else {
      m = genManager(w, rng, mainNation(w, club.country), id, club.id, club.reputation)
    }
    w.managers[id] = m
    club.managerId = id
  }
  // free-agent manager pool
  for (let i = 0; i < 36; i++) {
    const nat = rng.pick(['England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands', 'Argentina', 'Brazil', 'Belgium', 'Scotland', 'Denmark'])
    const id = w.nextIds.manager++
    w.managers[id] = genManager(w, rng, nat, id, 0, rng.int(25, 70))
  }
  // ---- squads: roles, numbers, values, sheets
  for (const club of Object.values(w.clubs)) {
    assignRolesAndNumbers(w, club)
    const mgr = w.managers[club.managerId]
    const formation = formationOf(mgr?.formation || '4-3-3 Holding').id
    const sheet = buildSheet(w, club, formation, tacticsForManager(mgr?.vision || 'Balanced', formation))
    club.sheets = [sheet]
    club.activeSheet = sheet.id
  }
  for (const p of Object.values(w.players)) {
    const raw = dynamicValue(p, start)
    if (!p.value) p.value = raw
    else if (!p.regen) p.valueCalib = Math.max(0.35, Math.min(2.5, p.value / Math.max(1, raw)))
  }
  // ---- user replaces the incumbent manager
  const userClub = w.clubs[opts.clubId]
  const incumbent = w.managers[userClub.managerId]
  if (incumbent) { incumbent.clubId = 0; w.flags.replacedManager = incumbent.name }
  userClub.managerId = -1
  w.user.history.push({ clubId: userClub.id, from: start, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, trophies: [] })
  w.user.reputation = clamp(Math.round(userClub.reputation * 0.55), 20, 70)
  // playing as a real manager: they leave their current post (an AI appointment replaces them) and bring their standing
  if (opts.manager.realManager) {
    const real = Object.values(w.managers).find((m) => m.real && m.name === opts.manager.realManager)
    if (real) {
      w.user.reputation = clamp(Math.round(real.reputation * 0.9), 30, 95)
      if (real.clubId && real.clubId !== userClub.id) {
        const club = w.clubs[real.clubId]
        const repl = genManager(w, rng, club.country in w.nations ? club.country : real.nationality, w.nextIds.manager++, club.id, club.reputation)
        w.managers[repl.id] = repl
        club.managerId = repl.id
      }
      real.clubId = 0
      real.retired = true
    }
  }
  if (opts.manager.style) {
    for (const sh of userClub.sheets) sh.tactics = tacticsForManager(opts.manager.style, sh.formation)
  }
  // user team sheets: First Team + saved alternatives
  const base = userClub.sheets[0]
  userClub.sheets = [
    { ...base, id: 'first', name: 'First Team' },
    { ...buildSheet(w, userClub, base.formation, { ...base.tactics }, { rotate: 1, id: 'cup', name: 'Cup XI' }) },
  ]
  applyDifficultyBudget(w)
  // ---- 2026/27 UEFA with real pots (unlicensed clubs replaced by the best eligible database clubs)
  const pots = replaceUnlicensed(w, raw)
  // ---- super cups 2026/27 from real 2025/26 honours
  const hist = (lid: number) => (raw.history[String(lid)] || []).map((r) => r.clubId)
  const H = raw.holders
  const byDb = (name: string) => Object.values(w.clubs).find((c) => c.dbName === name)?.id || 0
  const superCups: Record<string, number[]> = {
    COMMSHIELD: [hist(13)[0], H.FACUP && H.FACUP !== hist(13)[0] ? H.FACUP : hist(13)[1]],
    SUPERCOPA: uniq([hist(53)[0], hist(53)[1], H.CDR, ...hist(53).slice(2)]).slice(0, 4),
    DFLSC: [hist(19)[0], H.DFB && H.DFB !== hist(19)[0] ? H.DFB : hist(19)[1]],
    SCI: uniq([hist(31)[0], hist(31)[1], H.CI, byDb('SS Lazio'), ...hist(31).slice(2)]).slice(0, 4),
    TDC: [hist(16)[0], H.CDF && H.CDF !== hist(16)[0] ? H.CDF : hist(16)[1]],
    JCS: [hist(10)[0], hist(10)[1]],
    SUPERTACA: [hist(308)[0], hist(308)[1]],
  }
  const real: Record<string, [string, string, number, number, number][]> = raw.fixtures
  setupSeason(w, 2026, { realFixtures: real, uefaPots: pots, superCups, ciSeeds: hist(31).slice(0, 8) }, rng)
  // title holders
  const addTrophy = (clubId: number, compKey: string) => { if (w.clubs[clubId]) w.clubs[clubId].trophies.push({ compKey, season: 2025 }) }
  for (const [lid, rows] of Object.entries(raw.history)) if (rows[0]) addTrophy(rows[0].clubId, `L${lid}`)
  for (const [k, v] of Object.entries(H)) if (!k.endsWith('1') && v) addTrophy(v, k)
  for (const c of Object.values(w.competitions)) {
    const holder = H[c.key] || (c.key.startsWith('L') ? raw.history[c.key.slice(1)]?.[0]?.clubId : undefined)
    if (holder) c.holderId = holder
  }
  // ---- staff pools
  seedScouts(w, rng)
  w.rng = rng.state
  return w
}

function uniq(a: (number | undefined)[]): number[] {
  const out: number[] = []
  for (const x of a) if (x && !out.includes(x)) out.push(x)
  return out
}

function replaceUnlicensed(w: World, raw: RawDb): Record<string, number[][]> {
  const inAny = new Set<number>()
  const out: Record<string, number[][]> = {}
  for (const k of ['UCL', 'UEL', 'UECL']) for (const pot of raw.uefa[k]?.pots || []) for (const c of pot) inAny.add(c)
  const EUROPE = new Set(['Netherlands', 'Portugal', 'Belgium', 'Scotland', 'Türkiye', 'Austria', 'Switzerland', 'Denmark', 'Norway', 'Sweden', 'Poland', 'Romania', 'Greece', 'Croatia', 'Czechia', 'Ukraine', 'Cyprus', 'Hungary', 'Azerbaijan', 'Finland', 'Bulgaria', 'Republic of Ireland'])
  const cands = Object.values(w.clubs).filter((c) => EUROPE.has(c.country) && !inAny.has(c.id) && (w.leagues[c.leagueId]?.level ?? 1) === 1)
    .sort((a, b) => b.squadAvg - a.squadAvg)
  for (const k of ['UCL', 'UEL', 'UECL']) {
    const pots = (raw.uefa[k]?.pots || []).map((p) => [...p])
    const size = k === 'UECL' ? 6 : 9
    for (const pot of pots) {
      while (pot.length < size && cands.length) {
        const c = cands.shift()!
        pot.push(c.id)
        inAny.add(c.id)
      }
    }
    out[k] = pots
  }
  return out
}

function applyDifficultyBudget(w: World) {
  const c = w.clubs[w.userClubId]
  const f = w.settings.startingBudget === 'Low' ? 0.6 : w.settings.startingBudget === 'High' ? 1.6 : 1
  c.finance.transferBudget = roundValue(c.finance.transferBudget * f)
}

function seedScouts(w: World, rng: Rng) {
  const nats = ['England', 'Spain', 'Germany', 'Italy', 'France', 'Brazil', 'Argentina', 'Portugal', 'Netherlands', 'Belgium', 'Norway', 'Denmark', 'Croatia', 'Uruguay', 'Colombia', 'Japan', 'United States', 'Nigeria', 'Senegal', 'Côte d\'Ivoire', 'Ghana', 'Morocco', 'Serbia', 'Poland', 'Sweden', 'Austria', 'Switzerland', 'Scotland', 'Republic of Ireland', 'Türkiye', 'Mexico']
  const mk = (id: number, exp: number, jud: number): Scout => {
    const nat = rng.pick(nats)
    return { id, name: staffName(rng, w.namePools, nat), nationality: nat, experience: exp, judgement: jud, wage: Math.round((600 + (exp + jud) * 900 + rng.int(0, 600)) / 50) * 50, faceSeed: rng.int(1, 1e9) }
  }
  const star = () => clamp(Math.round(rng.normal(2.8, 1)), 1, 5)
  w.scouts = [mk(w.nextIds.misc++, 2, 3)]
  for (let i = 0; i < 12; i++) w.scoutPool.push(mk(w.nextIds.misc++, star(), star()))
  const ys = (id: number, exp: number, jud: number): YouthScout => ({ ...mk(id, exp, jud) })
  w.youthScouts = [ys(w.nextIds.misc++, 2, 2)]
  for (let i = 0; i < 10; i++) w.youthScoutPool.push(ys(w.nextIds.misc++, star(), star()))
}
