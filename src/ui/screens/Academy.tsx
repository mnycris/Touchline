import { useRemember } from '../memory'
import { useMemo, useState } from 'react'
import { Fx } from '../components/Fx'
import { useGame, useWorld, haptic } from '../../store/game'
import type { Prospect, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Avatar, Empty, Face, Flag, Ovr, PosChip, Stars, StatRow } from '../components/atoms'
import { Confirm, HubActions, Screen, Seg, Sheet, Tabs } from '../components/layout'
import { Silhouette } from '../components/Silhouette'
import { fmtMoney } from '../../domain/finance'
import { ageOn, fmtDate } from '../../domain/dates'
import { daysToNext, firstTeamBar, graduatesInSquad, paceOf, readiness } from '../../engine/world/academy'
import { academyOf } from '../../engine/world/roster'
import { PLAYER_TYPES, promoteYouth, sendYouthScout, signProspect, fireScout } from '../../engine/world/scouting'
import { ATTR_GROUPS, ATTR_LABEL } from '../../domain/constants'
import { A } from '../../domain/types'
import { HireSheet } from './Transfers'
import { ageOf, userClub } from '../selectors'
import { releaseUserPlayer } from '../../engine/world/userActions'

const YOUTH_COUNTRIES = ['England', 'Spain', 'France', 'Germany', 'Italy', 'Portugal', 'Netherlands', 'Belgium', 'Brazil', 'Argentina', 'Uruguay', 'Colombia', 'Croatia', 'Serbia', 'Denmark', 'Norway', 'Sweden', 'Scotland', 'Republic of Ireland', 'United States', 'Mexico', 'Japan', 'Korea Republic', 'Nigeria', 'Ghana', 'Senegal', "Côte d'Ivoire", 'Morocco', 'Cameroon', 'Türkiye', 'Poland', 'Austria', 'Switzerland', 'Ecuador']

export function Academy() {
  const w = useWorld()
  const [tab, setTab] = useRemember<'squad' | 'prospects' | 'scouts'>('tab', 'squad')
  if (w.flags.unemployed) return <Screen title="Youth Academy" right={<HubActions />}><Empty icon="academy" title="No club" /></Screen>
  const club = userClub(w)
  const squad = academyOf(w, club.id)
  const prospects = w.prospects.filter((p) => !p.signed)
  return (
    <Screen title="Youth Academy" sub={`${club.short} Academy · ${squad.length}/15`} right={<HubActions />}>
      <div className="pad">
        <div className="hero" style={{ padding: 16, minHeight: 120 }}>
          <Fx kind="pitch" />
          <div className="row between" style={{ position: 'relative', zIndex: 1, marginTop: 34 }}>
            <div><div className="label" style={{ color: 'rgba(255,255,255,.75)' }}>Academy rating</div><div style={{ marginTop: 6 }}><Stars n={club.youthRating / 2} size={16} /></div></div>
            <div style={{ textAlign: 'right' }}><div className="label" style={{ color: 'rgba(255,255,255,.75)' }}>Youth scouts</div><div className="display" style={{ fontSize: 26, marginTop: 4 }}>{w.youthScouts.length}/3</div></div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}><Tabs items={[{ id: 'squad', label: `Academy (${squad.length})` }, { id: 'prospects', label: `Prospects (${prospects.length})` }, { id: 'scouts', label: 'Youth Scouts' }]} value={tab} onChange={setTab} /></div>
      {tab === 'squad' && <AcademySquad w={w} />}
      {tab === 'prospects' && <Prospects w={w} list={prospects} />}
      {tab === 'scouts' && <YouthScouts w={w} />}
    </Screen>
  )
}

const READY_TONE = { Ready: 'var(--pos)', Close: 'var(--warn)', Developing: 'var(--t3)' } as const
const PACE_TONE = { pos: 'var(--pos)', neu: 'var(--t2)', neg: 'var(--t3)' } as const
const PACE_SHORT: Record<string, string> = { 'Fast developer': 'Fast riser', 'Steady progress': 'Steady', 'Slow burner': 'Slow burner' }

function AcademySquad({ w }: { w: World }) {
  const mutate = useGame((s) => s.mutate)
  const go = useGame((s) => s.go)
  const notify = useGame((s) => s.notify)
  const [rel, setRel] = useState<number>()
  const club = userClub(w)
  const bar = useMemo(() => firstTeamBar(w), [w.date, w.userClubId])
  const rank = { Ready: 0, Close: 1, Developing: 2 }
  const squad = [...academyOf(w, club.id)].sort((a, b) => rank[readiness(a, bar)] - rank[readiness(b, bar)] || b.pot - a.pot)
  const grads = graduatesInSquad(w)
  // players 19 or older on 1 July move up to the senior squad at the end of the season
  const cutoff = `${w.date.slice(5) >= '07-01' ? w.season + 1 : w.season}-07-01`
  const agesOut = (dob: string) => ageOn(dob, cutoff) >= 19
  if (!squad.length && !grads.length) return <Empty icon="youth" title="Academy is empty" text="Send youth scouts on missions and sign the best prospects they find." />
  const nReady = squad.filter((p) => readiness(p, bar) === 'Ready').length
  const nClose = squad.filter((p) => readiness(p, bar) === 'Close').length
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      <div className="ac-sum">
        <div><span className="display">{bar}</span><span className="tiny dim">First-team bar</span></div>
        <div><span className="display" style={{ color: 'var(--pos)' }}>{nReady}</span><span className="tiny dim">Ready now</span></div>
        <div><span className="display" style={{ color: 'var(--warn)' }}>{nClose}</span><span className="tiny dim">Close</span></div>
        <div><span className="display">{grads.length}</span><span className="tiny dim">Graduates in squad</span></div>
      </div>
      <div className="tiny dim" style={{ margin: '8px 2px 12px' }}>The bar is the level of real cover in your current XI. Ready players can help the first team now; close ones are within five points.</div>
      {squad.length > 0 && (
        <div className="card list">
          {squad.map((p) => {
            const r = readiness(p, bar)
            const pace = paceOf(p)
            const next = daysToNext(p)
            const out = agesOut(p.dob)
            const fill = Math.max(4, Math.min(100, ((p.ovr - (bar - 20)) / 20) * 100))
            return (
              <div key={p.id} className="li ac-row">
                <button className="row ac-top" onClick={() => go({ name: 'player', params: { id: p.id } })}>
                  <Face p={p} size={42} radius={10} club={club} />
                  <div className="meta">
                    <div className="row tight" style={{ minWidth: 0 }}><span className="t small ellipsis">{p.name}</span><span className="pill ac-ready" style={{ color: READY_TONE[r], background: `color-mix(in srgb, ${READY_TONE[r]} 16%, transparent)` }}>{r}</span></div>
                    <div className="s row tight"><Flag w={w} nation={p.nation} size={10} /><span className="ellipsis">{ageOf(w, p)} yrs · POT {p.pot}{out && <span className="ac-out"> · senior squad 1 Jul</span>}</span></div>
                    <div className="ac-bar" aria-label={`OVR ${p.ovr} against a first-team bar of ${bar}`}><i style={{ width: `${fill}%`, background: READY_TONE[r] }} /></div>
                  </div>
                  <PosChip pos={p.positions[0]} />
                  <Ovr v={p.ovr} size="sm" />
                </button>
                <div className="ac-foot">
                  <span className="tiny ellipsis" style={{ minWidth: 0 }}><span style={{ color: PACE_TONE[pace.tone] }}>{PACE_SHORT[pace.label] || pace.label}</span><span className="dim">{next != null ? ` · +1 in ~${next}d` : ' · at his ceiling'}</span></span>
                  <span className="grow" />
                  <button className="btn xs ac-rel" onClick={() => setRel(p.id)} aria-label={`Release ${p.name}`}><Icon name="close" size={13} strokeWidth={2.4} /></button>
                  <button className={`btn xs ${r === 'Ready' ? 'primary' : 'club'}`} onClick={() => { haptic('medium'); mutate((w) => promoteYouth(w, p.id), { roster: true }); notify(`${p.name} promoted to the first team`, 'ok') }}>Promote</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="tiny dim" style={{ marginTop: 8 }}>Academy players develop every day. Anyone who is 19 on 1 July moves up to the senior squad automatically at the end of the season, so decide on them before then.</div>
      {grads.length > 0 && (
        <>
          <div className="label" style={{ margin: '18px 2px 8px' }}>Graduates in the first team</div>
          <div className="card list">
            {grads.map((p) => {
              const st = Object.values(p.season).reduce((a, x) => ({ apps: a.apps + x.apps, goals: a.goals + x.goals }), { apps: 0, goals: 0 })
              return (
                <button key={p.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
                  <Face p={p} size={36} radius={9} club={club} />
                  <div className="meta"><div className="t small ellipsis">{p.name}</div><div className="s">{p.gradDate ? `Promoted ${fmtDate(p.gradDate, 'dm')} ${p.gradDate.slice(0, 4)}` : 'Academy graduate'} · {st.apps} apps{st.goals ? ` · ${st.goals} goals` : ''} this season</div></div>
                  <PosChip pos={p.positions[0]} />
                  <Ovr v={p.ovr} size="sm" />
                </button>
              )
            })}
          </div>
        </>
      )}
      <Confirm open={!!rel} title="Release academy player?" danger confirm="Release" text={rel ? `${w.players[rel]?.name} will leave the club.` : ''} onConfirm={() => { mutate((w) => { const p = w.players[rel!]; if (p) { p.academy = false; releaseUserPlayer(w, p) } }, { roster: true }) }} onClose={() => setRel(undefined)} />
    </div>
  )
}

function Prospects({ w, list }: { w: World; list: Prospect[] }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [sel, setSel] = useState<Prospect>()
  const full = academyOf(w, w.userClubId).length >= 15
  if (!list.length) return <Empty icon="scout" title="No prospects" text="Your youth scouts report monthly with new players they have found." />
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      <div className="card list">
        {[...list].sort((a, b) => b.potRange[1] - a.potRange[1]).map((p) => (
          <button key={p.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setSel(p)}>
            <div className="face" style={{ width: 42, height: 42, borderRadius: 10 }}><Silhouette size={42} kit={userClub(w).kit[0]} trim={userClub(w).kit[1]} seed={p.faceSeed} /></div>
            <div className="meta"><div className="t small ellipsis">{p.name}</div><div className="s row tight"><Flag w={w} nation={p.nation} size={10} />{p.age} yrs · {p.playerType} · found {fmtDate(p.found, 'dm')}</div></div>
            <PosChip pos={p.positions[0]} />
            <div className="col" style={{ alignItems: 'center' }}><Ovr v={`${p.ovrRange[0]}-${p.ovrRange[1]}`} size="sm" style={{ fontSize: 13 }} /><span className="tiny gold num">{p.potRange[0]}-{p.potRange[1]}</span></div>
          </button>
        ))}
      </div>
      <Sheet open={!!sel} onClose={() => setSel(undefined)} title={sel?.name}>
        {sel && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 12 }}>
              <div className="face" style={{ width: 72, height: 72, borderRadius: 16 }}><Silhouette size={72} kit={userClub(w).kit[0]} trim={userClub(w).kit[1]} seed={sel.faceSeed} /></div>
              <div className="grow"><div className="b">{sel.fullName}</div><div className="tiny dim row tight"><Flag w={w} nation={sel.nation} size={11} />{sel.nation} · {sel.age} · {sel.height} cm · {sel.foot === 'L' ? 'Left' : 'Right'} foot</div><div className="row tight" style={{ marginTop: 6 }}><PosChip pos={sel.positions[0]} /><span className="small">OVR <b>{sel.ovrRange[0]}–{sel.ovrRange[1]}</b></span><span className="small gold">POT <b>{sel.potRange[0]}–{sel.potRange[1]}</b></span></div></div>
            </div>
            <div className="grid2">
              {ATTR_GROUPS.slice(0, 6).map((g) => (
                <div key={g.key} className="card pad-card" style={{ padding: 10 }}>
                  <div className="label">{g.label}</div>
                  {g.attrs.slice(0, 3).map((k) => <StatRow key={k} label={ATTR_LABEL[k]} v={sel.attrs[A[k]]} />)}
                </div>
              ))}
            </div>
            <div className="tiny dim">Scout's judgement narrows the rating ranges. Signing costs nothing but takes an academy place.</div>
            <div className="row">
              <button className="btn grow" onClick={() => { mutate((w) => { w.prospects = w.prospects.filter((x) => x.id !== sel.id) }); setSel(undefined) }}>Dismiss</button>
              <button className="btn club grow" disabled={full} onClick={() => { let ok = false; mutate((w) => { ok = !!signProspect(w, sel.id) }, { roster: true }); notify(ok ? `${sel.name} joins the academy` : 'Academy is full', ok ? 'ok' : 'err'); setSel(undefined) }}>{full ? 'Academy full' : 'Sign to academy'}</button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function YouthScouts({ w }: { w: World }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [assign, setAssign] = useState<number>()
  const [hire, setHire] = useState(false)
  const [cfg, setCfg] = useState({ country: w.clubs[w.userClubId].country, type: 'Any', months: 3 })
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      {w.youthScouts.map((s) => (
        <div key={s.id} className="card">
          <div className="row" style={{ padding: 12, gap: 12 }}>
            <Avatar name={s.name} size={48} radius={12} />
            <div className="grow">
              <div className="b">{s.name}</div>
              <div className="tiny dim row tight"><Flag w={w} nation={s.nationality} size={10} />{s.nationality} · {fmtMoney(s.wage)}/wk</div>
              <div className="row tight tiny" style={{ marginTop: 4 }}><span className="dim">EXP</span><Stars n={s.experience} size={10} /><span className="dim">JDG</span><Stars n={s.judgement} size={10} /></div>
            </div>
            <div className="col" style={{ gap: 4 }}>
              <button className="btn xs club" onClick={() => setAssign(s.id)}>{s.mission ? 'Change' : 'Send'}</button>
              <button className="btn xs" onClick={() => mutate((w) => fireScout(w, s.id, true))}>Fire</button>
            </div>
          </div>
          {s.mission && <div className="tiny muted" style={{ padding: '0 12px 12px' }}><Icon name="globe" size={12} /> {s.mission.country} · {s.mission.playerType} · {s.mission.months} months · next report {fmtDate(s.mission.nextReport, 'dm')}</div>}
        </div>
      ))}
      {w.youthScouts.length < 3 && <button className="btn block" onClick={() => setHire(true)}><Icon name="plus" size={18} /> Hire youth scout</button>}
      <Sheet open={assign !== undefined} onClose={() => setAssign(undefined)} title="Scouting mission">
        <div className="stack" style={{ gap: 12 }}>
          <div className="field"><label className="label">Country</label><select className="input" value={cfg.country} onChange={(e) => setCfg({ ...cfg, country: e.target.value })}>{[...new Set([w.clubs[w.userClubId].country, ...YOUTH_COUNTRIES])].map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><div className="label" style={{ marginBottom: 6 }}>Player type</div><div className="row wrap" style={{ gap: 6 }}>{PLAYER_TYPES.map((t) => <button key={t} className={`chip ${cfg.type === t ? 'on' : ''}`} onClick={() => setCfg({ ...cfg, type: t })}>{t}</button>)}</div></div>
          <div><div className="label" style={{ marginBottom: 6 }}>Duration</div><Seg small items={[1, 3, 6, 12].map((m) => ({ id: m, label: `${m} mo` }))} value={cfg.months} onChange={(v) => setCfg({ ...cfg, months: v })} /></div>
          <button className="btn primary block" onClick={() => { mutate((w) => sendYouthScout(w, assign!, cfg.country, cfg.type, cfg.months)); notify('Youth scout dispatched — first report on the 1st of next month', 'ok'); setAssign(undefined) }}>Send scout</button>
        </div>
      </Sheet>
      <HireSheet open={hire} onClose={() => setHire(false)} youth />
    </div>
  )
}
