// ============================================================================
// Touchline — authoritative world model. Everything in `World` is serialisable
// and persisted in a save slot. No UI state lives here.
// ============================================================================

export type ISODate = string // yyyy-mm-dd
export type Position =
  | 'GK' | 'RB' | 'RWB' | 'CB' | 'LB' | 'LWB' | 'CDM' | 'CM' | 'RM' | 'LM' | 'CAM' | 'RW' | 'LW' | 'CF' | 'ST'
export type PosGroup = 'GK' | 'DEF' | 'MID' | 'ATT'
export type Foot = 'L' | 'R'
export type SquadRole = 'Crucial' | 'Important' | 'Rotation' | 'Sparingly' | 'Prospect'
export type MoraleLevel = 'Very Unhappy' | 'Unhappy' | 'Content' | 'Happy' | 'Very Happy'

/** Indexes into Player.attrs (same order as the database build). */
export const A = {
  crossing: 0, finishing: 1, heading: 2, shortPassing: 3, volleys: 4, dribbling: 5, curve: 6, fkAccuracy: 7,
  longPassing: 8, ballControl: 9, acceleration: 10, sprintSpeed: 11, agility: 12, reactions: 13, balance: 14,
  shotPower: 15, jumping: 16, stamina: 17, strength: 18, longShots: 19, aggression: 20, interceptions: 21,
  positioning: 22, vision: 23, penalties: 24, composure: 25, defAwareness: 26, standingTackle: 27, slidingTackle: 28,
  gkDiving: 29, gkHandling: 30, gkKicking: 31, gkPositioning: 32, gkReflexes: 33,
} as const
export type AttrKey = keyof typeof A

export interface Injury {
  type: string
  severity: 'Minor' | 'Moderate' | 'Serious' | 'Severe'
  since: ISODate
  until: ISODate
  totalDays: number
  inMatch?: string // fixture id where it happened
}

export interface Suspension {
  matches: number
  scope: 'league' | 'cup' | 'continental' | 'intl' | 'all'
  compId?: string
  reason: string
}

export interface Contract {
  until: number // season end year (contract expires 30 June `until`)
  wage: number // weekly, EUR
  role: SquadRole
  releaseClause: number // 0 = none
  signedOn: ISODate
  signingBonus?: number
  bonuses?: { goal?: number; cleanSheet?: number; appearance?: number }
}

export interface LoanInfo {
  fromClubId: number
  until: ISODate
  wageSplit: number // % paid by loaning club
  optionFee?: number
  obligation?: boolean
  recallable?: boolean
  expectation?: SquadRole
}

export interface StatLine {
  apps: number; starts: number; subs: number; mins: number; goals: number; assists: number; cleanSheets: number
  yellows: number; reds: number; ratingSum: number; rated: number; motm: number; shots: number; sot: number
  xg: number; saves: number; conceded: number; tackles: number; keyPasses: number; passes: number; passesCompleted: number
}

export interface CareerEntry {
  season: number // start year (2026 => 2026/27)
  clubId: number
  loan?: boolean
  apps: number; goals: number; assists: number; cleanSheets: number; ratingAvg: number; ovr: number
}

export interface Player {
  id: number
  name: string
  fullName: string
  shortName: string
  nation: string
  clubId: number // 0 = free agent
  positions: Position[]
  dob: ISODate
  height: number
  weight: number
  foot: Foot
  ovr: number // cached overall at primary position
  pot: number
  ovrAdj: number // calibration so formula OVR == EA OVR at start
  attrs: number[]
  weakFoot: number
  skillMoves: number
  intlRep: number
  workRate: [string, string]
  bodyType: string
  playstyles: string[]
  playstylesPlus: string[]
  value: number
  valueCalib?: number // real market value ÷ formula value at career start, kept so values stay anchored to reality
  wage: number
  contract: Contract
  jersey: number
  realFace: boolean
  faceSeed?: number // generated players: procedural portrait seed
  regen?: boolean
  academy?: boolean // currently in youth academy squad
  // --- dynamic state ---
  fitness: number // 0..100 energy
  sharpness: number // 0..100
  morale: number // 0..100
  formRatings: number[] // last 5 match ratings (most recent last)
  injury?: Injury
  suspensions: Suspension[]
  yellowAccum: Record<string, number> // competition id -> yellow cards towards ban
  transferListed?: boolean
  loanListed?: boolean
  loan?: LoanInfo
  untouchable?: boolean
  joinedDate?: ISODate
  trainingPlan: TrainingPlan
  devPlan: string // development plan id
  devTargetPos?: Position // position conversion in progress
  devProgress: number // xp bucket 0..100 towards next attribute bump cycle
  growthHistory: { date: ISODate; ovr: number }[]
  /** recent attribute changes (user's squad): shown as small arrows on the profile for a few weeks */
  attrGains?: { date: ISODate; k: AttrKey; d: number }[]
  hidden: {
    consistency: number; professionalism: number; injuryProne: number; devRate: number; adaptability: number
    bigMatch: number; ambition: number; loyalty: number; temperament: number
  }
  season: Record<string, StatLine> // competition id -> stats (current season)
  career: CareerEntry[]
  nationalCaps?: number
  intlDuty?: boolean
  intlGoals?: number
  /** this season's matches for his country, by competition id (kept apart from club stats) */
  intlSeason?: Record<string, StatLine>
  /** international record by season: [season, caps, goals] */
  intlCareer?: [number, number, number][]
  retiringAtSeasonEnd?: boolean
  happinessFactors?: Record<string, number>
  lastMatchDate?: ISODate
  interestedClubs?: number[]
  recentMins?: number[] // minutes in the club's last matches (6; 12 for the user's squad)
  lastStart?: ISODate
  /** club whose academy produced him, and when he was promoted */
  academyGrad?: number
  gradDate?: ISODate
}

// ---------------------------------------------------------------- tactics
export type BuildUp = 'Balanced' | 'Short Passing' | 'Counter' | 'Long Ball'
export type DefApproach = 'Deep' | 'Balanced' | 'High' | 'Aggressive'
export type ChanceCreation = 'Balanced' | 'Possession' | 'Direct Passing' | 'Forward Runs'
export type Mentality = 'Ultra Defensive' | 'Defensive' | 'Balanced' | 'Attacking' | 'Ultra Attacking'

export interface TeamTactics {
  buildUp: BuildUp
  defApproach: DefApproach
  lineHeight: number // 0..100
  width: number // 0..100
  tempo: number // 0..100
  pressing: number // 0..100 (derived default from defApproach, adjustable)
  chanceCreation: ChanceCreation
  playersInBox: number // 1..10
  corners: 'Balanced' | 'Near Post' | 'Far Post' | 'Short'
  freeKicks: 'Balanced' | 'Direct' | 'Cross'
  mentality: Mentality
  timeWasting: boolean
  offsideTrap: boolean
}

export interface SlotRole {
  role: string // e.g. 'Inside Forward'
  focus: string // e.g. 'Attack'
  instructions: Record<string, string> // e.g. { 'Attacking Runs': 'Get In Behind' }
}

export interface TeamSheet {
  id: string
  name: string
  formation: string
  lineup: number[] // 11 player ids ordered by formation slot
  bench: number[] // up to 9
  roles: SlotRole[] // 11
  tactics: TeamTactics
  captain: number
  viceCaptain: number
  penalties: number
  freeKicks: number
  cornersL: number
  cornersR: number
}

// ---------------------------------------------------------------- clubs
export interface ClubFinance {
  balance: number
  transferBudget: number
  wageBudget: number // weekly
  revenueSeason: number
  expensesSeason: number
  ledger: { date: ISODate; label: string; amount: number; kind: 'transfer' | 'wages' | 'prize' | 'gate' | 'tv' | 'bonus' | 'other' }[]
}

export interface Club {
  id: number
  name: string
  short: string
  abbr: string
  dbName: string
  leagueId: number // 0 = rest of world
  country: string
  stadium: string
  capacity: number
  city: string
  founded: number
  kit: [string, string]
  theme: string
  badge: boolean
  sofifaTeamId: number
  rivals: [number, string, number][] // [clubId, derby name, intensity]
  prestige: { domestic: number; intl: number } // 1..10
  finance: ClubFinance
  managerId: number
  sheets: TeamSheet[]
  activeSheet: string
  squadAvg: number
  reputation: number // 1..100
  youthRating: number // 1..10 academy quality
  transferPolicy?: {
    lastActivity?: ISODate; needs?: string[]
    /** lost a starter recently: recruit with priority */
    review?: ISODate
    lost?: { id: number; pos: Position; date: ISODate; key?: boolean }[]
  }
  trophies: { compKey: string; season: number }[]
  /** Edit Mode transfer behaviour for an AI club: buying activity (−2 never … 2 splurges) and selling stance */
  market?: { buy?: -2 | -1 | 1 | 2; sell?: -1 | 1 }
  lastSeasonPos?: number
  recent?: ('W' | 'D' | 'L')[]
  /** national team (a nation's side, not a club) */
  national?: boolean
  nation?: string
  flag?: string
  confed?: string
}

export interface Manager {
  id: number
  name: string
  nationality: string
  age: number
  clubId: number // 0 = unemployed
  formation: string
  vision: string
  reputation: number
  real: boolean
  faceSeed: number
  record: { p: number; w: number; d: number; l: number }
  trophies: number
  appointed?: ISODate
  retired?: boolean
}

// ---------------------------------------------------------------- competitions
export type CompFormat = 'league' | 'cup' | 'uefa' | 'supercup' | 'playoff' | 'intl'
export interface StandingRow {
  clubId: number; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number
  form: ('W' | 'D' | 'L')[]; ded?: number; group?: string
}

export interface Round {
  id: string
  name: string
  legs: 1 | 2
  date: ISODate // first leg date (or single)
  date2?: ISODate
  fixtures: string[] // fixture ids
  drawn: boolean
  neutral?: boolean
  venueName?: string
  entrants?: number[] // clubs entering this round (seeded byes)
  byes?: number[] // clubs passing straight through this round
  winners?: number[]
  pool?: number[] // all clubs involved in this round at draw time
}

export interface Competition {
  id: string // e.g. 'L13-2026', 'FACUP-2026', 'UCL-2026'
  key: string // stable key across seasons, e.g. 'L13', 'FACUP', 'UCL'
  name: string
  short: string
  format: CompFormat
  season: number
  country: string
  leagueId?: number
  tier: number // prestige weight (1 top)
  clubs: number[]
  table?: StandingRow[]
  groups?: Record<string, number[]>
  rounds: Round[]
  fixtures: string[]
  status: 'upcoming' | 'active' | 'finished'
  winner?: number
  runnerUp?: number
  rules: {
    promo?: number; playoff?: [number, number]; rele?: number; releplayoff?: number; promoplayoff?: number
    uefa?: string[]; ucl?: number; uel?: number; uecl?: number; lp?: { direct: number; playoff: [number, number] }
    awayGoals?: false; extraTime?: boolean; penalties?: boolean
  }
  logoKey?: string
  holderId?: number
  stats?: { topScorers?: [number, number][]; topAssists?: [number, number][]; cleanSheets?: [number, number][] }
  intl?: IntlMeta
}

/** International competitions: groups (Nations League, qualifiers), tournaments (groups then knockouts), friendlies. */
export interface IntlMeta {
  confed: string
  kind: 'groups' | 'tournament' | 'friendly'
  stage: 'groups' | 'ko' | 'done'
  /** from each group into the knockouts: the top n, plus the best third-placed sides; `groupsPrefix` limits it to some groups */
  advance?: { top: number; thirds: number; groupsPrefix?: string }
  koDates?: ISODate[]
  hosts?: string[]
  squadSize: number
  /** a qualifying competition feeding a tournament created when it ends */
  feeds?: string
  /** how many a qualifying group sends on (per group top n, plus best runners-up/thirds) */
  qualify?: { top: number; extra: number }
}

export interface MatchEvent {
  min: number
  add?: number // stoppage time minute
  type:
    | 'goal' | 'owngoal' | 'penGoal' | 'penMiss' | 'yellow' | 'red' | 'secondYellow' | 'sub' | 'injury' | 'save'
    | 'chance' | 'miss' | 'woodwork' | 'corner' | 'freekick' | 'offside' | 'foul' | 'var' | 'tactic' | 'ht' | 'ft'
    | 'kickoff' | 'info' | 'et' | 'pens' | 'shootout' | 'penalty'
  side: 0 | 1 | -1
  player?: number
  player2?: number // assist / sub off / fouled (for 'penalty': the defender who conceded it)
  text: string
  xg?: number
  big?: boolean
  score?: [number, number]
  /** shot location, absolute pitch frame (home attacks toward x = 100) */
  loc?: [number, number]
  /** how the chance was made: cross, through, cutback, counter, long, solo, corner, freekick, rebound, error, header, pen ... */
  how?: string
  /** penalty kick detail, decided by the simulation before it is shown */
  pen?: PenaltyKick
  /** a shot as the simulation played it (shot map) */
  shot?: ShotInfo
  /** the move that led to a goal, action by action (goal replay), absolute pitch frame */
  chain?: ReplayStep[]
}

export interface ShotInfo {
  /** where the ball ended up: the goal line, a blocker, or wide/over (absolute pitch frame) */
  end: [number, number]
  /** placement in the goal mouth from the shooter's view: gy −1 left post … +1 right post (beyond = wide), gz 0 ground … 1 bar (above = over) */
  gy: number
  gz: number
  /** left foot, right foot, header */
  body: 'L' | 'R' | 'H'
  /** on the weaker foot */
  weak?: boolean
  xgot?: number
  res: 'goal' | 'saved' | 'blocked' | 'off' | 'post'
  /** the keeper faced (saved / beaten) */
  gk?: number
  /** the blocker */
  by?: number
}

export interface ReplayStep {
  /** action: pass, long, through, cross, carry, drib, shot, goal, tackle, int, rec, corner, fk, throw, aerial, clear */
  k: string
  s: 0 | 1
  p: number
  q?: number
  x0: number; y0: number; x1: number; y1: number
  ok: boolean
}

// ---------------------------------------------------------------- edit mode: scripted matches
/** −2 … +2: much worse, worse, normal, better, much better. */
export type ScriptLevel = -2 | -1 | 0 | 1 | 2
export interface ScriptEvent {
  id: string
  kind: 'goal' | 'pen' | 'yellow' | 'red'
  side: 0 | 1
  player: number // scorer, penalty taker, or the player booked; 0 = the engine picks (AUTO)
  assist?: number // undefined = no assist; -1 = the engine picks (AUTO)
  min: number // match minute 1–120
  add?: number // stoppage-time minute (45+add, 90+add)
  pen?: 'goal' | 'saved' | 'miss'
  spot?: 'BL' | 'BR' | 'TL' | 'TR' | 'C'
  dive?: 'L' | 'R' | 'C'
  /** penalty: the card for the foul that gave it (undefined: the referee decides) */
  card?: 'none' | 'yellow' | 'red'
}
/** Facts the editor guarantees; the match engine plays everything else out as normal around them. */
export interface MatchScript {
  bias?: ScriptLevel // + favours the home side
  score?: [number, number] // final score (after extra time)
  events?: ScriptEvent[]
  form?: Record<number, ScriptLevel> // individual performances
  lineups?: Partial<Record<'0' | '1', { formation: string; lineup: number[]; bench: number[] }>>
  /** how open the game is: −1 tight, 1 open, 2 goal-fest (finishing, both ways) */
  goals?: -1 | 1 | 2
  /** −1 calm, 1 heated (the referee's cards and the players' tempers) */
  temper?: -1 | 1
  /** late drama: the last ten minutes and stoppage time turn frantic */
  late?: boolean
  /** each side's three best players have a big day */
  stars?: 'home' | 'away' | 'both'
}

export interface PenaltyKick {
  taker: number
  keeper?: number
  spot: 'BL' | 'BR' | 'TL' | 'TR' | 'C' // from the taker's view
  dive: 'L' | 'R' | 'C'
  res: 'goal' | 'saved' | 'miss' | 'post'
}

export interface MatchPlayerStats {
  id: number
  side: 0 | 1
  pos: Position
  mins: number
  rating: number
  goals: number; assists: number; shots: number; sot: number; xg: number; passes: number; passesCompleted: number
  keyPasses: number; tackles: number; interceptions: number; saves: number; fouls: number; yellow: boolean; red: boolean
  subOn?: number; subOff?: number; injured?: boolean; started: boolean; energy?: number
  // action-engine detail (absent on results from older versions)
  xa?: number; touches?: number; bcc?: number; bcm?: number; boxTouches?: number
  crosses?: number; crossesOk?: number; longBalls?: number; longBallsOk?: number; throughBalls?: number
  dribbles?: number; dribblesOk?: number; duels?: number; duelsWon?: number; aerials?: number; aerialsWon?: number
  clearances?: number; blocks?: number; recoveries?: number; foulsWon?: number; offsides?: number
  possLost?: number; dispossessed?: number; dribbledPast?: number; errors?: number
  penWon?: number; penConceded?: number; ownGoals?: number
  conceded?: number; xgot?: number; xgotFaced?: number; claims?: number; punches?: number; sweeps?: number
  /** 12×8 touch heat map, one base-36 digit per cell */
  heat?: string
}

export interface TeamMatchStats {
  possession: number; shots: number; sot: number; xg: number; passes: number; passAcc: number; corners: number
  fouls: number; offsides: number; yellows: number; reds: number; saves: number; bigChances: number
  // action-engine detail (absent on results from older versions)
  tackles?: number; interceptions?: number; clearances?: number; blocks?: number; crosses?: number; crossesOk?: number
  dribbles?: number; dribblesOk?: number; aerialsWon?: number; duelsWon?: number; boxTouches?: number; longBalls?: number
  throwIns?: number; goalKicks?: number; bigChancesMissed?: number; xgot?: number; recoveries?: number; touches?: number
}

export interface MatchResult {
  score: [number, number]
  ht: [number, number]
  et?: [number, number]
  pens?: [number, number]
  events: MatchEvent[]
  stats: [TeamMatchStats, TeamMatchStats]
  players: MatchPlayerStats[]
  motm?: number
  attendance: number
  detail: 'full' | 'stats' | 'quick'
  lineups?: [number[], number[]]
  formations?: [string, string] // starting formations
  captains?: [number, number]
  mom?: [number, number][] // per simulated minute: [minute + added/100, momentum -1 (away) .. 1 (home)]
}

export interface Fixture {
  id: string
  compId: string
  roundId?: string
  roundName: string
  date: ISODate
  time: string
  home: number
  away: number
  leg?: 1 | 2
  tieId?: string
  /** played from an Edit Mode script */
  edited?: boolean
  neutral?: boolean
  venue?: string
  played: boolean
  result?: MatchResult
  userInvolved?: boolean
  derby?: string
  importance?: number
  /** moved from its original date: when it was due, why, and whether it was brought forward or put back */
  moved?: { from: ISODate; reason: string; kind: 'early' | 'late'; source?: 'calendar' | 'clash' }
}

// ---------------------------------------------------------------- transfers
export type TransferStatus =
  | 'Scouting' | 'Report Available' | 'Club Approached' | 'Offer Submitted' | 'Offer Rejected' | 'Counter Offer'
  | 'Offer Accepted' | 'Contract Negotiation' | 'Contract Offered' | 'Completed' | 'Negotiations Failed' | 'Pre-Contract'
  | 'Awaiting Window'

export interface TransferOffer {
  id: string
  playerId: number
  fromClubId: number // buying club
  toClubId: number // selling club (current)
  type: 'transfer' | 'loan' | 'loan-option' | 'loan-obligation' | 'free' | 'pre-contract'
  fee: number
  sellOn: number // %
  swapPlayerId?: number
  loanWageSplit?: number
  loanUntil?: ISODate
  optionFee?: number
  status: TransferStatus
  history: { date: ISODate; by: 'buyer' | 'seller' | 'player'; text: string; fee?: number }[]
  patience: number // 0..100 selling club patience
  created: ISODate
  respondBy?: ISODate
  userIsBuyer: boolean
  userIsSeller: boolean
  contractTerms?: ContractOffer
  counterFee?: number
  delegated?: boolean
  sellerFloor?: number // hidden minimum fee the selling club will accept
  round?: number
  used?: string[] // dialogue lines already used in this negotiation
}

export interface ContractOffer {
  wage: number
  years: number
  role: SquadRole
  signingBonus: number
  releaseClause: number
  bonusGoal: number
  bonusCleanSheet: number
  bonusApp: number
}

export interface TransferRecord {
  date: ISODate
  playerId: number
  playerName: string
  from: number
  to: number
  fee: number
  type: 'transfer' | 'loan' | 'free' | 'loan-return' | 'release' | 'retire' | 'youth' | 'loan-buy'
  season: number
}

export interface TransferTarget {
  playerId: number
  added: ISODate
  status: TransferStatus
  offerId?: string
  notes?: string
}

// ---------------------------------------------------------------- scouting & youth
export interface Scout {
  id: number
  name: string
  nationality: string
  experience: number // 1..5 stars
  judgement: number // 1..5 stars
  wage: number
  faceSeed: number
  assignment?: ScoutAssignment
}

export interface ScoutAssignment {
  kind: 'network' | 'player'
  region?: string // country / league id / 'Anywhere'
  position?: string
  ageMax?: number
  ageMin?: number
  focus?: string
  playerId?: number
  started: ISODate
  duration: number // days
  progress: number // 0..100
  foundIds: number[]
}

export interface YouthScout {
  id: number
  name: string
  nationality: string
  experience: number
  judgement: number
  wage: number
  faceSeed: number
  mission?: { country: string; playerType: string; started: ISODate; months: number; nextReport: ISODate }
}

export interface Prospect {
  id: number
  scoutId: number
  name: string
  fullName: string
  nation: string
  age: number
  dob: ISODate
  positions: Position[]
  ovrRange: [number, number]
  potRange: [number, number]
  trueOvr: number
  truePot: number
  attrs: number[]
  foot: Foot
  height: number
  weight: number
  faceSeed: number
  value: number
  found: ISODate
  playerType: string
  signed?: boolean
}

// ---------------------------------------------------------------- inbox & news
export type InboxCategory = 'Board' | 'Transfers' | 'Squad' | 'Scouting' | 'Youth' | 'Medical' | 'Competitions' | 'Player' | 'Assistant' | 'Media' | 'Finance'
export interface InboxAction { label: string; action: string; payload?: any; primary?: boolean; danger?: boolean }
export interface InboxMessage {
  id: string
  date: ISODate
  from: string
  fromRole: string
  category: InboxCategory
  subject: string
  body: string
  read: boolean
  actions: InboxAction[]
  resolved?: boolean
  playerId?: number
  clubId?: number
  compId?: string
  urgent?: boolean
  expires?: ISODate
  image?: { kind: 'player' | 'club' | 'comp' | 'staff'; id: number | string }
  /** structured content rendered under the text (development updates) */
  dev?: { id: number; from: number; to: number; attrs: [AttrKey, number][] }[]
}

export interface NewsItem {
  id: string
  date: ISODate
  headline: string
  body: string
  kind: 'transfer' | 'rumour' | 'result' | 'injury' | 'manager' | 'record' | 'milestone' | 'youth' | 'contract' | 'title' | 'relegation' | 'award' | 'board' | 'preview'
  playerIds: number[]
  clubIds: number[]
  compId?: string
  importance: number // 1..5
  userRelated: boolean
  /** match the story is about (result reports) */
  fixtureId?: string
  /** transfer fee, when relevant */
  fee?: number
  /** awards roundup month (YYYY-MM) */
  month?: string
  /** a manager's words, when the story is a quote */
  quote?: { by: string; clubId: number; text: string }
}

// ---------------------------------------------------------------- board, promises, conversations
export type ObjectiveCategory = 'Domestic Success' | 'Continental Success' | 'Financial' | 'Brand Exposure' | 'Youth Development'
export type Priority = 'Critical' | 'Very High' | 'High' | 'Medium' | 'Low'
export interface Objective {
  id: string
  category: ObjectiveCategory
  priority: Priority
  text: string
  metric: string // machine evaluable key
  target: number
  compId?: string
  progress: number // 0..1
  status: 'active' | 'complete' | 'failed'
  deadline: ISODate
  season: number
}

export interface BoardState {
  objectives: Objective[]
  confidence: Record<ObjectiveCategory, number> // 0..100
  overall: number
  lastReview?: ISODate
  warnings: number
}

export interface PlayerPromise {
  id: string
  playerId: number
  kind: 'More Starts' | 'Cup Appearances' | 'New Contract' | 'Loan Move' | 'Transfer' | 'Bigger Role' | 'Play In Final'
  made: ISODate
  deadline: ISODate
  requirement: number
  progress: number
  status: 'active' | 'fulfilled' | 'broken'
  baseline?: number
}

export interface Conversation {
  id: string
  playerId: number
  kind: string
  opened: ISODate
  prompt: string
  options: { id: string; text: string; effect: string }[]
  resolved?: boolean
  choice?: string
}

// ---------------------------------------------------------------- manager career
export interface UserManager {
  firstName: string
  lastName: string
  nationality: string
  dob: ISODate
  avatar: AvatarConfig
  reputation: number // 1..100
  clubId: number // 0 = unemployed
  history: { clubId: number; from: ISODate; to?: ISODate; p: number; w: number; d: number; l: number; gf: number; ga: number; trophies: string[] }[]
  trophies: { compKey: string; compName: string; season: number; clubId: number }[]
  awards: { name: string; season: number; month?: string }[]
  jobOffers: { clubId: number; date: ISODate; expires: ISODate }[]
  sacked?: ISODate
  rating: number // manager rating 1..100 dynamic
  realManager?: string // playing as a real-world manager (photo looked up by name)
  avatarColor?: string // monogram colour for a custom manager
  style?: string // coaching identity chosen at creation (vision preset)
}

export interface AvatarConfig {
  skin: number
  hair: number
  hairColor: number
  beard: number
  eyes: number
  brows: number
  glasses: number
  outfit: 'Suit' | 'Tracksuit' | 'Smart Casual' | 'Coat'
  outfitColor: string
  tie: boolean
}

// ---------------------------------------------------------------- training
export type TrainingPlan = 'All Out Energy' | 'Energy Focused' | 'Balanced' | 'Performance Focused' | 'All Out Performance'

// ---------------------------------------------------------------- awards & history
export interface Award {
  id: string
  name: string
  season: number
  month?: string // yyyy-mm
  compKey?: string
  playerId?: number
  clubId?: number
  managerName?: string
  value?: number
}

export interface SeasonArchive {
  season: number
  tables: Record<string, StandingRow[]>
  winners: Record<string, number>
  userClubId: number
  userFinish?: number
  awards: Award[]
  topScorers: Record<string, [number, number][]>
  transfersIn: number
  transfersOut: number
}

// ---------------------------------------------------------------- settings
export interface CareerSettings {
  difficulty: 'Beginner' | 'Amateur' | 'Semi-Pro' | 'Professional' | 'World Class' | 'Legendary' | 'Ultimate'
  transferDifficulty: 'Easy' | 'Normal' | 'Hard'
  injuries: 'Low' | 'Normal' | 'High'
  growth: 'Slow' | 'Normal' | 'Fast'
  sacking: boolean
  aiTransfers: boolean
  startingBudget: 'Default' | 'Low' | 'High'
  /** leagues simulated with the full match engine besides the user's own (max 5); the rest use the fast model */
  deepLeagues?: number[]
}

export interface World {
  meta: { version: number; id: string; created: string; seed: number; saveName: string; playTimeMin: number; editMode?: boolean }
  date: ISODate
  /** Edit Mode: scripts for upcoming fixtures, by fixture id */
  scripts?: Record<string, MatchScript>
  /** the transfer centre's live stories (rumours, talks, negotiations, done and failed deals) */
  market?: { stories: TransferStory[]; seq: number }
  /** international football: national team ids by nation, and each side's called-up squad */
  intl?: { nt: Record<string, number>; squads: Record<number, number[]>; calledOn?: Record<number, string> }
  season: number // season start year
  seasonStart: ISODate
  seasonEnd: ISODate
  rng: number // rng state
  settings: CareerSettings
  user: UserManager
  userClubId: number
  nations: Record<string, { name: string; flag: string; code: string; confed: string }>
  leagues: Record<number, LeagueDef>
  clubs: Record<number, Club>
  players: Record<number, Player>
  managers: Record<number, Manager>
  competitions: Record<string, Competition>
  fixtures: Record<string, Fixture>
  windows: { name: 'Summer' | 'Winter'; open: ISODate; close: ISODate }[]
  intlBreaks: { start: ISODate; end: ISODate }[]
  transfers: {
    offers: Record<string, TransferOffer>
    history: TransferRecord[]
    shortlist: number[]
    targets: Record<number, TransferTarget>
    knowledge: Record<number, number> // playerId -> scouting knowledge 0..100
  }
  scouts: Scout[]
  scoutPool: Scout[]
  youthScouts: YouthScout[]
  youthScoutPool: YouthScout[]
  prospects: Prospect[]
  inbox: InboxMessage[]
  news: NewsItem[]
  board: BoardState
  promises: PlayerPromise[]
  conversations: Conversation[]
  awards: Award[]
  archive: SeasonArchive[]
  records: Record<string, { value: number; playerId?: number; clubId?: number; season: number; text: string }>
  namePools: Record<string, [string[], string[]]>
  nextIds: { player: number; manager: number; msg: number; news: number; offer: number; misc: number }
  pendingMatchId?: string // user fixture awaiting play
  lastUserResult?: string // fixture id
  flags: Record<string, any>
}

// ---------------------------------------------------------------- transfer centre
export type StoryStage = 'rumour' | 'talks' | 'negotiating' | 'close' | 'done' | 'failed'
export interface TransferStory {
  id: number
  playerId: number
  /** selling club (0 = free agent) */
  from: number
  to: number
  stage: StoryStage
  kind: 'transfer' | 'loan' | 'free'
  /** reported (rumour) or agreed (done) fee */
  fee?: number
  wage?: number
  years?: number
  /** the outlet that reported it, and how reliable it tends to be (1-5) */
  source?: string
  reliability?: number
  started: ISODate
  updated: ISODate
  /** a failed deal or a rumour that went nowhere leaves the feed after this */
  expires?: ISODate
  /** why the player wants it / why it collapsed */
  reason?: string
  log: { date: ISODate; stage: StoryStage; note: string }[]
  /** what weighed on the player's decision (for the story page) */
  why?: { v: number; text: string }[]
  /** made or changed in Edit Mode */
  edited?: boolean
  /** a done deal's undo record (what the transfer changed) */
  undo?: TransferUndo
  /** a real negotiation the AI is running (drives the stage) */
  ai?: { interest: number; nextStep: ISODate; round: number; cap?: number }
}
export interface TransferUndo {
  date: ISODate
  fee: number
  fromClub: number
  toClub: number
  type: 'transfer' | 'loan' | 'free'
  contract: Player['contract']
  wage: number
  jersey?: number
  loan?: Player['loan']
  joinedDate?: ISODate
  transferListed?: boolean
  loanListed?: boolean
  untouchable?: boolean
  morale: number
  /** his stats for the season before the move (the career entry the move closed is removed again) */
  season: Player['season']
  careerLen: number
  /** what the move did to the two clubs' budgets and the buyer's signing bonus */
  fromBudgetAdded: number
  toBudgetSpent: number
  signingBonus: number
  /** stories and messages the move produced */
  newsIds: string[]
  inboxIds: string[]
  /** a swap deal moved a second player: not reversible */
  swap?: boolean
}

export interface LeagueDef {
  id: number
  name: string
  short: string
  abbr: string
  country: string
  flag: string
  level: number
  teams: number
  clubs: number[]
  promo?: number
  playoff?: [number, number]
  rele?: number
  releplayoff?: number
  promoplayoff?: number
  uefa?: string[]
  prestige: number
  wealth: number
  rounds?: number
  conferences?: boolean
  fixtures?: string
}
