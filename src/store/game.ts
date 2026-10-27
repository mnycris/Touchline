import { create } from 'zustand'
import type { MatchResult, World } from '../domain/types'
import type { RawDb } from '../data/rawTypes'
import { createWorldAsync, type BuildStage, type NewCareerOptions } from '../data/createWorld'
import { advance as advanceWorld, afterMatch, careerIntro, fixturesOn, nextUserFixture, setWatched, simulateDay, userFixtureOn, watchedOn, watchedToday, worldRng, type StopReason } from '../engine/world/advance'
import { createSim, simulateFixture } from '../engine/world/matchRunner'
import { createOthers, type OtherLive } from '../engine/world/liveDay'
import { fmtDate } from '../domain/dates'
import { loadCareer as loadSave, saveCareer, listSaves, deleteSave, getKV, setKV, type SaveMeta, type CheckpointMeta, saveBytes, saveCheckpoint, loadCheckpoint, deleteCheckpoint as removeCheckpoint, exportCareer, readCareerFile } from '../services/saves'
import { positionOf } from '../engine/competitions/tables'
import type { MatchSim } from '../engine/match/engine'
import { touchRoster } from '../engine/world/roster'
import { clearMemory, forgetView, viewKeyFor } from '../ui/memory'
import { SAVE_SCHEMA, migrateSave } from '../engine/world/migrate'
import { lastSeenRelease, markNotesSeen, sendReleaseMail, sendWorldNotes } from '../engine/world/releases'
import { APP_VERSION } from '../ui/components/brand'
import { followSets, newsFollowRef } from '../engine/world/follow'

export type Tab = 'central' | 'squad' | 'transfers' | 'academy' | 'season'
export interface Route { name: string; params?: any }

/**
 * Bring a save from an earlier version up to date, and tell the manager what each release he hadn't seen brought to it
 * (one email per release, each once), plus any game-world note his career hasn't had. `listed` is the version the
 * save's list entry recorded, for saves from before they recorded it themselves.
 */
function migrateWorld(w: World, backedUp: boolean, listed?: string) {
  const rep = migrateSave(w)
  const sent = sendReleaseMail(w, lastSeenRelease(w, listed, rep.from), APP_VERSION, rep, backedUp)
  sendWorldNotes(w)
  w.meta.appVersion = APP_VERSION
  return { ...rep, mailed: sent }
}

const saveMetaOf = (w: World, id: string, auto: boolean): Omit<SaveMeta, 'size' | 'updated'> => {
  const club = w.clubs[w.userClubId]
  const comp = Object.values(w.competitions).find((c) => c.season === w.season && c.format === 'league' && c.clubs.includes(w.userClubId))
  const f = club ? nextUserFixture(w) : undefined
  const oppId = f ? (f.home === w.userClubId ? f.away : f.home) : 0
  return {
    id, name: w.meta.saveName || `${club?.name} Career`, managerName: `${w.user.firstName} ${w.user.lastName}`,
    clubId: club?.id || 0, clubName: club?.name || 'Unemployed', date: w.date, season: w.season, playTimeMin: w.meta.playTimeMin,
    leagueName: w.leagues[club?.leagueId]?.short || club?.country || '', position: comp && club ? positionOf(w, comp, club.id) : undefined, auto, editMode: !!w.meta.editMode,
    schema: w.meta.version, appVersion: APP_VERSION,
    kit: club?.kit, theme: club?.theme,
    next: f && w.clubs[oppId] ? { oppId, opp: w.clubs[oppId].short, home: f.home === w.userClubId, date: f.date, comp: w.competitions[f.compId]?.short || '' } : undefined,
  }
}

export interface LiveMatch {
  sim: MatchSim
  fixtureId: string
  /** matches kicking off at the same time, stepped in sync with this one */
  others?: OtherLive[]
  /** the one other match pinned as a floating mini player */
  pip?: string
  /** watching as a spectator: nobody's controls, the result is applied like any other game */
  spectator?: boolean
  /** other matches the manager opened or pinned: their full reports are kept */
  viewed?: string[]
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
  /** Edit Mode: don't show the Edited tag on scripted matches (a display preference; the record of the edit stays) */
  hideEdited?: boolean
  /** the four jumps offered by holding Continue, in days (1-30) */
  advanceDays?: number[]
}

export const DEFAULT_ADVANCE_DAYS = [1, 5, 7, 10]

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
  toast?: { id: number; text: string; kind: 'ok' | 'err' | 'info' | 'edit' }
  /** "Latest news" drop-in: a few important fresh stories */
  newsDrop?: { ids: string[]; nonce: number }
  /** the reminder of today's matches on the watch list, open (Continue stopped for them, or the manager opened it) */
  watchPrompt?: number
  prefs: AppPrefs
  saves: SaveMeta[]
  loadDb: () => Promise<RawDb | undefined>
  refreshSaves: () => Promise<void>
  /** builds the world stage by stage (each reported, and awaited, as it is done: the last is 'saved') and opens it */
  startCareer: (opts: NewCareerOptions, onStage?: (s: BuildStage | 'saved') => void | Promise<void>) => Promise<void>
  loadCareer: (id: string) => Promise<boolean>
  deleteCareer: (id: string) => Promise<void>
  /** a named snapshot of the current career */
  createCheckpoint: (name: string) => Promise<CheckpointMeta | undefined>
  /** go back to a checkpoint (the state being left is kept as an automatic checkpoint first) */
  restoreCheckpoint: (cp: CheckpointMeta) => Promise<boolean>
  deleteCheckpoint: (cp: CheckpointMeta) => Promise<void>
  /** a career as a file, to move it to another device or address */
  exportSave: (id: string) => Promise<void>
  importSave: (file: File) => Promise<boolean>
  exitToMenu: () => void
  save: (auto?: boolean) => Promise<void>
  saveAs: (name: string) => Promise<void>
  mutate: (fn: (w: World) => void, opts?: { save?: boolean; roster?: boolean }) => void
  bump: () => void
  setTab: (t: Tab) => void
  /** counts taps on the tab already open at its root: its screen scrolls back to the top */
  topTap: number
  go: (r: Route) => void
  back: () => void
  resetTab: () => void
  open: (r: Route) => void
  close: () => void
  closeAll: () => void
  advance: (until?: string) => Promise<StopReason | undefined>
  stopAdvance: () => void
  stopRequested: boolean
  finishUserMatch: (fixtureId: string, result: MatchResult, others?: OtherLive[]) => void
  /** apply a watched (spectated) match and whatever ran alongside it */
  finishWatched: (fixtureId: string, result: MatchResult, others?: OtherLive[]) => void
  /** watch a fixture live: today it opens straight away; a future one stops the calendar on its day */
  watchFixture: (fixtureId: string) => void
  /** today's watch-list reminder: open it, close it (the matches stay on the list), or let today's go */
  openWatchPrompt: () => void
  closeWatchPrompt: () => void
  skipWatchedToday: () => void
  setLive: (l?: LiveMatch) => void
  notify: (text: string, kind?: 'ok' | 'err' | 'info' | 'edit') => void
  /** show the latest-news drop-in if anything important happened since the last one */
  checkNews: () => void
  clearNewsDrop: () => void
  setPrefs: (p: Partial<AppPrefs>) => void
  /** universal search, over whatever screen is showing */
  searchOpen: boolean
  openSearch: () => void
  closeSearch: () => void
}

const emptyStacks = (): Record<Tab, Route[]> => ({ central: [], squad: [], transfers: [], academy: [], season: [] })
let saveTimer: number | undefined
let toastN = 0

// iOS Safari has no Vibration API. Since iOS 18 a native switch control gives a light haptic tick when it is toggled,
// so a hidden one is toggled instead (inside a tap; iOS gives no haptic outside one, and earlier versions none at all).
let iosSwitch: HTMLLabelElement | undefined
const isIOS = () => typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    label.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.tabIndex = -1
    label.appendChild(input)
    document.body.appendChild(label)
    iosSwitch = label
  }
  iosSwitch.click()
}

/** Restrained feedback, when Haptics is on: a tick for taps, a firmer pulse for decisions, a double for big moments
 *  (a goal, a signing). Android vibrates; iPhones on iOS 18 and later tick. */
export function haptic(kind: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    if (!useGame.getState().prefs.haptics) return
    if (typeof navigator.vibrate === 'function') navigator.vibrate(kind === 'light' ? 10 : kind === 'medium' ? 22 : [28, 55, 38])
    else if (isIOS()) { iosTick(); if (kind === 'heavy') window.setTimeout(iosTick, 110) }
  } catch { /* unsupported */ }
}

export const useGame = create<GameState>((set, get) => ({
  loadingDb: false,
  v: 0,
  tab: 'central',
  topTap: 0,
  stacks: emptyStacks(),
  overlay: [],
  advancing: false,
  prefs: { haptics: true, matchSpeed: 1, speeds: DEFAULT_SPEEDS, sound: false, reduceMotion: false, assistantSubs: false, stopOn: { offers: true, injuries: true, scouting: false, conversations: true, news: false } },
  stopRequested: false,
  saves: [],
  searchOpen: false,

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

  async startCareer(opts, onStage) {
    const raw = await get().loadDb()
    if (!raw) return
    const w = await createWorldAsync(raw, opts, onStage)
    markNotesSeen(w, APP_VERSION)
    careerIntro(w)
    w.flags.assistantSubs = get().prefs.assistantSubs
    // saved before it opens, so the first screen of the career is never held up by the save
    try { await saveCareer(w, saveMetaOf(w, w.meta.id, false)) } catch { get().notify('Save failed — storage unavailable', 'err') }
    await onStage?.('saved')
    set({ world: w, saveId: w.meta.id, v: get().v + 1, tab: 'central', stacks: emptyStacks(), overlay: [] })
  },

  async loadCareer(id) {
    let w: World | undefined
    try { w = await loadSave(id) } catch { w = undefined }
    if (!w) { get().notify('This save could not be read', 'err'); return false }
    const schema = w.meta?.version || 1
    if (schema > SAVE_SCHEMA) { get().notify('Saved by a newer version of Touchline: update the app to load it', 'err'); return false }
    // an older save: keep it exactly as it was before converting it
    let backedUp = false
    if (schema < SAVE_SCHEMA) {
      const bytes = await saveBytes(id).catch(() => undefined)
      if (bytes) {
        await saveCheckpoint(bytes, { careerId: id, name: `Before the v${APP_VERSION} update`, date: w.date, season: w.season, clubName: w.clubs[w.userClubId]?.name || '', auto: 'update', schema }).catch(() => undefined)
        backedUp = true
      }
    }
    const seen = w.meta.appVersion
    const rep = migrateWorld(w, backedUp, (await listSaves().catch(() => [])).find((m) => m.id === id)?.appVersion)
    touchRoster(w)
    clearMemory()
    set({ world: w, saveId: id, v: get().v + 1, tab: 'central', stacks: emptyStacks(), overlay: [], live: undefined })
    await setKV('lastSave', id)
    if (rep.applied.length || rep.mailed) get().notify(`Career updated to v${APP_VERSION}`, 'ok')
    if (rep.applied.length || rep.mailed || seen !== APP_VERSION) await get().save(true)
    return true
  },

  async createCheckpoint(name) {
    const w = get().world
    const id = get().saveId || w?.meta.id
    if (!w || !id) return undefined
    try {
      await get().save(true)
      const m = saveMetaOf(w, id, false)
      const cp = await saveCheckpoint(w, { careerId: id, name: name.trim() || fmtDate(w.date, 'long'), date: w.date, season: w.season, clubName: m.clubName, position: m.position, leagueName: m.leagueName, schema: w.meta.version })
      get().notify('Checkpoint created', 'ok')
      return cp
    } catch {
      get().notify('Checkpoint failed: storage unavailable or full', 'err')
      return undefined
    }
  },

  async restoreCheckpoint(cp) {
    const cur = get().world
    const loaded = cur && (get().saveId || cur.meta.id) === cp.careerId
    // the state we leave is kept, so going back is never a one-way door
    try {
      if (loaded) await saveCheckpoint(cur!, { careerId: cp.careerId, name: `Before restoring “${cp.name}”`, date: cur!.date, season: cur!.season, clubName: cur!.clubs[cur!.userClubId]?.name || '', auto: 'restore', schema: cur!.meta.version })
      else { const b = await saveBytes(cp.careerId); if (b) await saveCheckpoint(b, { careerId: cp.careerId, name: `Before restoring “${cp.name}”`, date: cp.date, season: cp.season, clubName: cp.clubName, auto: 'restore' }) }
    } catch { /* keep going: the restore itself matters more */ }
    const w = await loadCheckpoint(cp.id).catch(() => undefined)
    if (!w) { get().notify('Checkpoint could not be read', 'err'); return false }
    if ((w.meta?.version || 1) > SAVE_SCHEMA) { get().notify('Checkpoint made by a newer version of Touchline', 'err'); return false }
    // (a checkpoint from before an update gets that update's emails, once, like any save)
    migrateWorld(w, false)
    w.meta.id = cp.careerId
    touchRoster(w)
    clearMemory()
    set({ world: w, saveId: cp.careerId, v: get().v + 1, tab: 'central', stacks: emptyStacks(), overlay: [], live: undefined, newsDrop: undefined })
    await get().save(true)
    await setKV('lastSave', cp.careerId)
    get().notify(`Back to “${cp.name}”`, 'ok')
    return true
  },

  async deleteCheckpoint(cp) {
    await removeCheckpoint(cp.careerId, cp.id)
  },

  async exportSave(id) {
    if (get().world && (get().saveId || get().world!.meta.id) === id) await get().save(true)
    const out = await exportCareer(id)
    if (!out) { get().notify('Nothing to export', 'err'); return }
    const file = new File([out.blob], out.filename, { type: 'application/octet-stream' })
    // phones hand the file to the share sheet (Files, AirDrop...); desktops download it
    try {
      if ((navigator as any).canShare?.({ files: [file] })) { await (navigator as any).share({ files: [file], title: out.filename }); return }
    } catch (e: any) { if (e?.name === 'AbortError') return }
    const url = URL.createObjectURL(out.blob)
    const a = document.createElement('a')
    a.href = url; a.download = out.filename
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    get().notify('Career exported', 'ok')
  },

  async importSave(file) {
    try {
      const { world: w, meta } = await readCareerFile(file)
      if (!w?.meta || !w.players || !w.clubs) throw new Error('not a career')
      if ((w.meta.version || 1) > SAVE_SCHEMA) { get().notify('Saved by a newer version of Touchline: update the app to import it', 'err'); return false }
      // never overwrite a career that is already on this device
      const exists = get().saves.some((m) => m.id === w.meta.id)
      if (exists || !w.meta.id) { w.meta.id = `career-${Date.now().toString(36)}`; w.meta.saveName = `${w.meta.saveName || `${w.clubs[w.userClubId]?.name} Career`} (imported)` }
      migrateWorld(w, false, meta?.appVersion)
      await saveCareer(w, saveMetaOf(w, w.meta.id, false))
      await get().refreshSaves()
      get().notify('Career imported', 'ok')
      return true
    } catch {
      get().notify('That file isn’t a Touchline career', 'err')
      return false
    }
  },

  async deleteCareer(id) {
    await deleteSave(id)
    await get().refreshSaves()
  },

  exitToMenu() {
    set({ world: undefined, saveId: undefined, live: undefined, overlay: [], stacks: emptyStacks(), tab: 'central', searchOpen: false })
    get().refreshSaves()
  },

  async save(auto = true) {
    const w = get().world
    if (!w) return
    try {
      await saveCareer(w, saveMetaOf(w, get().saveId || w.meta.id, auto))
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
    if (get().tab === t) {
      // the tab you're on, tapped again: back to its root, and from the root, back to the top
      if (!get().stacks[t].length) set({ topTap: get().topTap + 1 })
      set({ stacks: { ...get().stacks, [t]: [] } })
      return
    }
    set({ tab: t })
    haptic()
  },
  go(r) {
    // navigating from inside an overlay (match day, negotiation…) stacks on the overlay so it stays visible
    if (get().overlay.length) { get().open(r); return }
    const t = get().tab
    const stack = [...get().stacks[t], r]
    // a page opened afresh starts afresh, whatever an earlier visit to it left behind
    forgetView(viewKeyFor(t, stack.length, r.name, r.params))
    set({ stacks: { ...get().stacks, [t]: stack } })
    haptic()
  },
  back() {
    if (get().overlay.length) { get().close(); return }
    const t = get().tab
    const s = get().stacks[t]
    if (s.length) set({ stacks: { ...get().stacks, [t]: s.slice(0, -1) } })
  },
  resetTab() { set({ stacks: { ...get().stacks, [get().tab]: [] } }) },
  open(r) {
    const overlay = [...get().overlay, r]
    forgetView(viewKeyFor('ov', overlay.length, r.name, r.params))
    set({ overlay })
    haptic()
  },
  close() { set({ overlay: get().overlay.slice(0, -1) }) },
  closeAll() { set({ overlay: [] }) },

  async advance(until) {
    const w = get().world
    if (!w || get().advancing) return
    // moving on dismisses the last drop of stories
    set({ advancing: true, stopRequested: false, newsDrop: undefined })
    let stop: StopReason = 'limit'
    const stopOn = get().prefs.stopOn
    const seenInbox = new Set(w.inbox.map((m) => m.id))
    try {
      // step day by day so the calendar animates and the UI stays responsive
      for (let i = 0; i < 400; i++) {
        // busy match days: simulate the day's fixtures in batches so the UI keeps breathing (not on a day with a match
        // to watch: the day stops for it first, and the games played alongside it run with it)
        if (!userFixtureOn(w, w.date) && !watchedOn(w)) {
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
        await new Promise((res) => setTimeout(res, get().prefs.reduceMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0 : until ? 25 : 70))
      }
    } finally {
      set({ advancing: false, lastStop: stop, v: get().v + 1, stopRequested: false })
    }
    // on a match day the stories wait: the preview opens clean and the news drops in after the final whistle
    if (stop !== 'match' && stop !== 'watch') get().checkNews()
    if (stop === 'match') get().open({ name: 'prematch' })
    // a day with matches on the watch list: stop on it and ask (never straight into a match)
    else if (stop === 'watch') get().openWatchPrompt()
    else if (stop === 'season-end') get().open({ name: 'seasonReview', params: { season: w.season - 1 } })
    else if (stop === 'sacked') get().open({ name: 'jobs', params: { sacked: true } })
    else if (stop === 'deadline') get().notify('Transfer Deadline Day!', 'info')
    else if (stop === 'window') get().notify('The transfer window is open', 'info')
    else if (stop === 'inbox') get().notify('New message needs your attention', 'info')
    get().save(true)
    return stop
  },

  stopAdvance() { set({ stopRequested: true }) },

  finishUserMatch(fixtureId, result, others) {
    const w = get().world
    if (!w) return
    const f = w.fixtures[fixtureId]
    if (!f || f.played) return
    const rng = worldRng(w)
    afterMatch(w, f, result, rng)
    applyOthers(w, others, rng, get().live?.viewed)
    // play the rest of the day's fixtures so tables and other results are current
    simulateDay(w, rng)
    w.rng = rng.state
    w.lastUserResult = f.id
    set({ v: get().v + 1, live: undefined })
    window.setTimeout(() => get().checkNews(), 1800)
    get().save(true)
  },

  finishWatched(fixtureId, result, others) {
    const w = get().world
    if (!w) return
    const f = w.fixtures[fixtureId]
    const rng = worldRng(w)
    if (f && !f.played) afterMatch(w, f, result, rng, true)
    applyOthers(w, others, rng, get().live?.viewed)
    w.rng = rng.state
    set({ v: get().v + 1, live: undefined })
    get().save(true)
  },

  watchFixture(fixtureId) {
    const w = get().world
    if (!w || get().live) return
    const f = w.fixtures[fixtureId]
    if (!f || f.played || f.userInvolved) return
    if (f.date > w.date) {
      setWatched(w, f.id, true)
      get().notify(`Set to watch ${w.clubs[f.home]?.short} v ${w.clubs[f.away]?.short}: Continue stops on ${fmtDate(f.date, 'dm')}`, 'ok')
      set({ v: get().v + 1 })
      return
    }
    if (f.date < w.date) return
    setWatched(w, f.id, false)
    set({ watchPrompt: undefined })
    const sim = createSim(w, f, false, true)
    set({ live: { sim, fixtureId: f.id, speed: get().prefs.matchSpeed, running: true, tick: 0, finished: false, applied: false, spectator: true, others: createOthers(w, f) }, v: get().v + 1 })
    get().closeAll()
    get().open({ name: 'match' })
  },

  openWatchPrompt() { if (get().world && watchedToday(get().world!).length) set({ watchPrompt: Date.now() }) },
  closeWatchPrompt() { set({ watchPrompt: undefined }) },
  skipWatchedToday() {
    const w = get().world
    if (!w) return
    for (const f of watchedToday(w)) setWatched(w, f.id, false)
    set({ watchPrompt: undefined, v: get().v + 1 })
    get().save(true)
  },

  setLive(l) { set({ live: l, v: get().v + 1 }) },

  checkNews() {
    const w = get().world
    if (!w) return
    const num = (id: string) => Number(id.slice(1)) || 0
    const seen = Number(w.flags.newsSeen || 0)
    const fresh = w.news.filter((n) => num(n.id) > seen)
    if (w.news[0]) w.flags.newsSeen = num(w.news[0].id)
    const own = (n: (typeof fresh)[number]) => !!n.quote && n.quote.clubId === w.userClubId && n.kind === 'manager'
    // what he follows counts for a little more: its real developments make the drop-in, the small stuff stays in the feed
    const sets = followSets(w)
    const weight = (n: (typeof fresh)[number]) => n.importance + (n.importance >= 2 && newsFollowRef(w, n, sets) ? 1 : 0)
    const pickd = fresh.filter((n) => weight(n) >= 3 && !own(n)).sort((a, b) => weight(b) - weight(a) || num(b.id) - num(a.id)).slice(0, 3)
    if (!seen || !pickd.length) return
    set({ newsDrop: { ids: pickd.map((n) => n.id), nonce: Date.now() } })
  },
  clearNewsDrop() { set({ newsDrop: undefined }) },

  notify(text, kind = 'info') {
    const id = ++toastN
    set({ toast: { id, text, kind } })
    window.setTimeout(() => { if (get().toast?.id === id) set({ toast: undefined }) }, 2600)
  },

  openSearch() { if (!get().searchOpen) { set({ searchOpen: true }); haptic() } },
  closeSearch() { if (get().searchOpen) set({ searchOpen: false }) },

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

/** Apply matches that ran live alongside another one, with exactly the results that were on screen. */
function applyOthers(w: World, others: OtherLive[] | undefined, rng: ReturnType<typeof worldRng>, viewed?: string[]) {
  for (const o of others || []) {
    const f = w.fixtures[o.fixtureId]
    if (!f || f.played) continue
    const r = o.sim.finished ? o.sim.result() : o.sim.runToEnd()
    afterMatch(w, f, r, rng, !!viewed?.includes(o.fixtureId))
  }
}
