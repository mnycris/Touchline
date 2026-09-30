// Save versioning. Every save records the schema it was written with (`meta.version`); loading an older one runs
// each migration after it in order, then a repair pass fills any structure a newer build expects. Nothing is thrown
// away: players, fixtures, finances, history and settings all carry over.
import type { World } from '../../domain/types'
import { dynamicValue } from '../../domain/finance'
import { addDays } from '../../domain/dates'
import { migrateIntl } from './international'
import { emptyLine } from './matchRunner'
import { markOutOfSequence, rescheduleClashes } from '../competitions/reschedule'
import { takeNewFixtures } from '../competitions/fixtures'

/** The schema this build writes. Bump it with a new entry in MIGRATIONS whenever saves need converting. */
export const SAVE_SCHEMA = 4

interface Migration { to: number; name: string; run: (w: World) => void }

const MIGRATIONS: Migration[] = [
  {
    to: 2, name: 'Player values anchored to their original valuation',
    run: (w) => {
      if (w.flags.valueCalibV1) return
      for (const p of Object.values(w.players)) {
        if (p.regen || p.valueCalib) continue
        const raw = dynamicValue(p, w.date, 1)
        if (raw > 0 && p.value > 0) p.valueCalib = Math.max(0.35, Math.min(2.5, p.value / raw))
      }
      w.flags.valueCalibV1 = true
    },
  },
  { to: 3, name: 'International football: national teams and this season\'s windows', run: (w) => migrateIntl(w) },
  {
    to: 4, name: 'Transfer centre, rankings and checkpoints',
    run: (w) => {
      // the live transfer feed starts from the deals already in the history
      w.market ||= { stories: [], seq: 1 }
      // this season's notable moves go into the centre as done deals (their undo records never existed)
      if (!w.market.stories.length) {
        for (const h of w.transfers.history.slice(0, 400)) {
          if (h.season !== w.season || !['transfer', 'loan', 'free'].includes(h.type)) continue
          const p = w.players[h.playerId]
          if (!p || !(h.fee >= 8e6 || p.ovr >= 74 || h.to === w.userClubId || h.from === w.userClubId)) continue
          w.market.stories.push({ id: w.market.seq++, playerId: h.playerId, from: h.from, to: h.to, stage: 'done', kind: h.type as 'transfer' | 'loan' | 'free', fee: h.fee, started: h.date, updated: h.date, expires: addDays(w.date, 30), log: [{ date: h.date, stage: 'done', note: `${w.clubs[h.to]?.short} complete the ${h.type === 'loan' ? 'loan' : h.type === 'free' ? 'free signing' : 'signing'} of ${p.name}${h.fee ? ` for €${(h.fee / 1e6).toFixed(1)}M` : ''}.` }] })
        }
      }
      // fixture clashes are resolved and out-of-sequence games labelled
      for (const c of Object.values(w.competitions)) if (c.season === w.season && c.format === 'league') markOutOfSequence(w, c.id)
      rescheduleClashes(w)
      takeNewFixtures(w)
    },
  },
]

export interface MigrationReport { from: number; to: number; applied: string[]; repaired: number }

/** Bring a save up to the current schema in place. Returns what was done (empty when it was already current). */
export function migrateSave(w: World): MigrationReport {
  const from = w.meta?.version || 1
  const applied: string[] = []
  for (const m of MIGRATIONS) {
    if (m.to <= from) continue
    m.run(w)
    applied.push(m.name)
  }
  const repaired = repairWorld(w)
  w.meta.version = Math.max(from, SAVE_SCHEMA)
  return { from, to: w.meta.version, applied, repaired }
}

/** Defaults for everything later builds read without a guard. Counts what it had to fill in. */
export function repairWorld(w: World): number {
  let n = 0
  const fix = <T>(ok: boolean, set: () => T) => { if (!ok) { set(); n++ } }
  fix(!!w.flags, () => { w.flags = {} })
  fix(!!w.transfers, () => { w.transfers = { offers: {}, history: [], shortlist: [], targets: {}, knowledge: {} } })
  fix(!!w.transfers.offers, () => { w.transfers.offers = {} })
  fix(Array.isArray(w.transfers.history), () => { w.transfers.history = [] })
  fix(Array.isArray(w.transfers.shortlist), () => { w.transfers.shortlist = [] })
  fix(!!w.transfers.targets, () => { w.transfers.targets = {} })
  fix(!!w.transfers.knowledge, () => { w.transfers.knowledge = {} })
  for (const k of ['scouts', 'scoutPool', 'youthScouts', 'youthScoutPool', 'prospects', 'inbox', 'news', 'promises', 'conversations', 'awards', 'archive'] as const) {
    fix(Array.isArray(w[k]), () => { (w as any)[k] = [] })
  }
  fix(!!w.records, () => { w.records = {} })
  fix(!!w.market, () => { w.market = { stories: [], seq: 1 } })
  fix(!!w.user.history, () => { w.user.history = [] })
  fix(!!w.user.trophies, () => { w.user.trophies = [] })
  fix(!!w.user.awards, () => { w.user.awards = [] })
  fix(!!w.user.jobOffers, () => { w.user.jobOffers = [] })
  for (const p of Object.values(w.players)) {
    if (!p.season) { p.season = {}; n++ }
    if (!p.career) { p.career = []; n++ }
    if (!p.suspensions) { p.suspensions = []; n++ }
    if (!p.yellowAccum) { p.yellowAccum = {}; n++ }
    if (!p.formRatings) { p.formRatings = []; n++ }
    if (!p.growthHistory) { p.growthHistory = []; n++ }
    for (const [k, s] of Object.entries(p.season)) {
      // stat lines from before a stat was tracked get it at zero
      const base = emptyLine()
      for (const key of Object.keys(base) as (keyof typeof base)[]) if (typeof s[key] !== 'number') { (s as any)[key] = 0; n++ }
      p.season[k] = s
    }
  }
  for (const c of Object.values(w.clubs)) {
    if (!c.trophies) { c.trophies = []; n++ }
    if (!c.sheets) { c.sheets = []; n++ }
    if (!c.rivals) { c.rivals = []; n++ }
  }
  return n
}
