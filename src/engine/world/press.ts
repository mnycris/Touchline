// Pre- and post-match press conferences built from the real state of the save: competition and round, stakes,
// form and streaks, head-to-head, the last result, injuries, transfers, youngsters, former clubs, the opposing
// manager, fixture congestion, promises you made before the game and how you've spoken to the media before.
// Answers move squad and individual morale, board confidence and your reputation; bold claims can come back to you.
import type { Club, Competition, Fixture, MatchEvent, MatchResult, Player, World } from '../../domain/types'
import { Rng, clamp, hashString } from '../../domain/rng'
import { rosterOf } from './roster'
import { postNews } from './messages'
import { sortTable } from '../competitions/tables'
import { callName } from '../match/commentary'
import { matchFacts, streakText, type MatchFacts } from './storylines'
import { fmtMoney } from '../../domain/finance'
import { addDays, ageOn, diffDays, fmtDate, monthName } from '../../domain/dates'
import { isSuspendedFor } from '../match/selection'
import { YELLOW_LIMITS, refereeStrictness } from './matchRunner'
import { opponentReport } from './opponentReport'
import { fmtFormation, media, personaOf, rememberLines } from './media'

export type Tone = 'Confident' | 'Measured' | 'Humble' | 'Deflect' | 'Praise' | 'Critical' | 'Defiant' | 'Joke' | 'Bold'
export interface PressEffect { team?: number; player?: number; playerId?: number; brand?: number; rep?: number; opponent?: number; youth?: number; promise?: 'win' | 'title' | 'survive' | 'trophy' | 'score'; stopId?: number }
export interface PressOption { id: string; tone: Tone; text: string; effect: PressEffect; quote: string; followUp?: PressQuestion }
export interface PressQuestion { id: string; topic: string; reporter: string; outlet: string; text: string; options: PressOption[]; playerId?: number; clubId?: number; followKind?: string }

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
  pre?: { promiseWin?: boolean; tone?: string; quote?: string; promiseScore?: boolean; stopId?: number; backed?: [number, number][] }
  m: Map<string, unknown> // per-conference memo
  games: number // matches in charge
}
type Build = (c: Ctx) => Omit<PressQuestion, 'id' | 'reporter' | 'outlet' | 'topic'> | undefined
interface Topic {
  id: string; kind: 'pre' | 'post'; weight: (c: Ctx) => number; build: Build; always?: boolean
  /** this topic's own follow-up to a given answer */
  follow?: (c: Ctx, op: PressOption) => { text: string; options: PressOption[] } | undefined
}

/** "A" or "An" before a name as it is said: an FA Cup, an MLS game, an Emirates FA Cup, a Coupe de France. */
const aAn = (w: string) => (/^[AEIOU]/.test(w) || /^[FHLMNRSX][A-Z]/.test(w) ? 'An' : 'A')
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
  Praise: [''], Deflect: [''], Bold: [''], Joke: [''],
}
const CLOSE_STOP = new Set(['the', 'and', "that's", 'that', 'how', 'for', 'are', 'you'])
const CLAUSE = /^(I|We|He|It|They|That|This|There|Our|Every|No|Nobody|Some|The|His|Their|You|Games|Football|Whatever|If|When|Nothing|Everyone)\b/
/** Names an answer can start with: both clubs, the other manager, and both squads as the press calls them. */
function namesOf(c: Ctx): string[] {
  let n = c.m.get('names') as string[] | undefined
  if (!n) {
    const set = new Set<string>([c.club.short, c.club.name, c.opp.short, c.opp.name, ...(c.oppMgr ? [c.oppMgr, callName(c.oppMgr)] : [])])
    for (const p of Object.values(c.w.players)) if (p.clubId === c.club.id || p.clubId === c.opp.id) { set.add(cn(p)); set.add(p.name) }
    const top = leader(c)
    if (top) set.add(top.short)
    n = [...set].filter(Boolean)
    c.m.set('names', n)
  }
  return n
}
function vary(c: Ctx, tone: Tone, text: string) {
  let op = pk(c, TONE_OPEN[tone] || [''])
  // never "Credit where it is due: credit to him..."
  if (op && op.split(/\W/)[0].toLowerCase() === text.split(/\W/)[0].toLowerCase()) op = ''
  // "I think" and "The truth is" need a full clause after them: never "I think good performance."
  if (/^(I think|For me|The truth is)/.test(op) && !CLAUSE.test(text)) op = ''
  // nor in front of a one- or two-word reply ("I have to be honest: very.")
  if (op && text.split(/[.!?]/)[0].trim().split(/\s+/).length <= 2) op = ''
  const lower = text.toLowerCase()
  // nor "Credit where it is due: ... credit to them", "Honestly? ... to be honest"
  if (op && op.toLowerCase().match(/[a-z]{5,}/g)?.some((wd) => lower.includes(wd.slice(0, 5)))) op = ''
  let cl = pk(c, TONE_CLOSE[tone] || [''])
  // and no closer that repeats the answer ("We are working with him. We keep working.")
  if (cl && cl.toLowerCase().match(/[a-z']{3,}/g)?.filter((wd) => !CLOSE_STOP.has(wd)).some((wd) => lower.includes(wd.slice(0, 5)))) cl = ''
  if (/include myself/.test(cl) && !/\b(we|our|us|team|players|everyone)\b/i.test(text)) cl = ''
  if (!op && !cl) return text
  // after an opener the answer carries on mid-sentence: lower-case its first word, unless it is "I" or a name
  // ("Brentford are well organised", "Saka was the difference")
  const named = /^(I\b|I'|[A-Z]{2})/.test(text) || namesOf(c).some((n) => text.startsWith(n))
  const safe = op && !/[?!]\s$/.test(op) && !named ? text.charAt(0).toLowerCase() + text.slice(1) : text
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
        `${aAn(c.comp?.short || '')} ${c.comp?.short} semi-final${c.x.leg ? `, ${c.x.leg === 1 ? 'first' : 'second'} leg` : ''}. How big is this for the club?`,
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
          o(c, 'Measured', ['There is a long way to go. We only look at the next game.', c.w.date.slice(5, 7) >= '08' ? 'The table does not lie, but it does not give trophies in autumn either.' : 'The table does not lie, but nothing is decided until the last day.'], { team: 2 }),
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
      const ask = pk(c, [`${callName(q.by)} has just said: "${q.text}" What's your reaction?`, `${q.by} says "${q.text}" Do you agree?`, ...(t === 'red' || t === 'penalty' ? [`The other dressing room isn't happy. ${callName(q.by)}: "${q.text}" Your response?`] : t === 'dig' ? [`The other dressing room is enjoying this one. ${callName(q.by)}: "${q.text}" Your response?`] : [])])
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
    id: 'wordsTested', kind: 'post', weight: (c) => { const l = preLine(c); return l && (c.lost || c.drew) && /\b(win|beat|confident|ready|best)\b/i.test(l.text) ? 9 : 0 }, build: (c) => {
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
        ? pk(c, [`${saidBefore(c)} And you delivered. A good feeling?`, `You backed your team publicly and they won. Were you ever worried?`])
        : pk(c, [`${saidBefore(c)} What happened?`, `You guaranteed a win and didn't get it. Do you regret those words?`, `Were your comments before the game a mistake?`]),
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
      if (c.pens) text = c.won ? pk(c, [`Through on penalties after a ${s} draw. How did you feel when the last kick went in?`, `${s} after ${c.et ? 'extra time' : 'ninety minutes'}, then penalties. Talk us through it.`]) : pk(c, [`Out on penalties after a ${s} draw. How do you pick the players up?`, `${s}, and then the lottery went against you. Is that how you see it?`])
      else if (c.won && c.gf - c.ga >= 3) text = pk(c, [`A statement ${s} win. Your thoughts?`, `${s}. Is that the best your team has played?`, `That was a demolition. How do you keep the players grounded?`])
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

// ---------------------------------------------------------------- more pre-match topics
// Everything here is read from the save: board confidence, suspensions and bookings, the fixture's referee, contracts,
// form ratings, international duty, the opposition scouting report, venue records, goals for and against, our own
// weaknesses, the team sheet, the table, rivals, sales and signings, awards and the national-team ranking.
const PRE_MORE: Topic[] = [
  {
    id: 'jobPressure', kind: 'pre', weight: (c) => (!c.club.national && c.games >= 6 && (c.w.board.overall < 45 || c.w.board.warnings > 0) ? 12 + (c.w.board.overall < 35 ? 8 : 0) : 0), build: (c) => {
      const s = c.x.usStreak
      const bad = s && (s.kind === 'lost' || s.kind === 'winless') ? `${streakText(s, 'You')}. ` : ''
      return {
        text: pk(c, [`${bad}Reports say the board's patience is wearing thin. Is this a must-win for you personally?`, `${bad}Have you spoken to the board this week? Do you still have their backing?`, `There is talk that this game could decide your future. How do you deal with that?`]),
        options: [
          o(c, 'Defiant', ['I am not thinking about my job. I am thinking about winning this game.', 'I have never been afraid of pressure. It comes with the job.'], { team: 2, brand: 1, rep: 0.1 }),
          o(c, 'Measured', ['I speak with the board every week. We all know results have to improve.', 'My relationship with the board is good. Football is about results, and I accept that.'], { team: 1, rep: 0.05 }),
          o(c, 'Humble', ['I understand the frustration. Nobody is more disappointed than me.'], { team: 0, brand: 1 }),
          o(c, 'Critical', ['I am not the only one in this building who should feel the pressure.'], { team: -4, brand: -2, rep: -0.2 }),
        ],
      }
    },
    follow: (c, op) => op.tone === 'Defiant' ? {
      text: pk(c, ['And if you lose tomorrow?', 'So you expect to be here next month?']),
      options: [
        o(c, 'Defiant', ['We will not lose. And yes, I will be here.'], { team: 2, brand: 1, promise: 'win' }),
        o(c, 'Measured', ['Then we go again. That is the only way I know.'], { team: 1 }),
        o(c, 'Joke', ['Then you will have a new face to ask questions to. But not yet.'], { brand: 1 }),
      ],
    } : undefined,
  },
  {
    id: 'suspended', kind: 'pre', weight: (c) => (suspendedKey(c) ? 10 : 0), build: (c) => {
      const p = suspendedKey(c)!
      const why = p.suspensions.find((s) => isSuspendedFor({ ...p, suspensions: [s] }, c.comp))?.reason || ''
      const red = /sent off|red/i.test(why)
      return {
        playerId: p.id,
        text: red
          ? pk(c, [`${p.name} serves a ban after his red card. How big a loss is he?`, `Has ${cn(p)} apologised to his team-mates for the sending-off?`, `Without ${cn(p)} after that red card, who steps in?`])
          : pk(c, [`${p.name} is banned after picking up ${why || 'too many bookings'}. Who comes in?`, `How do you cope without ${cn(p)}, who is suspended for this one?`]),
        options: [
          o(c, 'Measured', ['We have options. Whoever comes in knows exactly what to do.', 'It is a chance for someone else. That is what a squad is for.'], { team: 2 }),
          o(c, 'Praise', ['He is a big part of this team and we will miss him, but he will come back stronger.'], { player: 3, playerId: p.id, team: 1 }),
          o(c, 'Critical', red ? ['He let the team down. He knows it and he has said sorry to everyone.'] : ['Some of those bookings were avoidable. He has to be smarter.'], { player: -4, playerId: p.id, team: 1, brand: 1 }),
        ],
      }
    },
  },
  {
    id: 'banRisk', kind: 'pre', weight: (c) => (banRisk(c) ? 6 : 0), build: (c) => {
      const { p, next } = banRisk(c)!
      const big = nextBig(c)
      return {
        playerId: p.id,
        text: pk(c, [`${p.name} is one booking away from a ban. Will you speak to him?`, `${cn(p)} is on ${next - 1} yellow cards. Do you worry about him missing ${big ? big : 'the next game'}?`, `Will ${cn(p)} have to hold back with a suspension hanging over him?`]),
        options: [
          o(c, 'Measured', [`He knows. But I don't want him playing scared. That is when you get booked.`], { player: 2, playerId: p.id, team: 1 }),
          o(c, 'Deflect', [`I won't change how he plays because of a yellow card.`], { player: 1, playerId: p.id }),
          o(c, 'Critical', [`He has to be cleverer. Some of those cards were for dissent, and that cannot happen.`], { player: -3, playerId: p.id }),
          o(c, 'Joke', [`I have told him: tackle the ball, not the referee.`], { brand: 1, team: 1 }),
        ],
      }
    },
  },
  {
    id: 'strictRef', kind: 'pre', weight: (c) => { const s = refereeStrictness(c.f); return s >= 1.16 ? 6 + (c.f.derby ? 4 : 0) + (seasonCards(c).y / Math.max(1, ourGames(c).length) >= 2.2 ? 4 : 0) : s <= 0.9 && c.f.derby ? 5 : 0 }, build: (c) => {
      const strict = refereeStrictness(c.f) >= 1.16
      return {
        text: strict
          ? pk(c, [`The referee for this one shows more cards than most. Will you speak to your players about discipline?`, `You have a referee who isn't afraid to reach for his pocket. Does that change how you approach the game?`, `With a strict referee${c.f.derby ? ' in a derby' : ''}, how do you keep your players on the right side of the line?`])
          : pk(c, [`The referee tends to let the game flow. Does that suit a derby like this?`, `A referee who lets a lot go. Could this turn into a battle?`]),
        options: strict ? [
          o(c, 'Measured', [`We know. We have spoken about staying calm and not giving him decisions to make.`], { team: 1, rep: 0.05 }),
          o(c, 'Critical', [`I just hope he lets the players play. People come to watch football, not cards.`], { brand: 1, rep: -0.1, team: 1 }),
          o(c, 'Deflect', [`I never talk about referees before a game.`], { rep: 0.05 }),
          o(c, 'Joke', [`I have told the players to be very polite to him.`], { team: 1, brand: 1 }),
        ] : [
          o(c, 'Confident', [`If it is a battle, we are ready. We will not be pushed around.`], { team: 2, brand: 1 }),
          o(c, 'Measured', [`I like referees who let the game breathe. We have to stay disciplined anyway.`], { team: 1 }),
          o(c, 'Deflect', [`The referee is not my concern. My team is.`], {}),
        ],
      }
    },
  },
  {
    id: 'discipline', kind: 'pre', weight: (c) => { const k = seasonCards(c), n = ourGames(c).length; return n >= 8 && (k.r >= 3 || k.y / n >= 2.4) ? 7 : 0 }, build: (c) => {
      const k = seasonCards(c)
      return {
        text: pk(c, [`${k.y} yellow cards and ${k.r} red${k.r === 1 ? '' : 's'} so far this season. Does your team have a discipline problem?`, `${(k.y / Math.max(1, ourGames(c).length)).toFixed(1)} bookings a game this season. Is it costing you?`, `${k.r ? `${k.r} red card${k.r === 1 ? '' : 's'} already this season. ` : ''}Do your players need to calm down?`]),
        options: [
          o(c, 'Defiant', ['We play with intensity. I would rather that than a soft team.', 'We compete for every ball. Sometimes that brings cards.'], { team: 2, brand: 1, rep: -0.05 }),
          o(c, 'Critical', ['It is too many. It costs us points, and the players have heard that from me.'], { team: -1, brand: 1, rep: 0.05 }),
          o(c, 'Measured', ['We look at every card. Some are part of the game, some are not, and those we have to cut out.'], { team: 1, rep: 0.05 }),
        ],
      }
    },
  },
  {
    id: 'expiring', kind: 'pre', weight: (c) => (expiringStar(c) ? 9 : 0), build: (c) => {
      const p = expiringStar(c)!
      return {
        playerId: p.id,
        text: pk(c, [`${p.name}'s contract runs out in the summer. Will he sign a new one?`, `Are you worried ${cn(p)} could leave for nothing at the end of the season?`, `Is there any progress on a new deal for ${cn(p)}?`]),
        options: [
          o(c, 'Confident', ['Talks are going well. I am confident he will stay.'], { player: 2, playerId: p.id, brand: 1 }),
          o(c, 'Deflect', ['That is between the club, the player and his agent.'], { rep: 0.05 }),
          o(c, 'Praise', ['We want him here for many years. He knows how much we value him.'], { player: 5, playerId: p.id }),
          o(c, 'Critical', ['No player is bigger than the club. The offer is there if he wants it.'], { player: -5, playerId: p.id, brand: 1 }),
        ],
      }
    },
    follow: (c, op) => op.tone === 'Confident' ? {
      text: pk(c, ['So can we expect an announcement soon?', 'Is there a deadline for him to decide?']),
      options: [
        o(c, 'Joke', [`You will be the second to know.`], { brand: 1 }),
        o(c, 'Measured', [`When it is done, it is done. There is no rush from our side.`], {}),
        o(c, 'Confident', [`I would be surprised if it takes long.`], { brand: 1, player: 1, playerId: op.effect.playerId }),
      ],
    } : undefined,
  },
  {
    id: 'outOfForm', kind: 'pre', weight: (c) => (outOfForm(c) ? 8 : 0), build: (c) => {
      const p = outOfForm(c)!
      const avg = recentForm(p).toFixed(1)
      return {
        playerId: p.id,
        text: pk(c, [`${p.name} hasn't been at his best lately. Is his place under threat?`, `Averaging ${avg} in his last three games, ${cn(p)} is struggling. What does he need?`, `Do you need to take ${cn(p)} out of the firing line for a game or two?`]),
        options: [
          o(c, 'Praise', ['Class is permanent. He will come good, and he has my full support.'], { player: 6, playerId: p.id }),
          o(c, 'Critical', ['He knows he has to do more. Nobody here plays on reputation.'], { player: -6, playerId: p.id, team: 1 }),
          o(c, 'Measured', ['Every player goes through spells like this. We are working with him.'], { player: 2, playerId: p.id }),
          o(c, 'Deflect', ['You will see if he plays at kick-off.'], {}),
        ],
      }
    },
  },
  {
    id: 'fatigue', kind: 'pre', weight: (c) => (tiredStar(c) ? 6 : 0), build: (c) => {
      const p = tiredStar(c)!
      return {
        playerId: p.id,
        text: pk(c, [`${p.name} looked tired last time out. Will you rest him?`, `${cn(p)} has played a lot of minutes. Is there a risk of burning him out?`, `Is ${cn(p)} fit enough to start?`]),
        options: [
          o(c, 'Measured', ['We will decide after training. The fitness data will tell us.'], { player: 1, playerId: p.id }),
          o(c, 'Confident', ['He is fine. Big players want to play every game.'], { player: 2, playerId: p.id, team: 1 }),
          o(c, 'Deflect', ['You will see the team at kick-off like everybody else.'], {}),
        ],
      }
    },
  },
  {
    id: 'unhappy', kind: 'pre', weight: (c) => (!c.club.national && unhappyPlayer(c) ? 8 : 0), build: (c) => {
      const p = unhappyPlayer(c)!
      return {
        playerId: p.id,
        text: pk(c, [`There are reports ${p.name} is unhappy. Is there a problem?`, `Is ${cn(p)} frustrated with his situation at the club?`, `People close to ${cn(p)} say he wants more. Have you spoken to him?`]),
        options: [
          o(c, 'Deflect', ['I will not talk about private conversations with my players.'], { rep: 0.05 }),
          o(c, 'Measured', ['We have spoken. He wants to play more, and that is normal for a good player.'], { player: 3, playerId: p.id }),
          o(c, 'Praise', ['He is an important player for us and he will get his chances.'], { player: 5, playerId: p.id, team: -1 }),
          o(c, 'Critical', ['If anyone is not happy, my door is open. So is the exit.'], { player: -8, playerId: p.id, team: -1, brand: 1 }),
        ],
      }
    },
  },
  {
    id: 'intlReturn', kind: 'pre', weight: (c) => (intlReturns(c).length >= 2 ? 8 : intlReturns(c).length === 1 ? 4 : 0), build: (c) => {
      const back = intlReturns(c)
      const scorer = back.find((b) => b.goals > 0)
      const text = scorer && c.rng.next() < 0.6
        ? pk(c, [`${scorer.p.name} scored for ${scorer.nt} this week. Does that give him a lift for this one?`, `${cn(scorer.p)} comes back from ${scorer.nt} duty with ${scorer.goals === 1 ? 'a goal' : `${scorer.goals} goals`}. Will he start?`])
        : pk(c, [`${back.length === 1 ? `${back[0].p.name} is` : `${back.length} of your players are`} just back from international duty. Will they be fresh enough?`, `How do you manage players coming back from international games${back.length > 2 ? ` all over the world` : ''}?`])
      return {
        playerId: scorer?.p.id,
        text,
        options: [
          o(c, 'Measured', ['We monitored all of them. The staff have done a great job this week.', 'We know exactly how many minutes each of them played. We will manage it.'], { team: 1 }),
          o(c, 'Critical', ['It is always the same after an international break. They come back tired and we pay for it.'], { brand: 1, rep: -0.05 }),
          scorer
            ? o(c, 'Praise', [`${cn(scorer.p)} comes back full of confidence. That is good for us.`], { player: 4, playerId: scorer.p.id, team: 1 })
            : o(c, 'Confident', ['They are professionals. They will be ready.'], { team: 2 }),
        ],
      }
    },
  },
  {
    id: 'dangerMan', kind: 'pre', weight: (c) => (dangerMan(c) ? 9 : 0), build: (c) => {
      const d = dangerMan(c)!
      const p = c.w.players[d.id]
      return {
        text: pk(c, [`${p.name} has ${d.goals} goals for ${c.opp.short} this season. How do you stop him?`, `Is ${cn(p)} the player you fear most in this ${c.opp.short} side?`, `Have you prepared anything special for ${cn(p)}?`, `${d.goals} goals and ${d.assists} assists: how much of ${c.opp.short}'s threat goes through ${cn(p)}?`]),
        options: [
          o(c, 'Confident', ['We have a plan for him. I will not tell you what it is.'], { team: 2, brand: 1 }),
          o(c, 'Praise', ['He is a top player. You do not stop him with one man, you stop him as a team.'], { team: 1, rep: 0.05 }),
          o(c, 'Bold', ['He will not score tomorrow.', 'He will not get a kick.'], { team: 2, brand: 2, opponent: 1, stopId: d.id }),
          o(c, 'Deflect', ['I am more interested in my players than theirs.'], { team: 1 }),
        ],
      }
    },
    follow: (c, op) => op.tone === 'Bold' ? {
      text: pk(c, ['Is that a guarantee?', 'You realise he will read that?']),
      options: [
        o(c, 'Bold', ['I hope he reads it. We are ready for him.'], { team: 2, brand: 2, opponent: 2, stopId: op.effect.stopId }),
        o(c, 'Joke', ['Maybe I should have kept that one to myself.'], { brand: 1 }),
        o(c, 'Measured', ['It is belief in my defenders. That is all.'], { team: 2 }),
      ],
    } : undefined,
  },
  {
    id: 'oppMissing', kind: 'pre', weight: (c) => (oppMissing(c).length >= 2 ? 7 : oppMissing(c).length === 1 ? 4 : 0), build: (c) => {
      const m = oppMissing(c)
      const names = m.map((p) => cn(p))
      return {
        text: m.length === 1
          ? pk(c, [`${c.opp.short} are without ${m[0].name}. Does that make them easier to play?`, `How much weaker are ${c.opp.short} without ${names[0]}?`])
          : pk(c, [`${c.opp.short} are missing ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}. Is this a good time to play them?`, `With ${m.length} key players out, are ${c.opp.short} there for the taking?`]),
        options: [
          o(c, 'Measured', ['They have a strong squad. Whoever plays will be good.', 'I never count on the other team\'s absences.'], { team: 2 }),
          o(c, 'Confident', ['We want to take advantage, of course. We are ready.'], { team: 1, brand: 1 }),
          o(c, 'Praise', [`${c.opp.short} will still be dangerous. Their coach will find a solution.`], { rep: 0.05 }),
        ],
      }
    },
  },
  {
    id: 'oppStyle', kind: 'pre', weight: (c) => (oppStyle(c) ? 7 : 0), build: (c) => {
      const s = oppStyle(c)!
      const O = c.opp.short
      const sets: Record<string, { q: string[]; a: PressOption[] }> = {
        possession: {
          q: [`${O} average ${s.v}% possession. Are you happy to let them have the ball?`, `${O} will want the ball. What do you do without it?`],
          a: [
            o(c, 'Confident', ['If they want the ball, they can have it. We know exactly what to do without it.'], { team: 2, brand: 1 }),
            o(c, 'Measured', ['We will try to take it off them. Nobody enjoys chasing for ninety minutes.'], { team: 1 }),
            o(c, 'Praise', [`They are the best in the league at keeping it. We have to be patient and brave.`], { rep: 0.05 }),
          ],
        },
        setPieces: {
          q: [`${O} have scored ${s.v} of their ${s.t} goals from set pieces. How much work have you done on that?`, `Are ${O}'s set pieces the biggest danger tomorrow?`],
          a: [
            o(c, 'Measured', ['A lot. Details decide games like this, and we have gone through every one of them.'], { team: 2 }),
            o(c, 'Confident', ['We are strong in the air too. They will have to deal with us as well.'], { team: 1, brand: 1 }),
            o(c, 'Joke', ['My set-piece coach has not slept this week.'], { team: 1, brand: 1 }),
          ],
        },
        counter: {
          q: [`${O} are dangerous on the break: ${s.v} of their ${s.t} goals came from counters. Do you have to be careful committing players forward?`, `How do you attack ${O} without leaving yourselves open?`],
          a: [
            o(c, 'Measured', ['Balance is everything. We will attack with numbers and protect ourselves too.'], { team: 2 }),
            o(c, 'Bold', ['We will not change how we play. They have to stop us first.'], { team: 2, brand: 2 }),
            o(c, 'Humble', ['They punish every mistake. We have to be very careful.'], { team: 0, rep: 0.05 }),
          ],
        },
        highLine: {
          q: [`${O} play a very high line. Is there space in behind for your forwards?`, `Will you look to get runners in behind ${O}'s defence?`],
          a: [
            o(c, 'Confident', ['We have the pace to hurt them. They know it.'], { team: 2, brand: 1 }),
            o(c, 'Deflect', ['You will see tomorrow.'], {}),
            o(c, 'Measured', ['A high line brings risks for both teams. We have to time our runs well.'], { team: 1 }),
          ],
        },
        press: {
          q: [`${O} press as hard as anyone. Can your team play through it?`, `Will you go long to beat ${O}'s press?`],
          a: [
            o(c, 'Confident', ['We are comfortable on the ball. If they press, space opens somewhere else.'], { team: 2 }),
            o(c, 'Measured', ['We have worked on it. Sometimes you play through, sometimes over.'], { team: 1 }),
            o(c, 'Praise', [`Their intensity is impressive. It is the hardest thing to prepare for.`], { rep: 0.05 }),
          ],
        },
        late: {
          q: [`${s.v} of ${O}'s ${s.t} goals came in the last quarter of an hour. Do you have to be ready for a late push?`, `${O} never give up. Is concentration at the end the key?`],
          a: [
            o(c, 'Measured', ['Games last more than ninety minutes. We will be ready for all of them.'], { team: 2 }),
            o(c, 'Confident', ['We are strong at the end too. Our bench will make a difference.'], { team: 1, brand: 1 }),
          ],
        },
        leaky: {
          q: [`${O} concede ${s.x} expected goals a game. Is this a chance to get your forwards firing?`, `${O} have looked vulnerable at the back. Will you go for it from the start?`],
          a: [
            o(c, 'Confident', ['We will create chances. The question is whether we take them.'], { team: 2 }),
            o(c, 'Measured', ['Statistics are one thing. On the day they will defend with their lives.'], { team: 1 }),
            o(c, 'Bold', ['If we play our game, we will score goals.'], { team: 2, brand: 1 }),
          ],
        },
      }
      const set = sets[s.k]
      return { text: pk(c, set.q), options: set.a }
    },
  },
  {
    id: 'venue', kind: 'pre', weight: (c) => (venueStory(c) ? 7 : 0), build: (c) => {
      const v = venueStory(c)!
      const S = c.club.stadium
      const text = v.k === 'fortress' ? pk(c, [`You've won ${v.w} of ${v.n} league games at ${S} this season. What makes it so hard for visitors?`, `${S} has become a fortress. Where does that come from?`])
        : v.k === 'homeBlues' ? pk(c, [`Only ${v.w} home win${v.w === 1 ? '' : 's'} from ${v.n} this season. Is ${S} becoming a problem?`])
          : v.k === 'roadWarriors' ? pk(c, [`${v.w} wins from ${v.n} on the road. Why is this team so good away from home?`, `You travel better than almost anyone. What's the secret?`])
            : pk(c, [`Still no away win in the league this season. How do you fix that?`, `${v.n} league games away and no win yet. Is it mental?`])
      const good = v.k === 'fortress' || v.k === 'roadWarriors'
      return {
        text,
        options: good ? [
          o(c, 'Praise', [v.k === 'fortress' ? 'The supporters. They make it a very difficult place to come.' : 'The character of this group. They enjoy going into hostile places.'], { team: 3, brand: v.k === 'fortress' ? 2 : 0 }),
          o(c, 'Confident', ['It is the way we play. It works anywhere.'], { team: 2, brand: 1 }),
          o(c, 'Humble', ['Records are there to be broken. We cannot relax.'], { team: 1 }),
        ] : [
          o(c, 'Measured', ['It is something we have talked about. Tomorrow is a chance to change it.'], { team: 1 }),
          o(c, 'Critical', ['There is no excuse. It is on us to change it.'], { team: -1, brand: 1 }),
          o(c, 'Defiant', ['Records mean nothing. Tomorrow is a new game.'], { team: 2 }),
          ...(v.k === 'homeBlues' ? [o(c, 'Praise', ['The supporters have been patient. We owe them a performance.'], { team: 1, brand: 2 })] : []),
        ],
      }
    },
  },
  {
    id: 'goalsStory', kind: 'pre', weight: (c) => (goalsStory(c) ? 8 : 0), build: (c) => {
      const g = goalsStory(c)!
      if (g.k === 'drought') return {
        text: pk(c, [`Just ${g.gf} goal${g.gf === 1 ? '' : 's'} in your last ${g.n} games. Where are the goals going to come from?`, `Your forwards have gone quiet: ${g.gf} in ${g.n}. Is it a confidence problem?`, `Do you need a new striker?`]),
        options: [
          o(c, 'Measured', ['We are creating chances. Keep doing that and the goals will come.'], { team: 2 }),
          o(c, 'Critical', ['Our forwards know they have to be more clinical. That is their job.'], { team: -2, brand: 1 }),
          o(c, 'Confident', ["Don't worry about goals. We will score tomorrow."], { team: 2, brand: 1, promise: 'score' }),
        ],
      }
      if (g.k === 'leaky') return {
        text: pk(c, [`You've conceded ${g.ga} in your last ${g.n}. Is the defence your biggest worry?`, `${g.ga} goals against in ${g.n} games. What is going wrong at the back?`, `When did you last keep a clean sheet?`]),
        options: [
          o(c, 'Critical', ['It is not only the defenders. We defend as a team, and right now we do not.'], { team: -1, brand: 1 }),
          o(c, 'Measured', ['We have worked on it all week. It is about concentration and distances.'], { team: 1 }),
          o(c, 'Defiant', ['We will keep a clean sheet tomorrow. You will see.'], { team: 2, brand: 1 }),
        ],
      }
      return {
        text: pk(c, [`${g.gf} goals in ${g.n} games. Is this the most attacking team you have managed?`, `You're scoring for fun at the moment. Is there more to come?`]),
        options: [
          o(c, 'Praise', ['The players are enjoying their football. You can see it.'], { team: 3 }),
          o(c, 'Confident', ['We have only scratched the surface.'], { team: 2, brand: 2 }),
          o(c, 'Humble', ['Goals are great, but I want clean sheets too.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'ourWeakness', kind: 'pre', weight: (c) => (ourWeakness(c) ? 6 : 0), build: (c) => {
      const k = ourWeakness(c)!
      if (k.k === 'setPiece') return {
        text: pk(c, [`You've conceded ${k.v} of your ${k.t} goals from set pieces. Is that a training-ground problem?`, `Opponents seem to target you at corners and free kicks. Why?`]),
        options: [
          o(c, 'Critical', ['It is unacceptable. We have spent the week on it.'], { team: -1, brand: 1 }),
          o(c, 'Measured', ['We are working on it. Details: who attacks the ball, who blocks, who reacts.'], { team: 1 }),
          o(c, 'Deflect', ['Every team concedes from set pieces.'], { brand: -1 }),
        ],
      }
      return {
        text: pk(c, [`${k.v} of the ${k.t} goals you've conceded came after the 75th minute. Is it fitness or concentration?`, `Your team keeps conceding late. Why?`]),
        options: [
          o(c, 'Measured', ['It is a mix of both. We have looked closely at the last twenty minutes of every game.'], { team: 1 }),
          o(c, 'Critical', ['It is concentration. Fitness is not the issue; mentality is.'], { team: -2, brand: 1 }),
          o(c, 'Defiant', ['We score late too. Games are long.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'shape', kind: 'pre', weight: (c) => (shapeChange(c) ? 7 : 0), build: (c) => {
      const s = shapeChange(c)!
      return {
        text: pk(c, [`There are suggestions you've been working on a ${s.to} in training. Is that the plan against ${c.opp.short}?`, `You went with a ${s.from} last time. Will we see something different tomorrow?`, `Is the ${s.to} we saw in training a sign of things to come?`]),
        options: [
          o(c, 'Deflect', ['You will see at kick-off.', 'I never give the other coach a head start.'], {}),
          o(c, 'Confident', [`We have trained it all week. The players like it.`], { team: 1, brand: 1 }),
          o(c, 'Measured', ['It gives us options. We will decide what suits this game best.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'ourStyle', kind: 'pre', weight: (c) => (styleStory(c) ? 6 : 0), build: (c) => {
      const s = styleStory(c)!
      if (s.k === 'press') return {
        text: pk(c, [`Your team presses as hard as anyone. Can they keep it up with this schedule?`, `Is your pressing game sustainable over a whole season?`]),
        options: [
          o(c, 'Defiant', ['That is our identity. We do not change it.'], { team: 2, brand: 1 }),
          o(c, 'Measured', ['We manage the intensity. We press smarter, not only harder.'], { team: 1 }),
          o(c, 'Humble', ['It is a fair question. We will have to choose our moments.'], { team: 0, rep: 0.05 }),
        ],
      }
      if (s.k === 'lowPoss') return {
        text: pk(c, [`Your team averages ${s.v}% possession. Is that by design?`, `Some say your football is too cautious. Do you agree?`, `Do you want more of the ball than you have been getting?`]),
        options: [
          o(c, 'Confident', ['Possession does not win games. We know exactly what we are doing.'], { team: 2, brand: 1 }),
          o(c, 'Measured', ['It depends on the opponent. Against some teams you give them the ball.'], { team: 1 }),
          o(c, 'Humble', ['We want more of the ball, and we are working on it.'], { team: 1 }),
        ],
      }
      return {
        text: pk(c, [`${s.v}% possession on average. Is dominating the ball non-negotiable for you?`, `Teams sit deep against you now. How do you keep finding a way through?`]),
        options: [
          o(c, 'Confident', ['With the ball, we decide what happens. That is how I see football.'], { team: 2, brand: 2 }),
          o(c, 'Measured', ['Having the ball is only useful if you hurt the opponent with it.'], { team: 1 }),
          o(c, 'Critical', ['Sometimes we are too slow with it. We need more risk in the final third.'], { team: -1, brand: 1 }),
        ],
      }
    },
  },
  {
    id: 'topClash', kind: 'pre', weight: (c) => (c.x.kind === 'league' && (c.x.played || 0) >= 10 && (c.x.usPos || 99) <= 4 && (c.x.themPos || 99) <= 4 && Math.abs((c.x.usPts || 0) - (c.x.themPts || 0)) <= 6 ? 14 : 0), build: (c) => {
      const gap = (c.x.usPts || 0) - (c.x.themPts || 0)
      const rel = gap > 0 ? `${gap} point${gap === 1 ? '' : 's'} behind you` : gap < 0 ? `${-gap} point${gap === -1 ? '' : 's'} ahead of you` : 'level on points with you'
      return {
        text: pk(c, [`${c.opp.short} are ${rel}. Is this a title six-pointer?`, `${ord(c.x.usPos!)} against ${ord(c.x.themPos!)}. Could this game decide the title?`, `Is this the biggest league game of your time here?`]),
        options: [
          o(c, 'Bold', ['Win this and everyone will see who the best team in this league is.'], { team: 3, brand: 3, rep: 0.1 }),
          o(c, 'Measured', ['It is big, but it will not decide anything on its own. There are too many games left.'], { team: 2 }),
          o(c, 'Humble', [`${c.opp.short} have been very consistent. We want to close the gap on the best.`], { team: 0, rep: 0.05 }),
          o(c, 'Defiant', ['It is three points. We treat it like every other game.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'quarter', kind: 'pre', weight: (c) => (/quarter/i.test(c.f.roundName) && c.x.kind !== 'league' ? 14 : 0), build: (c) => ({
      text: pk(c, [`${aAn(c.comp?.short || '')} ${c.comp?.short} quarter-final. Is the trophy now a realistic target?`, `Three wins from the ${c.comp?.short}. Are you starting to dream?`, `Does this ${c.comp?.short} quarter-final mean more to you than the league at the moment?`]),
      options: [
        o(c, 'Bold', ['We want to win it. Why not us?'], { team: 3, brand: 2, rep: 0.1 }),
        o(c, 'Measured', ['There is a lot of football left. We think only about this one.'], { team: 2 }),
        o(c, 'Humble', ['There are some very strong teams left. We are just happy to be here.'], { team: 0, brand: -1 }),
      ],
    }),
  },
  {
    id: 'boardTarget', kind: 'pre', weight: (c) => (boardTarget(c) ? 7 : 0), build: (c) => {
      const t = boardTarget(c)!
      const ahead = t.pos <= t.target
      return {
        text: ahead
          ? pk(c, [`The board wanted a top-${t.target} finish and you're ${ord(t.pos)}. Is it time to raise the bar?`, `You're ahead of the board's target. What is the new ambition?`])
          : pk(c, [`The board asked for a top-${t.target} finish. Sitting ${ord(t.pos)}, can you still get there?`, `You're ${t.pos - t.target} place${t.pos - t.target === 1 ? '' : 's'} below the board's target. How worried are you?`]),
        options: ahead ? [
          o(c, 'Confident', ['We want more. Targets are a minimum, not a ceiling.'], { team: 2, brand: 2, rep: 0.1 }),
          o(c, 'Measured', ['We stay humble and keep working. Nothing has been achieved yet.'], { team: 1 }),
        ] : [
          o(c, 'Defiant', ['We will get there. I have no doubts.'], { team: 2, brand: 1 }),
          o(c, 'Measured', ['There are enough games left. We need a run, starting now.'], { team: 1 }),
          o(c, 'Humble', ['We are behind where we want to be. I take responsibility for that.'], { team: 0, rep: 0.05 }),
        ],
      }
    },
  },
  {
    id: 'managerMonth', kind: 'pre', weight: (c) => (managerOfMonth(c) ? 9 : 0), build: (c) => ({
      text: pk(c, [`Congratulations on ${managerOfMonth(c)}. Are you worried about the curse?`, `You've been named ${managerOfMonth(c)}. Who deserves the credit?`]),
      options: [
        o(c, 'Joke', ['I have hidden the trophy so it cannot see us play.'], { team: 2, brand: 2 }),
        o(c, 'Praise', ['It is an award for the players and my staff. I just collect it.'], { team: 3 }),
        o(c, 'Confident', ['I would like a few more of them this season.'], { team: 1, brand: 2, rep: 0.05 }),
      ],
    }),
  },
  {
    id: 'priceTag', kind: 'pre', weight: (c) => (!c.club.national && priceTag(c) ? 8 : 0), build: (c) => {
      const t = priceTag(c)!
      return {
        playerId: t.p.id,
        text: pk(c, [`${t.p.name} cost ${fmtMoney(t.fee, { short: true })}. Is he living up to the price tag?`, `Has the pressure of the fee got to ${cn(t.p)}?`, `Are you disappointed with what ${cn(t.p)} has given you so far?`]),
        options: [
          o(c, 'Praise', ['Give him time. The fee is not his problem, and he will prove his worth.'], { player: 5, playerId: t.p.id }),
          o(c, 'Measured', ['He is adapting to a new club and a new style. The best is still to come.'], { player: 2, playerId: t.p.id }),
          o(c, 'Critical', ['He knows he can give much more. So do I.'], { player: -6, playerId: t.p.id, brand: 1 }),
        ],
      }
    },
  },
  {
    id: 'soldStar', kind: 'pre', weight: (c) => (!c.club.national && soldStar(c) ? 9 : 0), build: (c) => {
      const t = soldStar(c)!
      return {
        text: pk(c, [`You sold ${t.name} to ${t.to} for ${fmtMoney(t.fee, { short: true })}. Will you miss him?`, `How do you replace ${t.name}?`, `Supporters are still upset about ${t.name} leaving. What do you say to them?`]),
        options: [
          o(c, 'Measured', ['It was good business for everyone. We have players ready to step up.'], { team: 1, brand: 1 }),
          o(c, 'Praise', ['He gave this club a lot. I wish him all the best, except against us.'], { team: 1, rep: 0.05 }),
          o(c, 'Confident', ['His replacement is already in this squad. You will see.'], { team: 2, brand: 1 }),
          o(c, 'Critical', ['He wanted to go. I only want players who want to be here.'], { team: 1, brand: 2, rep: -0.05 }),
        ],
      }
    },
  },
  {
    id: 'oppMgrPressure', kind: 'pre', weight: (c) => (c.oppMgr && !c.opp.national && c.x.themStreak && (c.x.themStreak.kind === 'lost' || c.x.themStreak.kind === 'winless') ? 6 : 0), build: (c) => ({
      text: pk(c, [`${c.oppMgr} is under pressure. ${streakText(c.x.themStreak!, c.opp.short)}. Do you feel for him?`, `Could this game decide ${c.oppMgr}'s future?`]),
      options: [
        o(c, 'Praise', ['Of course. Every coach knows that feeling. I respect him a lot.'], { rep: 0.1 }),
        o(c, 'Measured', ['It is part of the job. I hope he is still under pressure after tomorrow.'], { team: 1, brand: 1 }),
        o(c, 'Deflect', ['I have enough to worry about with my own team.'], { team: 1 }),
      ],
    }),
  },
  {
    id: 'lastGame', kind: 'pre', weight: (c) => (lastGame(c) ? 9 : 0), build: (c) => {
      const g = lastGame(c)!
      const O = c.w.clubs[g.oppId]?.short || 'them'
      const s = `${g.gf}-${g.ga}`
      if (g.ga - g.gf >= 3) return {
        text: pk(c, [`How have the players responded after the ${s} defeat to ${O}?`, `Have you been able to get ${s} against ${O} out of your system?`, `What did you say to the players after ${O}?`]),
        options: [
          o(c, 'Critical', ['I told them the truth. They know it was not acceptable.'], { team: -1, brand: 1 }),
          o(c, 'Measured', ['We analysed it, we learned, and we moved on. That is all you can do.'], { team: 2 }),
          o(c, 'Defiant', ['One bad day does not define this team. You will see a reaction.'], { team: 3, brand: 1 }),
        ],
      }
      if (g.gf < g.ga) return {
        text: pk(c, [`Has the defeat to ${O} been put to bed?`, `What went wrong against ${O}, and has it been fixed?`]),
        options: [
          o(c, 'Measured', ['We looked at it on Monday and then we moved on. This game is what matters.'], { team: 2 }),
          o(c, 'Defiant', ['The best way to answer a defeat is to win the next game.'], { team: 2, brand: 1 }),
          o(c, 'Humble', [`${O} were better. We have to be better tomorrow.`], { team: 1 }),
        ],
      }
      if (g.gf - g.ga >= 3) return {
        text: pk(c, [`After the ${s} win over ${O}, how do you keep feet on the ground?`, `Was ${s} against ${O} the best performance of your time here?`]),
        options: [
          o(c, 'Humble', ['That game gives us nothing tomorrow. We start again from zero.'], { team: 2 }),
          o(c, 'Confident', ['We want to play like that every week. That is the standard now.'], { team: 2, brand: 2 }),
          o(c, 'Praise', ['I loved it, but I have told them I want even more.'], { team: 3 }),
        ],
      }
      if (g.gf > g.ga) return {
        text: pk(c, [`Can you build on the ${s} win over ${O}?`, `How much confidence did beating ${O} give the players?`, `After ${O}, is this the start of a run?`]),
        options: [
          o(c, 'Confident', ['Winning is a habit. We want to make it one.'], { team: 2, brand: 1 }),
          o(c, 'Measured', ['It was a good result, but it gives us nothing tomorrow.'], { team: 2 }),
          o(c, 'Critical', ['We won, but we were not at our best. I want more tomorrow.'], { team: 0, brand: 1 }),
        ],
      }
      return {
        text: pk(c, [`Looking back, was the ${s} draw with ${O} two points dropped?`, `Did the draw against ${O} leave you frustrated?`]),
        options: [
          o(c, 'Measured', ['A point is a point. We have to turn those into wins.'], { team: 1 }),
          o(c, 'Critical', ['Yes. We should have won that game and we know it.'], { team: 0, brand: 1 }),
          o(c, 'Confident', ['We stayed unbeaten. We build on that.'], { team: 2 }),
        ],
      }
    },
  },
  {
    id: 'rivalWatch', kind: 'pre', weight: (c) => (rivalWatch(c) ? 6 : 0), build: (c) => {
      const r = rivalWatch(c)!
      if (r.k === 'result') return {
        text: r.lost ? pk(c, [`${r.club.short} lost at the weekend. Did you enjoy that?`, `Did you see the ${r.club.short} result? The supporters certainly did.`]) : pk(c, [`${r.club.short} won again. Are you watching them?`, `Your rivals ${r.club.short} keep winning. Does that add pressure?`]),
        options: r.lost ? [
          o(c, 'Joke', ['I was watching. I might have smiled.'], { team: 1, brand: 3 }),
          o(c, 'Measured', ['I only care about my team. Their results do not change ours.'], { team: 1, rep: 0.05 }),
          o(c, 'Deflect', ['I did not see it.'], {}),
        ] : [
          o(c, 'Measured', ['I only care about my team. Their results do not change ours.'], { team: 1, rep: 0.05 }),
          o(c, 'Defiant', ['Let them win. We look after ourselves.'], { team: 2 }),
        ],
      }
      return {
        text: pk(c, [`${r.club.short} are ${r.gap} point${r.gap === 1 ? '' : 's'} above you. How much does finishing above them matter?`, `Is finishing above ${r.club.short} a target this season?`]),
        options: [
          o(c, 'Bold', ['We will finish above them. The supporters can hold me to that.'], { team: 2, brand: 3, rep: 0.05 }),
          o(c, 'Measured', ['Our targets are about us, not about them.'], { team: 1 }),
          o(c, 'Praise', ['The supporters care a lot about it, and so do I.'], { team: 1, brand: 2 }),
        ],
      }
    },
  },
  {
    id: 'homeCrowd', kind: 'pre', weight: (c) => (c.x.home && !c.f.neutral && (c.f.derby || c.x.kind === 'uefa' || c.x.semi || c.x.agg) ? 5 : 0), build: (c) => ({
      text: pk(c, [`A full house expected at ${c.club.stadium}. How much of a difference can the crowd make?`, `What do you want from the supporters tomorrow night?`]),
      options: [
        o(c, 'Praise', ['They are our twelfth man. We need them from the first minute to the last.'], { team: 2, brand: 3 }),
        o(c, 'Measured', ['The atmosphere will be special. It is our job to give them something to shout about.'], { team: 2, brand: 1 }),
      ],
    }),
  },
  {
    id: 'fifaRank', kind: 'pre', weight: (c) => (c.club.national && fifaRank(c) ? 10 : 0), build: (c) => {
      const r = fifaRank(c)!
      return {
        text: pk(c, [`${c.club.short} are ${ord(r.rank)} in the FIFA ranking. Is that a fair reflection?`, `${r.move > 0 ? `Up ${r.move} place${r.move === 1 ? '' : 's'} in the last ranking. ` : r.move < 0 ? `Down ${-r.move} place${r.move === -1 ? '' : 's'} in the last ranking. ` : ''}Where should this team be?`]),
        options: [
          o(c, 'Confident', ['We should be higher. This group can compete with anyone.'], { team: 2, brand: 2 }),
          o(c, 'Measured', ['Rankings follow results. Win games and the number takes care of itself.'], { team: 1 }),
          o(c, 'Humble', ['It is about right. We have work to do to climb.'], { team: 0, rep: 0.05 }),
        ],
      }
    },
  },
  {
    id: 'friendly', kind: 'pre', weight: (c) => (friendlyComp(c.comp) ? 14 : 0), build: (c) => ({
      text: pk(c, [`Will you use this game against ${c.opp.short} to experiment?`, `How many minutes will the new faces get?`, `Is the result important, or is it all about fitness?`]),
      options: [
        o(c, 'Measured', ['Minutes and sharpness first. But we always want to win.'], { team: 2 }),
        o(c, 'Confident', ['There is no such thing as a friendly for my teams.'], { team: 1, brand: 1 }),
        o(c, 'Praise', ['Some young players will get a chance. They have earned it in training.'], { team: 1, youth: 1 }),
      ],
    }),
  },
]

// ---------------------------------------------------------------- more post-match topics
const POST_MORE: Topic[] = [
  {
    // what you said about a player before the game, against what he did
    id: 'backed', kind: 'post', weight: (c) => (backedOutcome(c) ? 13 : 0), build: (c) => {
      const b = backedOutcome(c)!
      const p = c.w.players[b.id]
      const did = b.s.goals >= 2 ? `scored ${b.s.goals}` : b.s.goals ? 'scored' : 'was outstanding'
      if (b.praised && b.delivered) return {
        playerId: p.id,
        text: pk(c, [`You backed ${p.name} before the game and he ${did}. Do you feel vindicated?`, `You said great things about ${cn(p)} in the week. He clearly listened.`]),
        options: [
          o(c, 'Praise', ['I know what he can do. Today everyone saw it.'], { player: 4, playerId: p.id }),
          o(c, 'Confident', ['I do not say things I do not believe.'], { player: 2, playerId: p.id, brand: 1 }),
          o(c, 'Humble', ['He did it, not me. I just watched.'], { player: 3, playerId: p.id, team: 1 }),
        ],
      }
      if (b.praised) return {
        playerId: p.id,
        text: pk(c, [`You praised ${p.name} before the game, but he struggled today. Did the spotlight get to him?`, `${cn(p)} didn't live up to your words today. What happened?`]),
        options: [
          o(c, 'Praise', ['One game does not change my opinion. He is a top player.'], { player: 5, playerId: p.id }),
          o(c, 'Critical', ['He knows he can do much better than that.'], { player: -5, playerId: p.id }),
          o(c, 'Deflect', ['I will not single out one player after a team performance.'], { team: 1 }),
        ],
      }
      return {
        playerId: p.id,
        text: pk(c, [`You questioned ${p.name} before the game and he ${did}. Was that the plan all along?`, `${cn(p)} answered your criticism on the pitch. Were you trying to provoke him?`]),
        options: [
          o(c, 'Joke', ['Maybe I should criticise him every week.'], { player: 2, playerId: p.id, brand: 1 }),
          o(c, 'Praise', ['That is the reaction I wanted. He showed his character.'], { player: 6, playerId: p.id }),
          o(c, 'Measured', ['I said what I thought. He responded like a professional.'], { player: 3, playerId: p.id }),
        ],
      }
    },
  },
  {
    // "we'll score tomorrow"
    id: 'scoreVow', kind: 'post', weight: (c) => (c.pre?.promiseScore ? (c.gf === 0 ? 20 : 6) : 0), build: (c) => c.gf === 0 ? {
      text: pk(c, ['You told us not to worry about goals. You didn\'t score again. What now?', `"We will score tomorrow," you said. What went wrong?`]),
      options: [
        o(c, 'Humble', ['I was wrong. The goals have to come, and it is my job to find them.'], { team: 1, rep: -0.05 }),
        o(c, 'Defiant', ['We created enough. I still believe in my forwards.'], { team: 2, brand: -1 }),
        o(c, 'Critical', ['We need more from the players in the final third. That is clear.'], { team: -2, brand: 1 }),
      ],
    } : {
      text: pk(c, [`You said the goals would come, and ${c.gf === 1 ? 'one did' : `${c.gf} did`}. A weight off everyone's shoulders?`, 'Goals again. Was the drought in their heads?']),
      options: [
        o(c, 'Confident', ['I never doubted it. Quality always comes through.'], { team: 2, brand: 1 }),
        o(c, 'Praise', ['The forwards kept working through a difficult spell. They deserved it.'], { team: 3 }),
      ],
    },
  },
  {
    // "he won't score"
    id: 'stopVow', kind: 'post', weight: (c) => (stopVow(c) ? 18 : 0), build: (c) => {
      const v = stopVow(c)!
      const p = c.w.players[v.id]
      return v.scored ? {
        text: pk(c, [`You said ${p.name} wouldn't score. He did. Do you regret those words?`, `${cn(p)} scored after you said he wouldn't. Did you give him extra motivation?`]),
        options: [
          o(c, 'Humble', ['Yes. Lesson learned. He is a very good player.'], { rep: 0.05, brand: -1 }),
          o(c, 'Defiant', ['One goal. We will see him again.'], { team: 1, brand: 1, opponent: 1 }),
          o(c, 'Joke', ['I think he reads my press conferences. I will stop talking about him.'], { brand: 2 }),
        ],
      } : {
        text: pk(c, [`You said ${p.name} wouldn't score, and he didn't. How did you keep him quiet?`, `${cn(p)} didn't get a look in. Was that the plan?`]),
        options: [
          o(c, 'Confident', ['We had a plan and the players followed it perfectly.'], { team: 2, brand: 2 }),
          o(c, 'Praise', ['My defenders were outstanding. They deserve the credit.'], { team: 3 }),
        ],
      }
    },
  },
  {
    id: 'subImpact', kind: 'post', weight: (c) => (subImpact(c) ? 9 : 0), build: (c) => {
      const s = subImpact(c)!
      const p = c.w.players[s.id]
      const what = s.goals ? (s.goals > 1 ? `scored ${s.goals}` : 'scored') : 'set one up'
      return {
        playerId: p.id,
        text: pk(c, [`${p.name} came off the bench and ${what}. What did you see?`, `Your changes turned the game. Was it planned?`, `Does ${cn(p)} deserve to start next time?`]),
        options: [
          o(c, 'Confident', ['I saw space and wanted fresh legs in there. It worked.'], { team: 1, brand: 2, rep: 0.1 }),
          o(c, 'Praise', [`The bench is part of the team. ${cn(p)} was ready and he made the difference.`], { player: 5, playerId: p.id, team: 1 }),
          o(c, 'Humble', ['Sometimes you get it right. The players did the hard part.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'tacticalSwitch', kind: 'post', weight: (c) => (tacticalSwitch(c) ? 8 : 0), build: (c) => {
      const t = tacticalSwitch(c)!
      return {
        text: pk(c, [`You changed things around the ${ord(t.min)} minute and the game turned. What did you see?`, `Was the switch at ${t.min}' the moment you won it?`]),
        options: [
          o(c, 'Confident', ['We needed more in the final third, so we went for it.', 'Their full-backs were tired. We attacked that.'], { team: 1, brand: 2, rep: 0.1 }),
          o(c, 'Praise', ['The players adapted brilliantly. Not every team can change during a game.'], { team: 3 }),
          o(c, 'Humble', ['Sometimes you make the right call. Sometimes you do not.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'ownGoal', kind: 'post', weight: (c) => (ownGoalBy(c) ? 9 : 0), build: (c) => {
      const p = ownGoalBy(c)!
      return {
        playerId: p.id,
        text: pk(c, [`An own goal from ${p.name}. How do you pick him up?`, `${cn(p)} put it into his own net. What did you say to him?`]),
        options: [
          o(c, 'Praise', ['Nobody blames him. It can happen to anyone who puts his body on the line.'], { player: 5, playerId: p.id, team: 1 }),
          o(c, 'Measured', ['It was unlucky. He will bounce back.'], { player: 2, playerId: p.id }),
          o(c, 'Critical', ['He has to deal with that situation better.'], { player: -5, playerId: p.id }),
        ],
      }
    },
  },
  {
    id: 'errorGoal', kind: 'post', weight: (c) => (errorBy(c) ? 9 : 0), build: (c) => {
      const p = errorBy(c)!
      return {
        playerId: p.id,
        text: pk(c, [`${p.name}'s mistake led to a goal. Will he keep his place?`, `How costly was the error from ${cn(p)}?`, `Did ${cn(p)} apologise in the dressing room?`]),
        options: [
          o(c, 'Praise', ['He has my full backing. He has won us plenty of points.'], { player: 6, playerId: p.id }),
          o(c, 'Critical', ['Mistakes like that cost points. He knows it.'], { player: -7, playerId: p.id, team: 1 }),
          o(c, 'Deflect', ['We win and lose as a team. I will not single him out.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'wasteful', kind: 'post', weight: (c) => (wasteful(c) ? 9 : 0), build: (c) => {
      const w = wasteful(c)!
      const p = w.culprit ? c.w.players[w.culprit] : undefined
      return {
        playerId: p?.id,
        text: p && c.rng.next() < 0.5
          ? pk(c, [`${p.name} had chances to ${c.drew ? 'win it' : 'change the game'}. How frustrated is he?`, `Should ${cn(p)} have done better with his chances?`])
          : pk(c, [`${w.bcm >= 2 ? `You missed ${w.bcm} big chances` : `You created ${w.xg} expected goals and scored ${c.gf}`}. Is finishing the problem?`, `How did you not ${c.lost ? 'get something' : 'win'} with the chances you created?`]),
        options: [
          o(c, 'Measured', ['We created enough to win. Keep creating and the goals will come.'], { team: 2 }),
          o(c, 'Critical', ['At this level you cannot miss chances like that. It is that simple.'], { team: -2, brand: 1 }),
          p ? o(c, 'Praise', [`${cn(p)} will score next week. He always responds.`], { player: 4, playerId: p.id }) : o(c, 'Humble', ['Their goalkeeper was good too. Some days it does not go in.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'setPieceAgainst', kind: 'post', weight: (c) => (setPieceAgainst(c) ? 8 : 0), build: (c) => {
      const again = (ourRep(c).conceded.setPiece || 0) >= 4
      return {
        text: again ? pk(c, ['You conceded from a set piece again. How frustrating is that?', 'Another goal from a set piece. Why does it keep happening?']) : pk(c, ['The goal came from a set piece. Were you unhappy with the marking?', 'How did you let that set piece in?']),
        options: [
          o(c, 'Critical', ['Very. We work on it every week and we still switch off.'], { team: -1, brand: 1 }),
          o(c, 'Measured', ['One lapse of concentration. We have to be sharper.'], { team: 1 }),
          o(c, 'Deflect', ['Every team concedes from set pieces.'], { brand: -1 }),
        ],
      }
    },
  },
  {
    id: 'collapse', kind: 'post', weight: (c) => (collapse(c) ? 14 : 0), build: (c) => {
      const k = collapse(c)!
      return {
        text: pk(c, [`You were ${k.a}-${k.b} up and lost. How did that happen?`, `${k.a}-${k.b} ahead and it slipped away. Is that a mentality problem?`, `What did you say to the players after throwing away a ${k.a - k.b}-goal lead?`]),
        options: [
          o(c, 'Critical', ['We stopped playing. That is a mentality issue, and it is my job to fix it.'], { team: -2, brand: 1, rep: 0.05 }),
          o(c, 'Measured', ['We lost control after the first goal. Small details, big consequences.'], { team: 1 }),
          o(c, 'Deflect', ['I need to watch it again before I say anything.'], {}),
          o(c, 'Humble', ['Credit to them. They never gave up.'], { team: 0, rep: 0.1 }),
        ],
      }
    },
  },
  {
    id: 'homeFans', kind: 'post', weight: (c) => (c.lost && c.x.home && !c.f.neutral && ((c.x.usStreak && (c.x.usStreak.kind === 'lost' || c.x.usStreak.kind === 'winless')) || c.ga - c.gf >= 3) ? 11 : 0), build: (c) => ({
      text: pk(c, ['There was frustration in the stands at full time. Do you understand it?', `The home supporters let their feelings be known. What do you say to them?`, `How much does it hurt to lose at ${c.club.stadium} like that?`]),
      options: [
        o(c, 'Humble', ['Completely. They pay to see their team win and we did not give them that.'], { brand: 2, team: 1 }),
        o(c, 'Defiant', ['I understand, but they need to stick with us. We will turn this around.'], { team: 2 }),
        o(c, 'Critical', ['They are right to be angry. I am angry too.'], { team: -2, brand: 1 }),
      ],
    }),
  },
  {
    id: 'run', kind: 'post', weight: (c) => (runStory(c) ? 12 : 0), build: (c) => {
      const r = runStory(c)!
      if (r.k === 'won') return {
        text: pk(c, [`That's ${r.n} wins in a row. How far can this run go?`, `${r.n} straight wins. Is this the best spell of your career?`, `Does anyone in the dressing room talk about the winning run?`]),
        options: [
          o(c, 'Humble', ['We do not talk about it. Next game, that is all.'], { team: 2 }),
          o(c, 'Confident', ['We want to keep it going as long as we can. This team has no ceiling.'], { team: 2, brand: 2, rep: 0.1 }),
          o(c, 'Praise', ['The hunger in this group is special. They deserve every win.'], { team: 3 }),
        ],
      }
      if (r.k === 'lost') return {
        text: pk(c, [`That's ${r.n} defeats in a row. How do you stop the rot?`, `${r.n} straight losses. Do you still have the answers?`, `Are you worried about your job after ${r.n} defeats in a row?`]),
        options: [
          o(c, 'Defiant', ['I have the answers and I have the players. We will get out of this.'], { team: 2, brand: 1, rep: 0.05 }),
          o(c, 'Measured', ['Results have to change. We go back to basics, starting tomorrow.'], { team: 2 }),
          o(c, 'Critical', ['Some players are hiding. That has to stop.'], { team: -4, brand: 1 }),
          o(c, 'Humble', ['I take responsibility. It is my job to find a solution.'], { team: 1, rep: 0.05 }),
        ],
      }
      if (r.k === 'unbeaten') return {
        text: pk(c, [`Unbeaten in ${r.n} now. Is this the most consistent your team has been?`, `${r.n} without defeat. What makes this team so hard to beat?`]),
        options: [
          o(c, 'Praise', ['The attitude. Every player fights for the team.'], { team: 3 }),
          o(c, 'Measured', ['Unbeaten is good, but we want more wins among them.'], { team: 1 }),
          o(c, 'Confident', ['We are hard to beat because we are good. Simple.'], { team: 2, brand: 1 }),
        ],
      }
      if (r.k === 'winless') return {
        text: pk(c, [`${r.n} games without a win now. Are you worried?`, `When do you expect the next win to come?`]),
        options: [
          o(c, 'Measured', ['Worried, no. Concerned, yes. We are close.'], { team: 1 }),
          o(c, 'Defiant', ['The next win is coming. I have no doubt.'], { team: 2, brand: 1 }),
          o(c, 'Critical', ['Being close is not enough. We have to win games.'], { team: -1, brand: 1 }),
        ],
      }
      if (r.k === 'relief') return {
        text: pk(c, [`A first win in ${r.n} games. How much of a relief is that?`, `The winless run is over. Can this be a turning point?`]),
        options: [
          o(c, 'Humble', ['Huge. The players needed it more than anyone.'], { team: 3 }),
          o(c, 'Confident', ['This is the start of something. You will see.'], { team: 2, brand: 1 }),
          o(c, 'Measured', ['One win. Now we need another one.'], { team: 1 }),
        ],
      }
      return {
        text: pk(c, [`Your ${r.n}-game unbeaten run is over. How do you respond?`, `The unbeaten run ends at ${r.n}. Were you due a defeat?`]),
        options: [
          o(c, 'Measured', ['It had to end some day. What matters is the reaction.'], { team: 2 }),
          o(c, 'Critical', ['I am not interested in runs. I am interested in this performance, and it was not good enough.'], { team: -1, brand: 1 }),
          o(c, 'Praise', [`${c.opp.short} deserved it. We will start a new run.`], { team: 1, rep: 0.05 }),
        ],
      }
    },
  },
  {
    id: 'refereeGame', kind: 'post', weight: (c) => (cardsGame(c) ? 9 : 0), build: (c) => {
      const k = cardsGame(c)!
      return {
        text: pk(c, [`${k.y} yellow cards${k.r ? ` and ${k.r} red${k.r === 1 ? '' : 's'}` : ''} today. Did the referee lose control of the game?`, `Was the referee too quick to reach for his cards?`, `A bad-tempered game. Who is to blame?`]),
        options: [
          o(c, 'Critical', ['He was far too quick with his cards. It killed the rhythm of the game.'], { team: 1, brand: 1, rep: -0.15 }),
          o(c, 'Measured', ['It was a fiery game. Some cards were fair, some less so.'], { rep: 0.05 }),
          o(c, 'Deflect', ['You will have to ask him.'], {}),
          o(c, 'Joke', ['I think he wanted to use every page of his notebook.'], { brand: 2, rep: -0.05 }),
        ],
      }
    },
  },
  {
    id: 'possession', kind: 'post', weight: (c) => (possStory(c) ? 7 : 0), build: (c) => {
      const s = possStory(c)!
      if (s.k === 'barren') return {
        text: pk(c, [`${s.p}% of the ball but no win. Was something missing?`, `You dominated possession. Why didn't it turn into goals?`]),
        options: [
          o(c, 'Measured', ['We needed more speed and more risk in the last third.'], { team: 1 }),
          o(c, 'Critical', ['Too many passes sideways. We were predictable.'], { team: -1, brand: 1 }),
          o(c, 'Praise', [`${c.opp.short} defended with their lives. Credit to them.`], { rep: 0.05 }),
        ],
      }
      return {
        text: pk(c, [`Only ${s.p}% possession, but three points. Was that the plan?`, `${c.opp.short} had the ball, you had the win. Is that the way to beat them?`]),
        options: [
          o(c, 'Confident', ['Exactly the plan. We knew where to hurt them.'], { team: 2, brand: 2, rep: 0.1 }),
          o(c, 'Humble', ['Not exactly. We suffered, but we defended well.'], { team: 1 }),
          o(c, 'Joke', ['Possession is overrated. Ask the scoreboard.'], { brand: 2 }),
        ],
      }
    },
  },
  {
    id: 'theirKeeper', kind: 'post', weight: (c) => (theirKeeper(c) ? 8 : 0), build: (c) => {
      const k = theirKeeper(c)!
      const p = c.w.players[k.id]
      return {
        text: pk(c, [`${p.name} made ${k.saves} saves. Was he the difference?`, `Did ${cn(p)} stop you from winning today?`]),
        options: [
          o(c, 'Praise', ['He had the game of his life. You have to say well done.'], { rep: 0.1 }),
          o(c, 'Critical', ['We made him look good. Too many shots straight at him.'], { team: -1, brand: 1 }),
          o(c, 'Measured', ['We created enough. Some days the keeper is in the way.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'theirStar', kind: 'post', weight: (c) => (theirStar(c) ? 9 : 0), build: (c) => {
      const s = theirStar(c)!
      const p = c.w.players[s.id]
      return {
        text: pk(c, [`${p.name} scored ${s.goals} against you. What went wrong in dealing with him?`, `Could anyone have stopped ${cn(p)} today?`]),
        options: [
          o(c, 'Praise', ['A top performance. Sometimes you have to say well done.'], { rep: 0.1 }),
          o(c, 'Critical', ['We knew what he does and we still let him do it.'], { team: -2, brand: 1 }),
          o(c, 'Measured', ['We gave him too much space. We will look at it.'], { team: 1 }),
        ],
      }
    },
  },
  {
    id: 'debut', kind: 'post', weight: (c) => (debutant(c) ? 10 : 0), build: (c) => {
      const d = debutant(c)!
      const p = d.p
      return {
        playerId: p.id,
        text: pk(c, [`A debut for ${p.name} at just ${d.age}. How did you judge the moment?`, `What did you say to ${cn(p)} before he went on?`, `${cn(p)} made his first appearance today. Is he ready for more?`]),
        options: [
          o(c, 'Praise', ['He was fearless. That is exactly why he played.'], { player: 6, playerId: p.id, youth: 1 }),
          o(c, 'Measured', ['He deserved it. Now the hard work starts.'], { player: 2, playerId: p.id, youth: 1 }),
          o(c, 'Critical', ['He has a lot to learn. Nobody should get carried away.'], { player: -3, playerId: p.id }),
        ],
      }
    },
  },
  {
    id: 'firstGoal', kind: 'post', weight: (c) => (firstGoal(c) ? 8 : 0), build: (c) => {
      const p = firstGoal(c)!
      return {
        playerId: p.id,
        text: pk(c, [`${p.name} opened his account for ${c.club.short}. How important is that for him?`, `A first goal for the club for ${cn(p)}. Will it relax him?`]),
        options: [
          o(c, 'Praise', ['I am so happy for him. He has worked hard for that moment.'], { player: 5, playerId: p.id }),
          o(c, 'Measured', ['It will help him. Now the next one comes easier.'], { player: 2, playerId: p.id }),
        ],
      }
    },
  },
  {
    id: 'managerWins', kind: 'post', weight: (c) => (c.won && [10, 25, 50, 75, 100, 150, 200, 250, 300].includes(winsHere(c)) ? 10 : 0), build: (c) => ({
      text: pk(c, [`That's your ${ord(winsHere(c))} win as ${c.club.short} ${c.club.national ? 'coach' : 'manager'}. What has been the secret?`, `${winsHere(c)} wins in charge now. Which one meant the most?`]),
      options: [
        o(c, 'Praise', ['The players and the staff. I just try to make good decisions.'], { team: 2 }),
        o(c, 'Confident', ['Hard work and belief. And there are many more to come.'], { team: 1, brand: 2, rep: 0.1 }),
        o(c, 'Humble', ['I do not count them. The next one is the one that matters.'], { team: 1 }),
      ],
    }),
  },
  {
    id: 'oppMgrFuture', kind: 'post', weight: (c) => (c.won && c.oppMgr && !c.opp.national && c.x.themStreak && (c.x.themStreak.kind === 'lost' || c.x.themStreak.kind === 'winless') ? 7 : 0), build: (c) => ({
      text: pk(c, [`Could that result cost ${c.oppMgr} his job?`, `${streakText(c.x.themStreak!, c.opp.short)}. Do you have any sympathy for ${callName(c.oppMgr!)}?`]),
      options: [
        o(c, 'Praise', ['I hope not. He is a good coach and he will turn it around.'], { rep: 0.1 }),
        o(c, 'Deflect', ['That is not for me to say.'], {}),
        o(c, 'Measured', ['That is football. Today I only think about my team.'], { team: 1 }),
      ],
    }),
  },
  {
    id: 'intlBreak', kind: 'post', weight: (c) => (!c.club.national && intlAhead(c) >= 3 ? 6 : 0), build: (c) => ({
      text: pk(c, [`${intlAhead(c) >= 10 ? 'Most of your squad' : `${intlAhead(c)} of your players`} now head off on international duty. Are you worried?`, 'An international break now. Does it come at a good time?', 'Will you be in touch with the national team coaches about minutes?']),
      options: [
        o(c, 'Critical', ['Always. It is the part of the calendar every club coach hates.'], { brand: 1, rep: -0.05 }),
        o(c, 'Measured', ['It is an honour for them. We will stay in contact with every federation.'], { team: 1, rep: 0.05 }),
        o(c, 'Joke', ['I have asked them all to come back in one piece.'], { team: 1, brand: 1 }),
      ],
    }),
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

/** The promise you made before this game, in your own words (older saves stored it lower-cased). */
function saidBefore(c: Ctx) {
  const q = c.pre?.quote
  if (!q) return 'Before the game you said you would win.'
  return /^[a-z]/.test(q) ? `Before the game you said ${q.replace(/[.!]+$/, '')}.` : `Before the game you said: "${q}"`
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

// ---------------------------------------------------------------- helpers for the wider question bank
const memo = <T,>(c: Ctx, k: string, fn: () => T): T => { if (!c.m.has(k)) c.m.set(k, fn()); return c.m.get(k) as T }
const avgOf = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const recentForm = (p: Player, n = 3) => avgOf(p.formRatings.slice(-n))
const friendlyComp = (comp?: Competition) => !comp || comp.intl?.kind === 'friendly'
const isGoalEv = (e: MatchEvent) => e.type === 'goal' || e.type === 'penGoal' || e.type === 'owngoal'
interface Game { f: Fixture; home: boolean; gf: number; ga: number; oppId: number; comp?: Competition }
/** This season's played matches for the manager's team, oldest first, not counting this fixture. */
function ourGames(c: Ctx): Game[] {
  return memo(c, 'games', () => Object.values(c.w.fixtures)
    .filter((x) => x.played && x.result && x.id !== c.f.id && (x.home === c.club.id || x.away === c.club.id) && c.w.competitions[x.compId]?.season === c.w.season)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((x) => { const h = x.home === c.club.id; return { f: x, home: h, gf: x.result!.score[h ? 0 : 1], ga: x.result!.score[h ? 1 : 0], oppId: h ? x.away : x.home, comp: c.w.competitions[x.compId] } }))
}
const oppRep = (c: Ctx) => memo(c, 'oppRep', () => opponentReport(c.w, c.opp.id, c.comp))
const ourRep = (c: Ctx) => memo(c, 'ourRep', () => opponentReport(c.w, c.club.id, c.comp))
const xiAvg = (c: Ctx) => memo(c, 'xiAvg', () => avgOf([...c.squad].sort((a, b) => b.ovr - a.ovr).slice(0, 11).map((p) => p.ovr)))
function leagueTable(c: Ctx) {
  return memo(c, 'table', () => {
    const lg = c.comp?.format === 'league' ? c.comp : Object.values(c.w.competitions).find((x) => x.format === 'league' && x.clubs.includes(c.club.id) && x.status !== 'finished')
    return lg?.table?.length ? { lg, rows: sortTable(c.w, lg) } : undefined
  })
}
function leader(c: Ctx) { const t = leagueTable(c); return t ? c.w.clubs[t.rows[0].clubId] : undefined }
function seasonCards(c: Ctx) {
  return memo(c, 'cards', () => { let y = 0, r = 0; for (const p of c.squad) for (const s of Object.values(p.season)) { y += s.yellows; r += s.reds } return { y, r } })
}
function suspendedKey(c: Ctx) {
  return memo(c, 'susp', () => c.squad.filter((p) => p.suspensions.length && isSuspendedFor(p, c.comp) && p.ovr >= xiAvg(c) - 3).sort((a, b) => b.ovr - a.ovr)[0])
}
function banRisk(c: Ctx) {
  return memo(c, 'ban', () => {
    const comp = c.comp
    if (!comp || comp.intl?.kind === 'friendly' || c.x.kind === 'friendly') return undefined
    const key = comp.key || c.f.compId
    const limits = YELLOW_LIMITS[comp.format] || [5]
    const p = c.squad.filter((x) => !x.injury && !isSuspendedFor(x, comp) && seasonApps(x) >= 4 && limits.includes((x.yellowAccum[key] || 0) + 1)).sort((a, b) => b.ovr - a.ovr)[0]
    return p ? { p, next: (p.yellowAccum[key] || 0) + 1 } : undefined
  })
}
/** The next game in this competition, when it is one a ban would really hurt to miss. */
function nextBig(c: Ctx): string | undefined {
  const n = Object.values(c.w.fixtures).filter((x) => !x.played && x.compId === c.f.compId && x.id !== c.f.id && x.date > c.f.date && (x.home === c.club.id || x.away === c.club.id)).sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!n) return undefined
  const opp = c.w.clubs[n.home === c.club.id ? n.away : n.home]
  if (n.derby) return `the ${n.derby}`
  const t = leagueTable(c)
  const pos = t ? t.rows.findIndex((r) => r.clubId === opp?.id) : -1
  return opp && pos >= 0 && pos < 4 ? `the ${opp.short} game` : undefined
}
function expiringStar(c: Ctx) {
  return memo(c, 'expiring', () => c.w.date >= `${c.w.season}-10-01` && !c.club.national
    ? c.squad.filter((p) => !p.loan && !p.retiringAtSeasonEnd && p.contract.until <= c.w.season && p.ovr >= xiAvg(c)).sort((a, b) => b.ovr - a.ovr)[0]
    : undefined)
}
function outOfForm(c: Ctx) {
  return memo(c, 'oof', () => c.squad.filter((p) => !p.injury && seasonApps(p) >= 6 && p.formRatings.length >= 3 && recentForm(p) <= 6.35 && p.ovr >= xiAvg(c) - 2).sort((a, b) => b.ovr - a.ovr)[0])
}
function tiredStar(c: Ctx) {
  return memo(c, 'tired', () => c.squad.filter((p) => !p.injury && p.fitness < 72 && p.ovr >= xiAvg(c) + 1 && p.lastMatchDate && diffDays(c.f.date, p.lastMatchDate) <= 4).sort((a, b) => b.ovr - a.ovr)[0])
}
function unhappyPlayer(c: Ctx) {
  return memo(c, 'unhappy', () => c.squad.filter((p) => !p.injury && p.morale < 32 && p.ovr >= xiAvg(c) - 1).sort((a, b) => a.morale - b.morale || b.ovr - a.ovr)[0])
}
/** Our players who played for their country in the last nine days, with their goals. */
function intlReturns(c: Ctx) {
  return memo(c, 'intl', () => {
    if (c.club.national) return []
    const since = addDays(c.w.date, -9)
    const out = new Map<number, { p: Player; nt: string; goals: number }>()
    for (const f of Object.values(c.w.fixtures)) {
      if (!f.played || !f.result || f.date < since || f.date > c.w.date) continue
      const h = c.w.clubs[f.home], a = c.w.clubs[f.away]
      if (!h?.national || !a?.national) continue
      for (const s of f.result.players) {
        const p = c.w.players[s.id]
        if (!p || p.clubId !== c.club.id || s.mins <= 0) continue
        const e = out.get(p.id) || { p, nt: (s.side === 0 ? h : a).short, goals: 0 }
        e.goals += s.goals
        out.set(p.id, e)
      }
    }
    return [...out.values()].sort((a, b) => b.goals - a.goals || b.p.ovr - a.p.ovr)
  })
}
function dangerMan(c: Ctx) {
  return memo(c, 'danger', () => { const r = oppRep(c); const out = new Set(r.missing.map((m) => m.id)); return r.danger.find((d) => d.goals >= 4 && !out.has(d.id) && c.w.players[d.id]?.clubId === c.opp.id) })
}
function oppMissing(c: Ctx): Player[] {
  return memo(c, 'oppMissing', () => oppRep(c).missing.map((m) => c.w.players[m.id]).filter((p) => p && p.ovr >= c.opp.squadAvg + 1).slice(0, 3))
}
interface StyleHook { k: 'possession' | 'setPieces' | 'counter' | 'highLine' | 'press' | 'late' | 'leaky'; v?: number; t?: number; x?: string }
function oppStyle(c: Ctx): StyleHook | undefined {
  return memo(c, 'oppStyle', () => {
    const r = oppRep(c)
    if (r.games < 5) return undefined
    const hooks: StyleHook[] = []
    if (r.style.possession >= 56) hooks.push({ k: 'possession', v: Math.round(r.style.possession) })
    if (r.setPieces.share >= 0.3 && r.scored.total >= 5) hooks.push({ k: 'setPieces', v: r.scored.setPiece, t: r.scored.total })
    if (r.scored.total >= 5 && r.scored.counter / r.scored.total >= 0.25) hooks.push({ k: 'counter', v: r.scored.counter, t: r.scored.total })
    if (r.tactics.lineHeight >= 68) hooks.push({ k: 'highLine' })
    if (r.tactics.pressing >= 70) hooks.push({ k: 'press' })
    if (r.scored.total >= 5 && r.scored.late / r.scored.total >= 0.33) hooks.push({ k: 'late', v: r.scored.late, t: r.scored.total })
    if (r.league && r.style.xga >= r.league.xg * 1.2) hooks.push({ k: 'leaky', x: r.style.xga.toFixed(1) })
    return hooks.length ? hooks[hashString(`${c.f.id}style`) % hooks.length] : undefined
  })
}
function venueStory(c: Ctx) {
  return memo(c, 'venue', () => {
    if (c.f.neutral) return undefined
    const lg = ourGames(c).filter((g) => g.comp?.format === 'league' && g.home === c.x.home)
    if (lg.length < 4) return undefined
    const n = lg.length, w = lg.filter((g) => g.gf > g.ga).length, l = lg.filter((g) => g.gf < g.ga).length
    if (c.x.home) { if (w / n >= 0.75 && l === 0) return { k: 'fortress', w, n }; if (w / n <= 0.3) return { k: 'homeBlues', w, n } }
    else { if (w / n >= 0.6) return { k: 'roadWarriors', w, n }; if (w === 0) return { k: 'awayBlues', w, n } }
    return undefined
  })
}
function goalsStory(c: Ctx) {
  return memo(c, 'goals', () => {
    const last = ourGames(c).filter((g) => !friendlyComp(g.comp)).slice(-5)
    if (last.length < 5) return undefined
    const gf = last.reduce((a, g) => a + g.gf, 0), ga = last.reduce((a, g) => a + g.ga, 0)
    if (gf <= 2) return { k: 'drought', gf, ga, n: 5 }
    if (ga >= 11) return { k: 'leaky', gf, ga, n: 5 }
    if (gf >= 15) return { k: 'flowing', gf, ga, n: 5 }
    return undefined
  })
}
function ourWeakness(c: Ctx) {
  return memo(c, 'weak', () => {
    const k = ourRep(c).conceded
    if (k.total < 6) return undefined
    if (k.setPiece / k.total >= 0.35) return { k: 'setPiece', v: k.setPiece, t: k.total }
    if (k.late / k.total >= 0.38) return { k: 'late', v: k.late, t: k.total }
    return undefined
  })
}
const activeSheet = (c: Ctx) => c.club.sheets.find((s) => s.id === c.club.activeSheet) || c.club.sheets[0]
function shapeChange(c: Ctx) {
  return memo(c, 'shape', () => {
    const g = ourGames(c).slice(-1)[0]
    const fr = g?.f.result?.formations
    const sheet = activeSheet(c)
    if (!fr || !sheet) return undefined
    const last = fr[g.home ? 0 : 1]
    if (!last || fmtFormation(last) === fmtFormation(sheet.formation)) return undefined
    return { from: fmtFormation(last), to: fmtFormation(sheet.formation) }
  })
}
function styleStory(c: Ctx) {
  return memo(c, 'style', () => {
    const t = activeSheet(c)?.tactics
    const soon = Object.values(c.w.fixtures).filter((x) => !x.played && (x.home === c.club.id || x.away === c.club.id) && x.date >= c.f.date && diffDays(x.date, c.f.date) <= 10).length
    if (t && t.pressing >= 72 && soon >= 3) return { k: 'press', v: t.pressing }
    const r = ourRep(c)
    if (r.games < 6) return undefined
    if (r.style.possession <= 44) return { k: 'lowPoss', v: Math.round(r.style.possession) }
    if (r.style.possession >= 60) return { k: 'highPoss', v: Math.round(r.style.possession) }
    return undefined
  })
}
function boardTarget(c: Ctx) {
  return memo(c, 'board', () => {
    if (c.x.kind !== 'league' || (c.x.played || 0) < 12 || !c.x.usPos || c.club.national) return undefined
    const ob = c.w.board.objectives.find((x) => x.season === c.w.season && x.metric === 'leaguePos' && x.status === 'active' && (!x.compId || x.compId === c.f.compId) && !/relegation|promotion/i.test(x.text))
    if (!ob || ob.target <= 1) return undefined
    const pos = c.x.usPos
    return pos <= ob.target - 2 || pos >= ob.target + 3 ? { pos, target: ob.target } : undefined
  })
}
function managerOfMonth(c: Ctx) {
  return memo(c, 'motm', () => {
    const d = new Date(`${c.w.date}T12:00:00Z`)
    if (d.getUTCDate() > 16) return undefined
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1)
    const ym = d.toISOString().slice(0, 7)
    const me = `${c.w.user.firstName} ${c.w.user.lastName}`
    const a = c.w.awards.find((x) => x.month === ym && x.clubId === c.club.id && x.managerName === me && /Manager of the Month$/.test(x.name))
    return a ? `${a.name.replace(/ Manager of the Month$/, '')} Manager of the Month for ${monthName(d.getUTCMonth())}` : undefined
  })
}
function priceTag(c: Ctx) {
  return memo(c, 'price', () => {
    const since = addDays(c.w.date, -300)
    for (const t of [...c.w.transfers.history].reverse()) {
      if (t.date < since) break
      if (t.to !== c.club.id || t.type !== 'transfer' || t.fee < 15e6) continue
      const p = c.w.players[t.playerId]
      if (!p || p.clubId !== c.club.id || seasonApps(p) < 5 || p.formRatings.length < 4 || recentForm(p, 5) >= 6.6) continue
      return { p, fee: t.fee }
    }
    return undefined
  })
}
function soldStar(c: Ctx) {
  return memo(c, 'sold', () => {
    const since = addDays(c.w.date, -35)
    const t = c.w.transfers.history.filter((x) => x.from === c.club.id && x.date >= since && x.type === 'transfer' && x.fee >= 15e6 && c.w.clubs[x.to]).sort((a, b) => b.fee - a.fee)[0]
    return t ? { name: t.playerName, to: c.w.clubs[t.to].short, fee: t.fee } : undefined
  })
}
function lastGame(c: Ctx) {
  return memo(c, 'last', () => {
    const g = ourGames(c).slice(-1)[0]
    if (!g || g.oppId === c.opp.id || friendlyComp(g.comp) || diffDays(c.f.date, g.f.date) > 12) return undefined
    return g
  })
}
function rivalWatch(c: Ctx) {
  return memo(c, 'rival', () => {
    if (c.club.national || !c.club.rivals?.length) return undefined
    const riv = [...c.club.rivals].sort((a, b) => b[2] - a[2]).map((r) => c.w.clubs[r[0]]).filter((r) => r && r.id !== c.opp.id)[0]
    if (!riv) return undefined
    const last = Object.values(c.w.fixtures).filter((f) => f.played && f.result && (f.home === riv.id || f.away === riv.id) && f.date <= c.w.date && diffDays(c.w.date, f.date) <= 4).sort((a, b) => b.date.localeCompare(a.date))[0]
    if (last && last.home !== c.club.id && last.away !== c.club.id) {
      const h = last.home === riv.id
      const gf = last.result!.score[h ? 0 : 1], ga = last.result!.score[h ? 1 : 0]
      if (gf < ga) return { k: 'result' as const, club: riv, lost: true, gap: 0 }
      if (gf > ga && hashString(last.id) % 5 < 2) return { k: 'result' as const, club: riv, lost: false, gap: 0 }
    }
    const t = leagueTable(c)
    if (!t || (c.x.played || 0) < 10) return undefined
    const a = t.rows.findIndex((r) => r.clubId === c.club.id), b = t.rows.findIndex((r) => r.clubId === riv.id)
    if (a < 0 || b < 0 || b > a) return undefined
    const gap = (t.rows[b].pts - (t.rows[b].ded || 0)) - (t.rows[a].pts - (t.rows[a].ded || 0))
    return gap > 0 && gap <= 8 ? { k: 'table' as const, club: riv, lost: false, gap } : undefined
  })
}
function fifaRank(c: Ctx) {
  const F = c.w.intl?.fifa
  const rank = F?.pub.rank[c.club.id]
  return F && rank ? { rank, move: (F.prev.rank[c.club.id] ?? rank) - rank } : undefined
}

// post-match
const mine = (c: Ctx) => c.r!.players.filter((x) => x.side === c.us && c.w.players[x.id])
const theirs = (c: Ctx) => c.r!.players.filter((x) => x.side !== c.us && c.w.players[x.id])
function backedOutcome(c: Ctx) {
  for (const [id, d] of c.pre?.backed || []) {
    const s = mine(c).find((x) => x.id === id)
    if (!s || !d) continue
    const good = s.goals > 0 || s.rating >= 7.6, bad = s.mins >= 45 && s.rating < 6.2 && !s.goals
    if (d > 0 && good) return { id, praised: true, delivered: true, s }
    if (d > 0 && bad) return { id, praised: true, delivered: false, s }
    if (d < 0 && good) return { id, praised: false, delivered: true, s }
  }
  return undefined
}
function stopVow(c: Ctx) {
  const id = c.pre?.stopId
  if (!id || !c.w.players[id]) return undefined
  const s = c.r!.players.find((x) => x.id === id)
  return s && s.mins > 0 ? { id, scored: s.goals > 0 } : undefined
}
function subImpact(c: Ctx) {
  return mine(c).filter((x) => !x.started && x.mins > 0 && x.goals + x.assists > 0).sort((a, b) => b.goals * 2 + b.assists - (a.goals * 2 + a.assists))[0]
}
/** A change of approach during the game (from the tactics log) after which we outscored them. */
function tacticalSwitch(c: Ctx) {
  const ch = c.r!.events.find((e) => e.type === 'tactic' && e.side === c.us && e.min >= 25 && e.min <= 80)
  if (!ch) return undefined
  const after = c.r!.events.filter((e) => isGoalEv(e) && e.min >= ch.min)
  const us = after.filter((e) => e.side === c.us).length, them = after.length - us
  return us >= 1 && us > them && !c.lost ? { min: ch.min } : undefined
}
function ownGoalBy(c: Ctx) {
  const e = c.r!.events.find((x) => x.type === 'owngoal' && x.side !== c.us && x.player && c.w.players[x.player]?.clubId === c.club.id)
  return e ? c.w.players[e.player!] : undefined
}
function errorBy(c: Ctx) {
  if (!c.r!.events.some((e) => isGoalEv(e) && e.side !== c.us && e.how === 'error')) return undefined
  const s = mine(c).filter((x) => (x.errors || 0) > 0).sort((a, b) => (b.errors || 0) - (a.errors || 0))[0]
  return s ? c.w.players[s.id] : undefined
}
function wasteful(c: Ctx) {
  if (c.won && c.gf - c.ga >= 2) return undefined
  const st = c.r!.stats[c.us]
  const bcm = st.bigChancesMissed ?? mine(c).reduce((a, x) => a + (x.bcm || 0), 0)
  if (bcm < 3 && st.xg - c.gf < 1.6) return undefined
  const culprit = mine(c).filter((x) => (x.bcm || 0) >= 2).sort((a, b) => (b.bcm || 0) - (a.bcm || 0))[0]?.id
  return { bcm, xg: st.xg.toFixed(1), culprit }
}
function setPieceAgainst(c: Ctx) {
  return c.r!.events.some((e) => isGoalEv(e) && e.side !== c.us && (e.how === 'corner' || e.how === 'freekick'))
}
/** Our biggest lead in a game we did not win. */
function collapse(c: Ctx) {
  // a draw from winning positions is the main result question already
  if (!c.lost) return undefined
  let best: [number, number] | undefined
  for (const e of c.r!.events) if (isGoalEv(e) && e.score) { const a = e.score[c.us], b = e.score[1 - c.us]; if (a - b >= 2 && (!best || a - b > best[0] - best[1])) best = [a, b] }
  return best ? { a: best[0], b: best[1] } : undefined
}
function runStory(c: Ctx) {
  // form over this and earlier games, most recent first
  const games = [...ourGames(c), ...(c.r ? [{ gf: c.gf, ga: c.ga, f: c.f }] : [])].filter((g) => !friendlyComp(c.w.competitions[g.f.compId])).reverse()
  const res = games.map((g) => (g.gf > g.ga ? 'W' : g.gf < g.ga ? 'L' : 'D'))
  const count = (from: number, ok: (r: string) => boolean) => { let n = 0; for (let i = from; i < res.length && ok(res[i]); i++) n++; return n }
  const won = count(0, (r) => r === 'W'), lost = count(0, (r) => r === 'L'), unb = count(0, (r) => r !== 'L'), winless = count(0, (r) => r !== 'W')
  if (won >= 4) return { k: 'won', n: won }
  if (lost >= 3) return { k: 'lost', n: lost }
  if (res[0] === 'W') { const before = count(1, (r) => r !== 'W'); if (before >= 4) return { k: 'relief', n: before + 1 } }
  if (res[0] === 'L') { const before = count(1, (r) => r !== 'L'); if (before >= 8) return { k: 'ended', n: before } }
  if (unb >= 8 && unb % 2 === 0) return { k: 'unbeaten', n: unb }
  if (winless >= 5) return { k: 'winless', n: winless }
  return undefined
}
function cardsGame(c: Ctx) {
  const [a, b] = c.r!.stats
  const y = a.yellows + b.yellows, r = a.reds + b.reds
  return y >= 7 || r >= 2 ? { y, r } : undefined
}
function possStory(c: Ctx) {
  const p = Math.round(c.r!.stats[c.us].possession)
  if (p >= 64 && !c.won) return { k: 'barren', p }
  if (p <= 36 && c.won) return { k: 'smash', p }
  return undefined
}
function theirKeeper(c: Ctx) {
  if (c.won) return undefined
  return theirs(c).find((x) => x.pos === 'GK' && x.saves >= 6)
}
function theirStar(c: Ctx) {
  if (c.won) return undefined
  return theirs(c).filter((x) => x.goals >= 2).sort((a, b) => b.goals - a.goals)[0]
}
function debutant(c: Ctx) {
  for (const s of mine(c)) {
    const p = c.w.players[s.id]
    const age = ageOn(p.dob, c.w.date)
    if (s.mins <= 0 || age > 20 || seasonApps(p) > 1 || p.career.some((e) => e.clubId === c.club.id && e.apps > 0)) continue
    return { p, age }
  }
  return undefined
}
function firstGoal(c: Ctx) {
  for (const s of mine(c)) {
    if (!s.goals) continue
    const p = c.w.players[s.id]
    if (seasonGoals(p) === s.goals && !p.career.some((e) => e.clubId === c.club.id && e.goals > 0) && seasonApps(p) >= 3 && debutant(c)?.p.id !== p.id) return p
  }
  return undefined
}
const winsHere = (c: Ctx) => c.w.user.history.find((h) => h.clubId === c.club.id && !h.to)?.w || 0
/** How many of our players are about to join a national team (squads are called three days out). */
function intlAhead(c: Ctx) {
  return memo(c, 'intlAhead', () => {
    const soon = Object.values(c.w.fixtures).some((x) => !x.played && x.date > c.w.date && diffDays(x.date, c.w.date) <= 6 && c.w.clubs[x.home]?.national)
    return soon ? c.squad.filter((p) => (p.nationalCaps || 0) >= 8 && !p.injury).length : 0
  })
}

// ---------------------------------------------------------------- follow-ups
// A second question from the same reporter that picks up on what you just said: a topic's own follow-up first,
// then one keyed to the tone of the answer and the situation.
type Built = NonNullable<ReturnType<Build>>
const REF_TOPICS = new Set(['penaltyCall', 'redCard', 'refereeGame', 'strictRef', 'rivalReaction', 'oppRed'])
const TABLE_TOPICS = new Set(['titleRace', 'table', 'topClash', 'form', 'run', 'opener', 'europeRace', 'result', 'boardTarget'])
const ABOUT_OPP = new Set(['preview', 'favourite', 'oppManager', 'oppStyle', 'oppMissing', 'dangerMan', 'lastMeeting', 'oppForm', 'europeNight', 'exPlayer'])
function followFor(c: Ctx, t: Topic, q: Built, op: PressOption, rep: { reporter: string; outlet: string }): PressQuestion | undefined {
  let kind = t.id
  const mk = (x: { text: string; options: PressOption[] }): PressQuestion => ({ id: `f-${op.id}`, topic: `${t.id}-follow`, ...rep, text: x.text, options: x.options, playerId: op.effect.playerId ?? q.playerId, followKind: kind })
  const own = t.follow?.(c, op)
  if (own) return mk(own)
  // each kind of comeback at most once a conference, and rarely one you have heard in the last few
  const offered = memo(c, 'followOffered', () => new Set<string>())
  const lately: string[] = c.w.flags.pressFollow || []
  const ok = (k: string) => { if (offered.has(k) || (lately.includes(k) && c.rng.next() < 0.7)) return false; offered.add(k); kind = k; return true }
  const p = op.effect.playerId ? c.w.players[op.effect.playerId] : undefined
  const ours = p && p.clubId === c.club.id
  // criticised one of your players
  if (ours && (op.effect.player || 0) <= -4 && ok('criticisedPlayer')) return mk({
    text: pk(c, [`Have you said that to ${cn(p)} directly?`, `Is ${cn(p)} going to lose his place?`, `Isn't criticising ${cn(p)} in public a risk?`]),
    options: [
      o(c, 'Critical', ['He knows. I say the same things to his face.', 'My door is open. So is the bench.'], { player: -3, playerId: p.id, team: 1, brand: 1 }),
      o(c, 'Measured', ['We talk every day. He knows exactly what I expect from him.'], { player: 1, playerId: p.id }),
      o(c, 'Humble', ['Maybe that came out harder than I meant. He is an important player for us.'], { player: 4, playerId: p.id, brand: -1 }),
    ],
  })
  // praised one of your players
  if (ours && (op.effect.player || 0) >= 5) {
    const age = ageOn(p.dob, c.w.date)
    if (!c.club.national && (p.nationalCaps || 0) < 5 && age <= 29 && p.ovr >= 72 && ok('callUp')) return mk({
      text: pk(c, [`Should ${cn(p)} be in the ${p.nation} squad?`, `Is ${cn(p)} ready for international football?`, `Does the ${p.nation} coach need to be watching ${cn(p)}?`]),
      options: [
        o(c, 'Bold', [`If he isn't in the next squad, I will be very surprised.`, 'He is ready. Anyone who watches him can see it.'], { player: 4, playerId: p.id, brand: 1 }),
        o(c, 'Measured', ['That is for the national coach to decide. He just has to keep playing like this.'], { player: 1, playerId: p.id }),
        o(c, 'Joke', [`I hope they don't notice. I want him fresh for us.`], { player: 2, playerId: p.id, brand: 1 }),
      ],
    })
    if (!c.club.national && p.value >= 20e6 && ok('keepHim')) return mk({
      text: pk(c, [`Playing like that, the biggest clubs will be watching ${cn(p)}. Can you keep him?`, `Is ${cn(p)} for sale at any price?`]),
      options: [
        o(c, 'Defiant', ['He is going nowhere. He is happy here and he is ours.'], { player: 3, playerId: p.id, team: 1, brand: 1 }),
        o(c, 'Measured', ['He has a contract and he loves this club. I do not worry about it.'], { player: 1, playerId: p.id }),
        o(c, 'Joke', ['Tell them the price went up again today.'], { player: 2, playerId: p.id, brand: 1 }),
      ],
    })
  }
  // called the whole squad out
  if (op.tone === 'Critical' && (op.effect.team || 0) <= -3 && ok('dressingRoom')) return mk({
    text: pk(c, ['Is anyone going to lose their place?', 'Strong words. Is the dressing room still with you?', 'Is that a message to specific players?']),
    options: [
      o(c, 'Critical', [`Nobody's shirt is guaranteed. That goes for everyone.`], { team: -1, brand: 1 }),
      o(c, 'Measured', ['The dressing room is fine. This is honesty, not a crisis.'], { team: 3 }),
      o(c, 'Defiant', ['The dressing room is with me. Ask them.'], { team: 2, brand: 1 }),
    ],
  })
  // a go at the officials
  if (op.tone === 'Critical' && REF_TOPICS.has(t.id) && /referee|decision|penalty|red card|cards/i.test(op.text) && ok('fine')) return mk({
    text: pk(c, ['Are you worried about a fine for those comments?', ...(c.kind === 'post' ? ['Will you be asking the referees for an explanation?'] : ['Is that pressure on the referee before a ball is kicked?'])]),
    options: [
      o(c, 'Defiant', ['Fine me. Somebody has to say it.'], { team: 2, brand: 2, rep: -0.2 }),
      o(c, 'Humble', ['I will choose my words more carefully. Emotions were high.'], { rep: 0.1 }),
      o(c, 'Deflect', ['I have said what I wanted to say.'], {}),
    ],
  })
  // dodged it
  if (op.tone === 'Deflect' && ok('notAnAnswer')) return mk({
    text: pk(c, [`With respect, that isn't really an answer.`, 'Come on, give us something.', 'The supporters would like a proper answer to that.']),
    options: [
      o(c, 'Measured', ['Fine. We are ready, and you will see it on the pitch.', 'All right: we know what we want to do and the players are ready.'], { team: 1, brand: 1 }),
      o(c, 'Deflect', ['That is all you get from me today.'], { brand: -2, rep: -0.05 }),
      o(c, 'Joke', ['Nice try. Next question.'], { brand: 1 }),
    ],
  })
  // a joke on a bad day
  if (op.tone === 'Joke' && c.kind === 'post' && c.lost && ok('jokeAfterLoss')) return mk({
    text: pk(c, ['You are joking after a defeat. Is that the right message for the supporters?', 'Is this really the day for jokes?']),
    options: [
      o(c, 'Humble', [`You're right. The fans deserved better today and I apologise.`], { brand: 2 }),
      o(c, 'Defiant', [`If I can't smile, I can't lead. The work is serious; I don't need to be.`], { team: 1, brand: -1 }),
      o(c, 'Measured', ['It was not a joke about the result. Nobody is hurting more than me.'], { team: 1 }),
    ],
  })
  // talking big before facing a stronger side
  if ((op.tone === 'Defiant' || op.tone === 'Confident' || op.tone === 'Bold') && c.kind === 'pre' && c.x.strengthGap < -2 && ok('arrogant')) return mk({
    text: pk(c, [`Isn't that a little arrogant against a side like ${c.opp.short}?`, 'And if it goes wrong tomorrow?', `${c.opp.short} will read that. Are you giving them extra motivation?`]),
    options: [
      o(c, 'Defiant', ['Call it what you like. I believe in my players.'], { team: 2, brand: 1, opponent: 1 }),
      o(c, 'Humble', ['It is not arrogance, it is belief. There is a difference, and I respect them a lot.'], { team: 1, rep: 0.05 }),
      o(c, 'Joke', [`If it goes wrong, I'm sure you'll remind me.`], { brand: 1 }),
    ],
  })
  // confident, with a leader to chase
  const top = leader(c)
  if ((op.tone === 'Confident' || op.tone === 'Bold') && TABLE_TOPICS.has(t.id) && top && top.id !== c.club.id && top.id !== c.opp.id && (c.x.gapTop ?? 99) <= 9 && (c.x.played || 0) >= 6 && ok('leader')) return mk({
    text: pk(c, [`Any message for ${top.short} at the top?`, `Should ${top.short} be looking over their shoulder?`]),
    options: [
      o(c, 'Bold', [`Keep looking over your shoulder. We're coming.`], { team: 2, brand: 2, rep: 0.05 }),
      o(c, 'Measured', ['No message. We look after ourselves.'], { team: 1 }),
      o(c, 'Praise', ['They are the team to catch. Credit to them, they have been very consistent.'], { rep: 0.05 }),
    ],
  })
  // playing it down when there is plenty to be proud of
  if (op.tone === 'Humble' && (c.kind === 'pre' ? c.x.strengthGap > 2 : c.won && c.gf - c.ga >= 2) && ok('underselling')) return mk({
    text: pk(c, [`Aren't you underselling this team?`, 'Your players might want to hear you say how good they are.', 'Is that false modesty?', 'Why so cautious? The numbers say this team is very good.']),
    options: [
      o(c, 'Confident', ['Maybe. But inside that dressing room nobody undersells anything.'], { team: 3 }),
      o(c, 'Measured', ['I prefer to be judged in May, not today.'], { team: 1 }),
    ],
  })
  // a lot of respect for the favourites' opponents
  if (op.tone === 'Praise' && c.kind === 'pre' && !p && c.x.strengthGap > 2 && ABOUT_OPP.has(t.id) && ok('tooMuchRespect')) return mk({
    text: pk(c, [`Are you giving ${c.opp.short} too much respect?`, 'So you would take a draw?']),
    options: [
      o(c, 'Confident', ['Respect, not fear. We go to win.'], { team: 2, brand: 1 }),
      o(c, 'Measured', ['I respect every opponent. It does not change what we want.'], { team: 1 }),
    ],
  })
  // a flat answer after a big win
  if (op.tone === 'Measured' && c.kind === 'post' && c.won && (c.f.derby || c.x.final || c.x.semi || c.gf - c.ga >= 3) && ok('enjoy')) return mk({
    text: pk(c, ['Come on, you must be enjoying this one a little?', 'Will you allow yourself a celebration tonight?']),
    options: [
      o(c, 'Joke', ['Maybe one glass. Then the videos.'], { team: 2, brand: 1 }),
      o(c, 'Praise', ['Tonight is for the players and the supporters. They have earned it.'], { team: 2, brand: 2 }),
      o(c, 'Measured', ['I enjoy it on the inside. Tomorrow we start again.'], { team: 1 }),
    ],
  })
  return undefined
}


function reporter(w: World, rng: Rng) {
  const c = w.clubs[w.userClubId]
  const o = OUTLETS[c.country] || OUTLETS._
  return { reporter: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, outlet: rng.pick(o) }
}

/** QA scripts set this to surface errors that the game itself swallows (a broken topic is skipped, not fatal). */
const pressDebug = () => !!(globalThis as { __pressDebug?: boolean }).__pressDebug

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
    pre: (w.flags.pressLog || {})[fixtureId], games: hist ? hist.p - (kind === 'post' ? 1 : 0) : 0, m: new Map(),
  }
  const topics = kind === 'pre' ? [...PRE, ...PRE_MORE] : [...POST, ...POST_MORE]
  const recent: string[] = w.flags.pressRecent || []
  const scored = topics.map((t) => {
    let wt = 0
    try { wt = t.weight(c) } catch (e) { if (pressDebug()) throw e; wt = 0 }
    // what you were asked lately comes up again rarely; a big running storyline still can, just less often
    if (wt > 0 && recent.includes(t.id) && !t.always) wt *= wt < 12 ? 0.15 : 0.5
    return { t, wt: wt * (0.75 + rng.next() * 0.5) }
  }).filter((x) => x.wt > 0)
  const n = c.x.final || c.x.semi || c.bigMatch || (kind === 'post' && (c.x.final || pens)) ? 5 : 4
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
  let follows = 0
  for (const t of picked) {
    let q: ReturnType<Build>
    try { q = t.build(c) } catch (e) { if (pressDebug()) throw e; q = undefined }
    if (!q || !q.options.length) continue
    // bold claims get a follow-up from the same reporter
    const rep = reporter(w, rng)
    for (const op of q.options) {
      if (op.effect.promise === 'win' || op.effect.promise === 'title' || op.effect.promise === 'trophy') {
        op.followUp = {
          id: `f-${op.id}`, topic: `${t.id}-follow`, ...rep,
          text: pk(c, ['Bold words. Are you guaranteeing it?', 'Is that a promise to the supporters?', 'You realise that headline will be everywhere tomorrow?']),
          options: [
            o(c, 'Bold', ['Yes. Write it down.', 'Guaranteed. I believe in this group.'], { team: 2, brand: 2, rep: 0.1, promise: op.effect.promise }),
            o(c, 'Measured', ['It is a belief, not a guarantee. But I do believe it.'], { team: 1 }),
            o(c, 'Joke', ['Ask me again after the game. I might have changed my mind.'], { team: 1, brand: 1 }),
          ],
        }
      }
    }
    // and some answers draw a follow-up of their own (a couple per conference, never on top of a promise)
    if (follows < (n >= 5 ? 3 : 2) && rng.next() < 0.6) {
      let any = false
      for (const op of q.options) {
        if (op.followUp) continue
        let fq: PressQuestion | undefined
        try { fq = followFor(c, t, q, op, rep) } catch (e) { if (pressDebug()) throw e; fq = undefined }
        if (fq) { op.followUp = fq; any = true }
      }
      if (any) follows++
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
  let promiseWin = false, promiseQuote = '', promiseScore = false, stopId: number | undefined
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
    if (o.effect.promise === 'win' || o.effect.promise === 'trophy') { promiseWin = true; promiseQuote = o.quote.replace(/^"|"$/g, '') }
    if (o.effect.promise === 'title') (w.flags.pressPromises ||= {}).title = w.season
    if (o.effect.promise === 'score') promiseScore = true
    if (o.effect.stopId) stopId = o.effect.stopId
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
  // what was promised and who was talked up or down, so the post-match conference can hold you to it
  if (kind === 'pre') ((w.flags.pressLog ||= {}) as Record<string, unknown>)[fixtureId] = { promiseWin, quote: promiseQuote, date: w.date, promiseScore, stopId, backed: [...personal].filter(([id, d]) => Math.abs(d) >= 4 && w.players[id]?.clubId === club.id).map(([id, d]) => [id, Math.sign(d)]) }
  const recent: string[] = (w.flags.pressRecent ||= [])
  for (const q of questions) recent.push(q.topic)
  if (recent.length > 24) recent.splice(0, recent.length - 24)
  // follow-up kinds asked lately, so the same comeback doesn't come every week
  const fk: string[] = (w.flags.pressFollow ||= [])
  for (const q of questions) if (q.followKind && answers[q.id]) fk.push(q.followKind)
  if (fk.length > 8) fk.splice(0, fk.length - 8)
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
