// The youth academy: who is coming through, how close each of them is to the first team and how fast they are
// growing, what the scouts have found and where they are looking. Nothing here needs weekly attention: the
// academy runs itself, this is where you come to see it and make the occasional call.
import { useRemember } from '../memory'
import { useMemo, useState } from 'react'
import { useGame, useWorld, haptic } from '../../store/game'
import type { Player, Prospect, World, YouthScout } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Avatar, Empty, Face, Flag, Ovr, PosChip, Stars } from '../components/atoms'
import { Chips, Confirm, HubActions, Screen, Seg, Sheet, Tabs } from '../components/layout'
import { Silhouette } from '../components/Silhouette'
import { fmtMoney } from '../../domain/finance'
import { ageOn, diffDays, fmtDate } from '../../domain/dates'
import { daysToNext, firstTeamBar, graduatesInSquad, paceOf, readiness, type Readiness } from '../../engine/world/academy'
import { academyOf } from '../../engine/world/roster'
import { PLAYER_TYPES, promoteYouth, sendYouthScout, signProspect, fireScout } from '../../engine/world/scouting'
import { ATTR_LABEL, POS_GROUP } from '../../domain/constants'
import { A, type AttrKey } from '../../domain/types'
import { faceStats } from '../../domain/ratings'
import { HireSheet } from './Transfers'
import { ageOf, userClub } from '../selectors'
import { releaseUserPlayer } from '../../engine/world/userActions'

const YOUTH_COUNTRIES = ['England', 'Spain', 'France', 'Germany', 'Italy', 'Portugal', 'Netherlands', 'Belgium', 'Brazil', 'Argentina', 'Uruguay', 'Colombia', 'Croatia', 'Serbia', 'Denmark', 'Norway', 'Sweden', 'Scotland', 'Republic of Ireland', 'United States', 'Mexico', 'Japan', 'Korea Republic', 'Nigeria', 'Ghana', 'Senegal', "Côte d'Ivoire", 'Morocco', 'Cameroon', 'Türkiye', 'Poland', 'Austria', 'Switzerland', 'Ecuador']
const READY_TONE: Record<Readiness, string> = { Ready: 'var(--pos)', Close: 'var(--warn)', Developing: 'var(--t3)' }
const PACE_TONE = { pos: 'var(--pos)', neu: 'var(--t2)', neg: 'var(--t3)' } as const
const PACE_SHORT: Record<string, string> = { 'Fast developer': 'Fast riser', 'Steady progress': 'Steady', 'Slow burner': 'Slow burner' }
const LINE: Record<string, string> = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', ATT: 'Forwards' }

/** OVR now, the potential above it, and the first team's level: how far he has come and how far he can go. */
function GrowthBar({ ovr, pot, bar, lo: potLo }: { ovr: number; pot: number; bar: number; lo?: number }) {
  const min = 40, max = 95
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`
  return (
    <span className="gb" aria-label={`${ovr} now, potential ${potLo ? `${potLo}–` : ''}${pot}, first team ${bar}`}>
      <i className="gb-now" style={{ width: x(ovr) }} />
      {potLo != null && <i className="gb-range" style={{ left: x(potLo), width: `calc(${x(pot)} - ${x(potLo)})` }} />}
      <i className="gb-pot" style={{ left: x(ovr), width: `calc(${x(pot)} - ${x(ovr)})` }} />
      <i className="gb-bar" style={{ left: x(bar) }} />
    </span>
  )
}

/** How much a player has grown over the last month (from his growth record). */
function monthGain(w: World, p: Player) {
  const d = new Date(`${w.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 30)
  const from = d.toISOString().slice(0, 10)
  const before = [...p.growthHistory].reverse().find((g) => g.date <= from)?.ovr ?? p.growthHistory[0]?.ovr ?? p.ovr
  return p.ovr - before
}

export function Academy() {
  const w = useWorld()
  const [tab, setTab] = useRemember<'squad' | 'prospects' | 'scouts'>('tab', 'squad')
  if (w.flags.unemployed) return <Screen title="Youth Academy" right={<HubActions />}><Empty icon="academy" title="No club" /></Screen>
  const club = userClub(w)
  const squad = academyOf(w, club.id)
  const prospects = w.prospects.filter((p) => !p.signed)
  return (
    <Screen title="Youth Academy" sub={`${club.short} Academy`} right={<HubActions />}>
      <AcademyHero w={w} squad={squad} prospects={prospects} onTab={setTab} />
      <div style={{ marginTop: 12 }}><Tabs items={[{ id: 'squad', label: `Academy (${squad.length})` }, { id: 'prospects', label: `Prospects (${prospects.length})`, badge: prospects.filter((p) => diffDays(w.date, p.found) <= 7).length }, { id: 'scouts', label: 'Youth Scouts' }]} value={tab} onChange={setTab} /></div>
      {tab === 'squad' && <AcademySquad w={w} />}
      {tab === 'prospects' && <Prospects w={w} list={prospects} />}
      {tab === 'scouts' && <YouthScouts w={w} />}
    </Screen>
  )
}

function AcademyHero({ w, squad, prospects, onTab }: { w: World; squad: Player[]; prospects: Prospect[]; onTab: (t: 'squad' | 'prospects' | 'scouts') => void }) {
  const go = useGame((s) => s.go)
  const club = userClub(w)
  const bar = useMemo(() => firstTeamBar(w), [w.date, w.userClubId])
  const ready = squad.filter((p) => readiness(p, bar) === 'Ready').length
  const close = squad.filter((p) => readiness(p, bar) === 'Close').length
  const best = [...squad].sort((a, b) => b.pot - a.pot || b.ovr - a.ovr)[0]
  const next = w.youthScouts.map((s) => s.mission?.nextReport).filter(Boolean).sort()[0]
  const risers = squad.map((p) => ({ p, d: monthGain(w, p) })).filter((x) => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 3)
  return (
    <div className="pad">
      <div className="ac-hero" style={{ ['--cc' as string]: club.theme }}>
        <div className="ac-hero-glow" aria-hidden />
        <div className="ac-hero-row">
          <div className="ac-cap">
            <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden><circle cx="32" cy="32" r="27" className="ac-cap-bg" /><circle cx="32" cy="32" r="27" className="ac-cap-fg" style={{ strokeDasharray: `${(squad.length / 15) * 169.6} 169.6` }} /></svg>
            <b className="display">{squad.length}</b><span>of 15</span>
          </div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="ac-hero-k"><span>Facilities</span><Stars n={club.youthRating / 2} size={12} /></div>
            <div className="ac-hero-k"><span>First-team level</span><b>{bar}</b></div>
            <div className="ac-hero-k"><span>Coming through</span><b><span style={{ color: 'var(--pos)' }}>{ready} ready</span> · <span style={{ color: 'var(--warn)' }}>{close} close</span></b></div>
          </div>
        </div>
        <div className="ac-hero-foot">
          {best ? (
            <button className="ac-best" onClick={() => go({ name: 'player', params: { id: best.id } })}>
              <Face p={best} size={30} radius={15} club={club} />
              <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><span className="tiny dim">Brightest talent</span><span className="small b ellipsis" style={{ display: 'block' }}>{best.name} · POT {best.pot}</span></span>
            </button>
          ) : <span className="small dim">No academy players yet</span>}
          <button className="ac-scouts" onClick={() => onTab(prospects.length ? 'prospects' : 'scouts')}>
            <span className="tiny dim">{w.youthScouts.length}/3 scouts</span>
            <span className="small b">{prospects.length ? `${prospects.length} prospects` : next ? `Report ${fmtDate(next, 'dm')}` : 'None out'}</span>
          </button>
        </div>
        {risers.length > 0 && (
          <div className="ac-risers">
            <span className="tiny dim">This month</span>
            {risers.map(({ p, d }) => <button key={p.id} className="ac-riser" onClick={() => go({ name: 'player', params: { id: p.id } })}>{p.name.replace(/^[A-ZÀ-Ý]\.\s+/u, '')} <b>+{d}</b></button>)}
          </div>
        )}
      </div>
    </div>
  )
}

type Sort = 'ready' | 'pot' | 'age' | 'line'

function AcademySquad({ w }: { w: World }) {
  const mutate = useGame((s) => s.mutate)
  const go = useGame((s) => s.go)
  const notify = useGame((s) => s.notify)
  const [rel, setRel] = useState<number>()
  const [sort, setSort] = useRemember<Sort>('acSort', 'ready')
  const club = userClub(w)
  const bar = useMemo(() => firstTeamBar(w), [w.date, w.userClubId])
  const rank = { Ready: 0, Close: 1, Developing: 2 }
  const lineOf = (p: Player) => POS_GROUP[p.positions[0]] || 'MID'
  const all = academyOf(w, club.id)
  const squad = [...all].sort((a, b) =>
    sort === 'pot' ? b.pot - a.pot || b.ovr - a.ovr
      : sort === 'age' ? a.dob.localeCompare(b.dob) || b.pot - a.pot
        : sort === 'line' ? ['GK', 'DEF', 'MID', 'ATT'].indexOf(lineOf(a)) - ['GK', 'DEF', 'MID', 'ATT'].indexOf(lineOf(b)) || b.pot - a.pot
          : rank[readiness(a, bar)] - rank[readiness(b, bar)] || b.pot - a.pot)
  const grads = graduatesInSquad(w)
  // players 19 or older on 1 July move up to the senior squad at the end of the season
  const cutoff = `${w.date.slice(5) >= '07-01' ? w.season + 1 : w.season}-07-01`
  const agesOut = (dob: string) => ageOn(dob, cutoff) >= 19
  if (!squad.length && !grads.length) return <div className="pad" style={{ marginTop: 12 }}><div className="card"><Empty icon="youth" title="The academy is empty" text="Send youth scouts out on missions: they report on the 1st of each month, and the best of what they find can be signed here for nothing." /></div></div>
  // within each line, best first: a quick read of who leads in each position
  const best = new Map<string, number>()
  for (const p of all) { const g = lineOf(p); if ((best.get(g) ?? -1) < p.pot) best.set(g, p.pot) }
  // in position order, a heading where each line starts
  const heads = new Set(sort === 'line' ? squad.filter((p, i) => i === 0 || lineOf(squad[i - 1]) !== lineOf(p)).map((p) => p.id) : [])
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      {squad.length > 0 && <>
        <div className="row between" style={{ marginBottom: 8 }}>
          <Chips items={[{ id: 'ready', label: 'Closest' }, { id: 'pot', label: 'Potential' }, { id: 'line', label: 'Position' }, { id: 'age', label: 'Age' }]} value={sort} onChange={(v) => setSort(v as Sort)} />
        </div>
        <div className="ac-key tiny dim"><span><i className="k-now" />now</span><span><i className="k-pot" />potential</span><span><i className="k-bar" />first-team level ({bar})</span></div>
        <div className="card list ac-list">
          {squad.map((p) => {
            const r = readiness(p, bar)
            const pace = paceOf(p)
            const next = daysToNext(p)
            const out = agesOut(p.dob)
            const line = lineOf(p)
            const head = heads.has(p.id) ? <div className="ac-line label">{LINE[line]}</div> : null
            const lead = best.get(line) === p.pot
            return (
              <div key={p.id}>
                {head}
                <div className="ac-row">
                  <button className="ac-main" onClick={() => go({ name: 'player', params: { id: p.id } })}>
                    <Face p={p} size={44} radius={22} club={club} />
                    <div className="meta">
                      <div className="row tight" style={{ minWidth: 0 }}>
                        <span className="t small ellipsis">{p.name}</span>
                        {r !== 'Developing' && <span className="pill ac-ready" style={{ color: READY_TONE[r], background: `color-mix(in srgb, ${READY_TONE[r]} 16%, transparent)` }}>{r === 'Ready' ? 'Ready' : 'Close'}</span>}
                        {lead && all.filter((x) => lineOf(x) === line).length > 1 && <span className="pill ac-lead">Top {line === 'ATT' ? 'forward' : line === 'GK' ? 'keeper' : line === 'DEF' ? 'defender' : 'midfielder'}</span>}
                      </div>
                      <div className="s row tight"><Flag w={w} nation={p.nation} size={10} /><span className="ellipsis">{ageOf(w, p)} · {p.positions.slice(0, 2).join('/')}{out && <span className="ac-out"> · seniors on 1 Jul</span>}</span></div>
                      <div className="ac-grow"><GrowthBar ovr={p.ovr} pot={p.pot} bar={bar} /><span className="tiny num"><b>{p.ovr}</b><span className="dim"> → </span><b className="gold">{p.pot}</b></span></div>
                    </div>
                  </button>
                  <div className="ac-foot">
                    <span className="tiny ellipsis" style={{ minWidth: 0 }}><span style={{ color: PACE_TONE[pace.tone] }}>{PACE_SHORT[pace.label] || pace.label}</span><span className="dim">{next != null ? ` · +1 in ~${next}d` : ' · at his ceiling'}</span></span>
                    <span className="grow" />
                    <button className="btn xs ac-rel" onClick={() => setRel(p.id)} aria-label={`Release ${p.name}`}><Icon name="close" size={13} strokeWidth={2.4} /></button>
                    <button className={`btn xs ${r === 'Ready' ? 'primary' : 'ac-prom'}`} onClick={() => { haptic('medium'); mutate((x) => promoteYouth(x, p.id), { roster: true }); notify(`${p.name} promoted to the first team`, 'ok') }}><Icon name="arrowUp" size={12} strokeWidth={2.4} /> Promote</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="tiny dim" style={{ margin: '8px 2px 0' }}>Academy players grow every day. Anyone who is 19 on 1 July moves up to the senior squad at the end of the season, so decide on them before then.</div>
      </>}
      {grads.length > 0 && (
        <>
          <div className="label" style={{ margin: '18px 2px 8px' }}>Graduates in the first team</div>
          <div className="card list">
            {grads.map((p) => {
              const st = Object.values(p.season).reduce((a, x) => ({ apps: a.apps + x.apps, goals: a.goals + x.goals }), { apps: 0, goals: 0 })
              return (
                <button key={p.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
                  <Face p={p} size={36} radius={18} club={club} />
                  <div className="meta"><div className="t small ellipsis">{p.name}</div><div className="s">{p.gradDate ? `Promoted ${fmtDate(p.gradDate, 'dm')} ${p.gradDate.slice(0, 4)}` : 'Academy graduate'} · {st.apps} apps{st.goals ? ` · ${st.goals} goals` : ''} this season</div></div>
                  <PosChip pos={p.positions[0]} />
                  <Ovr v={p.ovr} size="sm" />
                </button>
              )
            })}
          </div>
        </>
      )}
      <Confirm open={!!rel} title="Release academy player?" danger confirm="Release" text={rel ? `${w.players[rel]?.name} will leave the club.` : ''} onConfirm={() => { mutate((x) => { const p = x.players[rel!]; if (p) { p.academy = false; releaseUserPlayer(x, p) } }, { roster: true }) }} onClose={() => setRel(undefined)} />
    </div>
  )
}

/** A scout's few lines on a prospect: what stands out, what doesn't, where he'd fit. */
function scoutReport(w: World, p: Prospect) {
  const keys = Object.keys(A) as AttrKey[]
  const outfield = p.positions[0] !== 'GK'
  const pool = keys.filter((k) => (outfield ? !k.startsWith('gk') : k.startsWith('gk') || ['reactions', 'composure', 'jumping'].includes(k)))
  const sorted = [...pool].sort((a, b) => p.attrs[A[b]] - p.attrs[A[a]])
  const top = sorted.slice(0, 4), low = sorted.slice(-3).reverse()
  const line = POS_GROUP[p.positions[0]] || 'MID'
  const mine = academyOf(w, w.userClubId).filter((x) => (POS_GROUP[x.positions[0]] || 'MID') === line).sort((a, b) => b.pot - a.pot)
  const rank = mine.filter((x) => x.pot > (p.potRange[0] + p.potRange[1]) / 2).length + 1
  const fit = !mine.length ? `You have no ${LINE[line].toLowerCase()} in the academy: he would be the first.`
    : rank === 1 ? `On potential he would be your best ${line === 'ATT' ? 'forward' : line === 'GK' ? 'keeper' : line === 'DEF' ? 'defender' : 'midfielder'} prospect, ahead of ${mine[0].name}.`
      : `He would rank ${rank === 2 ? 'second' : rank === 3 ? 'third' : `${rank}th`} of your ${mine.length + 1} academy ${LINE[line].toLowerCase()} on potential.`
  return { top, low, fit }
}

function Prospects({ w, list }: { w: World; list: Prospect[] }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [sel, setSel] = useState<Prospect>()
  const full = academyOf(w, w.userClubId).length >= 15
  const bar = useMemo(() => firstTeamBar(w), [w.date, w.userClubId])
  const club = userClub(w)
  if (!list.length) return <div className="pad" style={{ marginTop: 12 }}><div className="card"><Empty icon="scout" title="No prospects waiting" text={w.youthScouts.some((s) => s.mission) ? 'Your youth scouts report on the 1st of each month with the players they have found.' : 'Send a youth scout on a mission to start finding players.'} /></div></div>
  const scoutOf = (p: Prospect) => w.youthScouts.find((s) => s.id === p.scoutId)
  const rep = sel ? scoutReport(w, sel) : undefined
  return (
    <div className="pad" style={{ marginTop: 12 }}>
      <div className="tiny dim" style={{ margin: '0 2px 8px' }}>Ranges narrow with the scout's judgement. Signing costs nothing but takes one of 15 academy places{full ? ': the academy is full' : ''}.</div>
      <div className="card list">
        {[...list].sort((a, b) => b.potRange[1] - a.potRange[1]).map((p) => {
          const s = scoutOf(p)
          const fresh = diffDays(w.date, p.found) <= 7
          return (
            <button key={p.id} className="li tap ys-pro" onClick={() => { haptic(); setSel(p) }}>
              <div className="face" style={{ width: 44, height: 44, borderRadius: 22 }}><Silhouette size={44} kit={club.kit[0]} trim={club.kit[1]} seed={p.faceSeed} /></div>
              <div className="meta">
                <div className="row tight" style={{ minWidth: 0 }}><span className="t small ellipsis">{p.name}</span>{fresh && <span className="pill pr-new">New</span>}</div>
                <div className="s row tight"><Flag w={w} nation={p.nation} size={10} /><span className="ellipsis">{p.age} · {p.positions[0]}{s ? ` · ${s.name.split(' ').pop()}` : ''} · {fmtDate(p.found, 'dm')}</span></div>
                <div className="ac-grow"><GrowthBar ovr={Math.round((p.ovrRange[0] + p.ovrRange[1]) / 2)} pot={p.potRange[1]} lo={p.potRange[0]} bar={bar} /></div>
              </div>
              <div className="col pr-nums"><span className="num b">{p.ovrRange[0]}–{p.ovrRange[1]}</span><span className="num gold tiny b">{p.potRange[0]}–{p.potRange[1]}</span></div>
            </button>
          )
        })}
      </div>
      <Sheet open={!!sel} onClose={() => setSel(undefined)} title={sel?.name}>
        {sel && rep && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 12 }}>
              <div className="face" style={{ width: 72, height: 72, borderRadius: 36 }}><Silhouette size={72} kit={club.kit[0]} trim={club.kit[1]} seed={sel.faceSeed} /></div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="b ellipsis">{sel.fullName}</div>
                <div className="tiny dim row tight"><Flag w={w} nation={sel.nation} size={11} />{sel.nation} · {sel.age} · {sel.height} cm · {sel.foot === 'L' ? 'left' : 'right'} foot</div>
                <div className="row tight" style={{ marginTop: 6 }}><PosChip pos={sel.positions[0]} /><span className="small">OVR <b>{sel.ovrRange[0]}–{sel.ovrRange[1]}</b></span><span className="small gold">POT <b>{sel.potRange[0]}–{sel.potRange[1]}</b></span></div>
              </div>
            </div>
            <div className="pr-face">{faceStats(sel as unknown as Player).map((f) => <div key={f.key}><span className="tiny dim">{f.key}</span><b className="display">{f.value}</b></div>)}</div>
            <div className="card pad-card stack" style={{ gap: 8 }}>
              <div className="label">Scout's report{scoutOf(sel) ? ` · ${scoutOf(sel)!.name}` : ''}</div>
              <div className="small"><span className="pos b">Stands out: </span>{rep.top.map((k) => `${ATTR_LABEL[k].toLowerCase()} ${sel.attrs[A[k]]}`).join(', ')}.</div>
              <div className="small"><span className="neg b">Needs work: </span>{rep.low.map((k) => `${ATTR_LABEL[k].toLowerCase()} ${sel.attrs[A[k]]}`).join(', ')}.</div>
              <div className="small muted">{rep.fit}</div>
            </div>
            <div className="row">
              <button className="btn grow" onClick={() => { mutate((x) => { x.prospects = x.prospects.filter((y) => y.id !== sel.id) }); setSel(undefined) }}>Let him go</button>
              <button className="btn club grow" disabled={full} onClick={() => { let ok = false; mutate((x) => { ok = !!signProspect(x, sel.id) }, { roster: true }); notify(ok ? `${sel.name} joins the academy` : 'The academy is full', ok ? 'ok' : 'err'); setSel(undefined) }}>{full ? 'Academy full' : 'Sign to the academy'}</button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function missionProgress(w: World, s: YouthScout) {
  if (!s.mission) return undefined
  const end = new Date(`${s.mission.started}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + s.mission.months)
  const total = Math.max(1, diffDays(end.toISOString().slice(0, 10), s.mission.started))
  const done = Math.max(0, Math.min(total, diffDays(w.date, s.mission.started)))
  return { pct: (done / total) * 100, left: Math.max(0, Math.round((total - done) / 30)), end: end.toISOString().slice(0, 10) }
}

function YouthScouts({ w }: { w: World }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [assign, setAssign] = useState<number>()
  const [hire, setHire] = useState(false)
  const [fire, setFire] = useState<number>()
  const [cfg, setCfg] = useState({ country: w.clubs[w.userClubId].country, type: 'Any', months: 3 })
  const found = (s: YouthScout) => w.prospects.filter((p) => p.scoutId === s.id).length
  return (
    <div className="pad stack" style={{ marginTop: 12 }}>
      {w.youthScouts.map((s) => {
        const m = missionProgress(w, s)
        return (
          <div key={s.id} className="card ys-card">
            <div className="row" style={{ padding: '12px 12px 10px', gap: 12 }}>
              <Avatar name={s.name} size={46} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="b ellipsis">{s.name}</div>
                <div className="tiny dim row tight"><Flag w={w} nation={s.nationality} size={10} />{s.nationality} · {fmtMoney(s.wage, { short: true })}/wk</div>
                <div className="row tight tiny" style={{ marginTop: 5, gap: 10 }}>
                  <span className="row tight"><span className="dim">Finds</span><Stars n={s.experience} size={10} /></span>
                  <span className="row tight"><span className="dim">Judges</span><Stars n={s.judgement} size={10} /></span>
                </div>
              </div>
              <button className="btn xs club" onClick={() => { haptic(); setCfg({ country: s.mission?.country || w.clubs[w.userClubId].country, type: s.mission?.playerType || 'Any', months: s.mission?.months || 3 }); setAssign(s.id) }}>{s.mission ? 'Change' : 'Send out'}</button>
            </div>
            {s.mission && m ? (
              <div className="ys-mission">
                <Flag w={w} nation={s.mission.country} size={14} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small b ellipsis">{s.mission.country}{s.mission.playerType !== 'Any' ? ` · ${s.mission.playerType.toLowerCase()}s` : ''}</div>
                  <div className="bar" style={{ marginTop: 6, height: 4 }}><i style={{ width: `${m.pct}%`, background: 'var(--acc)' }} /></div>
                  <div className="tiny dim" style={{ marginTop: 5 }}>Next report {fmtDate(s.mission.nextReport, 'dm')} · {m.left ? `${m.left} month${m.left > 1 ? 's' : ''} left` : 'last report'}{found(s) ? ` · ${found(s)} waiting` : ''}</div>
                </div>
              </div>
            ) : <div className="ys-mission idle tiny dim">Not on a mission: send him out to start finding players.</div>}
            <button className="ys-fire tiny" onClick={() => setFire(s.id)}>Let go</button>
          </div>
        )
      })}
      {w.youthScouts.length < 3 && <button className="btn block" onClick={() => setHire(true)}><Icon name="plus" size={18} /> Hire a youth scout</button>}
      <Sheet open={assign !== undefined} onClose={() => setAssign(undefined)} title="Scouting mission">
        <div className="stack" style={{ gap: 12 }}>
          <div className="field"><label className="label">Country</label><select className="input" value={cfg.country} onChange={(e) => setCfg({ ...cfg, country: e.target.value })}>{[...new Set([w.clubs[w.userClubId].country, ...YOUTH_COUNTRIES])].map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><div className="label" style={{ marginBottom: 6 }}>Looking for</div><div className="row wrap" style={{ gap: 6 }}>{PLAYER_TYPES.map((t) => <button key={t} className={`chip ${cfg.type === t ? 'on' : ''}`} onClick={() => setCfg({ ...cfg, type: t })}>{t === 'Any' ? 'Anyone' : t}</button>)}</div></div>
          <div><div className="label" style={{ marginBottom: 6 }}>For</div><Seg small items={[1, 3, 6, 12].map((mo) => ({ id: mo, label: `${mo} mo` }))} value={cfg.months} onChange={(v) => setCfg({ ...cfg, months: v })} /></div>
          <div className="tiny dim">A report on the 1st of every month he is out. Longer missions, and a scout who knows the country, turn up better players.</div>
          <button className="btn primary block" onClick={() => { mutate((x) => sendYouthScout(x, assign!, cfg.country, cfg.type, cfg.months)); notify('Youth scout sent: first report on the 1st of next month', 'ok'); setAssign(undefined) }}>Send scout</button>
        </div>
      </Sheet>
      <Confirm open={fire !== undefined} title="Let this scout go?" danger confirm="Let go" text={`His mission ends and he is paid four weeks' wages (${fmtMoney((w.youthScouts.find((s) => s.id === fire)?.wage || 0) * 4, { short: true })}). The prospects he found stay on your list.`} onConfirm={() => mutate((x) => fireScout(x, fire!, true))} onClose={() => setFire(undefined)} />
      <HireSheet open={hire} onClose={() => setHire(false)} youth />
    </div>
  )
}
