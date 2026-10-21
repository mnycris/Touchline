// The assistant manager's view of the team, in plain words: which way of playing suits the players you have (from
// their attributes, against what is normal for players of their level in the same line), what needs fixing in the XI,
// and how to approach the next match (from the same prediction the match preview shows). Advice, not orders: every
// suggestion says why, and the manager can take it with one tap or ignore it.
import type { Fixture, Mentality, Player, Position, TeamSheet, World } from '../domain/types'
import { attr, posRating } from '../domain/ratings'
import { formationOf, POS_GROUP } from '../domain/constants'
import { buildSheet, isAvailable } from '../engine/match/selection'
import { predictFixture } from '../engine/match/predict'
import { callName } from '../engine/match/commentary'

// ---------------------------------------------------------------- what the players are good at
type Stat = 'pass' | 'long' | 'pace' | 'press' | 'def' | 'air' | 'cross'
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const STAT: Record<Stat, (p: Player) => number> = {
  pass: (p) => mean([attr(p, 'shortPassing'), attr(p, 'vision'), attr(p, 'ballControl'), attr(p, 'composure')]),
  long: (p) => mean([attr(p, 'longPassing'), attr(p, 'vision')]),
  pace: (p) => mean([attr(p, 'acceleration'), attr(p, 'sprintSpeed')]),
  press: (p) => mean([attr(p, 'stamina'), attr(p, 'aggression'), attr(p, 'acceleration')]),
  def: (p) => mean([attr(p, 'defAwareness'), attr(p, 'standingTackle'), attr(p, 'interceptions')]),
  air: (p) => mean([attr(p, 'heading'), attr(p, 'jumping'), attr(p, 'strength')]),
  cross: (p) => (attr(p, 'crossing') * 2 + attr(p, 'curve')) / 3,
}
const STATS = Object.keys(STAT) as Stat[]
/** Positions that ask the same things of a player: each is compared only with its own kind. */
type Fam = 'CB' | 'FB' | 'DM' | 'CM' | 'AM' | 'WM' | 'W' | 'ST'
const FAM: Partial<Record<Position, Fam>> = { CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB', CDM: 'DM', CM: 'CM', CAM: 'AM', LM: 'WM', RM: 'WM', LW: 'W', RW: 'W', ST: 'ST', CF: 'ST' }

/**
 * What is normal: for each position family and stat, the line through the world's players of that family (the stat
 * against the overall rating), so a player is measured against others of his kind and level, not a centre-back's
 * crossing against a full-back's or an elite player's stamina against a technical rating.
 */
const norms = new WeakMap<World, Record<Fam, Record<Stat, (ovr: number) => number>>>()
function normsOf(w: World) {
  let n = norms.get(w)
  if (n) return n
  const acc = {} as Record<Fam, { x: number[]; y: Record<Stat, number[]> }>
  for (const p of Object.values(w.players)) {
    const fam = FAM[p.positions[0]]
    if (!fam || p.ovr < 55) continue
    const a = (acc[fam] ||= { x: [], y: {} as Record<Stat, number[]> })
    a.x.push(p.ovr)
    for (const st of STATS) (a.y[st] ||= []).push(STAT[st](p))
  }
  n = {} as Record<Fam, Record<Stat, (ovr: number) => number>>
  for (const fam of Object.keys(acc) as Fam[]) {
    const { x, y } = acc[fam]
    n[fam] = {} as Record<Stat, (ovr: number) => number>
    for (const st of STATS) n[fam][st] = quadFit(x, y[st])
  }
  norms.set(w, n)
  return n
}

/** Least squares a + b·x + c·x² (attributes flatten out toward the top of the rating scale, so a line won't do). */
function quadFit(x: number[], y: number[]): (v: number) => number {
  const mx = mean(x)
  const u = x.map((v) => (v - mx) / 10)
  const S = (f: (i: number) => number) => x.reduce((a, _, i) => a + f(i), 0)
  const m = [[x.length, S((i) => u[i]), S((i) => u[i] ** 2)], [S((i) => u[i]), S((i) => u[i] ** 2), S((i) => u[i] ** 3)], [S((i) => u[i] ** 2), S((i) => u[i] ** 3), S((i) => u[i] ** 4)]]
  const r = [S((i) => y[i]), S((i) => u[i] * y[i]), S((i) => u[i] ** 2 * y[i])]
  // Cramer's rule on the 3×3 normal equations
  const det = (a: number[][]) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  const d = det(m)
  if (!d) { const my = mean(y); return () => my }
  const col = (k: number) => m.map((row, i) => row.map((v, j) => (j === k ? r[i] : v)))
  const [a0, a1, a2] = [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d]
  return (v) => { const t = (v - mx) / 10; return a0 + a1 * t + a2 * t * t }
}

// ---------------------------------------------------------------- ways of playing
type Group = 'DEF' | 'CB' | 'MID' | 'ATT' | 'FWD' | 'WIDE' | 'ALL'
const IN: Record<Group, (pos: Position) => boolean> = {
  DEF: (p) => POS_GROUP[p] === 'DEF', CB: (p) => p === 'CB', MID: (p) => POS_GROUP[p] === 'MID', ATT: (p) => POS_GROUP[p] === 'ATT',
  FWD: (p) => p === 'ST' || p === 'CF', WIDE: (p) => ['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'LW', 'RW'].includes(p), ALL: (p) => p !== 'GK',
}
const WHO: Record<Group, string> = { DEF: 'defenders', CB: 'centre-backs', MID: 'midfielders', ATT: 'forwards', FWD: 'strikers', WIDE: 'wide players', ALL: 'players' }

interface Term { g: Group; s: Stat; w: number; good: string; weak: string }
/** What each way of playing asks of the players, and what to say when the squad has it or lacks it. */
const STYLES: Record<string, Term[]> = {
  Possession: [
    { g: 'MID', s: 'pass', w: 2, good: 'keep the ball better than most at this level', weak: 'Your midfielders lose the ball too easily for a passing game' },
    { g: 'DEF', s: 'pass', w: 1, good: 'are comfortable playing out from the back', weak: 'Your defenders aren’t comfortable on the ball, so playing out from the back is risky' },
    { g: 'ATT', s: 'pass', w: 1, good: 'link the play well', weak: 'Your forwards don’t hold the ball up well enough for a patient game' },
  ],
  Gegenpress: [
    { g: 'ALL', s: 'press', w: 2, good: 'have the legs and the bite to press all game', weak: 'This squad will tire pressing all game: expect it to fade late on' },
    { g: 'CB', s: 'pace', w: 1, good: 'are quick enough to defend a high line', weak: 'Your centre-backs aren’t quick: with a high line, balls over the top will hurt' },
  ],
  'Counter-Attack': [
    { g: 'ATT', s: 'pace', w: 2, good: 'are quick: space behind a defence suits them', weak: 'Your forwards lack the pace to make a counter-attack count' },
    { g: 'MID', s: 'long', w: 1, good: 'pick the early pass forward', weak: 'Your midfield doesn’t look for the early pass forward' },
    { g: 'DEF', s: 'def', w: 1, good: 'defend well when the opponent has the ball', weak: 'Your defenders will be under pressure for long spells' },
  ],
  Direct: [
    { g: 'FWD', s: 'air', w: 2, good: 'win the ball in the air: long balls have a target', weak: 'There is no target up front: long balls will mostly come straight back' },
    { g: 'DEF', s: 'long', w: 1, good: 'hit long passes well', weak: 'Your defenders’ long passing is loose' },
    { g: 'ATT', s: 'pace', w: 0.5, good: 'chase the ball over the top', weak: 'Your forwards are slow to chase the ball over the top' },
  ],
  'Wing Play': [
    { g: 'WIDE', s: 'cross', w: 2, good: 'cross the ball well', weak: 'Your wide players don’t cross well enough to live off the flanks' },
    { g: 'FWD', s: 'air', w: 1, good: 'attack the ball in the box', weak: 'Your strikers don’t win many headers: crosses will mostly be cleared' },
  ],
  'Park the Bus': [
    { g: 'DEF', s: 'def', w: 2, good: 'defend the box well', weak: 'Your defenders aren’t strong enough to sit deep all game' },
    { g: 'DEF', s: 'air', w: 1, good: 'deal with crosses', weak: 'Your defence will struggle with balls into the box' },
    { g: 'FWD', s: 'air', w: 0.5, good: 'can hold the ball up alone', weak: 'Nobody up front can hold the ball up on their own' },
  ],
}
export const STYLE_ORDER = ['Balanced', 'Possession', 'Gegenpress', 'Counter-Attack', 'Direct', 'Wing Play', 'Park the Bus']

export interface StyleFit {
  name: string
  /** how much better than normal the squad is at what the style needs, in attribute points (0: an ordinary fit) */
  score: number
  stars: number
  /** why it suits, naming the players who make it work */
  why: string
  /** the squad's biggest gap for it, when it has one */
  weak?: string
}

/** The XI's players in their slots. */
function xiOf(w: World, s: TeamSheet) {
  const f = formationOf(s.formation)
  return s.lineup.map((id, i) => ({ p: w.players[id], pos: f.slots[i].pos })).filter((x): x is { p: Player; pos: Position } => !!x.p)
}

type Delta = (x: { p: Player; pos: Position }, st: Stat) => number
const deltaOf = (w: World): Delta => {
  const nm = normsOf(w)
  return (x, st) => { const f = nm[FAM[x.pos] as Fam]?.[st]; return f ? STAT[st](x.p) - f(x.p.ovr) : 0 }
}

/** Each term of each style for one XI: how far its players are above or below what is normal, in attribute points. */
function termValues(xi: { p: Player; pos: Position }[], delta: Delta) {
  const out: Record<string, (number | undefined)[]> = {}
  for (const [name, terms] of Object.entries(STYLES)) {
    out[name] = terms.map((t) => { const grp = xi.filter((x) => IN[t.g](x.pos)); return grp.length ? mean(grp.map((x) => delta(x, t.s))) : undefined })
  }
  return out
}

/**
 * Where other squads stand on the same terms, so a squad is judged against squads, not in the abstract: being "good
 * at keeping the ball" means better at it than most teams are. From the world's clubs at a professional level, once.
 */
const spread = new WeakMap<World, Record<string, [number, number][]>>()
function spreadOf(w: World, delta: Delta) {
  let sp = spread.get(w)
  if (sp) return sp
  const acc: Record<string, number[][]> = {}
  for (const c of Object.values(w.clubs)) {
    const s = c.sheets?.[0]
    if (c.national || !s || (c.squadAvg || 0) < 62) continue
    const tv = termValues(xiOf(w, s), delta)
    for (const [name, vs] of Object.entries(tv)) vs.forEach((v, i) => { if (v != null) ((acc[name] ||= [])[i] ||= []).push(v) })
  }
  sp = {}
  for (const [name, cols] of Object.entries(acc)) {
    sp[name] = cols.map((xs) => { const m = mean(xs); return [m, Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1] })
  }
  spread.set(w, sp)
  return sp
}

/** How each way of playing suits this XI. Balanced is the neutral base: an ordinary fit for any squad. */
export function styleFits(w: World, s: TeamSheet): StyleFit[] {
  const delta = deltaOf(w)
  const sp = spreadOf(w, delta)
  const xi = xiOf(w, s)
  const tv = termValues(xi, delta)
  const out: StyleFit[] = [{ name: 'Balanced', score: 0, stars: 3, why: 'Suits any squad: a sound base to change from.' }]
  for (const [name, terms] of Object.entries(STYLES)) {
    let sum = 0, wsum = 0, best: { t: Term; z: number } | undefined, worst: { t: Term; z: number } | undefined
    terms.forEach((t, i) => {
      const v = tv[name][i], ref = sp[name]?.[i]
      if (v == null || !ref) return
      // in other squads' spreads: 1 is better than about five teams in six
      const z = (v - ref[0]) / ref[1]
      sum += z * t.w; wsum += t.w
      if (!best || z * t.w > best.z * best.t.w) best = { t, z }
      if (!worst || z < worst.z) worst = { t, z }
    })
    if (!wsum || !best) continue
    const score = sum / wsum
    const stars = score >= 1 ? 5 : score >= 0.4 ? 4 : score >= -0.4 ? 3 : score >= -1 ? 2 : 1
    const b = best as { t: Term; z: number }
    const names = xi.filter((x) => IN[b.t.g](x.pos)).map((x) => ({ p: x.p, d: delta(x, b.t.s) })).filter((x) => x.d > 0)
      .sort((a, c) => c.d - a.d).slice(0, b.t.g === 'ALL' ? 3 : 2).map((x) => callName(x.p.name))
    const why = b.z > 0.2 && names.length ? `${listOf(names)} ${names.length > 1 || b.t.g === 'ALL' ? b.t.good : singular(b.t.good)}.` : 'Nothing in this XI stands out for it.'
    const wk = worst as { t: Term; z: number } | undefined
    out.push({ name, score, stars, why, weak: wk && wk.z < -0.9 ? `${wk.t.weak}.` : undefined })
  }
  return out.sort((a, b) => STYLE_ORDER.indexOf(a.name) - STYLE_ORDER.indexOf(b.name))
}

/** "keep the ball well" said of one player. */
const singular = (s: string) => s.replace(/^are /, 'is ').replace(/^have /, 'has ').replace(/^keep /, 'keeps ').replace(/^link /, 'links ').replace(/^win /, 'wins ').replace(/^pick /, 'picks ').replace(/^cross /, 'crosses ').replace(/^defend /, 'defends ').replace(/^deal /, 'deals ').replace(/^hit /, 'hits ').replace(/^chase /, 'chases ').replace(/^attack /, 'attacks ')

/**
 * Where the club stands in its league by the strength of its squad, 0 (the strongest) to 1 (the weakest): the
 * favourites will have the ball in most games, the underdogs will have to do without it.
 */
export function standingOf(w: World, clubId: number): number {
  const c = w.clubs[clubId]
  const lg = Object.values(w.competitions).find((x) => x.format === 'league' && x.season === w.season && x.clubs.includes(clubId))
  if (!c || !lg) return 0.5
  const avgs = lg.clubs.map((id) => w.clubs[id]?.squadAvg || 0).sort((a, b) => b - a)
  return avgs.length > 1 ? avgs.indexOf(c.squadAvg) / (avgs.length - 1) : 0.5
}

/** How each way of playing sits with a side's standing: sitting deep wastes a favourite, dominating the ball asks a lot of an underdog. */
export const FOR_STANDING: Record<string, (st: number) => number> = {
  'Park the Bus': (st) => (st < 0.35 ? -1.2 : st > 0.7 ? 0.3 : -0.3),
  'Counter-Attack': (st) => (st < 0.2 ? -0.5 : st > 0.6 ? 0.25 : 0),
  Possession: (st) => (st < 0.25 ? 0.25 : st > 0.7 ? -0.3 : 0),
  Gegenpress: (st) => (st > 0.75 ? -0.2 : 0),
}

export interface Recommendation { fit: StyleFit; standing: number }

/** What a side's standing says about a way of playing, when it says something. */
export function standingNote(name: string, standing: number): string | undefined {
  if (name === 'Park the Bus' && standing < 0.35) return 'Sitting this deep wastes a side as strong as yours: most teams will let you have the ball.'
  if (name === 'Counter-Attack' && standing < 0.2) return 'As favourites, most opponents will sit deep against you: there won’t often be space to break into.'
  if (name === 'Possession' && standing > 0.7) return 'Underdogs rarely get much of the ball: keeping it will ask a lot of this squad.'
  return undefined
}

/** The way of playing the assistant would pick: the clearest fit for a side like this, or the neutral base when nothing stands out. */
export function recommendedStyle(fits: StyleFit[], standing = 0.5): Recommendation {
  const score = (f: StyleFit) => f.score + (FOR_STANDING[f.name]?.(standing) || 0)
  const best = [...fits].filter((f) => f.name !== 'Balanced').sort((a, b) => score(b) - score(a))[0]
  return { fit: best && score(best) >= 0.4 ? best : fits.find((f) => f.name === 'Balanced')!, standing }
}

const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

// ---------------------------------------------------------------- attitude
/** The mentality ladder in words a manager would use on the touchline. */
export const ATTITUDE: Record<Mentality, { label: string; text: string }> = {
  'Ultra Defensive': { label: 'Hold on', text: 'Everyone behind the ball. For protecting a lead or surviving against a much stronger side.' },
  Defensive: { label: 'Careful', text: 'Sit deeper with fewer players going forward. Harder to break down, fewer chances of your own.' },
  Balanced: { label: 'Balanced', text: 'Measured risk both ways.' },
  Attacking: { label: 'Go for it', text: 'Push up and get more players into the box. More chances, and more risk on the break.' },
  'Ultra Attacking': { label: 'All out', text: 'Everyone forward. For when you have to score.' },
}

export interface AttitudeAdvice { fixture: Fixture; opp: string; venue: string; pWin: number; pLoss: number; suggest: Mentality; why: string }

/** How to approach the match, from its prediction: push on as favourites, stay compact as underdogs. */
export function attitudeFor(w: World, f: Fixture): AttitudeAdvice {
  const pr = predictFixture(w, f)
  const home = f.home === w.userClubId
  const pWin = home ? pr.pHome : pr.pAway, pLoss = home ? pr.pAway : pr.pHome
  const opp = w.clubs[home ? f.away : f.home]?.short || 'them'
  const venue = f.neutral ? 'at a neutral ground' : home ? 'at home' : 'away'
  const pct = (x: number) => `${Math.round(x * 100)}%`
  let suggest: Mentality = 'Balanced', why = `An even game against ${opp} ${venue} (${pct(pWin)} to win, ${pct(pLoss)} to lose): stay balanced.`
  if (pWin >= 0.6) { suggest = 'Attacking'; why = `You’re clear favourites against ${opp} ${venue} (${pct(pWin)} to win): go for it and turn that into goals.` }
  else if (pLoss >= 0.5) { suggest = 'Defensive'; why = `${opp} are the stronger side (${pct(pLoss)} you lose): stay compact, be careful and make your chances count.` }
  return { fixture: f, opp, venue, pWin, pLoss, suggest, why }
}

// ---------------------------------------------------------------- what needs attention
export interface Note {
  tone: 'fix' | 'warn' | 'tip'
  text: string
  /** a one-tap fix: changes the sheet it is given */
  fix?: { label: string; run: (s: TeamSheet) => void }
}

/** The best player not in the XI for a slot (fit and available first). */
function stand(w: World, s: TeamSheet, i: number, squad: Player[]) {
  const pos = formationOf(s.formation).slots[i].pos
  return squad
    .filter((q) => !s.lineup.includes(q.id) && isAvailable(w, q) && (pos === 'GK') === (q.positions[0] === 'GK'))
    .sort((a, b) => posRating(b, pos) - (100 - b.fitness) * 0.15 - (posRating(a, pos) - (100 - a.fitness) * 0.15))[0]
}

/** What the assistant would point out about the XI and the way it plays, most urgent first. */
export function teamNotes(w: World, s: TeamSheet, squad: Player[], fits: StyleFit[]): Note[] {
  const notes: Note[] = []
  const f = formationOf(s.formation)
  const swapIn = (i: number, q: Player) => (t: TeamSheet) => { const out = t.lineup[i]; t.lineup[i] = q.id; t.bench = t.bench.map((id) => (id === q.id ? out : id)).filter(Boolean) }
  // places with nobody, or with someone who can't play
  const holes = f.slots.map((_, i) => i).filter((i) => !w.players[s.lineup[i]])
  if (holes.length) notes.push({ tone: 'fix', text: `${holes.length === 1 ? 'One place' : `${holes.length} places`} in your XI ${holes.length === 1 ? 'is' : 'are'} empty.`, fix: { label: 'Fill them', run: (t) => { for (const i of holes) { const q = stand(w, t, i, squad); if (q) swapIn(i, q)(t) } } } })
  f.slots.forEach((slot, i) => {
    const p = w.players[s.lineup[i]]
    if (!p || isAvailable(w, p)) return
    const q = stand(w, s, i, squad)
    const why = p.injury ? `is injured (${p.injury.type})` : 'is suspended'
    notes.push({ tone: 'fix', text: `${callName(p.name)} ${why} and can’t play.${q ? ` ${callName(q.name)} can take the ${slot.label} spot.` : ''}`, fix: q ? { label: `Bring in ${callName(q.name)}`, run: swapIn(i, q) } : undefined })
  })
  // tired starters
  f.slots.forEach((slot, i) => {
    const p = w.players[s.lineup[i]]
    if (!p || !isAvailable(w, p) || p.fitness >= 72) return
    const q = stand(w, s, i, squad)
    const good = q && posRating(q, slot.pos) >= posRating(p, slot.pos) - 6
    notes.push({ tone: 'warn', text: `${callName(p.name)} is tired (${Math.round(p.fitness)}% energy): tired players fade and get injured more.${good ? ` ${callName(q!.name)} is fresh.` : ''}`, fix: good ? { label: `Rest ${callName(p.name)}`, run: swapIn(i, q!) } : undefined })
  })
  // playing well out of position
  f.slots.forEach((slot, i) => {
    const p = w.players[s.lineup[i]]
    if (!p) return
    const r = posRating(p, slot.pos)
    if (r <= p.ovr - 7) notes.push({ tone: 'warn', text: `${callName(p.name)} is out of position at ${slot.label}: rated ${r} there, ${p.ovr} at best.` })
  })
  // (the way of playing against what the squad can do is said where the way of playing is chosen)
  void fits
  // a stronger XI on the bench
  const auto = buildSheet(w, w.clubs[w.userClubId], s.formation, s.tactics)
  const rate = (t: TeamSheet) => mean(t.lineup.map((id, i) => { const p = w.players[id]; return p ? posRating(p, f.slots[i].pos) : 0 }))
  const gain = rate(auto) - rate(s)
  if (!holes.length && gain >= 1) notes.push({ tone: 'tip', text: `Your strongest available XI rates ${rate(auto).toFixed(1)}, this one ${rate(s).toFixed(1)}.`, fix: { label: 'Use the strongest XI', run: (t) => { t.lineup = auto.lineup; t.bench = auto.bench; t.roles = auto.roles } } })
  return notes
}


/** During a match: the attitude the score and the clock call for, the way a bench would shout it. */
export function matchAttitude(score: [number, number], side: 0 | 1, minute: number, reds: [number, number] = [0, 0]): { suggest: Mentality; why: string } {
  const lead = score[side] - score[1 - side]
  const left = Math.max(0, 90 - minute)
  const mins = `${left} minute${left === 1 ? '' : 's'} left`
  const sc = `${score[side]}–${score[1 - side]}`
  const down = reds[side] > reds[1 - side] ? ' with ten men' : ''
  if (lead < 0) {
    if (minute >= 82) return { suggest: 'Ultra Attacking', why: `${sc} down with ${mins}${down}: everyone forward, nothing to lose.` }
    if (minute >= 55) return { suggest: 'Attacking', why: `${sc} down with ${mins}${down}: go for it.` }
    return { suggest: 'Balanced', why: `${sc} down but there’s time${down}: stay patient, the chances will come.` }
  }
  if (lead > 0) {
    if (lead === 1 && minute >= 85) return { suggest: 'Ultra Defensive', why: `${sc} up with ${mins}: hold on to it.` }
    if (lead === 1 && minute >= 70) return { suggest: 'Defensive', why: `${sc} up with ${mins}: be careful, protect the lead.` }
    if (lead >= 2 && minute >= 70) return { suggest: 'Defensive', why: `${sc} up with ${mins}: see it out, save energy.` }
    return { suggest: 'Balanced', why: `${sc} up with ${mins}: keep doing what you’re doing.` }
  }
  if (minute >= 80) return { suggest: 'Balanced', why: `Level with ${mins}: a draw is a point; push only if you need the win.` }
  return { suggest: 'Balanced', why: `Level with ${mins}: stay balanced.` }
}
