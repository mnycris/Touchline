// The media's memory. After the user's matches the opposing manager gives his view (shaped by what actually happened
// and by his personality), meetings are remembered with the user's set-up, and the user's own lines are kept, so
// journalists can later ask about what was said and what was done before.
import type { Fixture, MatchResult, World } from '../../domain/types'
import { hashString } from '../../domain/rng'
import { formationOf } from '../../domain/constants'
import { postNews } from './messages'
import { callName } from '../match/commentary'

export type Persona = 'Fiery' | 'Diplomatic' | 'Bitter' | 'Philosophical' | 'Pragmatic'
export interface MediaQuote { date: string; by: string; managerId: number; clubId: number; about: number; fixtureId: string; topic: string; text: string }
export interface Meeting { fixtureId: string; date: string; season: number; oppId: number; formation: string; mentality: string; gf: number; ga: number; compId: string }
export interface UserLine { date: string; fixtureId: string; text: string; tone: string; kind: 'pre' | 'post' }
export interface Media { quotes: MediaQuote[]; meetings: Record<string, Meeting[]>; lines: UserLine[] }

export function media(w: World): Media {
  const m = (w.flags.media ||= { quotes: [], meetings: {}, lines: [] }) as Media
  m.quotes ||= []; m.meetings ||= {}; m.lines ||= []
  return m
}

export function personaOf(managerId: number): Persona {
  const all: Persona[] = ['Fiery', 'Diplomatic', 'Bitter', 'Philosophical', 'Pragmatic', 'Diplomatic', 'Pragmatic']
  return all[hashString(`mgr:${managerId}`) % all.length]
}

const pickFor = (seed: string) => { let k = 0; return <T,>(a: T[]) => a[hashString(`${seed}:${k++}`) % a.length] }

/** After a user match: remember the meeting and let the opposing manager speak. */
export function afterUserMatchMedia(w: World, f: Fixture, r: MatchResult) {
  const M = media(w)
  const me = w.userClubId
  const us: 0 | 1 = f.home === me ? 0 : 1
  const oppId = us === 0 ? f.away : f.home
  const club = w.clubs[me], opp = w.clubs[oppId]
  if (!club || !opp) return
  const sheet = club.sheets.find((s) => s.id === club.activeSheet) || club.sheets[0]
  const gf = r.score[us], ga = r.score[1 - us]
  const list = (M.meetings[oppId] ||= [])
  list.push({ fixtureId: f.id, date: f.date, season: w.season, oppId, formation: sheet?.formation || '', mentality: sheet?.tactics?.mentality || 'Balanced', gf, ga, compId: f.compId })
  if (list.length > 4) list.splice(0, list.length - 4)

  const mgr = w.managers[opp.managerId]
  if (!mgr) return
  const persona = personaOf(mgr.id)
  const pick = pickFor(`${f.id}:quote`)
  const them = 1 - us
  const theirGoals = r.score[them], ourGoals = r.score[us]
  const lost = theirGoals < ourGoals, won = theirGoals > ourGoals
  const reds = r.events.filter((e) => (e.type === 'red' || e.type === 'secondYellow') && e.side === them)
  const firstRed = reds[0]
  const goalsAfterRed = firstRed ? r.events.filter((e) => (e.type === 'goal' || e.type === 'penGoal') && e.side === us && e.min >= firstRed.min).length : 0
  const penAgainst = r.events.filter((e) => e.type === 'penGoal' && e.side === us)
  const decider = lost && ourGoals - theirGoals === 1 ? r.events.filter((e) => (e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal') && e.side === us).slice(-1)[0] : undefined
  const xgThem = r.stats?.[them]?.xg ?? 0, xgUs = r.stats?.[us]?.xg ?? 0
  const bigger = club.squadAvg - opp.squadAvg
  const userName = `${w.user.firstName} ${w.user.lastName}`
  let topic = '', text = ''
  const fiery = persona === 'Fiery' || persona === 'Bitter'
  if (lost && firstRed && goalsAfterRed >= 1 && ourGoals - theirGoals <= 2) {
    topic = 'red'
    text = fiery ? pick([`The red card decided this game. Not the players, not the tactics: the referee.`, `Eleven against ten for ${90 - firstRed.min} minutes. What do you expect? It was a terrible decision.`, `I have watched it back. It was never a red card, and it killed the game.`])
      : pick([`The red card changed everything. Until then we were in control of the game.`, `Playing with ten men against a team like ${club.short} is very difficult. We had to change our plan.`, `We will look at the red card calmly, but it made the game very hard for us.`])
  } else if (lost && decider?.type === 'penGoal') {
    topic = 'penalty'
    text = fiery ? pick([`That was never a penalty. Everybody in the stadium saw it.`, `We lose a game like this because of a soft penalty. It is hard to accept.`, `The penalty was a gift. I don't understand how it was given.`])
      : pick([`I need to see the penalty again. From where I was standing it looked soft.`, `A penalty decided a very tight game. That is football sometimes.`])
  } else if (lost && decider && decider.min >= 85) {
    topic = 'late'
    text = pick([`To lose like that, in the ${decider.min}th minute, is cruel. We deserved at least a point.`, `We were so close to taking something. The last minutes hurt a lot.`, `One moment at the end and it's gone. It's a painful way to lose.`])
  } else if (lost && xgThem > xgUs + 0.6) {
    topic = 'unlucky'
    text = persona === 'Philosophical' ? pick([`We created the better chances. Football is not always fair, but I am proud of the way we played.`, `If we play like that every week, the results will come.`]) : pick([`We had the chances to win this game. We have to be more clinical.`, `The numbers say we were the better team. The scoreboard says something else.`])
  } else if (lost && ourGoals - theirGoals >= 3) {
    topic = 'heavy'
    text = fiery ? pick([`That was unacceptable. I told the players exactly what I think.`, `No excuses. We were not at the level, and that starts with me.`]) : pick([`${club.short} were much better than us today. We have to accept it and learn.`, `I apologise to our supporters. That was not good enough.`, `${userName} has built a very good team. They showed it today.`])
  } else if (lost) {
    topic = 'beaten'
    text = pick([`They took their chances and we didn't. That's the difference.`, `We were not sharp enough in the key moments.`, persona === 'Diplomatic' ? `Congratulations to ${club.short}. They deserved it.` : `We gave away too much. We will be better.`])
  } else if (won && bigger >= 3) {
    topic = fiery ? 'dig' : 'upset'
    text = fiery ? pick([`They have the money and the big names. We have a team. Today that was enough.`, `Some people didn't give us a chance. I think we answered them.`, `Maybe now people will respect what we are doing here.`]) : pick([`We showed we can beat anyone on our day. I'm very proud.`, `A huge result for us against one of the best teams in the league.`])
  } else if (won) {
    topic = 'proud'
    text = pick([`A big win against a good side. The players were outstanding.`, `We managed the game well. That's what I asked for.`, `Three important points. We needed that.`])
  } else if (bigger >= 3) {
    topic = 'point'
    text = pick([`A good point against one of the best teams in the league.`, `We came here with a plan and we stuck to it. I'll take the point.`, `Nobody expected anything from us today. We showed character.`])
  } else if (bigger <= -3) {
    topic = 'dropped'
    text = pick([`Two points dropped. We should have won this game.`, `At home, against this opponent, we expect to win. It's a disappointing result.`, `We did not do enough to win. That's frustrating.`])
  } else return
  const q: MediaQuote = { date: w.date, by: mgr.name, managerId: mgr.id, clubId: opp.id, about: me, fixtureId: f.id, topic, text }
  M.quotes.push(q)
  if (M.quotes.length > 40) M.quotes.splice(0, M.quotes.length - 40)
  const hot = topic === 'red' || topic === 'penalty' || topic === 'dig'
  postNews(w, {
    headline: hot ? `${callName(mgr.name)}: ${text.split(/(?<=[.!?])\s/)[0]}` : `${callName(mgr.name)} ${won ? 'hails' : lost ? 'reacts to' : 'on'} ${won ? 'the win' : lost ? `defeat to ${club.short}` : `the draw with ${club.short}`}`,
    body: `${opp.name} manager ${mgr.name} spoke after the ${f.home === opp.id ? `${theirGoals}-${ourGoals}` : `${ourGoals}-${theirGoals}`} ${won ? 'win over' : lost ? 'defeat to' : 'draw with'} ${club.name}. "${text}"`,
    kind: 'manager', playerIds: [], clubIds: [opp.id, club.id], compId: f.compId, fixtureId: f.id, importance: hot ? 3 : 2, userRelated: true,
    quote: { by: mgr.name, clubId: opp.id, text },
  })
}

/** Remember what the user said, for later questions. */
export function rememberLines(w: World, fixtureId: string, kind: 'pre' | 'post', lines: { text: string; tone: string }[]) {
  const M = media(w)
  for (const l of lines) M.lines.push({ date: w.date, fixtureId, kind, text: l.text.replace(/^"|"$/g, ''), tone: l.tone })
  if (M.lines.length > 16) M.lines.splice(0, M.lines.length - 16)
}

export const fmtFormation = (id: string) => formationOf(id)?.name || id
