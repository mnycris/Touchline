// Penalties: the taker's technique and nerve against the keeper's read and reach, on absolute scales. A penalty is
// the same contest in a fourth-tier cup tie as in a Champions League final, so neither the level of the match nor the
// rest of the team (home crowd, the side's day, difficulty boosts) moves it. The action engine and the light sim both
// use this model, so a great taker is a great taker however the match is played out.
import type { PenaltyKick, Player } from '../../domain/types'
import { A } from '../../domain/types'
import { clamp, type Rng } from '../../domain/rng'

type Spot = PenaltyKick['spot']
type Dive = PenaltyKick['dive']
const SPOTS: Spot[] = ['BL', 'BR', 'TL', 'TR', 'C']

/** Penalty-taking quality: technique first, then nerve and a clean strike; a good or bad day moves it a little. */
export function takerQuality(p: Player, form = 0): number {
  const a = p.attrs
  return a[A.penalties] * 0.55 + a[A.composure] * 0.25 + a[A.finishing] * 0.1 + a[A.shotPower] * 0.1 + form * 0.4 + (clamp(p.morale, 0, 100) - 50) / 25
}

/** How well a keeper reads and reaches a penalty. */
export function keeperQuality(gk: Player | undefined): number {
  if (!gk) return 35
  const a = gk.attrs
  return a[A.gkDiving] * 0.4 + a[A.gkReflexes] * 0.3 + a[A.gkPositioning] * 0.2 + a[A.gkHandling] * 0.1
}

/** Where takers aim: the low corners mostly; confident takers go high more, and a little more to their natural side. */
function spotWeight(s: Spot, q: number, foot: 'L' | 'R'): number {
  const conf = clamp((q - 64) / 50, 0, 0.6)
  const base = s === 'BL' || s === 'BR' ? 0.33 : s === 'C' ? 0.1 : 0.1 + conf * 0.15
  return base * ((foot === 'L') === (s === 'BR' || s === 'TR') ? 1.15 : 1)
}

/** Off target (wide, over or the woodwork): placement risk, eased by technique; nerves add to it, less for the composed. */
function missChance(s: Spot, q: number, composure: number, pressure: number): number {
  const base = s === 'TL' || s === 'TR' ? 0.09 : s === 'C' ? 0.012 : 0.035
  return clamp(base * clamp(1 - (q - 75) / 30, 0.45, 1.8) + pressure * clamp(1.6 - composure / 75, 0.4, 1.2), 0.005, 0.3)
}

/** The keeper guesses right a little under half the time; better keepers read takers a little better. */
const readChance = (g: number) => clamp(0.44 + (g - 75) / 250, 0.36, 0.54)
const STAY = 0.08

/** Saved when the keeper went the right way: low corners depend on the strike against the keeper; high ones rarely. */
function saveChance(s: Spot, q: number, g: number): number {
  if (s === 'C') return 0.8
  if (s === 'TL' || s === 'TR') return 0.15
  return clamp(0.52 + (g - q) * 0.016, 0.2, 0.8)
}

const dirOf = (s: Spot): Dive => (s === 'C' ? 'C' : s[1] === 'L' ? 'L' : 'R')

/** Take one penalty. `spot` and `dive` can be fixed (Edit Mode); the outcome still follows the model. */
export function takePenalty(rng: Rng, q: number, composure: number, g: number, pressure: number, foot: 'L' | 'R', fixed?: { spot?: Spot; dive?: Dive }): { spot: Spot; dive: Dive; res: PenaltyKick['res'] } {
  const spot = fixed?.spot ?? rng.weighted(SPOTS, (s) => spotWeight(s, q, foot))
  const want = dirOf(spot)
  const side = (): Dive => (rng.next() < 0.5 ? 'L' : 'R')
  const dive: Dive = fixed?.dive ?? (rng.next() < STAY ? 'C' : rng.next() < readChance(g) ? (want === 'C' ? side() : want) : want === 'C' ? side() : want === 'L' ? 'R' : 'L')
  if (rng.next() < missChance(spot, q, composure, pressure)) return { spot, dive, res: rng.next() < 0.35 ? 'post' : 'miss' }
  if (dive === want && rng.next() < saveChance(spot, q, g)) return { spot, dive, res: 'saved' }
  return { spot, dive, res: 'goal' }
}

/** The chance a penalty is scored, from the same model (for the light sim and for checks). */
export function penaltyChance(q: number, composure: number, g: number, pressure = 0, foot: 'L' | 'R' = 'R'): number {
  let tot = 0, sum = 0
  for (const s of SPOTS) {
    const w = spotWeight(s, q, foot)
    const right = s === 'C' ? STAY : (1 - STAY) * readChance(g)
    sum += w * (1 - missChance(s, q, composure, pressure)) * (1 - right * saveChance(s, q, g))
    tot += w
  }
  return sum / tot
}
