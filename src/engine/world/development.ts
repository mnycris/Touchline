import type { AttrKey, Player, World } from '../../domain/types'
import { A } from '../../domain/types'
import { Rng, clamp } from '../../domain/rng'
import { DEV_PLANS, POS_GROUP, POS_WEIGHT_KEY, RATING_WEIGHTS, TRAINING_PLANS } from '../../domain/constants'
import { ageOn, diffDays } from '../../domain/dates'
import { computeOvr } from '../../domain/ratings'
import { dynamicValue } from '../../domain/finance'

const planOf = (p: Player) => TRAINING_PLANS.find((t) => t.id === p.trainingPlan) || TRAINING_PLANS[2]

/** Daily recovery / sharpness / development XP from the player's training plan. */
export function dailyTraining(w: World, p: Player, rng: Rng, matchDayGap: number) {
  const plan = planOf(p)
  const age = ageOn(p.dob, w.date)
  const stam = p.attrs[A.stamina]
  // recovery: faster for fitter, younger players and energy-focused plans
  const ageF = age <= 23 ? 1.08 : age <= 29 ? 1 : age <= 32 ? 0.9 : 0.8
  // recovery: quick at first, slower as the legs come back (Saturday → Tuesday leaves a player around 85%)
  const deficit = 100 - p.fitness
  const rec = (2.6 + deficit * 0.22) * (0.8 + stam / 250) * plan.energy * ageF
  const trainCost = plan.energy < 1 ? (1 - plan.energy) * 4 : 0
  if (!p.injury) p.fitness = clamp(p.fitness + rec - trainCost, 20, 100)
  else p.fitness = clamp(p.fitness + 2, 20, 88)
  // sharpness: training keeps it ticking over, only football tops it up; long lay-offs cost it
  if (p.injury) p.sharpness = Math.max(Math.min(p.sharpness, 30), p.sharpness - 1.1)
  else {
    const idle = p.lastMatchDate ? Math.abs(diffDays(w.date, p.lastMatchDate)) : 30
    const train = plan.sharp * 1.6 * Math.max(0, 1 - p.sharpness / 82)
    const decay = idle > 7 && p.sharpness > 55 ? 0.6 : 0
    p.sharpness = clamp(p.sharpness + train - decay, 0, 100)
  }
  // development XP
  const head = p.pot - p.ovr
  let xp = 0
  if (!p.injury) {
    const youth = age <= 18 ? 1.7 : age <= 20 ? 1.45 : age <= 22 ? 1.2 : age <= 24 ? 0.95 : age <= 27 ? 0.55 : age <= 29 ? 0.25 : 0
    xp = youth * Math.max(0, head) * 0.075 * plan.dev * p.hidden.devRate * (0.7 + p.hidden.professionalism / 200)
    const gs = w.settings.growth === 'Fast' ? 1.4 : w.settings.growth === 'Slow' ? 0.7 : 1
    xp *= gs
    // playing time drives growth
    const minsLast30 = recentMinutes(p)
    xp *= 0.55 + Math.min(1, minsLast30 / 900) * 0.75
    const form = p.formRatings.length ? p.formRatings.reduce((a, b) => a + b, 0) / p.formRatings.length : 6.6
    xp *= 1 + (form - 6.7) * 0.25
  }
  p.devProgress += xp
  // training injury risk for heavy plans
  const risk = plan.id === 'All Out Performance' ? 0.0011 : plan.id === 'Performance Focused' ? 0.0005 : 0.00015
  void matchDayGap
  return rng.next() < risk * (0.6 + p.hidden.injuryProne / 80) * (w.settings.injuries === 'High' ? 1.5 : w.settings.injuries === 'Low' ? 0.5 : 1)
}

function recentMinutes(p: Player): number {
  let m = 0
  for (const s of Object.values(p.season)) m += s.mins
  const apps = Object.values(p.season).reduce((a, s) => a + s.apps, 0)
  return apps ? (m / Math.max(1, apps)) * Math.min(4, apps) : 0
}

/** Converts accumulated XP into attribute growth (twice monthly), plus age decline. */
export function applyGrowth(w: World, p: Player, rng: Rng): number {
  const before = p.ovr
  const track = p.clubId === w.userClubId
  const snap = track ? [...p.attrs] : undefined
  const age = ageOn(p.dob, w.date)
  // decline for veterans
  if (age >= 30) {
    const d = (age - 29) * 0.18 * (1.2 - p.hidden.professionalism / 200) * (w.settings.growth === 'Fast' ? 1.1 : 1)
    p.devProgress -= d
  }
  let guard = 0
  while (p.devProgress >= 10 && guard++ < 6) {
    p.devProgress -= 10
    bumpAttrs(p, rng, +1)
  }
  while (p.devProgress <= -10 && guard++ < 6) {
    p.devProgress += 10
    bumpAttrs(p, rng, -1)
  }
  p.ovr = computeOvr(p)
  if (p.ovr > p.pot && age < 30) p.pot = p.ovr // exceeded expectations
  // late bloomers / stagnation of potential based on minutes & form
  if (age <= 23 && rng.next() < 0.02) {
    const form = p.formRatings.length ? p.formRatings.reduce((a, b) => a + b, 0) / p.formRatings.length : 6.6
    if (form > 7.3) p.pot = Math.min(95, p.pot + 1)
    else if (form < 6.2) p.pot = Math.max(p.ovr, p.pot - 1)
  }
  if (snap) {
    const gains: { date: string; k: AttrKey; d: number }[] = []
    for (const k of Object.keys(A) as AttrKey[]) { const d = p.attrs[A[k]] - snap[A[k]]; if (d) gains.push({ date: w.date, k, d }) }
    if (gains.length || p.attrGains?.length) p.attrGains = [...(p.attrGains || []).filter((g) => diffDays(w.date, g.date) <= 45), ...gains].slice(-16)
  }
  if (p.ovr !== before) {
    p.growthHistory.push({ date: w.date, ovr: p.ovr })
    if (p.growthHistory.length > 40) p.growthHistory.shift()
    p.value = dynamicValue(p, w.date, p.valueCalib ?? 1)
  }
  return p.ovr - before
}

function bumpAttrs(p: Player, rng: Rng, dir: 1 | -1) {
  const plan = DEV_PLANS.find((d) => d.id === p.devPlan)
  const pos = p.devTargetPos || p.positions[0]
  const weights = RATING_WEIGHTS[POS_WEIGHT_KEY[pos]]
  let keys: AttrKey[]
  if (dir < 0) {
    // physical attributes decline first
    keys = ['sprintSpeed', 'acceleration', 'stamina', 'agility', 'reactions', 'jumping', 'balance']
    if (rng.next() < 0.35) keys = Object.keys(weights) as AttrKey[]
  } else if (plan && plan.attrs.length && rng.next() < 0.7) keys = plan.attrs
  else keys = Object.keys(weights) as AttrKey[]
  const n = dir > 0 ? rng.int(2, 4) : rng.int(1, 3)
  for (let i = 0; i < n; i++) {
    const k = rng.pick(keys)
    const idx = A[k]
    const cap = dir > 0 ? 99 : 20
    p.attrs[idx] = clamp(p.attrs[idx] + dir * (rng.next() < 0.2 ? 2 : 1), 1, cap)
  }
  // position conversion progress
  if (p.devTargetPos && dir > 0 && !p.positions.includes(p.devTargetPos) && rng.next() < 0.18) {
    p.positions = [...p.positions, p.devTargetPos]
  }
}

export function seasonAging(w: World, p: Player, rng: Rng) {
  const age = ageOn(p.dob, w.date)
  if (age >= 31) {
    const drop = Math.max(0, Math.round((age - 30) * 0.6 + rng.normal(0, 0.8)))
    for (let i = 0; i < drop; i++) bumpAttrs(p, rng, -1)
    p.ovr = computeOvr(p)
    p.pot = Math.max(p.ovr, Math.min(p.pot, p.ovr + 1))
  }
  if (age >= 24 && p.pot > p.ovr + 3) p.pot = Math.max(p.ovr + 1, p.pot - rng.int(0, 2))
}

export function isRetiring(p: Player, age: number, rng: Rng): boolean {
  if (age < 33) return false
  const base = age >= 40 ? 0.95 : age >= 38 ? 0.7 : age >= 36 ? 0.4 : age >= 35 ? 0.25 : age >= 34 ? 0.12 : 0.05
  const qual = p.ovr >= 82 ? 0.6 : p.ovr >= 75 ? 0.85 : 1.15
  const gk = POS_GROUP[p.positions[0]] === 'GK' ? 0.6 : 1
  return rng.next() < base * qual * gk * (p.clubId === 0 ? 1.8 : 1)
}
