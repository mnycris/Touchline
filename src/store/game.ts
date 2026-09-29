import { create } from 'zustand'
import type { MatchResult, World } from '../domain/types'
import type { RawDb } from '../data/rawTypes'
import { createWorld, type NewCareerOptions } from '../data/createWorld'
import { advance as advanceWorld, afterMatch, careerIntro, fixturesOn, simulateDay, userFixtureOn, worldRng, type StopReason } from '../engine/world/advance'
import { simulateFixture } from '../engine/world/matchRunner'
import { loadCareer as loadSave, saveCareer, listSaves, deleteSave, getKV, setKV, type SaveMeta } from '../services/saves'
import { positionOf } from '../engine/competitions/tables'
import type { MatchSim } from '../engine/match/engine'
import { touchRoster } from '../engine/world/roster'
import { dynamicValue } from '../domain/finance'

export type Tab = 'central' | 'squad' | 'transfers' | 'academy' | 'season'
export interface Route { name: string; params?: any }

/** Bring saves from earlier versions up to date. */
function migrateWorld(w: World) {
  if (!w.flags.valueCalibV1) {
    // anchor player values to the valuation they had before formula updates took over
    for (const p of Object.values(w.players)) {
      if (p.regen || p.valueCalib) continue
      const raw = dynamicValue(p, w.date, 1)
      if (raw > 0 && p.value > 0) p.valueCalib = Math.max(0.35, Math.min(2.5, p.value / raw))
    }
    w.flags.valueCalibV1 = true
  }
}

export interface LiveMatch {
  sim: MatchSim
  fixtureId: string
  speed: number
  running: boolean
  tick: number
  finished: boolean
  applied: boolean
}

export interface StopPrefs { offers: boolean; injuries: boolean; scouting: boolean; conversations: boolean; news: boolean }
export interface AppPrefs {
  haptics: boolean
  /** speed a live match starts at (one of `speeds`) */
  matchSpeed: number
  /** the three speed buttons in the match centre (0.2×–6×) */
  speeds: [number, number, number]
  sound: boolean; reduceMotion: boolean; assistantSubs: boolean; stopOn: StopPrefs
}

export const DEFAULT_SPEEDS: [number, number, number] = [0.5, 1, 2]

interface GameState {
  raw?: RawDb
  dbError?: string
  loadingDb: boolean
  world?: World
  v: number
  saveId?: string
  tab: Tab
  stacks: Record<Tab, Route[]>
  overlay: Route[]
  live?: LiveMatch
  advancing: boolean
  advanceLabel?: string
  lastStop?: StopReason
  toast?: { id: number; text: string; kind: 'ok' | 'err' | 'info' }
  prefs: AppPrefs
  saves: SaveMeta[]
  loadDb: () => Promise<RawDb | undefined>
  refreshSaves: () => Promise<void>
  startCareer: (opts: NewCareerOptions) => Promise<void>
  loadCareer: (id: string) => Promise<boolean>
  deleteCareer: (id: string) => Promise<void>
  exitToMenu: () => void
  save: (auto?: boolean) => Promise<void>
  saveAs: (name: string) => Promise<void>
  mutate: (fn: (w: World) => void, opts?: { save?: boolean; roster?: boolean }) => void
  bump: () => void
  setTab: (t: Tab) => void
  go: (r: Route) => void
  back: () => void
  resetTab: () => void
  open: (r: Route) => void
  close: () => void
  closeAll: () => void
  advance: (until?: string) => Promise<StopReason | undefined>
  stopAdvance: () => void
  stopRequested: boolean
  finishUserMatch: (fixtureId: string, result: MatchResult) => void
  setLive: (l?: LiveMatch) => void
  notify: (text: string, kind?: 'ok' | 'err' | 'info') => void
  setPrefs: (p: Partial<AppPrefs>) => void
}

const emptyStacks = (): Record<Tab, Route[]> => ({ central: [], squad: [], transfers: [], academy: [], season: [] })
let saveTimer: number | undefined
let toastN = 0

export function haptic(kind: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    if (!useGame.getState().prefs.haptics) return
    const ms = kind === 'light' ? 8 : kind === 'medium' ? 16 : 30
    navigator.vibrate?.(ms)
  } catch { /* unsupported */ }
}

export const useGame = create<GameState>((set, get) => ({
  loadingDb: false,
  v: 0,
  tab: 'central',
  stacks: emptyStacks(),
  overlay: [],
  advancing: false,
  prefs: { haptics: true, matchSpeed: 1, speeds: DEFAULT_SPEEDS, sound: false, reduceMotion: false, assistantSubs: false, stopOn: { offers: true, injuries: true, scouting: false, conversations: true, news: false } },
  stopRequested: false,
  saves: [],

  async loadDb() {
    if (get().raw) return get().raw
    set({ loadingDb: true })
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/world.json`)
      const raw = (await res.json()) as RawDb
      set({ raw, loadingDb: false })
      return raw
    } catch (e: any) {
      set({ loadingDb: false, dbError: String(e?.message || e) })
      return undefined
    }
  },

  async refreshSaves() {
    try { set({ saves: await listSaves() }) } catch { set({ saves: [] }) }
    const p = await getKV<AppPrefs>('prefs').catch(() => undefined)
    if (p) {
      const prefs = { ...get().prefs, ...p, stopOn: { ...get().prefs.stopOn, ...(p.stopOn || {}) } }
      // older installs had fixed 1×/2×/4× buttons
      if (!Array.isArray(prefs.speeds) || prefs.speeds.length !== 3) prefs.speeds = DEFAULT_SPEEDS
      if (!prefs.speeds.includes(prefs.matchSpeed)) prefs.matchSpeed = prefs.speeds[1]
      set({ prefs })
    }
  },

  async startCareer(opts) {
    const raw = await get().loadDb()
    if (!raw) return
    const w = createWorld(raw, opts)
    careerIntro(w)
    w.flags.assistantSubs = get().prefs.assistantSubs
    set({ world: w, saveId: w.meta.id, v: get().v + 1, tab: 'central', stacks: emptyStacks(), overlay: [] })
    await get().save(false)
  },

  async loadCareer(id) {
    const w = await loadSave(id)
    if (!w) return false
    migrateWorld(w)
    touchRoster(w)
    set({ world: w, saveId: id, v: get().v + 1, tab: 'central', stacks: emptyStacks(), overlay: [], live: undefined })
    await setKV('lastSave', id)
    return true
  },

  async deleteCareer(id) {
    await deleteSave(id)
    await get().refreshSaves()
  },

  exitToMenu() {
    set({ world: undefined, saveId: undefined, live: undefined, overlay: [], stacks: emptyStacks(), tab: 'central' })
    get().refreshSaves()
  },

  async save(auto = true) {
    const w = get().world
    if (!w) return
    const club = w.clubs[w.userClubId]
    const comp = Object.values(w.competitions).find((c) => c.season === w.season && c.format === 'league' && c.clubs.includes(w.userClubId))
    try {
      await saveCareer(w, {
        id: get().saveId || w.meta.id, name: w.meta.saveName || `${club.name} Career`, managerName: `${w.user.firstName} ${w.user.lastName}`,
        clubId: club.id, clubName: club.name, date: w.date, season: w.season, playTimeMin: w.meta.playTimeMin,
        leagueName: w.leagues[club.leagueId]?.short || club.country, position: comp ? positionOf(w, comp, club.id) : undefined, auto,
      })
      if (!auto) get().notify('Career saved', 'ok')
    } catch (e) {
      get().notify('Save failed — storage unavailable', 'err')
    }
  },

  async saveAs(name) {
    const w = get().world
    if (!w) return
    const id = `career-${Date.now().toString(36)}`
    w.meta.id = id
    w.meta.saveName = name
    set({ saveId: id })
    await get().save(false)
    await get().refreshSaves()
  },

  mutate(fn, opts = {}) {
    const w = get().world
    if (!w) return
    fn(w)
    if (opts.roster) touchRoster(w)
    set({ v: get().v + 1 })
    if (opts.save !== false) {
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => get().save(true), 2500)
    }
  },

  bump() { set({ v: get().v + 1 }) },

  setTab(t) {
    if (get().tab === t) { set({ stacks: { ...get().stacks, [t]: [] } }); return }
    set({ tab: t })
    haptic()
  },
  go(r) {
    // navigating from inside an overlay (match day, negotiation…) stacks on the overlay so it stays visible
    if (get().overlay.length) { set({ overlay: [...get().overlay, r] }); haptic(); return }
    const t = get().tab
    set({ stacks: { ...get().stacks, [t]: [...get().stacks[t], r] } })
    haptic()
  },
  back() {
    if (get().overlay.length) { get().close(); return }
    const t = get().tab
    const s = get().stacks[t]
    if (s.length) set({ stacks: { ...get().stacks, [t]: s.slice(0, -1) } })
  },
  resetTab() { set({ stacks: { ...get().stacks, [get().tab]: [] } }) },
  open(r) { set({ overlay: [...get().overlay, r] }); haptic() },
  close() { set({ overlay: get().overlay.slice(0, -1) }) },
  closeAll() { set({ overlay: [] }) },

  async advance(until) {
    const w = get().world
    if (!w || get().advancing) return
    set({ advancing: true, stopRequested: false })
    let stop: StopReason = 'limit'
    const started = Date.now()
    const stopOn = get().prefs.stopOn
    const seenInbox = new Set(w.inbox.map((m) => m.id))
    try {
      // step day by day so the calendar animates and the UI stays responsive
      for (let i = 0; i < 400; i++) {
        // busy match days: simulate the day's fixtures in batches so the UI keeps breathing
        if (!userFixtureOn(w, w.date)) {
          const todays = fixturesOn(w, w.date)
          if (todays.length > 24) {
            for (let k = 0; k < todays.length; k += 24) {
              const rng = worldRng(w)
              for (const f of todays.slice(k, k + 24)) if (!f.played) afterMatch(w, f, simulateFixture(w, f), rng)
              w.rng = rng.state
              await new Promise((res) => setTimeout(res, 0))
            }
          }
        }
        const r = advanceWorld(w, 1)
        set({ v: get().v + 1, advanceLabel: w.date })
        stop = r.stop
        if (stop !== 'limit') break
        if (until && w.date >= until) { stop = 'none'; break }
        if (!until && i >= 120) break
        if (get().stopRequested) { stop = 'none'; break }
        // user stop conditions on new inbox items
        const fresh = w.inbox.filter((m) => !seenInbox.has(m.id))
        fresh.forEach((m) => seenInbox.add(m.id))
        const hit = fresh.find((m) =>
          (stopOn.offers && m.category === 'Transfers') || (stopOn.injuries && m.category === 'Medical') ||
          (stopOn.scouting && (m.category === 'Scouting' || m.category === 'Youth')) || (stopOn.conversations && m.category === 'Player'))
        if (hit) { stop = 'inbox'; break }
        await new Promise((res) => setTimeout(res, get().prefs.reduceMotion ? 0 : until ? 25 : 70))
      }
    } finally {
      w.meta.playTimeMin += Math.round((Date.now() - started) / 60000)
      set({ advancing: false, lastStop: stop, v: get().v + 1, stopRequested: false })
    }
    if (stop === 'match') get().open({ name: 'prematch' })
    else if (stop === 'season-end') get().open({ name: 'seasonReview', params: { season: w.season - 1 } })
    else if (stop === 'sacked') get().open({ name: 'jobs', params: { sacked: true } })
    else if (stop === 'deadline') get().notify('Transfer Deadline Day!', 'info')
    else if (stop === 'window') get().notify('The transfer window is open', 'info')
    else if (stop === 'inbox') get().notify('New message needs your attention', 'info')
    get().save(true)
    return stop
  },

  stopAdvance() { set({ stopRequested: true }) },

  finishUserMatch(fixtureId, result) {
    const w = get().world
    if (!w) return
    const f = w.fixtures[fixtureId]
    if (!f || f.played) return
    const rng = worldRng(w)
    afterMatch(w, f, result, rng)
    // play the rest of the day's fixtures so tables and other results are current
    simulateDay(w, rng)
    w.rng = rng.state
    w.lastUserResult = f.id
    set({ v: get().v + 1, live: undefined })
    get().save(true)
  },

  setLive(l) { set({ live: l, v: get().v + 1 }) },

  notify(text, kind = 'info') {
    const id = ++toastN
    set({ toast: { id, text, kind } })
    window.setTimeout(() => { if (get().toast?.id === id) set({ toast: undefined }) }, 2600)
  },

  setPrefs(p) {
    set({ prefs: { ...get().prefs, ...p, stopOn: { ...get().prefs.stopOn, ...(p.stopOn || {}) } } })
    setKV('prefs', get().prefs).catch(() => {})
    const w = get().world
    if (w && p.assistantSubs !== undefined) w.flags.assistantSubs = p.assistantSubs
  },
}))

export function useWorld(): World {
  useGame((s) => s.v)
  return useGame.getState().world as World
}

// dev builds only: lets the QA scripts reach the store (stripped from production bundles)
if (import.meta.env.DEV) (window as unknown as { __game: typeof useGame }).__game = useGame
