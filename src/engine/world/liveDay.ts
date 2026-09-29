// Matches played at the same time as the one on screen: picked by kick-off time and relevance, run through the full
// engine minute by minute in step with the main match, and applied to the world with exactly the results that were shown.
import type { Fixture, MatchEvent, World } from '../../domain/types'
import type { MatchSim, Phase } from '../match/engine'
import { createSim, deepLeagueSet, isDeepFixture } from './matchRunner'
import { fixturesOn } from './advance'

export interface OtherLive { fixtureId: string; sim: MatchSim }

const toMin = (t: string) => { const [h, m] = (t || '15:00').split(':').map(Number); return (h || 0) * 60 + (m || 0) }

/** Fixtures kicking off within half an hour of `f` on the same day that are worth following live. */
export function concurrentFixtures(w: World, f: Fixture, max = 12): Fixture[] {
  const t0 = toMin(f.time)
  const deep = deepLeagueSet(w)
  const rep = (x: Fixture) => (w.clubs[x.home]?.reputation || 0) + (w.clubs[x.away]?.reputation || 0)
  return fixturesOn(w, f.date)
    .filter((x) => x.id !== f.id && !x.played && !x.userInvolved && Math.abs(toMin(x.time) - t0) <= 30)
    .filter((x) => x.compId === f.compId || isDeepFixture(w, x, deep) || w.competitions[x.compId]?.format === 'uefa')
    .map((x) => ({ x, s: (x.compId === f.compId ? 1000 : 0) + (x.importance || 1) * 40 + rep(x) / 20 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((o) => o.x)
}

/** Build full-detail sims for the concurrent fixtures (they're watchable, so they keep commentary, heat maps and actions). */
export function createOthers(w: World, f: Fixture): OtherLive[] {
  return concurrentFixtures(w, f).map((x) => ({ fixtureId: x.id, sim: createSim(w, x, false, true) }))
}

const PHASE_ORDER: Record<Phase, number> = { pre: 0, '1H': 1, HT: 2, '2H': 3, ET1: 4, ETHT: 5, ET2: 6, PENS: 7, FT: 9 }
/** Monotonic match-clock position used to keep simultaneous matches level with each other. */
export const simRank = (s: MatchSim) => PHASE_ORDER[s.phase] * 1000 + s.minute + s.added / 100

/** Bring every other match level with `lead`. Returns the events produced, per fixture. */
export function syncOthers(lead: MatchSim, others: OtherLive[] | undefined): { fixtureId: string; e: MatchEvent }[] {
  if (!others?.length) return []
  const target = lead.finished ? Infinity : simRank(lead)
  const out: { fixtureId: string; e: MatchEvent }[] = []
  for (const o of others) {
    let guard = 0
    while (!o.sim.finished && simRank(o.sim) < target && guard++ < 400) {
      if (o.sim.injuredWaiting.length) o.sim.autoResolveInjuries()
      for (const e of o.sim.step()) out.push({ fixtureId: o.fixtureId, e })
    }
  }
  return out
}
