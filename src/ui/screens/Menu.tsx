import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Fx } from '../components/Fx'
import { useGame, haptic } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Badge, Empty } from '../components/atoms'
import { Confirm, Screen, Toggle } from '../components/layout'
import { fmtDate, seasonLabel } from '../../domain/dates'
import type { SaveMeta } from '../../services/saves'
import { NewCareer } from './NewCareer'
import { APP_VERSION, Wordmark } from '../components/brand'
import { CheckpointList } from '../components/Checkpoints'
import { SAVE_SCHEMA } from '../../engine/world/migrate'
import { ImageCheck } from '../components/ImageCheck'
import { SpeedEditor } from '../components/SpeedEditor'
import { clubAccent } from '../theme'

type View = 'home' | 'new' | 'load' | 'settings' | 'about'

export function MainMenu() {
  const [view, setView] = useState<View>('home')
  // the system's back (Android's button, the browser's) from Load, Settings or Data & Credits goes home (New Career
  // takes it a step at a time itself)
  useEffect(() => {
    if (view === 'home' || view === 'new') return
    const onPop = () => setView('home')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [view])
  const home = () => setView('home')
  if (view === 'new') return <NewCareer onExit={home} />
  if (view === 'load') return <SubView><LoadCareer onBack={home} /></SubView>
  if (view === 'settings') return <SubView><AppSettings onBack={home} /></SubView>
  if (view === 'about') return <SubView><About onBack={home} /></SubView>
  return <Home onView={setView} />
}

/** The menu's own air, the colour drifting at the top of the screen (Home has it at full strength, the views
 *  opened from it more quietly). */
function MenuFluid() {
  return <div className="menu-fluid"><i className="b1" /><i className="b2" /><i className="b3" /><i className="b4" /></div>
}

/** Load, Settings and Data & Credits: still the menu (its air carries on behind, quieter), coming in from the side. */
function SubView({ children }: { children: ReactNode }) {
  return (
    <div className="menu-sub">
      <div className="menu-sub-air" aria-hidden><MenuFluid /></div>
      {children}
    </div>
  )
}

/** A save's club colour: kept with the save since 4.2, else read from the database once it is in. */
function useSaveAccent(s: SaveMeta): string | undefined {
  const raw = useGame((g) => g.raw)
  const src = s.kit ? { kit: s.kit, theme: s.theme || s.kit[0] } : raw?.clubs.find((c) => c.id === s.clubId)
  return src ? clubAccent(src) : undefined
}

/** When a save was written, the way a person says it: just now, 12 min ago, today 21:33, yesterday 21:33, 3 Oct. */
function savedAgo(ts: number, now = Date.now()): string {
  const min = Math.floor((now - ts) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const d = new Date(ts), today = new Date(now)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000)
  if (days === 0) return `today ${time}`
  if (days === 1) return `yesterday ${time}`
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })
}

/** Hours and minutes of play. */
const played = (min: number) => (min < 60 ? `${Math.max(1, Math.round(min))} min` : `${Math.floor(min / 60)} h${min % 60 >= 1 ? ` ${Math.round(min % 60)} min` : ''}`)

/** The career to go back to, in its club's colours: where it stands, and what comes next. */
function ContinueCard({ save, busy, onPlay }: { save: SaveMeta; busy: boolean; onPlay: () => void }) {
  const acc = useSaveAccent(save)
  const n = save.next
  const today = n && n.date === save.date
  return (
    <button className="menu-continue" disabled={busy} onClick={onPlay} style={acc ? ({ ['--cc' as string]: acc } as CSSProperties) : undefined}>
      <span className="menu-continue-crest"><Badge club={saveClub(save)} size={60} /></span>
      <span className="menu-continue-main">
        <span className="menu-continue-k">Continue</span>
        <b className="menu-continue-club">{save.clubName}</b>
        <span className="menu-continue-line">{save.position ? `${ordinal(save.position)} in ${save.leagueName} · ` : ''}{fmtDate(save.date, 'full')}</span>
        {n && (
          <span className={`menu-continue-next ${today ? 'today' : ''}`}>
            <span className="menu-continue-when">{today ? 'Today' : `Next · ${fmtDate(n.date, 'dm')}`}</span>
            <Badge club={{ id: n.oppId, badge: true, sofifaTeamId: 0, name: n.opp, abbr: n.opp.slice(0, 3).toUpperCase(), kit: ['#333', '#fff'], theme: '#333' } as never} size={16} />
            <span className="ellipsis">{n.opp} {n.home ? '(H)' : '(A)'}{n.comp ? ` · ${n.comp}` : ''}</span>
          </span>
        )}
      </span>
      <span className="menu-continue-go">{busy ? <span className="spinner" /> : <Icon name="play" size={22} />}</span>
    </button>
  )
}

/** A save's club as the crest component takes it (its crest is found by its id). */
const saveClub = (s: SaveMeta) => ({ id: s.clubId, badge: true, sofifaTeamId: 0, name: s.clubName, abbr: s.clubName.slice(0, 3).toUpperCase(), kit: s.kit || ['#333', '#fff'], theme: s.theme || '#333' }) as never

function CrestMarquee() {
  const raw = useGame((s) => s.raw)
  if (!raw) return null
  const top = [...raw.clubs].filter((c) => c.badge && c.leagueId).sort((a, b) => b.squadAvg - a.squadAvg).slice(0, 36)
  const rows = [top.filter((_, i) => i % 2 === 0), top.filter((_, i) => i % 2 === 1)]
  return (
    <div className="crest-marquee" aria-hidden>
      {rows.map((r, k) => (
        <div key={k} className={`marquee-row ${k ? 'rev' : ''}`}>
          {[...r, ...r].map((c, i) => <Badge key={`${c.id}-${i}`} club={c as any} size={34} />)}
        </div>
      ))}
    </div>
  )
}

function Home({ onView }: { onView: (v: View) => void }) {
  const saves = useGame((s) => s.saves)
  const loadCareer = useGame((s) => s.loadCareer)
  const loadingDb = useGame((s) => s.loadingDb)
  const [busy, setBusy] = useState(false)
  const last = saves[0]
  return (
    <div className="screen no-nav no-top menu-screen">
      <div className="menu-bg" aria-hidden>
        {/* slow, heavy colour drifting through the top of the screen: ambient, never busy */}
        <MenuFluid />
        <Fx kind="floodlights" />
        
        <svg className="menu-pitch" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice">
          <g fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="2">
            <rect x="30" y="40" width="340" height="520" rx="4" />
            <line x1="30" y1="300" x2="370" y2="300" />
            <circle cx="200" cy="300" r="62" />
            <rect x="110" y="40" width="180" height="90" />
            <rect x="110" y="470" width="180" height="90" />
          </g>
        </svg>
      </div>
      <div className="menu-inner">
        <div className="fade-up" style={{ marginTop: 'calc(var(--sat) + 9vh)' }}>
          <Wordmark size={1} version />
          <div className="kicker" style={{ marginTop: 14 }}>Manager Career · {seasonLabel(2026)}</div>
          <div className="muted small" style={{ marginTop: 6, maxWidth: 300 }}>EA SPORTS FC 27 ratings · Real 2026/27 leagues, fixtures and European competitions</div>
        </div>

        <div style={{ marginTop: 'auto' }}><CrestMarquee /></div>
        <div className="stack stagger" style={{ marginTop: 22, paddingBottom: 'calc(var(--sab) + 24px)' }}>
          {last && <ContinueCard save={last} busy={busy} onPlay={async () => { haptic('medium'); setBusy(true); const ok = await loadCareer(last.id); if (!ok) setBusy(false) }} />}
          <button className="btn primary block menu-new" onClick={() => { haptic('medium'); onView('new') }}>
            <Icon name="plus" size={22} /> New Career
          </button>
          <div className="row">
            <button className="btn grow" onClick={() => { haptic(); onView('load') }}><Icon name="save" size={18} /> Load{saves.length > 0 && <span className="menu-count">{saves.length}</span>}</button>
            <button className="btn grow" onClick={() => { haptic(); onView('settings') }}><Icon name="settings" size={18} /> Settings</button>
          </div>
          <button className="menu-credits" onClick={() => { haptic(); onView('about') }}>
            {loadingDb ? <><span className="spinner xs" /> Loading the football database</> : <>Data sources &amp; credits</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** A saved career's card, washed with its club's colour at the top. */
function SaveCard({ save, children }: { save: SaveMeta; children: ReactNode }) {
  const acc = useSaveAccent(save)
  return <div className="card save-card" style={acc ? ({ ['--cc' as string]: acc } as CSSProperties) : undefined}>{children}</div>
}

function LoadCareer({ onBack }: { onBack: () => void }) {
  const saves = useGame((s) => s.saves)
  const loadCareer = useGame((s) => s.loadCareer)
  const deleteCareer = useGame((s) => s.deleteCareer)
  const importSave = useGame((s) => s.importSave)
  const exportSave = useGame((s) => s.exportSave)
  const [del, setDel] = useState<SaveMeta>()
  const [busy, setBusy] = useState<string>()
  const [open, setOpen] = useState<string>()
  // stays rendered after the first open so collapsing animates
  const [seen, setSeen] = useState<string[]>([])
  const file = useRef<HTMLInputElement>(null)
  return (
    <Screen title="Load Career" back onBack={onBack} noNav right={<button className="btn xs" onClick={() => { haptic(); file.current?.click() }}><Icon name="download" size={14} /> Import</button>}>
      <input ref={file} type="file" accept=".touchline,application/octet-stream,application/json" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setBusy('import'); await importSave(f); setBusy(undefined) } }} />
      {!saves.length && <Empty icon="save" title="No saved careers" text="Start a new career — progress is saved automatically after every match and when you advance. A career exported from another device can be brought in with Import." />}
      <div className="pad stack stagger">
        {saves.map((s) => {
          const older = (s.schema || 1) < SAVE_SCHEMA, newer = (s.schema || 1) > SAVE_SCHEMA
          return (
            <SaveCard key={s.id} save={s}>
              <button className="row tap" style={{ padding: 14, width: '100%', textAlign: 'left', gap: 14 }} disabled={!!busy || newer} onClick={async () => { haptic('medium'); setBusy(s.id); const ok = await loadCareer(s.id); if (!ok) setBusy(undefined) }}>
                <span className="save-crest"><Badge club={saveClub(s)} size={48} /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="t b row tight" style={{ minWidth: 0 }}><span className="ellipsis">{s.name}</span>{s.editMode && <span className="edit-flag sm" title="Edit Mode career"><Icon name="edit" size={11} strokeWidth={2.2} /></span>}</div>
                  <div className="tiny muted" style={{ marginTop: 3 }}>{s.managerName} · {s.clubName}{s.position ? ` · ${ordinal(s.position)} in ${s.leagueName}` : ''}</div>
                  <div className="tiny dim" style={{ marginTop: 2 }}>{fmtDate(s.date, 'full')} · {seasonLabel(s.season)}</div>
                  <div className="tiny dim" style={{ marginTop: 2 }}>Saved {savedAgo(s.updated)}{s.auto ? ' (auto)' : ''}{s.playTimeMin ? ` · ${played(s.playTimeMin)} played` : ''} · {(s.size / 1e6).toFixed(1)} MB</div>
                  {(older || newer) && <span className={`save-ver ${newer ? 'newer' : ''}`}><Icon name={newer ? 'lock' : 'refresh'} size={11} />{newer ? 'Made with a newer version' : `${s.appVersion ? `v${s.appVersion}` : 'Earlier version'} · updates to v${APP_VERSION} on load`}</span>}
                </div>
                {busy === s.id ? <div className="spinner" /> : <Icon name="forward" size={20} color="var(--t3)" />}
              </button>
              <div className="row save-actions">
                <button className={`btn xs ${open === s.id ? 'on' : ''}`} onClick={() => { haptic(); setOpen(open === s.id ? undefined : s.id); if (!seen.includes(s.id)) setSeen([...seen, s.id]) }}><Icon name="flag" size={14} /> Checkpoints<Icon name="down" size={13} style={{ transform: open === s.id ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} /></button>
                <span className="grow" />
                <button className="btn xs" onClick={() => { haptic(); exportSave(s.id) }}><Icon name="upload" size={14} /> Export</button>
                <button className="btn xs danger" onClick={() => setDel(s)}><Icon name="trash" size={14} /></button>
              </div>
              <div className={`save-cps ${open === s.id ? 'open' : ''}`}><div>{seen.includes(s.id) && <CheckpointList careerId={s.id} />}</div></div>
            </SaveCard>
          )
        })}
      </div>
      {busy === 'import' && <div className="pad"><div className="card pad-card row tight small"><div className="spinner" /> Importing…</div></div>}
      <Confirm open={!!del} title="Delete career?" danger confirm="Delete" text={del ? `“${del.name}” will be permanently deleted from this device.` : ''} onConfirm={() => del && deleteCareer(del.id)} onClose={() => setDel(undefined)} />
    </Screen>
  )
}

export function AppSettings({ onBack }: { onBack: () => void }) {
  const prefs = useGame((s) => s.prefs)
  const setPrefs = useGame((s) => s.setPrefs)
  return (
    <Screen title="Settings" back onBack={onBack} noNav>
      <div className="pad stack">
        <div className="card">
          <div className="card-h"><div className="label">Match speed buttons</div></div>
          <SpeedEditor />
          <Toggle label="Assistant manages substitutions" sub="Your assistant makes changes for injuries and fatigue during live matches" on={prefs.assistantSubs} onChange={(v) => setPrefs({ assistantSubs: v })} />
        </div>
        <div className="card">
          <div className="card-h"><div className="label">Device</div></div>
          <Toggle label="Haptic feedback" sub="Vibration on taps and goals (supported devices)" on={prefs.haptics} onChange={(v) => setPrefs({ haptics: v })} />
          <Toggle label="Reduce motion" sub="Calmer screens: no ambient movement, transitions and celebrations go straight to the end, the calendar skips its animation. The match itself still plays out. Also on whenever your device asks for less motion." on={prefs.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} />
        </div>
        <ImageCheck />
      </div>
    </Screen>
  )
}

function About({ onBack }: { onBack: () => void }) {
  return (
    <Screen title="Data & Credits" back onBack={onBack} noNav>
      <div className="pad stack">
        <div className="card pad-card stack small">
          <div className="h3">Football data</div>
          <div className="muted">Player ratings, attributes, PlayStyles, positions, contracts and values come from the EA SPORTS FC 27 database (SoFIFA roster 27.0002), enriched with FC 26 DataHub fields. Player headshots and team crests load from the SoFIFA image CDN.</div>
          <div className="muted">League memberships, 2026/27 fixture lists (Premier League, EFL, LaLiga, Bundesliga, Serie A, Ligue 1, Eredivisie and more), UEFA 2026/27 pots and 2025/26 honours reflect the real season. Clubs not licensed in EA FC are replaced by the strongest eligible licensed club.</div>
          <div className="h3" style={{ marginTop: 6 }}>Assets</div>
          <div className="muted">Competition logos from public logo sets; flags from flag-icons (MIT). Interface, icons and competition emblems designed for Touchline.</div>
          <div className="dim tiny" style={{ marginTop: 6 }}>Touchline is an unofficial fan project and is not affiliated with EA SPORTS, UEFA or any league or club.</div>
        </div>
      </div>
    </Screen>
  )
}
