import { useState } from 'react'
import { Fx } from '../components/Fx'
import { useGame, haptic } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Badge, Empty } from '../components/atoms'
import { Confirm, Screen, Toggle } from '../components/layout'
import { fmtDate, seasonLabel } from '../../domain/dates'
import type { SaveMeta } from '../../services/saves'
import { NewCareer } from './NewCareer'
import { Wordmark } from '../components/brand'
import { ImageCheck } from '../components/ImageCheck'
import { SpeedEditor } from '../components/SpeedEditor'

type View = 'home' | 'new' | 'load' | 'settings' | 'about'

export function MainMenu() {
  const [view, setView] = useState<View>('home')
  if (view === 'new') return <NewCareer onExit={() => setView('home')} />
  if (view === 'load') return <LoadCareer onBack={() => setView('home')} />
  if (view === 'settings') return <AppSettings onBack={() => setView('home')} />
  if (view === 'about') return <About onBack={() => setView('home')} />
  return <Home onView={setView} />
}

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
        <div className="menu-fluid"><i className="b1" /><i className="b2" /><i className="b3" /><i className="b4" /></div>
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
          {last && (
            <button className="card tap continue-card" disabled={busy} onClick={async () => { haptic('medium'); setBusy(true); const ok = await loadCareer(last.id); if (!ok) { setBusy(false); useGame.getState().notify('Save could not be loaded', 'err') } }}>
              <div className="row" style={{ padding: 14, gap: 14 }}>
                <Badge club={{ id: last.clubId, badge: true, sofifaTeamId: 0, name: last.clubName, abbr: last.clubName.slice(0, 3).toUpperCase(), kit: ['#333', '#fff'], theme: '#333' } as any} size={50} />
                <div className="grow" style={{ textAlign: 'left' }}>
                  <div className="kicker">Continue</div>
                  <div className="h3" style={{ marginTop: 3 }}>{last.clubName}</div>
                  <div className="tiny muted" style={{ marginTop: 3 }}>{last.managerName} · {fmtDate(last.date, 'long')}{last.position ? ` · ${ordinal(last.position)} in ${last.leagueName}` : ''}</div>
                </div>
                {busy ? <div className="spinner" /> : <Icon name="play" size={26} color="var(--acc)" />}
              </div>
            </button>
          )}
          <button className="btn primary block" style={{ height: 56, fontSize: 19 }} onClick={() => { haptic('medium'); onView('new') }}>
            <Icon name="plus" size={22} /> New Career
          </button>
          <div className="row">
            <button className="btn grow" onClick={() => onView('load')}><Icon name="save" size={18} /> Load{saves.length ? ` (${saves.length})` : ''}</button>
            <button className="btn grow" onClick={() => onView('settings')}><Icon name="settings" size={18} /> Settings</button>
          </div>
          <button className="tiny dim" style={{ marginTop: 4 }} onClick={() => onView('about')}>
            {loadingDb ? 'Loading football database…' : 'Data sources & credits'}
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

function LoadCareer({ onBack }: { onBack: () => void }) {
  const saves = useGame((s) => s.saves)
  const loadCareer = useGame((s) => s.loadCareer)
  const deleteCareer = useGame((s) => s.deleteCareer)
  const [del, setDel] = useState<SaveMeta>()
  const [busy, setBusy] = useState<string>()
  return (
    <Screen title="Load Career" back onBack={onBack} noNav>
      {!saves.length && <Empty icon="save" title="No saved careers" text="Start a new career — progress is saved automatically after every match and when you advance." />}
      <div className="pad stack stagger">
        {saves.map((s) => (
          <div key={s.id} className="card">
            <button className="row tap" style={{ padding: 14, width: '100%', textAlign: 'left', gap: 14 }} disabled={!!busy} onClick={async () => { setBusy(s.id); const ok = await loadCareer(s.id); if (!ok) { setBusy(undefined); useGame.getState().notify('Save could not be loaded', 'err') } }}>
              <Badge club={{ id: s.clubId, badge: true, sofifaTeamId: 0, name: s.clubName, abbr: s.clubName.slice(0, 3).toUpperCase(), kit: ['#333', '#fff'], theme: '#333' } as any} size={46} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="t b ellipsis">{s.name}</div>
                <div className="tiny muted" style={{ marginTop: 2 }}>{s.managerName} · {s.clubName}</div>
                <div className="tiny dim" style={{ marginTop: 2 }}>{fmtDate(s.date, 'long')} · {seasonLabel(s.season)}{s.position ? ` · ${ordinal(s.position)}` : ''}</div>
                <div className="tiny dim" style={{ marginTop: 2 }}>Saved {new Date(s.updated).toLocaleString()} · {(s.size / 1e6).toFixed(1)} MB{s.auto ? ' · autosave' : ''}</div>
              </div>
              {busy === s.id ? <div className="spinner" /> : <Icon name="forward" size={20} color="var(--t3)" />}
            </button>
            <div className="row" style={{ borderTop: '1px solid var(--line)', padding: '8px 12px', justifyContent: 'flex-end' }}>
              <button className="btn xs danger" onClick={() => setDel(s)}><Icon name="trash" size={14} /> Delete</button>
            </div>
          </div>
        ))}
      </div>
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
          <Toggle label="Reduce motion" sub="Skips calendar animation while advancing" on={prefs.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} />
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
