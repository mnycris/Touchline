// International football. National teams are sides made of real players: before each international match day a
// nation calls up its best available players (they leave their clubs), plays real fixtures through the match engine,
// and sends them back after its last game of the window or when it goes out of a tournament.
//
// The calendar follows a four-year cycle that matches the real one:
//   2026/27  UEFA Nations League (autumn) + Finals (June) · Asian Cup (January) · AFCON and Gold Cup (June) · friendlies
//   2027/28  Euro qualifiers (autumn + March) → Euro 2028 (June) · Copa América 2028 (June) · friendlies
//   2028/29  Nations League + Finals · AFCON and Gold Cup 2029 · friendlies
//   2029/30  World Cup qualifiers in every confederation (autumn + March) → World Cup 2030 (June)
// Summer tournaments are played in June so they finish before the new club season.
import type { Club, Competition, Fixture, IntlMeta, ISODate, MatchResult, Player, Position, World } from '../../domain/types'
import { ensureRanking, maybePublish, rankingAfterMatch } from './fifaRanking'
import { Rng, clamp } from '../../domain/rng'
import { addDays, ageOn, fmtDate, weekday } from '../../domain/dates'
import { seasonDates } from '../competitions/calendar'
import { multiRoundRobin } from '../competitions/leagues'
import { newFixture } from '../competitions/fixtures'
import { emptyRow, sortTable } from '../competitions/tables'
import { tieWinner } from '../competitions/cups'
import { postNews, sendInbox, staffNames } from './messages'
import { callName } from '../match/commentary'

export const NT_BASE = 9_500_000
/** Suspended from international competition: friendlies only. */
const BANNED = new Set(['Russia'])

export const isNational = (c?: Pick<Club, 'id'> | number) => (typeof c === 'number' ? c : c?.id ?? 0) >= NT_BASE
export const ntId = (w: World, nation: string) => w.intl?.nt[nation]
export const nationalTeam = (w: World, nation: string): Club | undefined => { const id = ntId(w, nation); return id ? w.clubs[id] : undefined }

const SHORT: Record<string, string> = {
  'Bosnia and Herzegovina': 'Bosnia', 'Republic of Ireland': 'Ireland', 'Northern Ireland': 'N. Ireland', 'Korea Republic': 'South Korea',
  'United States': 'USA', "Côte d'Ivoire": 'Ivory Coast', 'Congo DR': 'DR Congo', 'China PR': 'China', 'Saudi Arabia': 'Saudi Arabia',
  'Guinea-Bissau': 'G.-Bissau', 'Cabo Verde': 'Cape Verde', 'New Zealand': 'New Zealand',
}
const STADIUM: Record<string, string> = {
  England: 'Wembley Stadium', France: 'Stade de France', Spain: 'Estadio Metropolitano', Germany: 'Allianz Arena', Italy: 'Stadio Olimpico',
  Portugal: 'Estádio da Luz', Netherlands: 'Johan Cruijff ArenA', Belgium: 'King Baudouin Stadium', Brazil: 'Maracanã', Argentina: 'Estadio Monumental',
  Uruguay: 'Estadio Centenario', Croatia: 'Stadion Maksimir', Morocco: 'Stade Prince Moulay Abdellah', Scotland: 'Hampden Park', Wales: 'Cardiff City Stadium',
  'Republic of Ireland': 'Aviva Stadium', 'Northern Ireland': 'Windsor Park', Denmark: 'Parken', Norway: 'Ullevaal Stadion', Sweden: 'Strawberry Arena',
  Switzerland: 'St. Jakob-Park', Austria: 'Ernst-Happel-Stadion', Poland: 'PGE Narodowy', Türkiye: 'Atatürk Olympic Stadium', Serbia: 'Rajko Mitić Stadium',
  Colombia: 'Estadio Metropolitano Roberto Meléndez', Mexico: 'Estadio Azteca', 'United States': 'Mercedes-Benz Stadium', Japan: 'Saitama Stadium',
  'Korea Republic': 'Seoul World Cup Stadium', Senegal: 'Stade Abdoulaye Wade', Nigeria: 'Godswill Akpabio Stadium', Ghana: 'Baba Yara Stadium',
  Egypt: 'Cairo International Stadium', 'Saudi Arabia': 'King Fahd International Stadium', Australia: 'Stadium Australia', Canada: 'BMO Field',
  Greece: 'OAKA Spyros Louis', Czechia: 'Fortuna Arena', Hungary: 'Puskás Aréna', Romania: 'Arena Națională', Ukraine: 'Olimpiyskiy',
  Chile: 'Estadio Nacional', Ecuador: 'Estadio Rodrigo Paz Delgado', Paraguay: 'Estadio Defensores del Chaco', Peru: 'Estadio Nacional de Lima',
  Algeria: 'Stade Nelson Mandela', 'Côte d\'Ivoire': 'Stade Alassane Ouattara', Cameroon: 'Stade Olembe', Tunisia: 'Stade Hammadi Agrebi',
}
const KIT: Record<string, [string, string]> = {
  England: ['#f4f6f8', '#1d2a5b'], France: ['#1d3a8a', '#ffffff'], Spain: ['#c8102e', '#f1bf00'], Germany: ['#f4f6f8', '#111111'], Italy: ['#1f5fbf', '#ffffff'],
  Portugal: ['#b11226', '#0a6b3d'], Netherlands: ['#f36c21', '#1d2a5b'], Belgium: ['#c8102e', '#111111'], Brazil: ['#f7d417', '#1f7a3d'], Argentina: ['#75aadb', '#ffffff'],
  Uruguay: ['#5ab4e5', '#111111'], Croatia: ['#e3232a', '#ffffff'], Morocco: ['#c1272d', '#006233'], Scotland: ['#1d2a5b', '#ffffff'], Wales: ['#c8102e', '#ffffff'],
  'Republic of Ireland': ['#169b62', '#ffffff'], 'Northern Ireland': ['#1f7a3d', '#ffffff'], Denmark: ['#c8102e', '#ffffff'], Norway: ['#c8102e', '#1d2a5b'],
  Sweden: ['#fecc02', '#1d4f9c'], Switzerland: ['#d52b1e', '#ffffff'], Austria: ['#c8102e', '#ffffff'], Poland: ['#f4f6f8', '#dc143c'], Türkiye: ['#e30a17', '#ffffff'],
  Serbia: ['#c6363c', '#0c4076'], Colombia: ['#fcd116', '#003893'], Mexico: ['#006847', '#ce1126'], 'United States': ['#f4f6f8', '#1d2a5b'], Japan: ['#1d3a8a', '#ffffff'],
  'Korea Republic': ['#c8102e', '#1d2a5b'], Senegal: ['#f4f6f8', '#00853f'], Nigeria: ['#008751', '#ffffff'], Ghana: ['#f4f6f8', '#006b3f'], Egypt: ['#c8102e', '#ffffff'],
  'Saudi Arabia': ['#006c35', '#ffffff'], Australia: ['#fcd116', '#00843d'], Canada: ['#d52b1e', '#ffffff'], Greece: ['#0d5eaf', '#ffffff'], Czechia: ['#d7141a', '#11457e'],
  Hungary: ['#c8102e', '#ffffff'], Romania: ['#fcd116', '#002b7f'], Ukraine: ['#ffd500', '#005bbb'], Chile: ['#d52b1e', '#0039a6'], Ecuador: ['#ffd100', '#034ea2'],
  Paraguay: ['#d52b1e', '#ffffff'], Peru: ['#f4f6f8', '#d91023'], Algeria: ['#f4f6f8', '#006233'], "Côte d'Ivoire": ['#f77f00', '#009e60'], Cameroon: ['#007a5e', '#ce1126'],
  Tunisia: ['#e70013', '#ffffff'], 'Bosnia and Herzegovina': ['#002f6c', '#fecb00'], Slovakia: ['#0b4ea2', '#ffffff'], Slovenia: ['#f4f6f8', '#0072bc'], Finland: ['#f4f6f8', '#003580'],
  Iceland: ['#02529c', '#ffffff'], Albania: ['#e41e20', '#111111'], Georgia: ['#f4f6f8', '#e8112d'], Kosovo: ['#244aa5', '#d0a650'], Venezuela: ['#7b1e2c', '#ffffff'],
  Bolivia: ['#007934', '#ffffff'], Jamaica: ['#fed100', '#009b3a'], Mali: ['#14b53a', '#fcd116'], Qatar: ['#8a1538', '#ffffff'], 'New Zealand': ['#f4f6f8', '#111111'],
}

/** Create national teams for every nation with enough players in the world (once per save). */
export function ensureNationalTeams(w: World) {
  if (w.intl && Object.keys(w.intl.nt).length) return
  const count = new Map<string, number>()
  for (const p of Object.values(w.players)) if (!p.academy) count.set(p.nation, (count.get(p.nation) || 0) + 1)
  const eligible = [...count.entries()].filter(([n, c]) => c >= 18 && w.nations[n]).map(([n]) => n).sort()
  const nt: Record<string, number> = {}
  eligible.forEach((n, i) => {
    const id = NT_BASE + i + 1
    nt[n] = id
    const nat = w.nations[n]
    const kit = KIT[n] || ['#2a3346', '#ffffff']
    const club: Club = {
      id, name: n, short: SHORT[n] || n, abbr: (nat.code || n.slice(0, 3)).toUpperCase(), dbName: n, leagueId: 0, country: 'International',
      stadium: STADIUM[n] || `${n} national stadium`, capacity: 50000, city: '', founded: 1900, kit, theme: kit[0], badge: false, sofifaTeamId: 0,
      rivals: [], prestige: { domestic: 10, intl: 10 }, managerId: 0, sheets: [], activeSheet: '', squadAvg: 70, reputation: 70, youthRating: 5, trophies: [],
      finance: { balance: 0, transferBudget: 0, wageBudget: 0, revenueSeason: 0, expensesSeason: 0, ledger: [] },
      national: true, nation: n, flag: nat.flag, confed: nat.confed,
    }
    w.clubs[id] = club
  })
  w.intl = { nt, squads: {} }
  refreshStrength(w)
}

/** Squad strength: the average of the nation's best 23. */
export function refreshStrength(w: World) {
  const by = new Map<string, number[]>()
  for (const p of Object.values(w.players)) { if (p.academy) continue; const a = by.get(p.nation) || []; a.push(p.ovr); by.set(p.nation, a) }
  for (const [n, id] of Object.entries(w.intl?.nt || {})) {
    const top = (by.get(n) || []).sort((a, b) => b - a).slice(0, 23)
    const c = w.clubs[id]
    if (c && top.length) { c.squadAvg = Math.round((top.reduce((s, x) => s + x, 0) / top.length) * 10) / 10; c.reputation = clamp(Math.round((c.squadAvg - 55) * 3), 20, 99) }
  }
}

function teams(w: World, confed?: string, opts: { competitive?: boolean } = {}): Club[] {
  return Object.values(w.intl?.nt || {}).map((id) => w.clubs[id]).filter((c) => c && (!confed || c.confed === confed) && (!opts.competitive || !BANNED.has(c.nation!)))
    .sort((a, b) => b.squadAvg - a.squadAvg)
}

// ---------------------------------------------------------------- squads
const QUOTA: Record<'GK' | 'DEF' | 'MID' | 'FWD', number> = { GK: 3, DEF: 8, MID: 7, FWD: 5 }
const GRP = (pos: Position): 'GK' | 'DEF' | 'MID' | 'FWD' => pos === 'GK' ? 'GK' : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(pos) ? 'DEF' : ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(pos) ? 'MID' : 'FWD'

/** The best available players of a nation, balanced by position (23, or 26 for a tournament). */
export function pickSquad(w: World, nation: string, size = 23): Player[] {
  const pool = Object.values(w.players).filter((p) => p.nation === nation && !p.academy && !p.injury && ageOn(p.dob, w.date) >= 17)
  const score = (p: Player) => p.ovr + p.intlRep * 0.4 + (p.sharpness - 60) * 0.02 - (ageOn(p.dob, w.date) >= 35 ? 2 : 0)
  pool.sort((a, b) => score(b) - score(a))
  const extra = size - 23
  const want = { ...QUOTA, DEF: QUOTA.DEF + Math.ceil(extra / 3), MID: QUOTA.MID + Math.floor(extra / 3), FWD: QUOTA.FWD + (extra >= 3 ? 1 : 0) }
  const out: Player[] = []
  const got = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const p of pool) { const g = GRP(p.positions[0]); if (got[g] < want[g]) { out.push(p); got[g]++ } if (out.length >= size) break }
  for (const p of pool) { if (out.length >= size) break; if (!out.includes(p) && GRP(p.positions[0]) !== 'GK') out.push(p) }
  return out
}

/** A national side's players for team selection: the called-up squad, or who would be picked right now. */
export function nationalSquad(w: World, clubId: number): Player[] {
  const ids = w.intl?.squads[clubId]
  if (ids?.length) return ids.map((id) => w.players[id]).filter(Boolean)
  const c = w.clubs[clubId]
  return c?.nation ? pickSquad(w, c.nation) : []
}

// ---------------------------------------------------------------- calendar
const KO_NAME = (n: number) => (n === 2 ? 'Final' : n === 4 ? 'Semi-finals' : n === 8 ? 'Quarter-finals' : `Round of ${n}`)
const GROUP_LETTERS = 'ABCDEFGHIJKL'

interface Def { key: string; name: string; short: string; logoKey?: string; confed: string; kind: IntlMeta['kind']; squadSize?: number; hosts?: string[]; tier: number }

function makeComp(w: World, d: Def, season: number, meta: Partial<IntlMeta>): Competition {
  const id = `${d.key}-${season}`
  const comp: Competition = {
    id, key: d.key, name: d.name, short: d.short, format: 'intl', season, country: 'International', tier: d.tier, clubs: [], fixtures: [], rounds: [], status: 'upcoming',
    rules: { extraTime: true, penalties: true }, logoKey: d.logoKey || d.key,
    intl: { confed: d.confed, kind: d.kind, stage: 'groups', squadSize: d.squadSize || 23, hosts: d.hosts, ...meta },
  }
  w.competitions[id] = comp
  return comp
}

const venueOf = (w: World, comp: Competition, home: number, i: number) => comp.intl?.hosts?.length ? comp.intl.hosts[i % comp.intl.hosts.length] : w.clubs[home]?.stadium

/** Groups played on the given dates (round robin, single or double), a table row per side with its group. */
function addGroups(w: World, comp: Competition, groups: number[][], dates: ISODate[], rng: Rng, names?: string[], time = '20:45') {
  comp.table = comp.table || []
  comp.groups = comp.groups || {}
  let n = 0
  groups.forEach((g, gi) => {
    const name = names?.[gi] || `Group ${GROUP_LETTERS[gi]}`
    comp.groups![name] = [...g]
    for (const id of g) { comp.table!.push(emptyRow(id, name)); if (!comp.clubs.includes(id)) comp.clubs.push(id) }
    const legs = g.length <= 4 && dates.length >= (g.length - 1) * 2 ? 2 : 1
    const rounds = multiRoundRobin(g, legs, rng)
    rounds.slice(0, dates.length).forEach((round, ri) => {
      for (const [h, a] of round) {
        const neutral = !!comp.intl?.hosts?.length
        newFixture(w, comp, h, a, dates[ri], neutral ? (['15:00', '18:00', '21:00'][n++ % 3]) : time, `${name} · MD${ri + 1}`, { importance: comp.tier <= 1 ? 3 : 2, neutral, venue: venueOf(w, comp, h, n) })
      }
    })
  })
}

/** Split sides into groups of about `size`, seeded in pots so each group gets one strong side, one weaker... */
function seedGroups(list: Club[], nGroups: number, rng: Rng, w?: World): number[][] {
  const groups: number[][] = Array.from({ length: nGroups }, () => [])
  // pots by the world ranking, as FIFA and the confederations draw them (strength before a ranking exists)
  const pts = w?.intl?.fifa?.pts
  const sorted = [...list].sort((a, b) => (pts ? (pts[b.id] ?? 0) - (pts[a.id] ?? 0) : b.squadAvg - a.squadAvg))
  for (let i = 0; i < sorted.length; i += nGroups) {
    const pot = sorted.slice(i, i + nGroups)
    rng.shuffle(pot)
    pot.forEach((c, k) => groups[k].push(c.id))
  }
  return groups.filter((g) => g.length >= 2)
}

function windowDates(season: number) {
  const b = seasonDates(season).intlBreaks
  const at = (d: ISODate, k: number) => addDays(d, k)
  return {
    autumn: [at(b[0].start, 3), at(b[0].start, 6), at(b[0].start, 10), at(b[0].start, 13), at(b[1].start, 3), at(b[1].start, 6)],
    march: [at(b[2].start, 3), at(b[2].start, 6)],
    june: [`${season + 1}-06-03`, `${season + 1}-06-06`],
  }
}

const HOSTS: Record<string, string[]> = {
  UNLF: ['Wembley Stadium'],
  ASIAN: ['King Fahd International Stadium', 'King Abdullah Sports City', 'Prince Faisal bin Fahd Stadium', 'King Salman Stadium'],
  AFCON: ['Moi International Sports Centre', 'Mandela National Stadium', 'Benjamin Mkapa Stadium', 'Nyayo National Stadium'],
  GOLD: ['SoFi Stadium', 'AT&T Stadium', 'MetLife Stadium', 'NRG Stadium', 'Levi\'s Stadium'],
  EURO: ['Wembley Stadium', 'Hampden Park', 'Principality Stadium', 'Aviva Stadium', 'Villa Park', 'Etihad Stadium', 'Tottenham Hotspur Stadium', 'St James\' Park', 'Hill Dickinson Stadium'],
  CA: ['Estadio Monumental', 'Maracanã', 'Estadio Centenario', 'Estadio Nacional', 'Estadio Metropolitano Roberto Meléndez'],
  WC: ['Santiago Bernabéu', 'Camp Nou', 'Estadio Metropolitano', 'Estádio da Luz', 'Estádio do Dragão', 'Grand Stade Hassan II', 'San Mamés', 'Ramón Sánchez-Pizjuán', 'Estádio José Alvalade', 'Stade Ibn Batouta'],
}

/** International fixtures for a season: competitions by the cycle, and friendlies for whoever isn't playing. */
export function setupIntlSeason(w: World, season: number, rng: Rng) {
  ensureNationalTeams(w)
  refreshStrength(w)
  w.intl!.squads = {}
  const cyc = (((season - 2026) % 4) + 4) % 4
  const wd = windowDates(season)
  const UEFA = teams(w, 'UEFA', { competitive: true })
  const y = season + 1
  if (cyc === 0 || cyc === 2) {
    // Nations League: League A (16) and B (16) in groups of 4, League C the rest; the four League A group winners meet in the Finals
    const unl = makeComp(w, { key: 'UNL', name: 'UEFA Nations League', short: 'Nations League', confed: 'UEFA', kind: 'tournament', tier: 2, hosts: undefined }, season, { advance: { top: 1, thirds: 0, groupsPrefix: 'League A' }, koDates: [`${y}-06-09`, `${y}-06-13`] })
    const A = UEFA.slice(0, 16), B = UEFA.slice(16, 32), C = UEFA.slice(32)
    addGroups(w, unl, seedGroups(A, 4, rng, w), wd.autumn, rng, ['League A · Group 1', 'League A · Group 2', 'League A · Group 3', 'League A · Group 4'])
    addGroups(w, unl, seedGroups(B, 4, rng, w), wd.autumn, rng, ['League B · Group 1', 'League B · Group 2', 'League B · Group 3', 'League B · Group 4'])
    if (C.length >= 3) addGroups(w, unl, [C.map((c) => c.id)], wd.autumn, rng, ['League C'])
    unl.intl!.hosts = undefined
    if (y % 4 === 3) {
      // Asian Cup, January (Saudi Arabia 2027): the best eight AFC sides
      const asian = makeComp(w, { key: 'ASIAN', name: 'AFC Asian Cup', short: 'Asian Cup', confed: 'AFC', kind: 'tournament', squadSize: 26, hosts: HOSTS.ASIAN, tier: 2 }, season, { advance: { top: 2, thirds: 0 }, koDates: [`${y}-01-24`, `${y}-01-28`] })
      addGroups(w, asian, seedGroups(teams(w, 'AFC').slice(0, 8), 2, rng, w), [`${y}-01-10`, `${y}-01-14`, `${y}-01-18`], rng)
    }
    if (y % 2 === 1) {
      const afcon = makeComp(w, { key: 'AFCON', name: 'Africa Cup of Nations', short: 'AFCON', confed: 'CAF', kind: 'tournament', squadSize: 26, hosts: HOSTS.AFCON, tier: 2 }, season, { advance: { top: 2, thirds: 0 }, koDates: [`${y}-06-20`, `${y}-06-24`, `${y}-06-29`] })
      addGroups(w, afcon, seedGroups(teams(w, 'CAF').slice(0, 16), 4, rng, w), [`${y}-06-08`, `${y}-06-12`, `${y}-06-16`], rng)
      const gold = makeComp(w, { key: 'GOLD', name: 'CONCACAF Gold Cup', short: 'Gold Cup', confed: 'CONCACAF', kind: 'tournament', squadSize: 26, hosts: HOSTS.GOLD, tier: 3 }, season, { advance: { top: 2, thirds: 0 }, koDates: [`${y}-06-22`, `${y}-06-27`] })
      const cc = [...teams(w, 'CONCACAF'), ...teams(w, 'AFC').filter((c) => !['Japan', 'Korea Republic'].includes(c.nation!)).slice(0, 1)].slice(0, 8)
      addGroups(w, gold, seedGroups(cc, 2, rng, w), [`${y}-06-10`, `${y}-06-14`, `${y}-06-18`], rng)
    }
  }
  if (cyc === 1) {
    const q = makeComp(w, { key: 'EUROQ', name: 'European Qualifiers', short: 'Euro Qualifiers', logoKey: 'EURO', confed: 'UEFA', kind: 'groups', tier: 2 }, season, { feeds: 'EURO', qualify: { top: 2, extra: 8 } })
    addGroups(w, q, seedGroups(UEFA, 8, rng, w), [...wd.autumn, ...wd.march], rng)
    const ca = makeComp(w, { key: 'CA', name: 'Copa América', short: 'Copa América', confed: 'CONMEBOL', kind: 'tournament', squadSize: 26, hosts: HOSTS.CA, tier: 1 }, season, { advance: { top: 2, thirds: 0 }, koDates: [`${y}-06-20`, `${y}-06-24`, `${y}-06-28`] })
    addGroups(w, ca, seedGroups([...teams(w, 'CONMEBOL'), ...teams(w, 'CONCACAF').slice(0, 6)].slice(0, 16), 4, rng, w), [`${y}-06-08`, `${y}-06-12`, `${y}-06-16`], rng)
  }
  if (cyc === 3) {
    // World Cup qualifying in every confederation; the World Cup itself is drawn when they end
    const slots: Record<string, { groups: number; top: number; extra: number }> = {
      UEFA: { groups: 8, top: 2, extra: 2 }, CAF: { groups: 3, top: 3, extra: 0 }, AFC: { groups: 2, top: 4, extra: 0 },
      CONMEBOL: { groups: 2, top: 3, extra: 0 }, CONCACAF: { groups: 2, top: 3, extra: 0 },
    }
    for (const [conf, s] of Object.entries(slots)) {
      const list = teams(w, conf, { competitive: true })
      if (list.length < 4) continue
      const q = makeComp(w, { key: `WCQ${conf}`, name: `World Cup Qualifiers · ${conf}`, short: `WC Qualifiers (${conf})`, logoKey: 'WC', confed: conf, kind: 'groups', tier: 2 }, season, { feeds: 'WC', qualify: { top: s.top, extra: s.extra } })
      addGroups(w, q, seedGroups(list, Math.min(s.groups, Math.floor(list.length / 3)), rng, w), [...wd.autumn, ...wd.march], rng)
    }
  }
  scheduleFriendlies(w, season, [...wd.autumn, ...wd.march], rng)
}

/** A save from before international football: national teams now, and this season's remaining windows as friendlies
 *  (a competition can't start halfway through; next season has the full calendar). */
export function migrateIntl(w: World) {
  if (w.intl) return
  const rng = new Rng((w.meta.seed ^ 0x1a7e5) >>> 0)
  if (w.date < addDays(seasonDates(w.season).intlBreaks[0].start, -3)) { setupIntlSeason(w, w.season, rng); return }
  ensureNationalTeams(w)
  const wd = windowDates(w.season)
  scheduleFriendlies(w, w.season, [...wd.autumn, ...wd.march].filter((d) => d > addDays(w.date, 3)), rng)
}

/** Friendlies on window days for sides with no competitive match that day, paired with similar opposition. */
export function scheduleFriendlies(w: World, season: number, dates: ISODate[], rng: Rng, exclude = new Set<number>()) {
  const id = `INTF-${season}`
  const comp = w.competitions[id] || makeComp(w, { key: 'INTF', name: 'International Friendlies', short: 'Friendly', confed: 'FIFA', kind: 'friendly', tier: 4 }, season, { stage: 'done' })
  comp.intl!.stage = 'done'
  const busy = new Map<ISODate, Set<number>>()
  for (const f of Object.values(w.fixtures)) if (f.home >= NT_BASE && !f.played) { const s = busy.get(f.date) || new Set<number>(); s.add(f.home); s.add(f.away); busy.set(f.date, s) }
  const all = teams(w)
  for (const d of dates) {
    const b = busy.get(d) || new Set<number>()
    const free = all.filter((c) => !b.has(c.id) && !exclude.has(c.id))
    rng.shuffle(free)
    free.sort((a, c) => c.squadAvg - a.squadAvg + (rng.next() - 0.5) * 6)
    for (let i = 0; i + 1 < free.length; i += 2) {
      const [h, a] = rng.next() < 0.5 ? [free[i], free[i + 1]] : [free[i + 1], free[i]]
      newFixture(w, comp, h.id, a.id, d, weekday(d) === 6 || weekday(d) === 0 ? '18:00' : '20:45', 'Friendly', { importance: 1, venue: h.stadium })
      if (!comp.clubs.includes(h.id)) comp.clubs.push(h.id)
      if (!comp.clubs.includes(a.id)) comp.clubs.push(a.id)
    }
  }
}

// ---------------------------------------------------------------- after a match
/** Groups finish into knockouts, knockouts into the next round, qualifiers into the tournament they feed. */
export function advanceIntl(w: World, comp: Competition, f: Fixture, rng: Rng): { champion?: number } {
  const meta = comp.intl
  if (!meta || meta.kind === 'friendly') return {}
  if (comp.status === 'upcoming') comp.status = 'active'
  const all = comp.fixtures.map((id) => w.fixtures[id]).filter(Boolean)
  if (meta.stage === 'groups') {
    if (all.some((x) => !x.roundId && !x.played)) return {}
    if (meta.kind === 'groups') {
      meta.stage = 'done'
      comp.status = 'finished'
      if (meta.feeds) qualifiersDone(w, meta.feeds, comp.season, rng)
      return {}
    }
    const q = groupQualifiers(w, comp, meta.advance || { top: 2, thirds: 0 })
    meta.stage = 'ko'
    drawKnockout(w, comp, q, 0)
    return {}
  }
  if (meta.stage === 'ko') {
    const r = comp.rounds.find((x) => x.fixtures.includes(f.id))
    if (!r) return {}
    const ties = r.fixtures.map((id) => w.fixtures[id])
    if (ties.some((x) => !x.played)) return {}
    const winners = ties.map((x) => tieWinner(w, [x])!).filter(Boolean)
    r.winners = winners
    const ri = comp.rounds.indexOf(r)
    if (winners.length === 1) {
      meta.stage = 'done'
      comp.status = 'finished'
      comp.winner = winners[0]
      const fin = ties[0]
      comp.runnerUp = fin.home === winners[0] ? fin.away : fin.home
      return { champion: winners[0] }
    }
    drawKnockout(w, comp, winners, ri + 1, true)
  }
  return {}
}

function groupQualifiers(w: World, comp: Competition, adv: { top: number; thirds: number; groupsPrefix?: string }): number[] {
  const groups = Object.keys(comp.groups || {}).filter((g) => !adv.groupsPrefix || g.startsWith(adv.groupsPrefix))
  const tables = groups.map((g) => sortTable(w, comp, (comp.table || []).filter((r) => r.group === g)))
  const winners = tables.map((t) => t[0]).filter(Boolean)
  const runners = adv.top >= 2 ? tables.map((t) => t[1]).filter(Boolean) : []
  const rest = adv.top >= 3 ? tables.map((t) => t[2]).filter(Boolean) : []
  const rank = (a: typeof winners[number], b: typeof winners[number]) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
  const thirds = adv.thirds ? tables.map((t) => t[adv.top]).filter(Boolean).sort(rank).slice(0, adv.thirds) : []
  return [...winners.sort(rank), ...runners.sort(rank), ...rest.sort(rank), ...thirds].map((r) => r.clubId)
}

/** A knockout round: the first draws best against worst (keeping group-mates apart), later rounds follow the bracket. */
function drawKnockout(w: World, comp: Competition, sides: number[], ri: number, bracket = false) {
  const meta = comp.intl!
  const date = meta.koDates?.[ri] || addDays(w.date, 4)
  const pairs: [number, number][] = []
  if (bracket) for (let i = 0; i + 1 < sides.length; i += 2) pairs.push([sides[i], sides[i + 1]])
  else {
    const left = [...sides]
    const groupOf = (id: number) => comp.table?.find((r) => r.clubId === id)?.group
    while (left.length >= 2) {
      const a = left.shift()!
      let k = left.length - 1
      while (k > 0 && groupOf(left[k]) === groupOf(a)) k--
      pairs.push([a, left.splice(k, 1)[0]])
    }
    // bracket order: the winners of neighbouring ties meet next
  }
  const name = KO_NAME(pairs.length * 2)
  const round = { id: `${comp.id}-KO${ri}`, name, legs: 1 as const, date, fixtures: [] as string[], drawn: true }
  comp.rounds.push(round)
  pairs.forEach(([a, b], i) => {
    const neutral = !!meta.hosts?.length || comp.key === 'UNL'
    const venue = comp.key === 'UNL' ? w.clubs[pairs[0][0]]?.stadium : venueOf(w, comp, a, i + ri * 3)
    const d = pairs.length > 4 && i >= pairs.length / 2 ? addDays(date, 1) : date
    const f = newFixture(w, comp, a, b, d, name === 'Final' ? '21:00' : i % 2 ? '21:00' : '18:00', name, { importance: name === 'Final' ? 5 : 4, neutral, venue, roundId: round.id, tieId: `${round.id}-${i}` })
    round.fixtures.push(f.id)
  })
  if (ri === 0) postNews(w, { headline: `${comp.name}: the knockout draw`, body: pairs.map(([a, b]) => `${w.clubs[a]?.short} v ${w.clubs[b]?.short}`).join(' · '), kind: 'preview', playerIds: [], clubIds: [], compId: comp.id, importance: comp.tier <= 1 ? 4 : 3, userRelated: false })
}

/** A qualifying competition has ended: when every one feeding a tournament has, the tournament is drawn. */
function qualifiersDone(w: World, feeds: string, season: number, rng: Rng) {
  const quals = Object.values(w.competitions).filter((c) => c.season === season && c.intl?.feeds === feeds)
  if (quals.some((c) => c.status !== 'finished')) return
  const y = season + 1
  const qualified: number[] = []
  for (const q of quals) {
    const groups = Object.keys(q.groups || {})
    const tables = groups.map((g) => sortTable(w, q, (q.table || []).filter((r) => r.group === g)))
    const top = q.intl!.qualify?.top || 2
    for (const t of tables) qualified.push(...t.slice(0, top).map((r) => r.clubId))
    const extra = q.intl!.qualify?.extra || 0
    if (extra) {
      const next = tables.map((t) => t[top]).filter(Boolean).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga))
      qualified.push(...next.slice(0, extra).map((r) => r.clubId))
    }
  }
  if (feeds === 'WC') {
    const nz = ntId(w, 'New Zealand')
    if (nz && !qualified.includes(nz)) qualified.push(nz)
  }
  const list = [...new Set(qualified)].map((id) => w.clubs[id]).filter(Boolean)
  const size = feeds === 'WC' ? Math.min(48, list.length - (list.length % 4)) : Math.min(24, list.length - (list.length % 4))
  const field = list.sort((a, b) => b.squadAvg - a.squadAvg).slice(0, size)
  const def = feeds === 'WC'
    ? { key: 'WC', name: 'FIFA World Cup', short: 'World Cup', confed: 'FIFA', kind: 'tournament' as const, squadSize: 26, hosts: HOSTS.WC, tier: 1 }
    : { key: 'EURO', name: 'UEFA European Championship', short: 'Euro', confed: 'UEFA', kind: 'tournament' as const, squadSize: 26, hosts: HOSTS.EURO, tier: 1 }
  const nGroups = field.length / 4
  const thirds = nGroups >= 12 ? 8 : nGroups >= 6 ? 4 : 0
  const koTeams = nGroups * 2 + thirds
  const koDates = feeds === 'WC' ? [`${y}-06-15`, `${y}-06-19`, `${y}-06-23`, `${y}-06-26`, `${y}-06-30`] : [`${y}-06-17`, `${y}-06-21`, `${y}-06-25`, `${y}-06-29`]
  const comp = makeComp(w, def, season, { advance: { top: 2, thirds }, koDates: koDates.slice(-Math.log2(koTeams)) })
  addGroups(w, comp, seedGroups(field, nGroups, rng, w), feeds === 'WC' ? [`${y}-06-03`, `${y}-06-07`, `${y}-06-11`] : [`${y}-06-05`, `${y}-06-09`, `${y}-06-13`], rng)
  postNews(w, { headline: `${def.name} ${y}: the ${field.length} finalists are known`, body: `${field.slice(0, 8).map((c) => c.short).join(', ')} and the rest head to ${feeds === 'WC' ? 'Spain, Portugal and Morocco' : 'the United Kingdom and Ireland'} in June.`, kind: 'preview', playerIds: [], clubIds: [], compId: comp.id, importance: 4, userRelated: false })
}

/** June friendlies for everyone not at a summer tournament (planned once the June competitions are known). */
export function planJuneFriendlies(w: World, rng: Rng) {
  const season = w.season
  if (w.flags.juneFriendlies === season) return
  w.flags.juneFriendlies = season
  // sides going to a summer tournament prepare in their own camp
  const june = `${season + 1}-06-01`
  const away = new Set<number>()
  for (const c of Object.values(w.competitions)) {
    if (c.season !== season || c.intl?.kind !== 'tournament') continue
    for (const id of c.fixtures) { const f = w.fixtures[id]; if (f && !f.played && f.date >= june) { away.add(f.home); away.add(f.away) } }
  }
  scheduleFriendlies(w, season, windowDates(season).june, rng, away)
}

// ---------------------------------------------------------------- call-ups
/** Daily: call squads up a few days before a nation's next match, and send players back after its last. */
export function intlDaily(w: World) {
  if (!w.intl) return
  ensureRanking(w)
  maybePublish(w)
  const d = w.date
  if (d === `${w.season + 1}-05-20`) planJuneFriendlies(w, new Rng((w.meta.seed ^ w.season) >>> 0))
  const next = new Map<number, Fixture>()
  for (const f of Object.values(w.fixtures)) {
    if (f.played || f.home < NT_BASE || f.date < d) continue
    for (const id of [f.home, f.away]) { const cur = next.get(id); if (!cur || f.date < cur.date) next.set(id, f) }
  }
  const staff = staffNames(w)
  const called: string[] = []
  // release: no match in the next six days (one note for everyone who comes back today)
  const back: string[] = []
  for (const [idStr, ids] of Object.entries(w.intl.squads)) {
    const id = Number(idStr)
    const n = next.get(id)
    if (n && n.date <= addDays(d, 6)) continue
    back.push(...releaseSquad(w, id, ids))
  }
  if (back.length) sendInbox(w, { from: staff.assistant, fromRole: 'Assistant Manager', category: 'Squad', subject: back.length === 1 ? `${back[0].split(' (')[0]} is back from international duty` : `${back.length} players back from international duty`, body: `Back with us: ${back.join(', ')}.`, actions: [{ label: 'View Squad', action: 'openSquad', primary: true }] })
  // call up: a match within three days
  for (const [id, f] of next) {
    if (w.intl.squads[id] || f.date > addDays(d, 3)) continue
    const c = w.clubs[id]
    const comp = w.competitions[f.compId]
    const squad = pickSquad(w, c.nation!, comp?.intl?.squadSize || 23)
    w.intl.squads[id] = squad.map((p) => p.id)
    ;(w.intl.calledOn ||= {})[id] = d
    for (const p of squad) {
      p.intlDuty = true
      if (p.clubId === w.userClubId) called.push(`${p.name} (${c.short}, ${comp?.short || 'internationals'})`)
    }
  }
  if (called.length) sendInbox(w, { from: staff.assistant, fromRole: 'Assistant Manager', category: 'Squad', subject: called.length === 1 ? 'International call-up' : `${called.length} international call-ups`, body: `Called up: ${called.join(', ')}. They'll miss club football until their national team's games are done; you can follow or watch their matches from the calendar and fixtures.`, actions: [{ label: 'View Squad', action: 'openSquad', primary: true }] })
}

/** Sends a squad home; returns a line for each of the manager's players (what he did while he was away). */
function releaseSquad(w: World, ntIdNum: number, ids: number[]): string[] {
  const since = w.intl?.calledOn?.[ntIdNum] || addDays(w.date, -20)
  const back: string[] = []
  for (const pid of ids) {
    const p = w.players[pid]
    if (!p) continue
    p.intlDuty = false
    if (p.clubId !== w.userClubId) continue
    // what he did while he was away
    let apps = 0, goals = 0
    for (const f of Object.values(w.fixtures)) {
      if (!f.played || f.date < since || (f.home !== ntIdNum && f.away !== ntIdNum) || !f.result) continue
      const st = f.result.players.find((x) => x.id === pid)
      if (st && st.mins > 0) { apps++; goals += st.goals }
    }
    back.push(`${p.name} (${w.clubs[ntIdNum]?.short}: ${apps ? `${apps} app${apps > 1 ? 's' : ''}${goals ? `, ${goals} goal${goals > 1 ? 's' : ''}` : ''}` : 'unused'})`)
  }
  delete w.intl!.squads[ntIdNum]
  if (w.intl?.calledOn) delete w.intl.calledOn[ntIdNum]
  return back
}

/** After an international match: caps and goals for the players, headlines for the big ones. */
export function intlAfterMatch(w: World, f: Fixture, r: MatchResult, injuries: { id: number; days: number; type: string }[] = []) {
  rankingAfterMatch(w, f, r)
  // an injury on international duty is the club's problem too
  const staff = staffNames(w)
  for (const inj of injuries) {
    const p = w.players[inj.id]
    if (!p || p.clubId !== w.userClubId) continue
    const nt = w.clubs[f.home]?.nation === p.nation ? w.clubs[f.home] : w.clubs[f.away]
    sendInbox(w, {
      from: staff.medical, fromRole: 'Head of Medical', category: 'Medical', subject: `${p.name} injured on international duty`,
      body: `${p.name} picked up a ${inj.type.toLowerCase()} playing for ${nt?.short || p.nation} against ${(nt?.id === f.home ? w.clubs[f.away] : w.clubs[f.home])?.short}. He'll be out for about ${inj.days} day${inj.days === 1 ? '' : 's'} (back ${fmtDate(p.injury?.until || addDays(w.date, inj.days), 'dm')}).`,
      actions: [{ label: 'View Player', action: 'openPlayer', payload: p.id, primary: true }], playerId: p.id, image: { kind: 'player', id: p.id },
    })
  }
  // a star hurt playing for his country elsewhere is news for his club
  for (const inj of injuries) {
    const p = w.players[inj.id]
    if (!p || p.clubId === w.userClubId || p.ovr < 83 || inj.days < 21 || !w.clubs[p.clubId]) continue
    const club = w.clubs[p.clubId]
    postNews(w, {
      headline: `Blow for ${club.short} as ${callName(p.name)} is hurt on international duty`,
      body: `${p.name} will be out for around ${Math.round(inj.days / 7)} weeks after suffering a ${inj.type.toLowerCase()} playing for ${p.nation}. ${club.name} will be without him when club football resumes.`,
      kind: 'injury', playerIds: [p.id], clubIds: [p.clubId], compId: f.compId, importance: p.ovr >= 87 ? 4 : 3, userRelated: false,
    })
  }
  for (const st of r.players) {
    if (st.mins <= 0) continue
    const p = w.players[st.id]
    if (!p) continue
    p.nationalCaps = (p.nationalCaps || 0) + 1
    if (st.goals) p.intlGoals = (p.intlGoals || 0) + st.goals
  }
  const comp = w.competitions[f.compId]
  const home = w.clubs[f.home], away = w.clubs[f.away]
  // the user's players scoring for their country
  const mine = r.players.filter((st) => st.goals > 0 && w.players[st.id]?.clubId === w.userClubId)
  for (const st of mine) {
    const p = w.players[st.id]
    const side = st.side === 0 ? home : away
    const [a, b] = st.side === 0 ? r.score : [r.score[1], r.score[0]]
    postNews(w, {
      headline: `${callName(p.name)} ${st.goals >= 3 ? 'hat-trick' : st.goals === 2 ? 'double' : 'on target'} for ${side.short}`,
      body: `${p.name} scored ${st.goals === 1 ? 'once' : st.goals === 2 ? 'twice' : `${st.goals} times`} as ${side.name} ${a > b ? 'beat' : a < b ? 'lost to' : 'drew with'} ${(st.side === 0 ? away : home).name} ${a}-${b} (${comp?.short} · ${f.roundName}).`,
      kind: 'result', playerIds: [p.id], clubIds: [p.clubId], compId: f.compId, fixtureId: f.id, importance: 3, userRelated: true,
    })
  }
}

// ---------------------------------------------------------------- for the screens
/** National sides the manager's players are with right now: who, and the next (or last) game. */
export function userOnDuty(w: World): { nt: Club; players: Player[]; next?: Fixture; last?: Fixture }[] {
  const out: { nt: Club; players: Player[]; next?: Fixture; last?: Fixture }[] = []
  for (const [idStr, ids] of Object.entries(w.intl?.squads || {})) {
    const nt = w.clubs[Number(idStr)]
    const players = ids.map((id) => w.players[id]).filter((p) => p && p.clubId === w.userClubId)
    if (!nt || !players.length) continue
    const fx = Object.values(w.fixtures).filter((f) => f.home === nt.id || f.away === nt.id).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    out.push({ nt, players: players.sort((a, b) => b.ovr - a.ovr), next: fx.find((f) => !f.played), last: [...fx].reverse().find((f) => f.played) })
  }
  return out.sort((a, b) => b.players.length - a.players.length || b.nt.squadAvg - a.nt.squadAvg)
}

/** National sides with the manager's players in them: the called-up squad, or who would be picked today. */
export function userNations(w: World): Map<number, Player[]> {
  const m = new Map<number, Player[]>()
  const nations = new Set<string>()
  for (const p of Object.values(w.players)) if (p.clubId === w.userClubId && !p.academy) nations.add(p.nation)
  for (const n of nations) {
    const id = ntId(w, n)
    if (!id) continue
    const mine = nationalSquad(w, id).filter((p) => p.clubId === w.userClubId)
    if (mine.length) m.set(id, mine)
  }
  return m
}

/** The national side a player is with now, if any. */
export function dutyTeam(w: World, p: Player): Club | undefined {
  if (!p.intlDuty) return undefined
  const id = ntId(w, p.nation)
  return id && w.intl?.squads[id]?.includes(p.id) ? w.clubs[id] : undefined
}

/** When the season review comes: 1 June, or after the last international game of the summer. */
export function seasonReviewDate(w: World): ISODate {
  let d = `${w.season + 1}-06-01`
  for (const c of Object.values(w.competitions)) {
    if (c.season !== w.season || c.format !== 'intl' || c.status === 'finished') continue
    for (const k of c.intl?.koDates || []) if (k > d) d = k
    for (const id of c.fixtures) { const f = w.fixtures[id]; if (f && f.date > d) d = f.date }
  }
  return d
}

/** A competition's current stage in words (for lists). */
export function intlStage(w: World, c: Competition): string {
  const m = c.intl
  if (!m) return ''
  if (c.status === 'finished' && c.winner) return `Winner: ${w.clubs[c.winner]?.short}`
  if (m.kind === 'friendly') { const left = c.fixtures.filter((id) => w.fixtures[id] && !w.fixtures[id].played).length; return left ? `${left} friendlies to come` : `${c.fixtures.length} friendlies` }
  const fx = c.fixtures.map((id) => w.fixtures[id]).filter(Boolean)
  const next = fx.filter((f) => !f.played).sort((a, b) => a.date.localeCompare(b.date))[0]
  if (m.stage === 'ko') { const r = [...c.rounds].reverse().find((x) => x.fixtures.some((id) => !w.fixtures[id]?.played)); return r ? `${r.name}${next ? ` · ${fmtDate(next.date, 'dm')}` : ''}` : 'Knockouts' }
  if (m.kind === 'groups' && c.status === 'finished') return 'Qualifying complete'
  return next ? `${Object.keys(c.groups || {}).length} groups · next ${fmtDate(next.date, 'dm')}` : 'Group stage'
}

export function championIntlNews(w: World, comp: Competition, winner: number, f: Fixture) {
  const c = w.clubs[winner], o = w.clubs[f.home === winner ? f.away : f.home]
  const r = f.result
  postNews(w, {
    headline: `${c.short} win the ${comp.name}!`,
    body: `${c.name} beat ${o?.name} ${r ? `${Math.max(...r.score)}-${Math.min(...r.score)}${r.pens ? ` (${Math.max(...r.pens)}-${Math.min(...r.pens)} on penalties)` : ''}` : ''} in the final at ${f.venue || 'the final venue'} on ${fmtDate(f.date, 'long')}.`,
    kind: 'title', playerIds: r?.motm ? [r.motm] : [], clubIds: [winner], compId: comp.id, fixtureId: f.id, importance: comp.tier <= 1 ? 5 : 4, userRelated: false,
  })
}
