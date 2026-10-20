// The media at the manager's press conferences: the real outlets of the country his club plays in, each with the kind
// of football journalism it is known for (some ask about tactics, some about transfers, some like to needle, the
// local papers about the club's own business), and a small staff of reporters who keep turning up. The reporters
// are fictional staff of the outlet, not real journalists; the outlets are shown by name in their colours.
import type { Club, World } from '../../domain/types'
import { hashString } from '../../domain/rng'

export type Beat = 'tactics' | 'transfers' | 'provocative' | 'local' | 'general'
export interface Outlet {
  id: string; name: string; country: string
  kind: 'broadcaster' | 'newspaper' | 'digital' | 'radio' | 'agency'
  beat: Beat
  /** masthead colours: background and lettering */
  color: string; ink: string
  /** the clubs a local paper follows (by the start of the club's name) */
  clubs?: string[]
}

const o = (id: string, name: string, country: string, kind: Outlet['kind'], beat: Beat, color: string, ink = '#ffffff', clubs?: string[]): Outlet => ({ id, name, country, kind, beat, color, ink, clubs })
const LONDON = ['Arsenal', 'Chelsea', 'Tottenham', 'West Ham', 'Crystal Palace', 'Fulham', 'Brentford', 'Queens Park', 'Millwall', 'Charlton']

export const OUTLETS: Outlet[] = [
  o('bbc', 'BBC Sport', 'England', 'broadcaster', 'general', '#111111', '#FFD230'),
  o('sky', 'Sky Sports', 'England', 'broadcaster', 'transfers', '#0a2a6b'),
  o('tnt', 'TNT Sports', 'England', 'broadcaster', 'general', '#111111'),
  o('athletic', 'The Athletic', 'England', 'digital', 'tactics', '#111111'),
  o('guardian', 'The Guardian', 'England', 'newspaper', 'tactics', '#052962'),
  o('mail', 'Daily Mail', 'England', 'newspaper', 'provocative', '#004db3'),
  o('times', 'The Times', 'England', 'newspaper', 'general', '#1d1d1b'),
  o('telegraph', 'The Telegraph', 'England', 'newspaper', 'general', '#1d1d1b'),
  o('talksport', 'talkSPORT', 'England', 'radio', 'provocative', '#d4002a'),
  o('men', 'Manchester Evening News', 'England', 'newspaper', 'local', '#c8102e', '#ffffff', ['Manchester']),
  o('echo', 'Liverpool Echo', 'England', 'newspaper', 'local', '#b5121b', '#ffffff', ['Liverpool', 'Everton']),
  o('standard', 'Evening Standard', 'England', 'newspaper', 'local', '#1d1d1b', '#ffffff', LONDON),
  o('marca', 'MARCA', 'Spain', 'newspaper', 'transfers', '#d6001c'),
  o('as', 'AS', 'Spain', 'newspaper', 'general', '#d6001c'),
  o('md', 'Mundo Deportivo', 'Spain', 'newspaper', 'local', '#c8102e', '#ffffff', ['FC Barcelona', 'Barcelona', 'RCD Espanyol', 'Espanyol']),
  o('sport', 'SPORT', 'Spain', 'newspaper', 'local', '#e30613', '#ffffff', ['FC Barcelona', 'Barcelona']),
  o('movistar', 'Movistar Plus+', 'Spain', 'broadcaster', 'tactics', '#0b2739', '#5bc4f1'),
  o('dazn-es', 'DAZN', 'Spain', 'broadcaster', 'general', '#0c161c', '#f8f8f5'),
  o('elpais', 'El País', 'Spain', 'newspaper', 'tactics', '#1d1d1b'),
  o('ser', 'Cadena SER', 'Spain', 'radio', 'provocative', '#e2001a'),
  o('cope', 'COPE', 'Spain', 'radio', 'provocative', '#003a70'),
  o('gazzetta', 'La Gazzetta dello Sport', 'Italy', 'newspaper', 'general', '#f5b5cb', '#3a1020'),
  o('cds', 'Corriere dello Sport', 'Italy', 'newspaper', 'transfers', '#d6001c'),
  o('tuttosport', 'Tuttosport', 'Italy', 'newspaper', 'local', '#e30613', '#ffffff', ['Juventus', 'Torino']),
  o('sky-it', 'Sky Sport Italia', 'Italy', 'broadcaster', 'tactics', '#0a2a6b'),
  o('dazn-it', 'DAZN Italia', 'Italy', 'broadcaster', 'general', '#0c161c', '#f8f8f5'),
  o('rai', 'Rai Sport', 'Italy', 'broadcaster', 'general', '#0a3a7c'),
  o('kicker', 'kicker', 'Germany', 'newspaper', 'tactics', '#d6001c'),
  o('sky-de', 'Sky Sport Deutschland', 'Germany', 'broadcaster', 'transfers', '#0a2a6b'),
  o('sportbild', 'SPORT BILD', 'Germany', 'newspaper', 'provocative', '#d6001c'),
  o('bild', 'Bild', 'Germany', 'newspaper', 'provocative', '#d6001c'),
  o('sz', 'Süddeutsche Zeitung', 'Germany', 'newspaper', 'local', '#1d1d1b', '#ffffff', ['FC Bayern', 'Bayern', 'TSV 1860', '1860']),
  o('faz', 'FAZ', 'Germany', 'newspaper', 'general', '#1d1d1b'),
  o('sport1', 'Sport1', 'Germany', 'broadcaster', 'general', '#0a2240'),
  o('lequipe', "L'Équipe", 'France', 'newspaper', 'general', '#c8102e'),
  o('rmc', 'RMC Sport', 'France', 'broadcaster', 'provocative', '#111111'),
  o('canal', 'Canal+', 'France', 'broadcaster', 'tactics', '#111111'),
  o('bein', 'beIN Sports', 'France', 'broadcaster', 'general', '#5c2d91'),
  o('parisien', 'Le Parisien', 'France', 'newspaper', 'local', '#1d1d1b', '#ffffff', ['Paris']),
  o('provence', 'La Provence', 'France', 'newspaper', 'local', '#0063a6', '#ffffff', ['Olympique de Marseille']),
  o('ff', 'France Football', 'France', 'newspaper', 'tactics', '#003da5'),
  o('abola', 'A Bola', 'Portugal', 'newspaper', 'general', '#d6001c'),
  o('record', 'Record', 'Portugal', 'newspaper', 'transfers', '#d6001c'),
  o('ojogo', 'O Jogo', 'Portugal', 'newspaper', 'local', '#003da5', '#ffffff', ['FC Porto', 'Porto']),
  o('sic', 'SIC Notícias', 'Portugal', 'broadcaster', 'general', '#1d1d1b'),
  o('telegraaf', 'De Telegraaf', 'Netherlands', 'newspaper', 'provocative', '#1d1d1b'),
  o('vi', 'Voetbal International', 'Netherlands', 'newspaper', 'tactics', '#e30613'),
  o('nos', 'NOS', 'Netherlands', 'broadcaster', 'general', '#e4002b'),
  o('ad', 'AD', 'Netherlands', 'newspaper', 'general', '#d6001c'),
  o('bbc-sc', 'BBC Scotland', 'Scotland', 'broadcaster', 'general', '#111111', '#FFD230'),
  o('record-sc', 'Daily Record', 'Scotland', 'newspaper', 'provocative', '#d6001c'),
  o('herald', 'The Herald', 'Scotland', 'newspaper', 'general', '#1d1d1b'),
  o('sky-sc', 'Sky Sports', 'Scotland', 'broadcaster', 'transfers', '#0a2a6b'),
  o('fanatik', 'Fanatik', 'Türkiye', 'newspaper', 'provocative', '#d6001c'),
  o('hurriyet', 'Hürriyet', 'Türkiye', 'newspaper', 'general', '#d6001c'),
  o('sabah', 'Sabah Spor', 'Türkiye', 'newspaper', 'general', '#1d1d1b'),
  o('riyadiya', 'Al Riyadiya', 'Saudi Arabia', 'newspaper', 'general', '#006c35'),
  o('ssc', 'SSC', 'Saudi Arabia', 'broadcaster', 'general', '#1d1d1b'),
  o('arabnews', 'Arab News', 'Saudi Arabia', 'newspaper', 'general', '#004b87'),
  o('espn-us', 'ESPN', 'United States', 'broadcaster', 'general', '#cc0000'),
  o('athletic-us', 'The Athletic', 'United States', 'digital', 'tactics', '#111111'),
  o('mls', 'MLSsoccer.com', 'United States', 'digital', 'general', '#1d1d1b'),
  o('espn', 'ESPN', '_', 'broadcaster', 'general', '#cc0000'),
  o('reuters', 'Reuters', '_', 'agency', 'general', '#fa6400'),
  o('ap', 'Associated Press', '_', 'agency', 'general', '#1d1d1b'),
  o('athletic-int', 'The Athletic', '_', 'digital', 'tactics', '#111111'),
  o('goal', 'Goal', '_', 'digital', 'transfers', '#1d1d1b'),
]
const BY_ID = new Map(OUTLETS.map((x) => [x.id, x]))
export const outletById = (id?: string) => (id ? BY_ID.get(id) : undefined)

/** The outlets at a club's press conferences: the country's media, its local paper only if it follows this club. */
export function outletsFor(club: Club): Outlet[] {
  const home = OUTLETS.filter((x) => x.country === club.country)
  const list = (home.length ? home : OUTLETS.filter((x) => x.country === '_')).filter((x) => !x.clubs || x.clubs.some((c) => club.name.startsWith(c)))
  return list
}

/** What a question is about, for the outlet likeliest to ask it. */
const TOPIC_BEAT: Record<string, Beat> = {}
for (const [beat, ids] of Object.entries({
  tactics: 'sameApproach oppStyle shape ourStyle ourWeakness tacticalSwitch possession subImpact setPieceAgainst dangerMan oppMissing goalsStory lastMeeting oppForm theirKeeper theirStar',
  transfers: 'transferRumour starSale deadline newSigning priceTag soldStar expiring unhappy',
  provocative: 'rivalWords jobPressure oppManager wordsTested scapegoat penaltyCall refereeGame strictRef collapse homeFans oppMgrPressure mediaPersona rivalReaction errorGoal wasteful titlePromise promise scoreVow stopVow backed oppMgrFuture rivalWatch',
  local: 'youngster injuries homeCrowd debut fatigue congestion intlReturn outOfForm suspended banRisk discipline boardTarget venue cupRotation history',
} as Record<Beat, string>)) for (const id of ids.split(' ')) TOPIC_BEAT[id] = beat as Beat

/** The outlet that asks a question: one on that beat when the room has one, now and then anyone. */
export function outletForTopic(club: Club, topic: string, roll: number): Outlet {
  const room = outletsFor(club)
  const beat = TOPIC_BEAT[topic.replace(/-follow$/, '')] || 'general'
  const fit = room.filter((x) => x.beat === beat || (beat === 'local' && x.beat === 'general'))
  const pool = fit.length && roll < 0.75 ? fit : room
  return pool[Math.floor(((roll * 7919) % 1) * pool.length)] || room[0]
}

// fictional staff reporters, named the way the outlet's country names people
const STAFF_NAMES: Record<string, [string[], string[]]> = {
  England: [['Sam', 'Laura', 'Tom', 'Hannah', 'James', 'Rory', 'Ben', 'Emma', 'Oliver', 'Kate', 'Dan', 'Phil', 'Sophie', 'Matt'], ['Hughes', 'Bennett', 'Walsh', 'Fletcher', 'Marsden', 'Ashworth', 'Pearce', 'Holloway', 'Turner', 'Crane', 'Dawson', 'Lowe', 'Keane', 'Ridley']],
  Scotland: [['Ewan', 'Kirsty', 'Callum', 'Fiona', 'Graeme', 'Mhairi', 'Stuart', 'Ailsa'], ['MacLeod', 'Gillespie', 'Rennie', 'Ferguson', 'Kerr', 'Baird', 'Drummond', 'Sinclair']],
  Spain: [['Lucía', 'Javier', 'Marta', 'Sergio', 'Elena', 'Álvaro', 'Carmen', 'Raúl', 'Nuria', 'Diego'], ['Martín', 'Moreno', 'Ortega', 'Navarro', 'Gil', 'Serrano', 'Castillo', 'Delgado', 'Vidal', 'Ibáñez']],
  Italy: [['Matteo', 'Giulia', 'Luca', 'Chiara', 'Davide', 'Francesca', 'Stefano', 'Valentina'], ['Conti', 'Ferraro', 'Marchetti', 'Galli', 'Rinaldi', 'Costa', 'Bellini', 'Fontana']],
  Germany: [['Felix', 'Anna', 'Jonas', 'Lena', 'Tobias', 'Katrin', 'Stefan', 'Julia'], ['Keller', 'Schmidt', 'Brandt', 'Hoffmann', 'Wagner', 'Lange', 'Krämer', 'Vogt']],
  France: [['Chloé', 'Julien', 'Camille', 'Thomas', 'Léa', 'Nicolas', 'Manon', 'Antoine'], ['Dubois', 'Moreau', 'Lefèvre', 'Girard', 'Roux', 'Fournier', 'Chevalier', 'Bonnet']],
  Portugal: [['Inês', 'João', 'Rita', 'Tiago', 'Sofia', 'Rui', 'Ana', 'Miguel'], ['Barros', 'Costa', 'Ferreira', 'Pinto', 'Sousa', 'Carvalho', 'Lopes', 'Teixeira']],
  Netherlands: [['Pieter', 'Sanne', 'Joost', 'Lotte', 'Bram', 'Eva', 'Ruud', 'Iris'], ['de Vries', 'Bakker', 'Visser', 'Smit', 'Mulder', 'de Boer', 'Dekker', 'Vos']],
  Türkiye: [['Emre', 'Elif', 'Burak', 'Zeynep', 'Mert', 'Ayşe'], ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın']],
  'Saudi Arabia': [['Faisal', 'Nora', 'Khalid', 'Sara', 'Omar', 'Lama'], ['Al-Harbi', 'Al-Qahtani', 'Al-Otaibi', 'Al-Ghamdi', 'Al-Shehri', 'Al-Dosari']],
  _: [['Alex', 'Maria', 'Daniel', 'Nadia', 'Felix', 'Clara', 'Marco', 'Ines'], ['Novak', 'Lindqvist', 'Okafor', 'Silva', 'Costa', 'Moreno', 'Keller', 'Walsh']],
}

// each country's press corps for a career: three reporters per outlet, nobody working for two of them
const corps = new Map<string, Map<string, string[]>>()
function staffOf(w: World, country: string): Map<string, string[]> {
  const key = `${w.meta.seed}:${country}`
  let m = corps.get(key)
  if (m) return m
  m = new Map()
  const [first, last] = STAFF_NAMES[country] || STAFF_NAMES._
  const taken = new Set<string>(), lastTaken = new Map<string, number>()
  for (const out of OUTLETS.filter((x) => x.country === country)) {
    const staff: string[] = []
    for (let k = 0, tries = 0; staff.length < 3 && tries < 60; tries++, k++) {
      const h = hashString(`${w.meta.seed}:${out.id}:${k}`) >>> 0
      const name = `${first[h % first.length]} ${last[(h >>> 8) % last.length]}`
      const ln = name.split(' ').slice(1).join(' ')
      // a different name, and no surname shared by more than two people in the room
      if (taken.has(name) || (lastTaken.get(ln) || 0) >= 2) continue
      taken.add(name); lastTaken.set(ln, (lastTaken.get(ln) || 0) + 1)
      staff.push(name)
    }
    m.set(out.id, staff)
  }
  corps.set(key, m)
  return m
}

/** One of the three reporters who cover the club for an outlet: the same people all career, so faces come round. */
export function reporterFor(w: World, outlet: Outlet, roll: number): string {
  const staff = staffOf(w, outlet.country).get(outlet.id) || []
  return staff[Math.floor(roll * staff.length)] || staff[0] || 'Staff reporter'
}
