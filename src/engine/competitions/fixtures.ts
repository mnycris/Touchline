import type { Competition, Fixture, ISODate, World } from '../../domain/types'
import { ClubDateIndex } from './calendar'

const indexes = new WeakMap<World, ClubDateIndex>()
const byDate = new WeakMap<World, Map<ISODate, Fixture[]>>()
/** Fixtures grouped by date (kept current by newFixture). */
export function fixturesByDate(w: World): Map<ISODate, Fixture[]> {
  let m = byDate.get(w)
  if (!m) {
    m = new Map()
    for (const f of Object.values(w.fixtures)) { const a = m.get(f.date); if (a) a.push(f); else m.set(f.date, [f]) }
    byDate.set(w, m)
  }
  return m
}
export function resetFixtureIndexes(w: World) {
  indexes.delete(w)
  byDate.delete(w)
}
/** Persistent club/date index for a world; kept current by newFixture(). */
export function worldDateIndex(w: World): ClubDateIndex {
  let idx = indexes.get(w)
  if (!idx) { idx = ClubDateIndex.from(Object.values(w.fixtures)); indexes.set(w, idx) }
  return idx
}

export function newFixture(w: World, comp: Competition, home: number, away: number, date: ISODate, time: string, roundName: string, extra: Partial<Fixture> = {}): Fixture {
  const n = comp.fixtures.length + 1
  const id = `${comp.id}:${n}`
  const f: Fixture = {
    id, compId: comp.id, roundName, date, time, home, away, played: false,
    userInvolved: home === w.userClubId || away === w.userClubId, ...extra,
  }
  const derby = w.clubs[home]?.rivals.find((r) => r[0] === away)
  if (derby) f.derby = derby[1]
  w.fixtures[id] = f
  comp.fixtures.push(id)
  const idx = indexes.get(w)
  if (idx) { idx.add(home, date); idx.add(away, date) }
  const bd = byDate.get(w)
  if (bd) { const a = bd.get(date); if (a) a.push(f); else bd.set(date, [f]) }
  let fresh = created.get(w)
  if (!fresh) created.set(w, (fresh = []))
  fresh.push(f.id)
  return f
}

const created = new WeakMap<World, string[]>()
/** Fixtures created since the last call (new cup rounds, knockout draws, play-offs): checked for clashes. */
export function takeNewFixtures(w: World): Fixture[] {
  const ids = created.get(w) || []
  created.set(w, [])
  return ids.map((id) => w.fixtures[id]).filter(Boolean)
}

/** Move a fixture to another date, keeping the date caches and the fixture lists in step. */
export function moveFixture(w: World, f: Fixture, date: ISODate, time?: string) {
  const bd = byDate.get(w)
  if (bd) {
    const old = bd.get(f.date)
    if (old) { const i = old.indexOf(f); if (i >= 0) old.splice(i, 1) }
    const a = bd.get(date); if (a) a.push(f); else bd.set(date, [f])
  }
  const idx = indexes.get(w)
  if (idx) { idx.remove(f.home, f.date); idx.remove(f.away, f.date); idx.add(f.home, date); idx.add(f.away, date) }
  f.date = date
  if (time) f.time = time
  w.flags.fxRev = (w.flags.fxRev || 0) + 1
}

export function clubFixtures(w: World, clubId: number): Fixture[] {
  const out: Fixture[] = []
  for (const f of Object.values(w.fixtures)) if (f.home === clubId || f.away === clubId) out.push(f)
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

/** Maintains a per-club sorted fixture index for fast lookups. */
export function buildClubIndex(w: World): Map<number, Fixture[]> {
  const m = new Map<number, Fixture[]>()
  for (const f of Object.values(w.fixtures)) {
    for (const c of [f.home, f.away]) {
      let arr = m.get(c)
      if (!arr) m.set(c, (arr = []))
      arr.push(f)
    }
  }
  for (const arr of m.values()) arr.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  return m
}
