// Pre- and post-match press conferences built from the real state of the save: competition and round, stakes,
// form and streaks, head-to-head, the last result, injuries, transfers, youngsters, former clubs, the opposing
// manager, fixture congestion, promises you made before the game and how you've spoken to the media before.
// Answers move squad and individual morale, board confidence and your reputation; bold claims can come back to you.
import type { Club, Competition, Fixture, MatchResult, Player, World } from '../../domain/types'
import { Rng, clamp, hashString } from '../../domain/rng'
import { rosterOf } from './roster'
import { postNews } from './messages'
import { sortTable } from '../competitions/tables'
import { callName } from '../match/commentary'
import { matchFacts, streakText, type MatchFacts } from './storylines'
import { fmtMoney } from '../../domain/finance'
import { diffDays, fmtDate } from '../../domain/dates'
import { fmtFormation, media, personaOf, rememberLines } from './media'

export type Tone = 'Confident' | 'Measured' | 'Humble' | 'Deflect' | 'Praise' | 'Critical' | 'Defiant' | 'Joke' | 'Bold'
export interface PressEffect { team?: number; player?: number; playerId?: number; brand?: number; rep?: number; opponent?: number; youth?: number; promise?: 'win' | 'title' | 'survive' | 'trophy' | 'score' }
export interface PressOption { id: string; tone: Tone; text: string; effect: PressEffect; quote: string; followUp?: PressQuestion }
export interface PressQuestion { id: string; topic: string; reporter: string; outlet: string; text: string; options: PressOption[]; playerId?: number; clubId?: number }

const OUTLETS: Record<string, string[]> = {
  England: ['BBC Sport', 'Sky Sports News', 'The Athletic', 'The Guardian', 'talkSPORT', 'The Times', 'Daily Mail', 'The Telegraph'],
  Spain: ['Marca', 'AS', 'Mundo Deportivo', 'Sport', 'El País', 'Cadena SER', 'COPE'],
  Germany: ['kicker', 'Bild', 'Sport1', 'Süddeutsche Zeitung', 'FAZ', 'Sky Sport'],
  Italy: ['La Gazzetta dello Sport', 'Corriere dello Sport', 'Tuttosport', 'Sky Sport Italia', 'DAZN'],
  France: ["L'Équipe", 'RMC Sport', 'Le Parisien', 'France Football', 'Canal+'],
  Portugal: ['A Bola', 'Record', 'O Jogo', 'SIC Notícias'],
  Netherlands: ['De Telegraaf', 'Voetbal International', 'NOS', 'AD'],
  Scotland: ['BBC Scotland', 'Daily Record', 'The Herald', 'Sky Sports'],
  Turkey: ['Fanatik', 'Hürriyet', 'Sabah Spor'],
  'Saudi Arabia': ['Al Riyadiya', 'SSC', 'Arab News'],
  'United States': ['ESPN', 'The Athletic', 'MLSsoccer.com'],
  _: ['ESPN', 'Reuters', 'Associated Press', 'The Athletic', 'Goal'],
}
const FIRST = ['Sam', 'Laura', 'Marco', 'Elena', 'Tom', 'Sofia', 'Daniel', 'Clara', 'James', 'Lucía', 'Pieter', 'Anna', 'Rory', 'Ines', 'Felix', 'Hannah', 'Matteo', 'Chloé', 'Ben', 'Nadia']
const LAST = ['Hughes', 'Martín', 'Rossi', 'Keller', 'Dubois', 'Silva', 'de Vries', 'Walsh', 'Moreno', 'Schmidt', 'Costa', 'Bennett', 'Okafor', 'Novak', 'Lindqvist', 'Barros', 'Fitzgerald', 'Conti']

// ---------------------------------------------------------------- context
interface Ctx {
  w: World; f: Fixture; kind: 'pre' | 'post'; rng: Rng
  club: Club; opp: Club; comp?: Competition; x: MatchFacts
  squad: Player[]; oppMgr?: string; oppMgrReal: boolean
  r?: MatchResult; us: 0 | 1; gf: number; ga: number; won: boolean; lost: boolean; drew: boolean
  pens: boolean; et: boolean; bigMatch: boolean; tones: Record<string, number>
  pre?: { promiseWin?: boolean; tone?: string; quote?: string }
  games: number // matches in charge
}
type Build = (c: Ctx) => Omit<PressQuestion, 'id' | 'reporter' | 'outlet' | 'topic'> | undefined
interface Topic { id: string; kind: 'pre' | 'post'; weight: (c: Ctx) => number; build: Build; always?: boolean }

const pk = <T,>(c: Ctx, a: T[]): T => a[Math.floor(c.rng.next() * a.length)]
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
const cn = (p: Player) => callName(p.name)
let optSeq = 0
/** Same intent, different words: tone-matched openers and closers so answers don't read identically every time. */
const TONE_OPEN: Partial<Record<Tone, string[]>> = {
  Confident: ['Look, ', 'Honestly? ', "I'll be clear: ", '', '', ''], Measured: ['I think ', 'For me, ', '', '', ''], Humble: ['To be fair, ', 'Honestly, ', '', ''],
  Defiant: ['Listen, ', 'Let me say this: ', '', ''], Critical: ['I have to be honest: ', 'The truth is ', '', ''], Praise: ['', 'Credit where it is due: ', ''],
  Deflect: ['', 'With respect, ', ''], Bold: ['', 'I mean it: ', ''], Joke: ['', ''],
}
const TONE_CLOSE: Partial<Record<Tone, string[]>> = {
  Confident: ['', '', ' The players know that.', " That's how I see it."], Measured: ['', '', ' We keep working.', ' That is the job.'], Humble: ['', '', ' We have to improve.'],
  Defiant: ['', '', ' We will answer on the pitch.', ' Nothing changes for us.'], Critical: ['', '', ' I expect more.', ' And I include myself in that.'],
  Praise: ['', ' They deserve it.'], Deflect: ['', ''], Bold: ['', ''], Joke: ['', ''],
}
function vary(c: Ctx, tone: Tone, text: string) {
  let op = pk(c, TONE_OPEN[tone] || [''])
  // never "Credit where it is due: credit to him..."
  if (op && op.split(/\W/)[0].toLowerCase() === text.split(/\W/)[0].toLowerCase()) op = ''
  const cl = pk(c, TONE_CLOSE[tone] || [''])
  if (!op && !cl) return text
  const body = op && !/[?!]\s$/.test(op) ? text.charAt(0).toLowerCase() + text.slice(1) : text
  // don't lower-case names or "I"
  const safe = op && /^(I\b|[A-Z][a-z]+\s(?!I\b)[A-Z]|[A-Z]{2})/.test(text) ? text : body
  return `${op}${safe}${cl && /[.!?]$/.test(text) ? cl : ''}`
}
function o(c: Ctx, tone: Tone, texts: string[], effect: PressEffect, quote?: string, followUp?: PressQuestion): PressOption {
  const text = vary(c, tone, pk(c, texts))
  return { id: `o${optSeq++}`, tone, text, effect, quote: `"${(quote || text).replace(/^"|"$/g, '')}"`, followUp }
}
const seasonGoals = (p: Player) => Object.values(p.season).reduce((a, s) => a + s.goals, 0)
const seasonApps = (p: Player) => Object.values(p.season).reduce((a, s) => a + s.apps, 0)

// ---------------------------------------------------------------- pre-match topics
const PRE: Topic[] = [
  {
    // what the opposing manager said last time the sides met (or this week)
    id: 'rivalWords', kind: 'pre', weight: (c) => (rivalQuote(c) ? 16 : 0), build: (c) => {
      const q = rivalQuote(c)!
      const when = diffDays(c.w.date, q.date) <= 10 ? 'this week' : `after your meeting in ${fmtDate(q.date, 'month')}`
      return {
        text: pk(c, [`${q.by} said ${when}: "${q.text}" Does that add anything to this game?`, `"${q.text}" That was ${callName(q.by)} ${when}. Your response?`, `${callName(q.by)} had plenty to say ${when}. Have you read it?`]),
        options: [
          o(c, 'Defiant', [`He can say what he likes. We will answer on the pitch.`, `Words are cheap. Ninety minutes will tell the story.`], { team: 3, brand: 1, opponent: 1 }),
          o(c, 'Measured', [`He is entitled to his opinion. I respect him and his team.`, `Every coach sees a game his own way. It doesn't change our preparation.`], { team: 1, rep: 0.1 }),
          o(c, 'Joke', [`I hope he's had a good week. I'm sure he'll have plenty to say on Saturday too.`, `I didn't know he read my press conferences so closely.`], { team: 2, brand: 2 }),
          o(c, 'Deflect', [`I don't read what other managers say. I focus on my own team.`], { team: 0 }),
        ],
      }
    },
  },
  {
    // the set-up used last time against this opponent
    id: 'sameApproach', kind: 'pre', weight: (c) => (lastMeetingWithSetup(c) ? 9 : 0), build: (c) => {
      const m = lastMeetingWithSetup(c)!
      const res = m.gf > m.ga ? `won ${m.gf}-${m.ga}` : m.gf < m.ga ? `lost ${m.gf}-${m.ga}` : `drew ${m.gf}-${m.ga}`
      const when = m.season === c.w.season ? 'earlier this season' : m.season === c.w.season - 1 ? 'last season' : `in ${m.season}`
      const won = m.gf > m.ga
      return {
        text: pk(c, [`When you played ${c.opp.short} ${when} you went with ${fmtFormation(m.formation)} and ${res}. Can we expect a similar approach?`, `${when[0].toUpperCase() + when.slice(1)} a ${fmtFormation(m.formation)} ${won ? 'worked well' : "didn't work"} against ${c.opp.short}. Will you ${won ? 'stick with it' : 'change things'}?`]),
        options: won ? [
          o(c, 'Confident', [`If something works, why change it? But they will have learned too.`, `We know what hurt them last time. We'll use it again.`], { team: 2, brand: 1 }),
          o(c, 'Deflect', [`You'll see at kick-off.`, `I never give the opposition a head start.`], { team: 0 }),
          o(c, 'Bold', [`We'll show them something they haven't seen before.`], { team: 2, brand: 2 }),
        ] : [
          o(c, 'Critical', [`We got it wrong that day. That's on me, and we've looked at it closely.`], { team: 1, rep: 0.1 }),
          o(c, 'Measured', [`Every game is different. We have prepared for what they do now, not what they did then.`], { team: 1 }),
          o(c, 'Defiant', [`We'll set up to win. Last time is last time.`], { team: 2, brand: 1 }),
        ],
      }
    },
  },
  {
    // the manager's own words from recently, when events have tested them
    id: 'standBy', kind: 'pre', weight: (c) => (ownLine(c) ? 6 : 0), build: (c) => {
      const l = ownLine(c)!
      return {
        text: pk(c, [`Last time out you said: "${l.text}" Do you stand by that?`, `You told us "${l.text}" Has anything changed your mind since?`]),
        options: [
          o(c, 'Confident', ['Every word. Nothing has changed.', 'Absolutely. I say what I believe.'], { team: 2, brand: 1 }),
          o(c, 'Measured', ['It was true then and it is true now, but football moves quickly.'], { team: 1 }),
          o(c, 'Humble', ['Maybe I got carried away. The results have to do the talking.'], { team: 0, rep: 0.1 }),
        ],
      }
    },
  },
  {
    id: 'final', kind: 'pre', weight: (c) => (c.x.final ? 30 : 0), build: (c) => ({
      text: pk(c, [
        `It's the ${c.comp?.name} final against ${c.opp.short}. What would lifting this trophy mean to you?`,
        `One game from silverware. How are you handling the build-up to the ${c.comp?.short} final?`,
        `Finals are about nerves as much as quality. How do you keep the players calm before facing ${c.opp.short}?`,
      ]),
      options: [
        o(c, 'Bold', ['We came here to win it. Nothing else will do.', 'This trophy is coming home with us.'], { team: 4, brand: 3, rep: 0.3, promise: 'trophy' }),
        o(c, 'Measured', ['It would mean everything, but we have to earn it on the pitch.', 'Finals are decided by details. We have prepared for every one of them.'], { team: 2, brand: 1 }),
        o(c, 'Humble', [`${c.opp.short} are a great side. We will need our best performance of the season.`], { team: 0, rep: 0.1 }),
        o(c, 'Joke', ['I told the players to enjoy it. I am the one who will not sleep tonight.'], { team: 3, brand: 1 }),
      ],
    }),
  },
  {
    id: 'semi', kind: 'pre', weight: (c) => (c.x.semi ? 18 : 0), build: (c) => ({
      text: pk(c, [
        `A ${c.comp?.short} semi-final${c.x.leg ? `, ${c.x.leg === 1 ? 'first' : 'second'} leg` : ''}. How big is this for the club?`,
        `You're ${c.x.leg === 2 ? '90 minutes' : 'two games'} from a final. Is the pressure different now?`,
      ]),
      options: [
        o(c, 'Confident', ['We want to be in that final and we believe we will be.'], { team: 3, brand: 2, rep: 0.2 }),
        o(c, 'Measured', ['It is a big game, but we treat it like any other. Preparation, focus, execution.'], { team: 2 }),
        o(c, 'Deflect', ['Let us talk about finals when we are in one.'], { team: 0, brand: -1 }),
      ],
    }),
  },
  {
    id: 'secondLeg', kind: 'pre', weight: (c) => (c.x.agg ? 22 : 0), build: (c) => {
      const [a, b] = c.x.agg!
      const behind = a < b, ahead = a > b
      return {
        text: behind
          ? pk(c, [`You trail ${b}-${a} from the first leg. Can you turn it around against ${c.opp.short}?`, `${b}-${a} down on aggregate. What has to change from the first leg?`, `Is ${b - a > 1 ? 'a comeback' : 'overturning a one-goal deficit'} realistic against ${c.opp.short}?`])
          : ahead
            ? pk(c, [`You take a ${a}-${b} lead into the second leg. Do you protect it or go for more?`, `Is there a danger of sitting back with a ${a}-${b} advantage?`])
            : pk(c, [`It's level at ${a}-${a} after the first leg. How do you approach the decider?`, `Everything to play for at ${a}-${b}. Will you be cautious or go for it?`]),
        options: behind ? [
          o(c, 'Defiant', ['We have done it before and we will do it again. Nobody here has given up.', 'Write us off at your peril.'], { team: 4, brand: 2, rep: 0.2 }),
          o(c, 'Measured', ['We need an early goal and patience. It is possible.'], { team: 2 }),
          o(c, 'Humble', [`It will be very difficult. ${c.opp.short} are in a strong position.`], { team: -2 }),
        ] : ahead ? [
          o(c, 'Confident', ['We play to win the game, not to protect a lead.'], { team: 3, brand: 1 }),
          o(c, 'Measured', ['The job is only half done. We respect the second leg.'], { team: 2 }),
          o(c, 'Critical', ['If we think it is over, we will be punished. I have warned the players.'], { team: 0, brand: 1 }),
        ] : [
          o(c, 'Confident', ['We are at home in our heads. We go and win it.'], { team: 3, brand: 1 }),
          o(c, 'Measured', ['Ninety minutes, maybe more. We are ready for all of it, penalties included.'], { team: 2 }),
          o(c, 'Deflect', ['I never talk about tactics before a game like this.'], { brand: -1 }),
        ],
      }
    },
  },
  {
    id: 'derby', kind: 'pre', weight: (c) => (c.f.derby ? 20 : 0), build: (c) => ({
      text: pk(c, [
        `It's the ${c.f.derby} this week. What does this game mean to you and the supporters?`,
        `Derby week. Have the fans been telling you what they expect?`,
        `${c.x.h2h.w + c.x.h2h.d + c.x.h2h.l ? `Your record in this fixture is ${c.x.h2h.w}W ${c.x.h2h.d}D ${c.x.h2h.l}L. ` : ''}How do you approach the ${c.f.derby}?`,
        `Emotions will run high in the ${c.f.derby}. How do you keep your players' heads cool?`,
      ]),
      options: [
        o(c, 'Bold', ['We are going to win the derby. Nothing else matters this week.', 'The city will be ours on Sunday night.'], { team: 4, brand: 3, rep: 0.2, promise: 'win' }, undefined),
        o(c, 'Measured', ['Derbies are special, but it is still three points and a performance.'], { team: 1, brand: 1 }),
        o(c, 'Humble', [`${c.opp.short} are a very good side and we respect them.`], { team: -1 }),
        o(c, 'Critical', ['Some of my players need to understand what this game means to people here.'], { team: -2, brand: 2 }),
      ],
    }),
  },
  {
    id: 'europeNight', kind: 'pre', weight: (c) => (c.x.kind === 'uefa' && !c.x.final && !c.x.semi && !c.x.agg ? 12 : 0), build: (c) => ({
      text: pk(c, [
        `A European night${c.x.home ? ` at ${c.club.stadium}` : ` in ${c.opp.country}`}. How big is the ${c.comp?.short} for this club?`,
        `What is the realistic target for ${c.club.short} in the ${c.comp?.name} this season?`,
        `${c.opp.short} bring a different style to what you see domestically. How have you prepared?`,
      ]),
      options: [
        o(c, 'Confident', ['We want to go deep in this competition. We are good enough.', 'The club belongs on this stage and we will show it.'], { team: 3, brand: 3, rep: 0.2 }),
        o(c, 'Measured', ['Europe is about managing the details and the squad. We take it game by game.'], { team: 2, brand: 1 }),
        o(c, 'Humble', ['We are here to learn and to compete. Every game at this level is a test.'], { team: 0 }),
      ],
    }),
  },
  {
    id: 'cupRotation', kind: 'pre', weight: (c) => ((c.x.kind === 'cup' || c.x.kind === 'playoff') && !c.x.final && !c.x.semi && c.x.strengthGap > 4 ? 12 : 0), build: (c) => ({
      text: pk(c, [
        `Will you rotate for the ${c.comp?.short} tie against ${c.opp.short}?`,
        `Is this the chance for your fringe players to show you what they can do?`,
        `Some managers see the ${c.comp?.short} as a distraction. What about you?`,
      ]),
      options: [
        o(c, 'Measured', ['We will make changes, but whoever plays will be strong enough to win.', 'Players who have waited for their chance will get it.'], { team: 2 }),
        o(c, 'Confident', ['We take every competition seriously. I will pick a team to win it.'], { team: 1, brand: 2 }),
        o(c, 'Critical', ['Anyone who plays badly tomorrow will not get another chance soon.'], { team: -3, brand: 1 }),
      ],
    }),
  },
  {
    id: 'titleRace', kind: 'pre', weight: (c) => (c.x.titleRace ? 14 + (c.x.themPos && c.x.themPos <= 3 ? 6 : 0) : 0), build: (c) => {
      const top = c.x.usPos === 1
      return {
        text: top
          ? pk(c, [`You're top of the table. Do you believe this is your year?`, `Top of the ${c.comp?.short} with ${c.x.played} played. Can you handle being the hunted?`, `Everyone is chasing you now. Does that change anything?`])
          : pk(c, [`${c.x.gapTop} point${c.x.gapTop === 1 ? '' : 's'} off the top. Are you title contenders?`, `Is this the week to close the gap at the top?`, `Can you keep pace with the leaders?`]),
        options: [
          o(c, 'Bold', ['We are going to win the league. I believe it and the players believe it.'], { team: 3, brand: 4, rep: 0.3, promise: 'title' }),
          o(c, 'Measured', ['There is a long way to go. We only look at the next game.', 'The table does not lie, but it does not give trophies in autumn either.'], { team: 2 }),
          o(c, 'Humble', ['Others have bigger budgets and deeper squads. We just try to stay in the race.'], { team: 0, rep: 0.1 }),
        ],
      }
    },
  },
  {
    id: 'relegation', kind: 'pre', weight: (c) => (c.x.relegation ? 14 : 0), build: (c) => ({
      text: pk(c, [
        `You're ${ord(c.x.usPos!)} and ${c.x.gapSafety != null && c.x.gapSafety < 0 ? `${-c.x.gapSafety} point${c.x.gapSafety === -1 ? '' : 's'} from safety` : 'looking over your shoulder'}. Is this a must-win?`,
        `How do you lift a dressing room in a relegation fight?`,
        `${c.x.themPos && c.x.teams && c.x.themPos > c.x.teams - 6 ? `A six-pointer against ${c.opp.short}. ` : ''}Are you worried about going down?`,
      ]),
      options: [
        o(c, 'Defiant', ['We are not going down. I will stake everything on that.', 'This club will stay up and I will make sure of it.'], { team: 4, brand: 1, rep: 0.1, promise: 'survive' }),
        o(c, 'Measured', ['Every game is a final now. We need points, not words.'], { team: 2 }),
        o(c, 'Critical', ['Some players are not showing the fight this situation needs.'], { team: -4, brand: 1 }),
      ],
    }),
  },
  {
    id: 'europeRace', kind: 'pre', weight: (c) => (c.x.europe ? 7 : 0), build: (c) => ({
      text: pk(c, [`You're ${ord(c.x.usPos!)}. Is European football the target this season?`, `How important is finishing in the European places for ${c.club.short}?`]),
      options: [
        o(c, 'Confident', ['We want Europe and we will get there.'], { team: 2, brand: 2 }),
        o(c, 'Measured', ['It is the target, but we control only our own results.'], { team: 1 }),
        o(c, 'Humble', ['We are ahead of where people expected. Anything more is a bonus.'], { team: 1, brand: -1 }),
      ],
    }),
  },
  {
    id: 'opener', kind: 'pre', weight: (c) => (c.x.opener ? 16 : 0), build: (c) => ({
      text: pk(c, [`The new ${c.comp?.short} season starts against ${c.opp.short}. What are your expectations?`, `Opening day. What does success look like for ${c.club.short} this season?`, `How has pre-season shaped your thinking for the campaign ahead?`]),
      options: [
        o(c, 'Bold', ['We want to be champions. I am not here to finish in the middle.'], { team: 3, brand: 4, rep: 0.2, promise: 'title' }),
        o(c, 'Confident', ['We have a strong group and we want to be up there with the best.'], { team: 2, brand: 2 }),
        o(c, 'Measured', ['Improve every week and see where it takes us.'], { team: 1 }),
        o(c, 'Humble', ['Our first aim is to be stable and competitive.'], { team: 0, brand: -2 }),
      ],
    }),
  },
  {
    id: 'finale', kind: 'pre', weight: (c) => (c.x.finale ? 18 : 0), build: (c) => ({
      text: pk(c, [`Final day of the season. What's at stake for ${c.club.short}?`, `One game left. How do you want this season to end?`]),
      options: [
        o(c, 'Confident', ['We want to finish with a win in front of our people.'], { team: 2, brand: 2 }),
        o(c, 'Measured', ['Whatever happens, we will reflect properly after the game.'], { team: 1 }),
        o(c, 'Praise', ['This group deserves to finish the season on a high. They have given everything.'], { team: 3 }),
      ],
    }),
  },
  {
    id: 'firstGame', kind: 'pre', weight: (c) => (c.games === 0 ? 25 : 0), build: (c) => ({
      text: pk(c, [`Your first game in charge of ${c.club.short}. How are you feeling?`, `What can the supporters expect from your ${c.club.short} side?`, `You've had a short time with the squad. What's your first impression?`]),
      options: [
        o(c, 'Confident', ['Excited. The players have been fantastic and they will show it tomorrow.'], { team: 3, brand: 2, rep: 0.1 }),
        o(c, 'Bold', ['Intensity, courage and goals. That is my football.'], { team: 2, brand: 3, rep: 0.2 }),
        o(c, 'Measured', ['It takes time to build something. Tomorrow is the first step.'], { team: 1 }),
      ],
    }),
  },
  {
    id: 'returnToFormer', kind: 'pre', weight: (c) => (c.w.user.history.some((h) => h.clubId === c.opp.id && h.to) ? 16 : 0), build: (c) => ({
      text: pk(c, [`You're back facing ${c.opp.short}, your former club. How do you expect to be received?`, `Is there any extra motivation facing ${c.opp.short} after how things ended?`]),
      options: [
        o(c, 'Praise', ['I have great memories there and huge respect for the fans.'], { team: 0, rep: 0.1 }),
        o(c, 'Defiant', ['It is just another game. I work for this club now and I want to beat them.'], { team: 2, brand: 1 }),
        o(c, 'Deflect', ['The past is the past. I am only thinking about my team.'], { team: 1 }),
      ],
    }),
  },
  {
    id: 'oppManager', kind: 'pre', weight: (c) => (c.oppMgr && c.oppMgrReal ? 5 : 0), build: (c) => ({
      text: pk(c, [
        `You come up against ${c.oppMgr}. How do you rate him as a coach?`,
        `${c.oppMgr}'s teams are always well drilled. What problems will ${c.opp.short} pose?`,
        `Is this a tactical battle between you and ${c.oppMgr}?`,
      ]),
      options: [
        o(c, 'Praise', [`${c.oppMgr} is one of the best coaches around. It is a pleasure to compete with him.`], { team: 0, rep: 0.1 }),
        o(c, 'Confident', ['I respect him, but games are won by players. Mine are ready.'], { team: 2, brand: 1 }),
        o(c, 'Deflect', ['This is not about the two coaches. It is about the two teams.'], { team: 1 }),
      ],
    }),
  },
  {
    id: 'lastMeeting', kind: 'pre', weight: (c) => (c.x.lastMeeting?.result ? 8 : 0), build: (c) => {
      const m = c.x.lastMeeting!
      const s = m.result!.score, home = m.home === c.club.id
      const our = home ? s[0] : s[1], their = home ? s[1] : s[0]
      const res = our > their ? 'won' : our < their ? 'lost' : 'drew'
      return {
        text: res === 'lost'
          ? pk(c, [`${c.opp.short} beat you ${their}-${our} last time. Is this about revenge?`, `What have you learned from the ${our}-${their} defeat against ${c.opp.short}?`])
          : res === 'won'
            ? pk(c, [`You beat ${c.opp.short} ${our}-${their} in the last meeting. Will they be out for revenge?`, `Can you repeat the ${our}-${their} win from last time?`])
            : pk(c, [`The last meeting ended ${our}-${their}. What needs to change to win this one?`]),
        options: res === 'lost' ? [
          o(c, 'Defiant', ['We have not forgotten that game. The players want to put it right.'], { team: 3, brand: 1 }),
          o(c, 'Measured', ['We have analysed it, but every game is different.'], { team: 1 }),
          o(c, 'Humble', ['They were better that day. We have to be better this time.'], { team: 0 }),
        ] : [
          o(c, 'Confident', ['We know how to hurt them and we will do it again.'], { team: 2, brand: 1 }),
          o(c, 'Measured', ['That game means nothing now. It starts from zero.'], { team: 1 }),
          o(c, 'Praise', [`${c.opp.short} will have improved. We expect a much harder game.`], { team: 0 }),
        ],
      }
    },
  },
  {
    id: 'form', kind: 'pre', weight: (c) => (c.x.usStreak ? 10 : 0), build: (c) => {
      const s = c.x.usStreak!
      const good = s.kind === 'won' || s.kind === 'unbeaten' || s.kind === 'cleanSheets' || s.kind === 'scoring'
      return {
        text: good
          ? pk(c, [`${streakText(s, c.club.short)}. What's behind this run?`, `${streakText(s, 'You')}. Can anyone stop you right now?`, `How do you keep the momentum going after ${s.n} games like this?`])
          : pk(c, [`${streakText(s, c.club.short)}. Is your job under pressure?`, `${streakText(s, 'You')}. What is going wrong?`, `How do you end a run like this, ${s.n} games?`]),
        options: good ? [
          o(c, 'Praise', ['The players deserve all the credit. Their attitude is exceptional.', 'It is the hunger of this group. I just try not to get in the way.'], { team: 4 }),
          o(c, 'Confident', ['We are only getting started.', 'This is the level we expect of ourselves.'], { team: 2, brand: 2, rep: 0.2 }),
          o(c, 'Humble', ['Feet on the ground. Nothing is won in a run of games.'], { team: 1 }),
        ] : [
          o(c, 'Defiant', ['I am the right person for this job and I will prove it.', 'I have been through worse. We will turn it around.'], { team: 2, rep: 0.2, brand: 1 }),
          o(c, 'Measured', ['Results must improve and I take full responsibility.'], { team: 3, brand: 1 }),
          o(c, 'Critical', ['Some players need to take a hard look at themselves.'], { team: -5, brand: 2 }),
        ],
      }
    },
  },
  {
    id: 'oppForm', kind: 'pre', weight: (c) => (c.x.themStreak ? 6 : 0), build: (c) => {
      const s = c.x.themStreak!
      const good = s.kind === 'won' || s.kind === 'unbeaten' || s.kind === 'cleanSheets' || s.kind === 'scoring'
      return {
        text: good ? `${streakText(s, c.opp.short)}. How do you stop them?` : `${streakText(s, c.opp.short)}. Is this the perfect time to face them?`,
        options: good ? [
          o(c, 'Confident', ['Every run ends. Why not tomorrow?'], { team: 2, brand: 1 }),
          o(c, 'Praise', ['They are in great form, so we will need to be at our very best.'], { team: 1 }),
          o(c, 'Deflect', ['I am more worried about my team than theirs.'], { team: 1 }),
        ] : [
          o(c, 'Measured', ['A wounded team is dangerous. We will not take them lightly.'], { team: 2 }),
          o(c, 'Confident', ['We want to take advantage, of course.'], { team: 1, brand: 1 }),
        ],
      }
    },
  },
  {
    id: 'underdog', kind: 'pre', weight: (c) => (c.x.strengthGap < -3 ? 8 : 0), build: (c) => ({
      text: pk(c, [`${c.opp.short} are favourites for this one. Can your side cause an upset?`, `On paper ${c.opp.short} are stronger in every position. How do you bridge the gap?`, `What would a result against ${c.opp.short} do for your players?`]),
      options: [
        o(c, 'Bold', ["We fear no-one. We'll go toe to toe with them."], { team: 3, brand: 2, rep: 0.2 }),
        o(c, 'Measured', ['We have a plan. If we execute it, anything is possible.'], { team: 2, brand: 1 }),
        o(c, 'Humble', ["They're one of the best teams around. A point would be a good result."], { team: -3, brand: -1 }),
      ],
    }),
  },
  {
    id: 'favourite', kind: 'pre', weight: (c) => (c.x.strengthGap > 3 ? 6 : 0), build: (c) => ({
      text: pk(c, [`You're expected to win comfortably against ${c.opp.short}. Any danger of complacency?`, `Everyone expects three points. How do you avoid a banana skin?`, `${c.opp.short} will sit deep. How do you break them down?`]),
      options: [
        o(c, 'Measured', ['No game is easy at this level. We prepare the same way every week.'], { team: 2 }),
        o(c, 'Confident', ['We should be winning games like this, and we will.'], { team: 1, brand: 2, rep: 0.1 }),
        o(c, 'Praise', [`${c.opp.short} are well organised. They'll make it difficult.`], { team: 0 }),
      ],
    }),
  },
  {
    id: 'star', kind: 'pre', weight: () => 6, build: (c) => {
      const star = [...c.squad].filter((p) => !p.injury).sort((a, b) => b.formRatings.slice(-3).reduce((x, y) => x + y, 0) - a.formRatings.slice(-3).reduce((x, y) => x + y, 0) || b.ovr - a.ovr)[0]
      if (!star) return undefined
      return {
        playerId: star.id,
        text: pk(c, [`${star.name} has been in fine form. How important is he to this team?`, `Is ${cn(star)} the best player in the ${c.comp?.short || 'league'} right now?`, `What makes ${cn(star)} so special?`]),
        options: [
          o(c, 'Praise', ['He is world class. We build the team around him.', 'I would not swap him for anyone.'], { player: 8, playerId: star.id, team: -1 }, `${cn(star)} is world class. We build the team around him.`),
          o(c, 'Measured', ['He is important, but this is a team effort.'], { player: 3, playerId: star.id, team: 1 }),
          o(c, 'Critical', ['He can still do much more. I expect more from him.'], { player: -6, playerId: star.id }, `I expect even more from ${cn(star)}.`),
        ],
      }
    },
  },
  {
    id: 'topScorer', kind: 'pre', weight: (c) => (c.x.topScorer && c.x.topScorer.goals >= 5 ? 7 : 0), build: (c) => {
      const t = c.x.topScorer!
      return {
        playerId: t.p.id,
        text: pk(c, [`${t.p.name} has ${t.goals} goals already. Can he finish as top scorer?`, `${t.goals} goals for ${cn(t.p)} this season. Where does he rank among the strikers you've worked with?`, `Is there a risk you rely too much on ${cn(t.p)}'s goals?`]),
        options: [
          o(c, 'Praise', [`He can score against anyone. The Golden Boot is realistic.`], { player: 7, playerId: t.p.id }),
          o(c, 'Measured', ['The goals come from the whole team working for him.'], { player: 2, playerId: t.p.id, team: 2 }),
          o(c, 'Critical', ['Others need to chip in. We cannot depend on one player.'], { player: -2, playerId: t.p.id, team: -1 }),
        ],
      }
    },
  },
  {
    id: 'newSigning', kind: 'pre', weight: (c) => (c.x.newSigning ? 10 : 0), build: (c) => {
      const p = c.x.newSigning!
      return {
        playerId: p.id,
        text: pk(c, [`How has ${p.name} settled in since arriving?`, `Will ${cn(p)} make his debut against ${c.opp.short}?`, `Supporters are excited about ${cn(p)}. What does he bring to the team?`]),
        options: [
          o(c, 'Praise', ['He has been outstanding in training. You will see why we signed him.'], { player: 6, playerId: p.id, brand: 1 }),
          o(c, 'Measured', ['He needs time to adapt, like every new player. We will not rush him.'], { player: 1, playerId: p.id }),
          o(c, 'Confident', ['He was our number one target. He will make a big difference.'], { player: 4, playerId: p.id, brand: 2 }),
        ],
      }
    },
  },
  {
    id: 'youngster', kind: 'pre', weight: (c) => (c.x.youngster ? 6 : 0), build: (c) => {
      const p = c.x.youngster!
      return {
        playerId: p.id,
        text: pk(c, [`${p.name} is one of the brightest talents around. Is he ready for more minutes?`, `How do you protect a young player like ${cn(p)} from the hype?`, `Could ${cn(p)} be a future international?`]),
        options: [
          o(c, 'Praise', ['He is ready. Age does not matter if you are good enough.'], { player: 7, playerId: p.id, youth: 2 }),
          o(c, 'Measured', ['He will get his chances. We have a plan for his development.'], { player: 2, playerId: p.id, youth: 1 }),
          o(c, 'Critical', ['He has a lot to learn. Nobody has given him anything yet.'], { player: -4, playerId: p.id }),
        ],
      }
    },
  },
  {
    id: 'injuries', kind: 'pre', weight: (c) => (c.x.injured.length >= 2 ? 8 : c.x.injured.length === 1 ? 4 : 0), build: (c) => {
      const inj = c.x.injured
      const p = inj[0]
      return {
        playerId: inj.length === 1 ? p.id : undefined,
        text: inj.length >= 2
          ? pk(c, [`You're without ${inj.map(cn).join(', ')}. Does that give you an excuse?`, `How badly do the injuries to ${inj.map(cn).join(' and ')} hurt you?`])
          : pk(c, [`Any update on ${p.name}? When will he be back?`, `How are you coping without ${cn(p)}?`]),
        options: [
          o(c, 'Defiant', ['No excuses. The players who come in are good enough.'], { team: 3 }),
          o(c, 'Measured', ['It is difficult, but we will adapt.', 'We miss them, of course, but this squad was built for moments like this.'], { team: 1 }),
          o(c, 'Deflect', ['Ask the medical staff.'], { brand: -2, team: -1 }),
        ],
      }
    },
  },
  {
    id: 'exPlayer', kind: 'pre', weight: (c) => (c.x.exOurs.length || c.x.exTheirs.length ? 7 : 0), build: (c) => {
      const mine = c.x.exOurs[0], theirs = c.x.exTheirs[0]
      if (mine) return {
        playerId: mine.id,
        text: pk(c, [`${mine.name} faces his former club. Will he start?`, `Does ${cn(mine)} have a point to prove against ${c.opp.short}?`]),
        options: [
          o(c, 'Praise', ['He is professional. He will want to show them what they are missing.'], { player: 4, playerId: mine.id }),
          o(c, 'Measured', ['He is one of 25 players. Selection is based on what is best for the team.'], { player: 0, playerId: mine.id, team: 1 }),
        ],
      }
      return {
        text: pk(c, [`${theirs.name} returns to face you. Any regrets about letting him go?`, `How do you stop ${cn(theirs)}, who knows your club so well?`]),
        options: [
          o(c, 'Praise', [`${cn(theirs)} is a good player and we wish him well, just not tomorrow.`], { team: 0, rep: 0.1 }),
          o(c, 'Deflect', ['No regrets. We made the right decision for the club.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'transferRumour', kind: 'pre', weight: (c) => (rumourTarget(c) ? 5 : 0), build: (c) => {
      const p = rumourTarget(c)!
      return {
        text: pk(c, [`Reports link you with ${p.name} of ${c.w.clubs[p.clubId]?.short}. Can you comment?`, `Is ${cn(p)} someone you'd like to bring in?`, `Are you in the market for a player like ${p.name}?`]),
        options: [
          o(c, 'Deflect', ['I never talk about players at other clubs.', 'You know I will not comment on that.'], { team: 1, rep: 0.05 }),
          o(c, 'Praise', [`He is a fantastic player. Every coach would like a player like ${cn(p)}.`], { brand: 2, team: -1 }),
          o(c, 'Joke', ['If you have his number, send it to me.'], { brand: 2 }),
        ],
      }
    },
  },
  {
    id: 'starSale', kind: 'pre', weight: (c) => (incomingBid(c) ? 9 : 0), build: (c) => {
      const b = incomingBid(c)!
      const p = c.w.players[b.playerId]
      const buyer = c.w.clubs[b.fromClubId]
      return {
        playerId: p.id,
        text: pk(c, [`${buyer.short} have made an offer for ${p.name}. Is he for sale?`, `Can you guarantee ${cn(p)} will still be here after the window?`, `How is ${cn(p)} handling the interest from ${buyer.short}?`]),
        options: [
          o(c, 'Defiant', ['He is not for sale. End of story.'], { player: 3, playerId: p.id, team: 2, brand: 1 }),
          o(c, 'Measured', ['He is our player and he is focused. That is all I will say.'], { player: 0, playerId: p.id }),
          o(c, 'Critical', ['Every player has a price. If the offer is right, we will listen.'], { player: -6, playerId: p.id, team: -2, brand: 1 }),
        ],
      }
    },
  },
  {
    id: 'deadline', kind: 'pre', weight: (c) => (windowClosingIn(c.w) != null ? 8 : 0), build: (c) => ({
      text: pk(c, [`The window closes in ${windowClosingIn(c.w)} days. Will there be more business?`, `Are you happy with the squad, or do you need reinforcements before the deadline?`, `With a budget of ${fmtMoney(c.club.finance.transferBudget, { short: true })} left, will you spend before the window shuts?`]),
      options: [
        o(c, 'Confident', ['We are working on something. You will hear soon.'], { brand: 3, team: -1 }),
        o(c, 'Measured', ['If the right player is available, we will act. We will not panic buy.'], { team: 1 }),
        o(c, 'Praise', ['I am very happy with this group. They deserve my trust.'], { team: 3, brand: -1 }),
      ],
    }),
  },
  {
    id: 'congestion', kind: 'pre', weight: (c) => (daysSinceLast(c) != null && daysSinceLast(c)! <= 3 ? 7 : 0), build: (c) => ({
      text: pk(c, [`Another game only ${daysSinceLast(c)} days after the last one. How are the legs?`, `Will fatigue force you to rotate?`, `Is the fixture list asking too much of the players?`]),
      options: [
        o(c, 'Measured', ['We manage the load carefully. The squad is ready.'], { team: 1 }),
        o(c, 'Critical', ['The schedule is crazy. Nobody thinks about the players.'], { team: 2, brand: 1, rep: -0.1 }),
        o(c, 'Defiant', ['Fatigue is in the head. We go again.'], { team: 1, brand: 1 }),
      ],
    }),
  },
  {
    id: 'mediaPersona', kind: 'pre', weight: (c) => ((c.tones.Bold || 0) + (c.tones.Confident || 0) >= 8 || (c.tones.Critical || 0) >= 4 ? 5 : 0), build: (c) => {
      const loud = (c.tones.Bold || 0) + (c.tones.Confident || 0) >= 8
      return {
        text: loud ? pk(c, ['You have been very outspoken in recent weeks. Is that a deliberate strategy?', 'Some say your confidence borders on arrogance. How do you respond?'])
          : pk(c, ['You have publicly criticised your players several times. Does it risk losing the dressing room?', 'Is criticising players in public the right way to get a reaction?']),
        options: [
          o(c, 'Defiant', ['I say what I think. That will never change.'], { brand: 2, team: loud ? 0 : -2, rep: 0.1 }),
          o(c, 'Humble', ['Maybe I have been too emotional at times. Lesson learned.'], { team: 2, brand: -1 }),
          o(c, 'Joke', ['I promise to be boring today. Next question?'], { team: 1, brand: 1 }),
        ],
      }
    },
  },
  {
    id: 'preview', kind: 'pre', weight: () => 2, always: true, build: (c) => ({
      text: pk(c, [`How do you assess ${c.opp.short} ahead of the game?`, `What kind of game are you expecting against ${c.opp.short}?`, `Where can ${c.opp.short} hurt you?`, `Any selection news ahead of ${c.opp.short}?`]),
      options: [
        o(c, 'Confident', ["We're focused on ourselves. If we play our game we'll win."], { team: 2, brand: 1 }),
        o(c, 'Praise', [`A strong side with quality all over the pitch.`], { team: 0 }),
        o(c, 'Deflect', ["I'll talk about them after the game.", 'You will see my team at kick-off like everybody else.'], { brand: -1 }),
      ],
    }),
  },
]

// ---------------------------------------------------------------- post-match topics
const POST: Topic[] = [
  {
    // the opposing manager's reaction to this match
    id: 'rivalReaction', kind: 'post', weight: (c) => { const q = thisMatchQuote(c); return !q ? 0 : ['red', 'penalty', 'dig'].includes(q.topic) ? 16 : 5 }, build: (c) => {
      const q = thisMatchQuote(c)!
      const t = q.topic
      const ask = pk(c, [`${callName(q.by)} has just said: "${q.text}" What's your reaction?`, `${q.by} says "${q.text}" Do you agree?`, ...(t === 'red' || t === 'penalty' || t === 'dig' ? [`The other dressing room isn't happy. ${callName(q.by)}: "${q.text}" Your response?`] : [])])
      const sets: Record<string, PressOption[]> = {
        complaint: [
          o(c, 'Defiant', [`We won because we were the better team, not because of the referee.`, `Look at the whole game, not one decision.`], { team: 3, brand: 1, opponent: 1 }),
          o(c, 'Measured', [`I understand his frustration. Every manager sees these moments differently.`, `I haven't seen it again yet. Decisions go for you and against you over a season.`], { team: 1, rep: 0.1 }),
          o(c, 'Critical', [`Blaming the referee is the easy option.`, `If you need to talk about the referee, maybe look at your own team first.`], { team: 2, brand: 2, rep: -0.1, opponent: 2 }),
        ],
        dig: [
          o(c, 'Humble', [`They deserved it. We have to take it on the chin.`, `Fair play to them. They wanted it more today.`], { team: -1, rep: 0.1 }),
          o(c, 'Defiant', [`Enjoy it. We'll see where both teams finish.`, `One result doesn't change the table in May.`], { team: 2, brand: 1, opponent: 1 }),
          o(c, 'Deflect', [`I'm not here to talk about him. I'm here to talk about my team.`, `He can enjoy his evening. I'll be looking at our mistakes.`], { team: 0 }),
        ],
        selfCritical: [
          o(c, 'Praise', [`Credit to him for being honest. They're a good side and they'll bounce back.`, `I know how that feels. His team will recover quickly.`], { team: 1, rep: 0.2 }),
          o(c, 'Confident', [`We were very good today. That's what I'll remember.`, `We forced them into those mistakes. That's our work.`], { team: 2, brand: 1 }),
          o(c, 'Measured', [`Every game has its story. Today it went our way.`, `We take the points and move on.`], { team: 1 }),
        ],
        unlucky: [
          o(c, 'Confident', [`Chances don't win games; goals do. We took ours.`, `We defended our box well. That's part of football too.`], { team: 2, brand: 1 }),
          o(c, 'Humble', [`He has a point. We rode our luck at times.`, `They created a lot. We need to be better at stopping that.`], { team: 0, rep: 0.1 }),
          o(c, 'Deflect', [`The table doesn't ask about expected goals.`], { team: 1 }),
        ],
        late: [
          o(c, 'Confident', [`We kept going until the end. That's the mentality I want.`, `Games last ninety minutes and more. My team knows that.`], { team: 3, brand: 1 }),
          o(c, 'Praise', [`It's hard on them, honestly. They were very good.`], { team: 0, rep: 0.2 }),
          o(c, 'Measured', [`Late goals come from fitness and belief. We have both.`], { team: 2 }),
        ],
        theyWon: [
          o(c, 'Humble', [`They deserved it. We have to take it on the chin.`, `Credit to them. They were better in the moments that mattered.`], { team: -1, rep: 0.1 }),
          o(c, 'Critical', [`We handed them this game. That's what annoys me.`, `We were nowhere near our level. That's on us, not them.`], { team: 1, brand: 1 }),
          o(c, 'Defiant', [`One result. We'll see where both teams finish.`], { team: 2, brand: 1, opponent: 1 }),
        ],
        point: [
          o(c, 'Praise', [`They defended really well. Credit to them for the way they stuck at it.`, `He has every right to be pleased. They made it very hard for us.`], { team: 0, rep: 0.2 }),
          o(c, 'Critical', [`We should have won. Not finding a way through annoys me.`, `Against a side sitting that deep we need more ideas. That's on us.`], { team: 1, brand: 1 }),
          o(c, 'Measured', [`Some days the door stays shut. We move on.`, `A point away from home is never a disaster.`], { team: 1 }),
        ],
        draw: [
          o(c, 'Confident', [`They'll be disappointed with a point, and that tells you how far we've come.`, `We came to win and we could have. That's the standard now.`], { team: 2, brand: 1 }),
          o(c, 'Measured', [`A point is a fair reflection. We move on.`, `Both teams will feel they could have won it.`], { team: 1 }),
          o(c, 'Critical', [`We should have won. I'm not happy with a draw.`], { team: 1, brand: 1 }),
        ],
      }
      const key = t === 'red' || t === 'penalty' ? 'complaint' : t === 'dig' ? 'dig' : t === 'heavy' || t === 'beaten' ? 'selfCritical' : t === 'unlucky' ? 'unlucky' : t === 'late' ? 'late' : t === 'proud' || t === 'upset' ? 'theyWon' : t === 'point' ? 'point' : 'draw'
      return { text: ask, options: sets[key] }
    },
  },
  {
    // a penalty that went against us in a game we didn't win
    id: 'penaltyCall', kind: 'post', weight: (c) => (c.r && !c.won && c.r.events.some((e) => e.type === 'penGoal' && e.side !== c.us) ? 10 : 0), build: (c) => ({
      text: pk(c, [`The penalty proved costly. Was it the right decision?`, `Were you happy with the penalty decision today?`, `Did the penalty change the game?`]),
      options: [
        o(c, 'Critical', [`I have seen it again. It was not a penalty, and it cost us.`, `For me it was soft. At this level, the decisions have to be right.`], { team: 2, brand: -1, rep: -0.2 }),
        o(c, 'Measured', [`It's the referee's call. We had time to respond and didn't.`, `I won't hide behind one decision. We had chances.`], { team: 1, rep: 0.1 }),
        o(c, 'Deflect', [`I won't talk about the referee.`], { team: 0 }),
      ],
    }),
  },
  {
    // the manager's own words before this match
    id: 'wordsTested', kind: 'post', weight: (c) => { const l = preLine(c); return l && (c.lost || c.drew) && /win|beat|confident|ready|best/i.test(l.text) ? 9 : 0 }, build: (c) => {
      const l = preLine(c)!
      return {
        text: pk(c, [`Before the game you said: "${l.text}" What went wrong?`, `You were confident beforehand. "${l.text}" Do you regret saying that?`]),
        options: [
          o(c, 'Humble', ['Maybe. The result says we were not as ready as I thought.', 'I got that one wrong, and I take responsibility.'], { team: 0, rep: 0.1 }),
          o(c, 'Defiant', ['No. I believe in this team. One result does not change that.'], { team: 2, brand: 1 }),
          o(c, 'Deflect', ['That was before the game. I will not look back.'], { team: 0, brand: -1 }),
        ],
      }
    },
  },
  {
    id: 'trophy', kind: 'post', weight: (c) => (c.x.final && c.won ? 40 : 0), build: (c) => ({
      text: pk(c, [`${c.comp?.name} winners! What does this trophy mean to you?`, `Champions. Who do you dedicate this one to?`, `You've delivered silverware. Is this the start of something bigger?`]),
      options: [
        o(c, 'Praise', ['This is for the players and for every supporter who believed in us.'], { team: 5, brand: 4, rep: 0.5 }),
        o(c, 'Bold', ['This is only the first. This club is going to win a lot more.'], { team: 3, brand: 5, rep: 0.6 }),
        o(c, 'Humble', ['I am just proud to be part of it. The players did this.'], { team: 4, brand: 2, rep: 0.4 }),
      ],
    }),
  },
  {
    id: 'finalLost', kind: 'post', weight: (c) => (c.x.final && c.lost ? 40 : 0), build: (c) => ({
      text: pk(c, [`So close to a trophy. How are you and the players feeling?`, `What went wrong in the ${c.comp?.short} final?`, `How do you pick the dressing room up after losing a final?`]),
      options: [
        o(c, 'Measured', ['It hurts. It should hurt. We will use it.'], { team: 1, rep: 0.1 }),
        o(c, 'Praise', ['I could not be prouder of this group, even tonight.'], { team: 3 }),
        o(c, 'Critical', ['We did not turn up on the biggest day. That is on all of us.'], { team: -4, brand: 1 }),
      ],
    }),
  },
  {
    id: 'shootout', kind: 'post', weight: (c) => (c.pens ? 22 : 0), build: (c) => ({
      text: c.won
        ? pk(c, ['Through on penalties. Did you practise them?', 'Nerves of steel in the shoot-out. How did you watch it?'])
        : pk(c, ['Out on penalties. Is a shoot-out just a lottery?', 'How do you console the players who missed?']),
      options: c.won ? [
        o(c, 'Measured', ['We practise every week. It is not luck if you prepare.'], { team: 3, rep: 0.1 }),
        o(c, 'Joke', ['I could not watch. Ask my assistant what happened.'], { team: 3, brand: 1 }),
        o(c, 'Praise', ['Our keeper was a giant tonight.'], { team: 2 }),
      ] : [
        o(c, 'Measured', ['It is cruel, but we did enough to not need penalties.'], { team: 1 }),
        o(c, 'Praise', ['Only players with courage step up. I am proud of them.'], { team: 3 }),
        o(c, 'Critical', ['We practised them all week. That is unacceptable.'], { team: -3 }),
      ],
    }),
  },
  {
    id: 'promise', kind: 'post', weight: (c) => (c.pre?.promiseWin && !c.won ? 26 : c.pre?.promiseWin && c.won ? 12 : 0), build: (c) => ({
      text: c.won
        ? pk(c, [`Before the game you said ${c.pre?.quote || 'you would win'} and you delivered. A good feeling?`, `You backed your team publicly and they won. Were you ever worried?`])
        : pk(c, [`Before the game you said ${c.pre?.quote || 'you would win'}. What happened?`, `You guaranteed a win and didn't get it. Do you regret those words?`, `Were your comments before the game a mistake?`]),
      options: c.won ? [
        o(c, 'Confident', ['I believe in my players. I will always say what I think.'], { team: 3, brand: 3, rep: 0.3 }),
        o(c, 'Praise', ['The players made me look good tonight.'], { team: 4, brand: 1 }),
      ] : [
        o(c, 'Humble', ['I was wrong. I take responsibility for putting pressure on the players.'], { team: 2, brand: -1, rep: -0.1 }),
        o(c, 'Defiant', ['I would say it again. I believe in this team.'], { team: 1, brand: -2, rep: -0.2 }),
        o(c, 'Deflect', ['I do not live in the past. Next game.'], { brand: -2, rep: -0.2 }),
      ],
    }),
  },
  {
    id: 'titlePromise', kind: 'post', weight: (c) => (titlePromiseDoubt(c) ? 14 : 0), build: (c) => ({
      text: pk(c, [`You predicted a title this season. Sitting ${ord(c.x.usPos!)}, is that still realistic?`, `In the summer you talked about winning the league. Do you regret setting the bar so high?`]),
      options: [
        o(c, 'Defiant', ['Nothing has changed. We are still going for it.'], { team: 2, brand: -1 }),
        o(c, 'Humble', ['We have fallen short so far. We have to be honest about that.'], { team: 1, rep: -0.1 }),
        o(c, 'Deflect', ['Talk to me in May.'], { brand: -1 }),
      ],
    }),
  },
  {
    id: 'result', kind: 'post', weight: () => 20, always: true, build: (c) => {
      const lateWinner = c.won && c.r!.events.some((e) => (e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal') && e.side === c.us && e.min >= 85 && e.score && e.score[c.us] > e.score[1 - c.us] && e.score[c.us] - e.score[1 - c.us] === 1)
      const comeback = c.won && c.r!.events.some((e) => (e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal') && e.side !== c.us && e.score && e.score[1 - c.us] > e.score[c.us])
      const lateLoss = c.lost && c.r!.events.some((e) => (e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal') && e.side !== c.us && e.min >= 85 && e.score && e.score[1 - c.us] - e.score[c.us] === 1)
      const blewLead = c.drew && c.r!.events.some((e) => e.score && e.score[c.us] > e.score[1 - c.us])
      const xg = c.r!.stats[c.us].xg, xga = c.r!.stats[1 - c.us].xg
      const s = `${c.gf}-${c.ga}`
      let text: string
      if (c.won && c.gf - c.ga >= 3) text = pk(c, [`A statement ${s} win. Your thoughts?`, `${s}. Is that the best your team has played?`, `That was a demolition. How do you keep the players grounded?`])
      else if (lateWinner) text = pk(c, [`A late winner! Talk us through those final minutes.`, `You left it late. Did you think the win had gone?`, `That late goal could be huge. How important is it?`])
      else if (comeback) text = pk(c, [`You came from behind to win ${s}. What did you say to the players?`, `A real show of character to turn that around. Where did it come from?`])
      else if (c.won && xg < xga - 0.6) text = pk(c, [`You won, but ${c.opp.short} created more. Did you ride your luck?`, `Some will say that was a smash and grab. Fair?`])
      else if (c.won) text = pk(c, [`A ${s} win${c.f.derby ? ` in the ${c.f.derby}` : ''}. How pleased are you?`, `Three points. What pleased you most?`, `A hard-fought ${s}. Is winning ugly a sign of a good team?`])
      else if (c.lost && c.ga - c.gf >= 3) text = pk(c, [`A ${s} defeat. What went wrong?`, `That was a heavy loss. Do you owe the supporters an apology?`, `${s}. Was that the worst performance since you arrived?`])
      else if (lateLoss) text = pk(c, [`Beaten late on. How cruel does that feel?`, `You conceded at the end. Was it fatigue or concentration?`])
      else if (c.lost && xg > xga + 0.6) text = pk(c, [`You created the better chances but lost. Is football unfair sometimes?`, `The numbers say you deserved more. Do you agree?`])
      else if (c.lost) text = pk(c, [`A ${s} defeat. What was missing?`, `A frustrating result. Where was the game lost?`, `${c.opp.short} took their chances and you didn't. Is that the story?`])
      else if (blewLead) text = pk(c, [`You were ahead and let it slip. Two points dropped?`, `Why couldn't you hold on to the lead?`])
      else if (c.gf === 0) text = pk(c, [`A goalless draw. Were you happy with a point?`, `Neither side could find a way through. Fair result?`])
      else text = pk(c, [`A ${s} draw. A point gained or two dropped?`, `Honours even. How do you reflect on the game?`])
      const options: PressOption[] = c.won ? [
        o(c, 'Praise', ['I am proud of every single player today.', 'Everyone did their job. That is what pleases me most.'], { team: 4 }),
        o(c, 'Confident', ['This is what we are capable of. Expect more.', 'We are going to be a problem for everyone.'], { team: 2, brand: 2, rep: 0.3 }),
        o(c, 'Critical', ['We won, but there is still a lot to improve.', 'I am not satisfied. We can play much better than that.'], { team: -1, brand: 1 }),
        o(c, 'Humble', ['A good day, but tomorrow we start again from zero.'], { team: 2 }),
      ] : c.lost ? [
        o(c, 'Measured', ['We were not at our level. We learn and move on.', 'Not good enough today. The response is what matters now.'], { team: 1 }),
        o(c, 'Critical', ['That performance was unacceptable. Players must respond.', 'Some players let the shirt down today.'], { team: -4, brand: 1 }),
        o(c, 'Defiant', ['On another day we win that game.', 'I will not criticise players who gave everything.'], { team: 2, brand: -1 }),
        o(c, 'Humble', [`${c.opp.short} were better. Congratulations to them.`], { team: 0, rep: 0.1 }),
      ] : [
        o(c, 'Measured', ['A fair result. We take the point.'], { team: 1 }),
        o(c, 'Critical', ['Two points dropped. We should have won.'], { team: -1, brand: 1 }),
        o(c, 'Praise', ['The spirit to keep going pleased me most.'], { team: 2 }),
      ]
      return { text, options }
    },
  },
  {
    id: 'knockoutProgress', kind: 'post', weight: (c) => (c.x.knockout && !c.x.final && (c.won || c.lost) && c.x.leg !== 1 ? 12 : 0), build: (c) => ({
      text: c.won
        ? pk(c, [`You're through to the next round of the ${c.comp?.short}. Who would you like to draw?`, `Into the next round. How far can you go in the ${c.comp?.name}?`])
        : pk(c, [`Knocked out of the ${c.comp?.short}. How disappointing is that?`, `Your ${c.comp?.short} campaign is over. Does it free you up for the league?`]),
      options: c.won ? [
        o(c, 'Confident', ['We want to win this competition. Bring anyone.'], { team: 2, brand: 2, rep: 0.1 }),
        o(c, 'Measured', ['I do not care about the draw. We just want to keep improving.'], { team: 1 }),
        o(c, 'Joke', ['A home draw against a team with injuries would be nice.'], { team: 1, brand: 1 }),
      ] : [
        o(c, 'Measured', ['It hurts. We wanted to go further.'], { team: 0 }),
        o(c, 'Deflect', ['We move on. The league is the priority now.'], { team: 1, brand: -2 }),
        o(c, 'Critical', ['We threw it away. I am angry.'], { team: -3, brand: 1 }),
      ],
    }),
  },
  {
    id: 'derbyResult', kind: 'post', weight: (c) => (c.f.derby ? 10 : 0), build: (c) => ({
      text: c.won ? pk(c, [`Bragging rights are yours. What does winning the ${c.f.derby} mean?`, `The fans will enjoy this one. A message for them?`])
        : c.lost ? pk(c, [`Losing the ${c.f.derby} will hurt the fans. What do you say to them?`, `A painful derby defeat. How do you respond?`])
          : pk(c, [`Honours even in the ${c.f.derby}. Satisfied?`]),
      options: c.won ? [
        o(c, 'Praise', ['This one is for the supporters. Enjoy it, you deserve it.'], { team: 3, brand: 3 }),
        o(c, 'Bold', ['This city belongs to us.'], { team: 3, brand: 4, rep: -0.1 }),
        o(c, 'Measured', ['It is a special win, but it is still three points.'], { team: 1 }),
      ] : c.lost ? [
        o(c, 'Humble', ['I apologise to the fans. They deserved much more.'], { team: 1, brand: 1 }),
        o(c, 'Critical', ['Some players did not understand what this game means.'], { team: -4, brand: 1 }),
        o(c, 'Defiant', ['We will see them again, and it will be different.'], { team: 2 }),
      ] : [
        o(c, 'Measured', ['A draw is not the end of the world in a derby.'], { team: 1 }),
        o(c, 'Critical', ['We should have won. The fans deserved it.'], { team: -1, brand: 1 }),
      ],
    }),
  },
  {
    id: 'hero', kind: 'post', weight: (c) => (bestOf(c) ? 9 : 0), build: (c) => {
      const b = bestOf(c)!
      const p = c.w.players[b.id]
      const hat = b.goals >= 3, brace = b.goals === 2
      const sub = !b.started && b.goals > 0
      const debut = c.x.newSigning?.id === p.id && b.goals > 0
      const young = p && c.x.youngster?.id === p.id && b.goals > 0
      const text = hat ? pk(c, [`A hat-trick for ${p.name}! Can you put into words what he did today?`, `Three goals from ${cn(p)}. Is he the best striker you've managed?`])
        : sub ? pk(c, [`${p.name} came off the bench and scored. A super sub, or does he deserve to start?`, `A big impact from ${cn(p)} off the bench. Did you see that coming?`])
          : debut ? pk(c, [`A goal on his debut for ${p.name}. Could it have gone any better?`])
            : young ? pk(c, [`${p.name} scored today. How special is that for such a young player?`])
              : brace ? pk(c, [`Two goals for ${p.name}. He's in the form of his life, isn't he?`, `${cn(p)} with a brace. Your verdict?`])
                : pk(c, [`${p.name} stood out today. Your verdict?`, `Was ${cn(p)} the best player on the pitch?`, `How important was ${cn(p)} in this ${c.won ? 'win' : 'game'}?`])
      return {
        playerId: p.id,
        text,
        options: [
          o(c, 'Praise', [`Outstanding. ${cn(p)} was the difference.`, `He was magnificent. Nobody could live with him today.`], { player: 7, playerId: p.id, youth: young ? 1 : 0 }),
          o(c, 'Measured', ['He played well, like the whole team.', 'Good performance. Now he has to do it again.'], { player: 2, playerId: p.id, team: 1 }),
          o(c, 'Critical', ['He can still improve.', 'He missed chances too. There is more in him.'], { player: -5, playerId: p.id }),
        ],
      }
    },
  },
  {
    id: 'scapegoat', kind: 'post', weight: (c) => (worstOf(c) ? 6 : 0), build: (c) => {
      const b = worstOf(c)!
      const p = c.w.players[b.id]
      return {
        playerId: p.id,
        text: pk(c, [`${p.name} had a difficult afternoon. Will you stick with him?`, `Was ${cn(p)} at fault today?`, `Does ${cn(p)} need a rest after that performance?`]),
        options: [
          o(c, 'Praise', ['He has my full backing. Everyone has off days.'], { player: 6, playerId: p.id }),
          o(c, 'Critical', ['He knows he must do better. Places are up for grabs.'], { player: -7, playerId: p.id, team: 1 }),
          o(c, 'Deflect', ["I won't single out individuals.", 'We win together and we lose together.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'keeper', kind: 'post', weight: (c) => (keeperHero(c) ? 7 : 0), build: (c) => {
      const k = keeperHero(c)!
      const p = c.w.players[k.id]
      return {
        playerId: p.id,
        text: pk(c, [`${k.saves} saves from ${p.name}. Did he win you the game?`, `${cn(p)} kept you in it. How good was he?`]),
        options: [
          o(c, 'Praise', ['He was a wall. One of the best goalkeeping displays I have seen.'], { player: 7, playerId: p.id }),
          o(c, 'Critical', ['He was busy, which tells you we defended badly in front of him.'], { player: 2, playerId: p.id, team: -2 }),
        ],
      }
    },
  },
  {
    id: 'redCard', kind: 'post', weight: (c) => (c.r!.events.some((e) => (e.type === 'red' || e.type === 'secondYellow') && e.side === c.us) ? 14 : 0), build: (c) => {
      const e = c.r!.events.find((x) => (x.type === 'red' || x.type === 'secondYellow') && x.side === c.us)!
      const p = e.player ? c.w.players[e.player] : undefined
      return {
        playerId: p?.id,
        text: pk(c, [`${p ? cn(p) : 'Your player'} was sent off. Was the red card fair?`, `Did ${p ? cn(p) : 'the dismissal'} cost you today?`, `Will you be appealing ${p ? `${cn(p)}'s` : 'the'} red card?`]),
        options: [
          o(c, 'Critical', ['It was a shocking decision. The referee got it badly wrong.'], { team: 2, brand: 2, rep: -0.3 }),
          o(c, 'Measured', ["I need to see it again before I comment."], {}),
          o(c, 'Humble', ['We must be more disciplined. He let the team down.'], { team: -1, rep: 0.1, player: -5, playerId: p?.id }),
        ],
      }
    },
  },
  {
    id: 'oppRed', kind: 'post', weight: (c) => (c.r!.events.some((e) => (e.type === 'red' || e.type === 'secondYellow') && e.side === 1 - c.us) ? 6 : 0), build: (c) => ({
      text: pk(c, [`${c.opp.short} went down to ten men. Did that decide the game?`, `How much did the red card for ${c.opp.short} change things?`]),
      options: [
        o(c, 'Measured', ['It helped, of course, but you still have to use the extra man.'], { team: 1 }),
        o(c, 'Deflect', ['I focus on my team, not on the referee.'], { team: 1 }),
      ],
    }),
  },
  {
    id: 'penMiss', kind: 'post', weight: (c) => (c.r!.events.some((e) => e.type === 'penMiss' && e.side === c.us) ? 9 : 0), build: (c) => {
      const e = c.r!.events.find((x) => x.type === 'penMiss' && x.side === c.us)!
      const p = e.player ? c.w.players[e.player] : undefined
      return {
        playerId: p?.id,
        text: pk(c, [`${p ? cn(p) : 'Your taker'} missed a penalty. Will he keep the job?`, `How costly was the missed penalty?`]),
        options: [
          o(c, 'Praise', ['Only those who have the courage to take them can miss. He stays on penalties.'], { player: 6, playerId: p?.id }),
          o(c, 'Critical', ['We will look at who takes them next time.'], { player: -6, playerId: p?.id }),
        ],
      }
    },
  },
  {
    id: 'injuryInGame', kind: 'post', weight: (c) => (c.r!.events.some((e) => e.type === 'injury' && e.side === c.us) ? 8 : 0), build: (c) => {
      const e = c.r!.events.find((x) => x.type === 'injury' && x.side === c.us)!
      const p = e.player ? c.w.players[e.player] : undefined
      return {
        playerId: p?.id,
        text: pk(c, [`${p ? p.name : 'A player'} went off injured. How serious is it?`, `Any news on ${p ? cn(p) : 'the injury'}?`]),
        options: [
          o(c, 'Measured', ['We will know more after the scans. Fingers crossed.'], { team: 0 }),
          o(c, 'Critical', ['Too many injuries this season. We have to look at why.'], { team: -1, brand: 1 }),
        ],
      }
    },
  },
  {
    id: 'cleanSheet', kind: 'post', weight: (c) => (c.ga === 0 && c.won ? 5 : 0), build: (c) => ({
      text: pk(c, ['Another clean sheet. How pleased are you with the defence?', 'You barely gave them a chance. Is defending the foundation of this team?']),
      options: [
        o(c, 'Praise', ['The back line was outstanding. Defending starts with the strikers, though.'], { team: 3 }),
        o(c, 'Confident', ['If we do not concede, we always have a chance to win.'], { team: 2 }),
      ],
    }),
  },
  {
    id: 'table', kind: 'post', weight: (c) => (c.x.kind === 'league' && (c.x.played || 0) >= 3 ? 7 : 0), build: (c) => {
      const pos = c.x.usPos!
      return {
        text: pos === 1 ? pk(c, [`That result keeps you top. Is it yours to lose now?`, `Top of the ${c.comp?.short}. Can anyone catch you?`])
          : c.x.relegation ? pk(c, [`You're ${ord(pos)}. How worried are you about the drop?`, `Does that result change the picture at the bottom?`])
            : pk(c, [`You're ${ord(pos)} in the ${c.comp?.short}. What are your ambitions this season?`, `${ord(pos)}${c.x.gapTop ? `, ${c.x.gapTop} points off the top` : ''}. Where does this team end up?`]),
        options: [
          o(c, 'Confident', ['We want to be at the very top.'], { brand: 3, rep: 0.2, team: 1 }),
          o(c, 'Measured', ['One game at a time. The table will take care of itself.'], { team: 1 }),
          o(c, 'Humble', ['Our targets are realistic and we are on track.'], { brand: -1 }),
        ],
      }
    },
  },
  {
    id: 'milestone', kind: 'post', weight: (c) => ([10, 25, 50, 100, 150, 200, 250, 300].includes(c.games + 1) ? 10 : 0), build: (c) => ({
      text: pk(c, [`That was your ${ord(c.games + 1)} game in charge. How would you sum up your time here so far?`, `${c.games + 1} games at ${c.club.short}. Is the team becoming what you want it to be?`]),
      options: [
        o(c, 'Confident', ['We are building something special. The best is still to come.'], { team: 2, brand: 2, rep: 0.2 }),
        o(c, 'Humble', ['I am grateful every day to work for this club.'], { team: 2, rep: 0.1 }),
        o(c, 'Measured', ['There is progress, but a lot still to do.'], { team: 1 }),
      ],
    }),
  },
  {
    id: 'nextUp', kind: 'post', weight: (c) => (nextFixture(c) ? 3 : 0), build: (c) => {
      const n = nextFixture(c)!
      const opp = c.w.clubs[n.home === c.club.id ? n.away : n.home]
      return {
        text: pk(c, [`Next up is ${opp.short}${n.derby ? ` in the ${n.derby}` : ''}. Are you already thinking about that?`, `How quickly can you turn your attention to ${opp.short}?`]),
        options: [
          o(c, 'Measured', ['Tonight we recover. Tomorrow we start preparing.'], { team: 1 }),
          o(c, 'Confident', [`We will be ready for ${opp.short}. This team is hungry.`], { team: 2, brand: 1 }),
        ],
      }
    },
  },
]

// ---------------------------------------------------------------- helpers
function rumourTarget(c: Ctx): Player | undefined {
  const ids = [...Object.keys(c.w.transfers.targets).map(Number), ...c.w.transfers.shortlist]
  const ps = ids.map((id) => c.w.players[id]).filter((p) => p && p.clubId && p.clubId !== c.club.id && p.ovr >= 76)
  return ps.sort((a, b) => b.ovr - a.ovr)[0]
}
function incomingBid(c: Ctx) {
  return Object.values(c.w.transfers.offers).filter((o) => o.userIsSeller && ['Offer Submitted', 'Counter Offer'].includes(o.status) && c.w.players[o.playerId]?.ovr >= 74).sort((a, b) => b.fee - a.fee)[0]
}
function windowClosingIn(w: World): number | undefined {
  const win = w.windows.find((x) => x.open <= w.date && x.close >= w.date)
  if (!win) return undefined
  const d = diffDays(win.close, w.date)
  return d <= 6 ? d : undefined
}
function daysSinceLast(c: Ctx): number | undefined {
  const last = Object.values(c.w.fixtures).filter((x) => x.played && (x.home === c.club.id || x.away === c.club.id) && x.date < c.f.date).sort((a, b) => b.date.localeCompare(a.date))[0]
  return last ? diffDays(c.f.date, last.date) : undefined
}
function nextFixture(c: Ctx) {
  return Object.values(c.w.fixtures).filter((x) => !x.played && x.id !== c.f.id && (x.home === c.club.id || x.away === c.club.id) && x.date > c.f.date).sort((a, b) => a.date.localeCompare(b.date))[0]
}
function bestOf(c: Ctx) {
  const mine = c.r!.players.filter((x) => x.side === c.us && c.w.players[x.id])
  return [...mine].sort((a, b) => b.rating - a.rating)[0]
}
function worstOf(c: Ctx) {
  const mine = c.r!.players.filter((x) => x.side === c.us && x.mins >= 45 && c.w.players[x.id])
  const w = [...mine].sort((a, b) => a.rating - b.rating)[0]
  return w && w.rating < 6.2 && w.id !== bestOf(c)?.id ? w : undefined
}
function keeperHero(c: Ctx) {
  const k = c.r!.players.find((x) => x.side === c.us && x.pos === 'GK' && x.saves >= 5 && x.id !== bestOf(c)?.id)
  return k && c.w.players[k.id] ? k : undefined
}
function titlePromiseDoubt(c: Ctx) {
  const t = c.w.flags.pressPromises?.title as number | undefined
  return t === c.w.season && c.x.kind === 'league' && (c.x.played || 0) >= 12 && (c.x.usPos || 1) >= 4 && c.rng.next() < 0.5
}

function rivalQuote(c: Ctx) {
  const M = media(c.w)
  const mgr = c.w.managers[c.opp.managerId]
  // the current opposing manager's last words about us (recent, or from the last meeting)
  return [...M.quotes].reverse().find((q) => q.about === c.club.id && q.clubId === c.opp.id && q.managerId === mgr?.id && diffDays(c.w.date, q.date) <= 400 && q.fixtureId !== c.f.id)
}
function thisMatchQuote(c: Ctx) {
  return [...media(c.w).quotes].reverse().find((q) => q.fixtureId === c.f.id)
}
function lastMeetingWithSetup(c: Ctx) {
  const list = media(c.w).meetings[c.opp.id] || []
  return [...list].reverse().find((m) => m.fixtureId !== c.f.id && m.formation)
}
function ownLine(c: Ctx) {
  const l = [...media(c.w).lines].reverse().find((x) => x.fixtureId !== c.f.id && diffDays(c.w.date, x.date) <= 21 && x.text.length > 25 && ['Confident', 'Bold', 'Defiant', 'Critical'].includes(x.tone))
  return l
}
function preLine(c: Ctx) {
  return [...media(c.w).lines].reverse().find((x) => x.fixtureId === c.f.id && x.kind === 'pre' && x.text.length > 20)
}
void personaOf

function reporter(w: World, rng: Rng) {
  const c = w.clubs[w.userClubId]
  const o = OUTLETS[c.country] || OUTLETS._
  return { reporter: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, outlet: rng.pick(o) }
}

/** Build this press conference's questions: the most relevant topics, varied, avoiding what you were asked recently. */
export function pressQuestions(w: World, kind: 'pre' | 'post', fixtureId: string): PressQuestion[] {
  const f = w.fixtures[fixtureId]
  if (!f) return []
  const rng = new Rng(hashString(`${fixtureId}:${kind}:${w.meta.seed}:${(w.flags.pressCount || 0)}`))
  optSeq = 0
  const club = w.clubs[w.userClubId]
  const oppId = f.home === club.id ? f.away : f.home
  const opp = w.clubs[oppId]
  const comp = w.competitions[f.compId]
  const r = kind === 'post' ? f.result : undefined
  if (kind === 'post' && !r) return []
  const us: 0 | 1 = f.home === club.id ? 0 : 1
  const gf = r ? r.score[us] : 0, ga = r ? r.score[1 - us] : 0
  const pens = !!r?.pens
  const won = !!r && (gf > ga || (pens && r.pens![us] > r.pens![1 - us]))
  const lost = !!r && (gf < ga || (pens && r.pens![us] < r.pens![1 - us]))
  const mgr = w.managers[opp.managerId]
  const hist = w.user.history.find((h) => h.clubId === club.id && !h.to)
  const c: Ctx = {
    w, f, kind, rng, club, opp, comp, x: matchFacts(w, f, club.id), squad: rosterOf(w, club.id),
    oppMgr: mgr?.name, oppMgrReal: !!mgr?.real, r, us, gf, ga, won, lost, drew: !!r && !won && !lost, pens, et: !!r?.et,
    bigMatch: !!(f.derby || comp?.format === 'uefa'), tones: (w.flags.pressTones || {}) as Record<string, number>,
    pre: (w.flags.pressLog || {})[fixtureId], games: hist ? hist.p - (kind === 'post' ? 1 : 0) : 0,
  }
  const topics = kind === 'pre' ? PRE : POST
  const recent: string[] = w.flags.pressRecent || []
  const scored = topics.map((t) => {
    let wt = 0
    try { wt = t.weight(c) } catch { wt = 0 }
    if (wt > 0 && recent.includes(t.id) && wt < 12 && !t.always) wt *= 0.15
    return { t, wt: wt * (0.75 + rng.next() * 0.5) }
  }).filter((x) => x.wt > 0)
  const n = c.x.final || c.x.semi || c.bigMatch || (kind === 'post' && (c.x.final || pens)) ? 4 : 3
  const picked: Topic[] = []
  const pool = [...scored]
  if (kind === 'post') { const res = pool.findIndex((x) => x.t.id === 'result' || x.t.id === 'trophy' || x.t.id === 'finalLost'); const top = pool.filter((x) => ['trophy', 'finalLost'].includes(x.t.id))[0] || pool[res]; if (top) { picked.push(top.t); pool.splice(pool.indexOf(top), 1) } }
  while (picked.length < n && pool.length) {
    const total = pool.reduce((a, x) => a + x.wt, 0)
    let roll = rng.next() * total, i = 0
    for (; i < pool.length - 1; i++) { roll -= pool[i].wt; if (roll <= 0) break }
    const t = pool.splice(i, 1)[0].t
    if (kind === 'post' && (t.id === 'result') && picked.some((p) => p.id === 'trophy' || p.id === 'finalLost')) continue
    picked.push(t)
  }
  if (!picked.length) picked.push(topics.find((t) => t.always)!)
  const qs: PressQuestion[] = []
  for (const t of picked) {
    let q: ReturnType<Build>
    try { q = t.build(c) } catch { q = undefined }
    if (!q || !q.options.length) continue
    // bold claims get a follow-up from the same reporter
    const rep = reporter(w, rng)
    for (const op of q.options) {
      if (op.effect.promise === 'win' || op.effect.promise === 'title' || op.effect.promise === 'trophy') {
        op.followUp = {
          id: `f${qs.length}`, topic: `${t.id}-follow`, ...rep,
          text: pk(c, ['Bold words. Are you guaranteeing it?', 'Is that a promise to the supporters?', 'You realise that headline will be everywhere tomorrow?']),
          options: [
            o(c, 'Bold', ['Yes. Write it down.', 'Guaranteed. I believe in this group.'], { team: 2, brand: 2, rep: 0.1, promise: op.effect.promise }),
            o(c, 'Measured', ['It is a belief, not a guarantee. But I do believe it.'], { team: 1 }),
            o(c, 'Joke', ['Ask me again after the game. I might have changed my mind.'], { team: 1, brand: 1 }),
          ],
        }
      }
    }
    qs.push({ ...q, id: `q${qs.length}`, topic: t.id, ...rep })
  }
  return qs
}

export function applyPress(w: World, kind: 'pre' | 'post', fixtureId: string, questions: PressQuestion[], answers: Record<string, string>): string[] {
  const club = w.clubs[w.userClubId]
  const squad = rosterOf(w, club.id)
  const out: string[] = []
  let teamDelta = 0, brand = 0, rep = 0, youth = 0
  const quotes: string[] = []
  const personal = new Map<number, number>()
  const tones = (w.flags.pressTones ||= {}) as Record<string, number>
  let promiseWin = false, promiseQuote = ''
  const said: { text: string; tone: string }[] = []
  for (const q of questions) {
    const o = q.options.find((x) => x.id === answers[q.id])
    if (!o) continue
    teamDelta += o.effect.team || 0
    brand += o.effect.brand || 0
    rep += o.effect.rep || 0
    youth += o.effect.youth || 0
    if (o.effect.playerId) personal.set(o.effect.playerId, (personal.get(o.effect.playerId) || 0) + (o.effect.player || 0))
    quotes.push(o.quote)
    said.push({ text: o.quote, tone: o.tone })
    tones[o.tone] = (tones[o.tone] || 0) + 1
    if (o.effect.promise === 'win' || o.effect.promise === 'trophy') { promiseWin = true; promiseQuote = o.quote.toLowerCase().replace(/^"|"$/g, '') }
    if (o.effect.promise === 'title') (w.flags.pressPromises ||= {}).title = w.season
  }
  // tone memory decays so the media's image of you follows recent behaviour
  for (const k of Object.keys(tones)) tones[k] = Math.max(0, tones[k] * 0.93)
  for (const p of squad) p.morale = clamp(p.morale + teamDelta * (0.6 + p.hidden.temperament / 250), 0, 100)
  for (const [id, d] of personal) { const p = w.players[id] as Player | undefined; if (p) p.morale = clamp(p.morale + d, 0, 100) }
  w.board.confidence['Brand Exposure'] = clamp(w.board.confidence['Brand Exposure'] + brand, 0, 100)
  if (youth) w.board.confidence['Youth Development'] = clamp(w.board.confidence['Youth Development'] + youth, 0, 100)
  w.user.reputation = clamp(w.user.reputation + rep, 1, 100)
  if (teamDelta) out.push(`Squad morale ${teamDelta > 0 ? 'lifted' : 'dented'} (${teamDelta > 0 ? '+' : ''}${teamDelta})`)
  for (const [id, d] of personal) if (d) out.push(`${w.players[id]?.name} ${d > 0 ? 'boosted by your words' : 'unhappy with your comments'}`)
  if (brand) out.push(`Board brand confidence ${brand > 0 ? '+' : ''}${brand}`)
  if (youth) out.push(`Board youth confidence +${youth}`)
  if (rep) out.push(`Manager reputation ${rep > 0 ? '+' : ''}${rep.toFixed(1)}`)
  if (promiseWin) out.push('The media will hold you to your promise')
  if (kind === 'pre') ((w.flags.pressLog ||= {}) as Record<string, unknown>)[fixtureId] = { promiseWin, quote: promiseQuote, date: w.date }
  const recent: string[] = (w.flags.pressRecent ||= [])
  for (const q of questions) recent.push(q.topic)
  if (recent.length > 14) recent.splice(0, recent.length - 14)
  w.flags.pressCount = (w.flags.pressCount || 0) + 1
  const f = w.fixtures[fixtureId] as Fixture
  if (quotes.length) {
    const opp = w.clubs[f.home === club.id ? f.away : f.home]
    const lead = quotes.find((q) => q.length > 30) || quotes[0]
    postNews(w, {
      headline: `${w.user.lastName}: ${lead.replace(/^"|"$/g, '')}`,
      body: `${w.user.firstName} ${w.user.lastName} spoke to the media ${kind === 'pre' ? `ahead of ${club.short}'s meeting with ${opp.short}` : `after ${club.short}'s game against ${opp.short}`}. ${quotes.join(' ')}`,
      kind: 'manager', playerIds: [...personal.keys()], clubIds: [club.id, opp.id], compId: f.compId, importance: promiseWin ? 3 : 2, userRelated: true, fixtureId: f.id,
      quote: { by: `${w.user.firstName} ${w.user.lastName}`, clubId: club.id, text: lead.replace(/^"|"$/g, '') },
    })
  }
  rememberLines(w, fixtureId, kind, said)
  ;(w.flags.pressDone ||= {})[`${kind}:${fixtureId}`] = true
  return out
}
