// Player conversations built from the player's actual situation: how long since he last started, whether he was
// dropped after playing well, his form, contract, role, promises made and broken, interest from other clubs, how the
// team is doing and his personality. Prompts are composed from those facts, and the options offered fit the moment
// (a cup tie next week, an injured rival for his place, a contract nearly up).
import type { Conversation, Fixture, Player, World } from '../../domain/types'
import { Rng } from '../../domain/rng'
import { ageOn, diffDays, fmtDate } from '../../domain/dates'
import { POS_GROUP, ROLE_EXPECTED_SHARE } from '../../domain/constants'
import { rosterOf } from './roster'
import { yearsLeft } from './transfers'
import { clubForm, minutesShare } from './morale'

export interface ConvContext {
  p: Player
  age: number
  role: string
  expShare: number
  share: number
  /** club matches in a row without starting (from the most recent) */
  benchRun: number
  lastStart?: string
  weeksSinceStart?: number
  startsRecent: number
  games: number
  mins: number
  avgForm?: number
  goodThenDropped: boolean
  slump: boolean
  yl: number
  broken: number
  activePromise: boolean
  refused: boolean
  suitor?: number
  clubForm: number
  hot: boolean
  pro: boolean
  loyal: boolean
  ambitious: boolean
  intl: boolean
  nextCup?: Fixture
  injuredRival?: Player
}

/** Club-level facts shared by every conversation check on a day (computed once). */
export interface ClubDay { upcoming: Fixture[]; squad: Player[] }
const dayCache = new WeakMap<World, { key: string; v: ClubDay }>()
function clubDay(w: World, clubId: number): ClubDay {
  const key = `${w.date}:${clubId}`
  const c = dayCache.get(w)
  if (c && c.key === key) return c.v
  const upcoming: Fixture[] = []
  for (const f of Object.values(w.fixtures)) if (!f.played && (f.home === clubId || f.away === clubId) && f.date >= w.date && diffDays(f.date, w.date) <= 14) upcoming.push(f)
  upcoming.sort((a, b) => a.date.localeCompare(b.date))
  const v = { upcoming, squad: rosterOf(w, clubId) }
  dayCache.set(w, { key, v })
  return v
}

export function convContext(w: World, p: Player): ConvContext {
  const mins = p.recentMins || []
  let benchRun = 0
  for (let i = mins.length - 1; i >= 0 && mins[i] < 60; i--) benchRun++
  const fr = p.formRatings || []
  const avgForm = fr.length ? fr.reduce((a, b) => a + b, 0) / fr.length : undefined
  const earlier = mins.slice(0, Math.max(0, mins.length - 3))
  const goodThenDropped = mins.length >= 6 && earlier.length >= 3 && earlier.slice(-3).every((m) => m >= 60) && benchRun >= 2 && (avgForm ?? 6.5) >= 6.9
  const club = w.clubs[p.clubId]
  const day = clubDay(w, p.clubId)
  const nextCup = day.upcoming.find((f) => w.competitions[f.compId]?.format === 'cup')
  const group = POS_GROUP[p.positions[0]]
  const injuredRival = day.squad.filter((q) => q.id !== p.id && POS_GROUP[q.positions[0]] === group && q.injury && q.ovr >= p.ovr && diffDays(q.injury.until, w.date) >= 10).sort((a, b) => b.ovr - a.ovr)[0]
  const suitor = (p.interestedClubs || []).map((id) => w.clubs[id]).filter((c) => c && c.id !== p.clubId && c.reputation >= (club?.reputation || 0) - 5).sort((a, b) => b.reputation - a.reputation)[0]?.id
  return {
    p, age: ageOn(p.dob, w.date), role: p.contract.role, expShare: ROLE_EXPECTED_SHARE[p.contract.role] || 0.4, share: minutesShare(w, p),
    benchRun, lastStart: p.lastStart, weeksSinceStart: p.lastStart ? Math.floor(diffDays(w.date, p.lastStart) / 7) : undefined,
    startsRecent: mins.slice(-5).filter((m) => m >= 60).length, games: mins.length, mins: mins.reduce((a, b) => a + b, 0), avgForm,
    goodThenDropped, slump: fr.length >= 4 && fr.slice(-4).every((r) => r < 6.3),
    yl: yearsLeft(w, p), broken: w.promises.filter((x) => x.playerId === p.id && x.status === 'broken').length,
    activePromise: w.promises.some((x) => x.playerId === p.id && x.status === 'active'), refused: !!w.flags.transferRefused?.[p.id],
    suitor, clubForm: clubForm(w, p.clubId), hot: p.hidden.temperament > 68, pro: p.hidden.professionalism > 65, loyal: p.hidden.loyalty > 70, ambitious: p.hidden.ambition > 70,
    intl: p.intlRep >= 3, nextCup, injuredRival,
  }
}

type Draft = Omit<Conversation, 'id' | 'opened'>
const vs = (w: World, f: Fixture, clubId: number) => w.clubs[f.home === clubId ? f.away : f.home]?.short

/** Decide whether this player wants a word today, and what about. */
export function buildConversation(w: World, p: Player, rng: Rng): Draft | null {
  // cheap gate first: most players have nothing to raise on most days
  const yl0 = yearsLeft(w, p)
  const young = ageOn(p.dob, w.date) <= 21 && p.pot - p.ovr >= 8
  const worth = p.morale < 58 || (yl0 <= 1 && (p.contract.role === 'Crucial' || p.contract.role === 'Important')) || young || (p.interestedClubs?.length && p.morale < 75) || p.morale > 88 || (p.formRatings || []).length >= 4
  if (!worth || rng.next() < 0.5) return null
  const c = convContext(w, p)
  if (c.activePromise) return null
  const R = <T,>(a: T[]) => rng.pick(a)
  // memory: what we talked about last time, and what the manager said
  const prev = [...w.conversations].reverse().find((x) => x.playerId === p.id && x.resolved)
  const prevOpt = prev?.options.find((o) => o.id === prev.choice)
  const again = (kinds: string[]) => {
    if (!prev || !kinds.includes(prev.kind)) return ''
    const when = fmtDate(prev.opened, 'month')
    if (prevOpt?.effect === 'earn') return R([`You told me in ${when} to earn my place. I have been working, and nothing has changed.`, `Last time you said keep working. I have.`])
    if (prevOpt?.effect === 'promiseCup' || prevOpt?.effect === 'promiseCupNext') return R([`I got my cup games, but that's not enough.`, `The cup games were fine, but I need more than that.`])
    return R([`We spoke about this in ${when}.`, `I'm raising this again because nothing has changed since ${when}.`])
  }
  const opp = (f?: Fixture) => (f ? vs(w, f, p.clubId) : '')
  const sample = c.games >= 4

  // 1. wants out
  if (p.morale < 22 && rng.next() < 0.3) {
    const why = c.broken ? R([`You made me a promise and didn't keep it.`, `I trusted what you told me before, and nothing changed.`]) : c.benchRun >= 6 ? R([`I haven't started a game in ${c.benchRun} matches.`, `It's been ${c.weeksSinceStart ?? c.benchRun} weeks since I started.`]) : c.suitor ? R([`${w.clubs[c.suitor].short} want me, and I want to go.`, `There's interest from ${w.clubs[c.suitor].short} and I'd like to speak to them.`]) : R([`I'm not happy here, and I don't see it changing.`, `My head isn't here any more.`])
    const ask = c.hot ? R([`Put me on the list. I'm done.`, `I want to leave. This window.`]) : R([`I'm asking to be transfer listed.`, `I'd like the club to accept offers for me.`, `I think it's best for everyone if I move on.`])
    return {
      playerId: p.id, kind: 'Transfer Request', prompt: `${c.pro ? 'Boss, I\'ve thought about this carefully. ' : ''}${why} ${ask}`,
      options: [
        { id: 'list', text: 'I understand. We will listen to offers.', effect: 'list' },
        { id: 'role', text: c.injuredRival ? `With ${c.injuredRival.name} out, the place is yours. Stay and take it.` : 'Stay, and I promise you a bigger role in this team.', effect: 'promiseRole' },
        ...(c.yl <= 2 ? [{ id: 'contract', text: 'Let us talk about a new contract instead.', effect: 'openRenewal' }] : []),
        { id: 'refuse', text: 'You are under contract. You are going nowhere.', effect: 'refuse' },
      ],
    }
  }
  // 2. dropped after playing well: a different conversation from being a bench player
  if (sample && c.goodThenDropped && p.morale < 70 && !p.injury && rng.next() < 0.3) {
    const form = c.avgForm ? `I was averaging ${c.avgForm.toFixed(1)} and then I'm out.` : `I was playing well and then I'm out.`
    return {
      playerId: p.id, kind: 'Dropped', prompt: `${c.hot ? 'I need to understand this. ' : 'Can I ask you something? '}${form} ${R([`What did I do wrong?`, `Nobody told me why.`, `I thought I'd earned my place.`])}`,
      options: [
        { id: 'rotate', text: 'It was rotation, nothing more. You are back in the side soon.', effect: 'promiseStarts' },
        { id: 'tactic', text: 'It was a tactical call for those opponents. You are still important to me.', effect: 'reassure' },
        ...(c.nextCup ? [{ id: 'cup', text: `You'll start against ${opp(c.nextCup)} on ${fmtDate(c.nextCup.date, 'dm')}.`, effect: 'promiseCupNext' }] : []),
        { id: 'earn', text: 'The others are playing well too. Keep pushing.', effect: 'earn' },
      ],
    }
  }
  // 3. long-term bench: severity decides the tone
  if (sample && c.share < c.expShare - 0.28 && p.morale < 58 && !p.injury && rng.next() < 0.35) {
    const long = c.benchRun >= 8
    const detail = long
      ? R([`I haven't started for ${c.weeksSinceStart != null && c.weeksSinceStart >= 4 ? `${c.weeksSinceStart} weeks` : `${c.benchRun} matches`}.`, `${c.mins} minutes in our last ${c.games} games. That's not football, that's watching.`])
      : R([`${c.mins} minutes in our last ${c.games} games.`, `I've barely featured recently.`, `I've been on the bench for the last few games.`])
    const why = c.role === 'Crucial' ? R([`I was brought here to be a key player.`, `I'm supposed to be one of the first names on the team sheet.`]) : c.role === 'Important' ? R([`I was told I'd be an important part of this team.`, `When I signed, I was promised regular football.`]) : c.age <= 22 ? `I'm at an age where I need to play.` : ''
    const ask = c.hot ? R([`Something has to change.`, `I'm not going to sit here quietly.`]) : R([`What do I have to do to get in the side?`, `I want to be playing more.`, `I need to know where I stand.`])
    const context = c.clubForm >= 3 ? R([`I know the team is winning, but I can help too.`, `I'm happy for the lads, but I want to be part of it.`]) : c.clubForm <= -2 ? R([`We're struggling. I think I can help turn it around.`, `Results aren't coming. Give me a chance to change that.`]) : ''
    const intl = c.intl && long ? R([`My place in the national team is at risk.`, `The national coach wants me playing every week.`]) : ''
    const opts: Draft['options'] = [
      { id: 'promise', text: 'You will start more matches over the next month.', effect: 'promiseStarts' },
    ]
    if (c.injuredRival) opts.push({ id: 'chance', text: `With ${c.injuredRival.name} injured, this is your chance.`, effect: 'reassure' })
    if (c.nextCup) opts.push({ id: 'cupnext', text: `You'll start in the cup against ${opp(c.nextCup)}.`, effect: 'promiseCupNext' })
    else opts.push({ id: 'cup', text: 'You will get your chances in the cups.', effect: 'promiseCup' })
    opts.push({ id: 'earn', text: 'Keep working hard in training and earn your place.', effect: 'earn' })
    if (c.age <= 24 || long) opts.push({ id: 'loan', text: 'A loan move might be best for you.', effect: 'loanList' })
    return {
      playerId: p.id, kind: long ? 'No Football' : 'Playing Time',
      prompt: [c.hot && long ? R(['Boss, this is getting ridiculous.', "I'm not going to pretend I'm fine with this.", 'I need to get something off my chest.', 'This has gone on long enough.']) : '', again(['Playing Time', 'No Football', 'Dropped']), detail, why, context, intl, c.broken ? 'And last time I was promised things that never happened.' : '', ask].filter(Boolean).join(' '),
      options: opts.slice(0, 4),
    }
  }
  // 4. a suitor has appeared
  if (c.suitor && p.morale < 75 && c.ambitious && !c.refused && rng.next() < 0.08) {
    const club = w.clubs[c.suitor]
    return {
      playerId: p.id, kind: 'Interest',
      prompt: `${R([`My agent tells me ${club.name} are interested.`, `I've heard ${club.short} want to sign me.`])} ${c.loyal ? `I'm happy here, but I have to think about my career.` : `A move like that doesn't come around often.`} ${R(['What do you think?', 'Where do I stand?'])}`,
      options: [
        { id: 'key', text: 'You are key to what we are building. You stay.', effect: 'reassure' },
        { id: 'contract', text: "Let's show you how much we value you: new contract talks.", effect: 'openRenewal' },
        { id: 'listen', text: 'If the offer is right, we will listen.', effect: 'list' },
      ],
    }
  }
  // 5. contract running down
  if (c.yl <= 1 && (c.role === 'Crucial' || c.role === 'Important') && rng.next() < 0.12) {
    const lead = c.suitor ? `Other clubs are asking my agent about my situation, ${w.clubs[c.suitor].short} among them.` : R([`My contract runs out at the end of the season.`, `I'm into the last year of my deal.`])
    const want = c.loyal ? R([`I'd love to stay.`, `This is my club. I want to stay.`]) : c.ambitious ? R([`I want to know the club's ambitions before I commit.`, `I need to know we're going to compete.`]) : `I'd like to know where I stand.`
    return {
      playerId: p.id, kind: 'Contract', prompt: `${lead} ${want} ${R(['Are you going to offer me a new deal?', 'Is there a plan for me beyond this season?'])}`,
      options: [
        { id: 'talks', text: "Absolutely. Let's open talks now.", effect: 'openRenewal' },
        { id: 'promise', text: 'You will get a new contract before the end of the season.', effect: 'promiseContract' },
        { id: 'later', text: "We'll discuss it when the time is right.", effect: 'later' },
      ],
    }
  }
  // 6. young player needs football
  if (sample && c.age <= 21 && p.pot - p.ovr >= 8 && c.share < 0.12 && rng.next() < 0.1) {
    return {
      playerId: p.id, kind: 'Development',
      prompt: `${again(['Development']) ? `${again(['Development'])} ` : ''}${R([`I want to keep improving and I need minutes.`, `Training with the first team is great, but I need matches.`, `I feel ready for senior football every week.`, `I'm ${c.age}. Players my age are playing every week somewhere.`])} ${c.mins === 0 ? `I haven't played a minute in our last ${c.games} games.` : `${c.mins} minutes in ${c.games} games isn't enough at my age.`} ${R(['Could I go out on loan to play regular first-team football?', 'Would you consider a loan somewhere I will play?'])}`,
      options: [
        { id: 'loan', text: 'Good idea. We will find you the right loan.', effect: 'loanList' },
        c.nextCup ? { id: 'cupnext', text: `Stay: you'll start against ${opp(c.nextCup)} in the cup.`, effect: 'promiseCupNext' } : { id: 'stay', text: 'Stay and fight: you will get cup minutes.', effect: 'promiseCup' },
        { id: 'no', text: 'You are part of my plans here.', effect: 'earn' },
      ],
    }
  }
  // 7. confidence: a run of poor games
  if (c.slump && c.startsRecent >= 3 && rng.next() < 0.07) {
    return {
      playerId: p.id, kind: 'Confidence',
      prompt: `${R([`I know I'm not at my best at the moment.`, `My last few games haven't been good enough, I know that.`])} ${c.hot ? `Everyone's on my back.` : `I'm working on it.`} ${R(['I just need to know you still believe in me.', 'Do I still have your backing?'])}`,
      options: [
        { id: 'back', text: 'You have my full backing. Keep playing your game.', effect: 'praise' },
        { id: 'rest', text: 'Take a breather: a game or two out will reset you.', effect: 'rest' },
        { id: 'demand', text: 'I need more from you. Show me in training.', effect: 'demand' },
      ],
    }
  }
  // 8. thanks
  if (p.morale > 88 && (p.formRatings || []).length >= 3 && p.formRatings.slice(-3).every((r) => r >= 7.6) && rng.next() < 0.08) {
    const goals = Object.values(p.season).reduce((a, s) => a + s.goals, 0)
    return {
      playerId: p.id, kind: 'Thanks',
      prompt: `${R([`I just wanted to say thanks for the trust you're showing in me.`, `Boss, I'm loving my football right now.`, `The way we're playing suits me perfectly.`])} ${goals >= 5 ? `${goals} goals already this season. ` : ''}${R([`I've never felt this sharp.`, `I wanted you to know I'm fully committed.`])}`,
      options: [
        { id: 'keep', text: 'You deserve it. Keep it up.', effect: 'praise' },
        { id: 'more', text: "Don't get complacent: there's more to come.", effect: 'demand' },
      ],
    }
  }
  return null
}
