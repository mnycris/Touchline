import type { ComponentType } from 'react'
import { TransferStoryScreen } from './screens/TransferCentre'
import { OpponentReport } from './screens/OpponentReport'
import { FifaRanking } from './screens/FifaRanking'
import type { Tab } from '../store/game'
import { Hub } from './screens/Hub'
import { Inbox, Message, ConversationScreen, PressConference, SellNegotiation } from './screens/Comms'
import { Article, News } from './screens/NewsScreens'
import { LiveMatch, PostMatch, FixtureReport } from './screens/Match'
import { PreMatch } from './screens/MatchDay'
import { SquadHub, SquadStatus, Contracts } from './screens/Squad'
import { PlayerProfile } from './screens/Player'
import { Tactics } from './screens/Tactics'
import { Practice } from './screens/Practice'
import { TrainingScreen, DevelopmentScreen } from './screens/Training'
import { SeasonHub, CompScreen, ClubProfile, CalendarScreen } from './screens/Competitions'
import { TransferHub, Search, Scouting, Negotiation, Renewal, TransferHistory } from './screens/Transfers'
import { Academy } from './screens/Academy'
import { Office, ManagerCareer, Jobs, Awards, SeasonReview, CareerSettingsScreen } from './screens/Office'

export const TAB_ROOT: Record<Tab, ComponentType> = {
  central: Hub,
  squad: SquadHub,
  transfers: TransferHub,
  academy: Academy,
  season: SeasonHub,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ROUTES: Record<string, ComponentType<any>> = {
  inbox: Inbox,
  message: Message,
  news: News,
  article: Article,
  conversation: ConversationScreen,
  press: PressConference,
  sellNegotiation: SellNegotiation,
  prematch: PreMatch,
  match: LiveMatch,
  postmatch: PostMatch,
  fixture: FixtureReport,
  squadStatus: SquadStatus,
  contracts: Contracts,
  player: PlayerProfile,
  tactics: Tactics,
  practice: Practice,
  training: TrainingScreen,
  development: DevelopmentScreen,
  comp: CompScreen,
  club: ClubProfile,
  calendar: CalendarScreen,
  search: Search,
  scouting: Scouting,
  negotiation: Negotiation,
  renewal: Renewal,
  transferHistory: TransferHistory,
  office: Office,
  manager: ManagerCareer,
  jobs: Jobs,
  awards: Awards,
  seasonReview: SeasonReview,
  settings: CareerSettingsScreen,
  story: TransferStoryScreen,
  opponent: OpponentReport,
  fifa: FifaRanking,
}
