// The live transfer centre: the world's window as it happens, and every story in depth.
import { useMemo, useState } from 'react'
import { useGame, useWorld, haptic } from '../../store/game'
import type { Player, StoryStage, TransferOffer, TransferStory, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, Empty, Face, Ovr, PosChip } from '../components/atoms'
import { Chips, Confirm, Screen, Seg, Sheet, Stepper, Toggle } from '../components/layout'
import { DealFlow, Reliability, StageTrack, STAGE_BANNER, STAGE_TONE, TransferCard, TransferRow } from '../components/TransferCard'
import { OUTLETS, STAGE_LABEL, editStartStory, editStory, isOpen, moveAppeal, notable, reverseDeal, story as findStory } from '../../engine/world/market'
import { fmtMoney } from '../../domain/finance'
import { addDays, ageOn, diffDays, fmtDate } from '../../domain/dates'
import { currentWindow } from '../../engine/competitions/calendar'
import { potRange } from '../../engine/world/scouting'
import { useRemember } from '../memory'
import { callName } from '../../engine/match/commentary'
import { allPlayers } from '../../engine/world/roster'

type StageFilter = 'all' | 'rumour' | 'active' | 'done' | 'failed'
type Scope = 'world' | 'league' | 'club' | 'watch'

/** The manager's own business as stories too, so it sits in the same feed (tapping opens the negotiation). */
function userDeals(w: World): { s: TransferStory; o: TransferOffer }[] {
  const out: { s: TransferStory; o: TransferOffer }[] = []
  let k = 0
  for (const o of Object.values(w.transfers.offers)) {
    if (!o.userIsBuyer && !o.userIsSeller) continue
    if (o.status === 'Completed') continue
    const last = o.history[o.history.length - 1]
    const failed = o.status === 'Negotiations Failed' || o.status === 'Offer Rejected' && (o.patience ?? 100) <= 0
    if (failed && last && diffDays(w.date, last.date) > 8) continue
    const stage: StoryStage = failed ? 'failed' : ['Offer Accepted', 'Contract Negotiation', 'Contract Offered', 'Awaiting Window', 'Pre-Contract'].includes(o.status) ? 'close' : o.status === 'Offer Submitted' && o.history.length <= 1 ? 'talks' : 'negotiating'
    const buyer = o.fromClubId, p = w.players[o.playerId]
    if (!p) continue
    out.push({
      o,
      s: {
        id: -(++k), playerId: o.playerId, from: o.userIsSeller ? w.userClubId : o.toClubId, to: buyer, stage, kind: o.type.startsWith('loan') ? 'loan' : o.type === 'free' ? 'free' : 'transfer',
        fee: o.status === 'Counter Offer' && o.counterFee ? o.counterFee : o.fee, started: o.created, updated: last?.date || o.created,
        log: o.history.map((h) => ({ date: h.date, stage, note: h.text })),
      },
    })
  }
  return out
}

function importance(w: World, s: TransferStory) {
  const p = w.players[s.playerId]
  const stageW = s.stage === 'done' ? 3 : s.stage === 'close' ? 2.6 : s.stage === 'failed' ? 1.5 : s.stage === 'negotiating' ? 2 : s.stage === 'talks' ? 1.6 : 1.2 * ((s.reliability || 2) / 3)
  const mine = s.to === w.userClubId || s.from === w.userClubId ? 6 : 0
  return stageW * ((s.fee || p?.value || 0) / 1e7 + (p?.ovr || 60) / 12) + mine - diffDays(w.date, s.updated) * 0.6
}

export function TransferCentre({ w }: { w: World }) {
  const go = useGame((s) => s.go)
  const open = useGame((s) => s.open)
  const [stage, setStage] = useRemember<StageFilter>('tcStage', 'all')
  const [scope, setScope] = useRemember<Scope>('tcScope', 'world')
  const [more, setMore] = useState(1)
  const [creating, setCreating] = useState(false)
  const me = w.userClubId
  const lg = w.clubs[me]?.leagueId
  const mine = useMemo(() => userDeals(w), [w.date, useGame.getState().v])
  const all = useMemo(() => {
    const list = [...(w.market?.stories || []), ...mine.map((x) => x.s)]
    return list.filter((s) => {
      const p = w.players[s.playerId]
      if (!p) return false
      if (scope === 'world' && s.stage === 'done' && !notable(w, p, s.from, s.to, s.fee || 0)) return false
      if (scope === 'league' && !(w.clubs[s.from]?.leagueId === lg || w.clubs[s.to]?.leagueId === lg)) return false
      if (scope === 'club' && s.from !== me && s.to !== me) return false
      if (scope === 'watch' && !w.transfers.shortlist.includes(s.playerId) && s.from !== me && s.to !== me) return false
      if (stage === 'rumour') return s.stage === 'rumour'
      if (stage === 'active') return ['talks', 'negotiating', 'close'].includes(s.stage)
      if (stage === 'done') return s.stage === 'done'
      if (stage === 'failed') return s.stage === 'failed'
      return true
    })
  }, [w.date, stage, scope, mine, useGame.getState().v])
  const counts = useMemo(() => {
    const c = { rumour: 0, active: 0, done: 0, failed: 0 }
    for (const s of w.market?.stories || []) { if (s.stage === 'rumour') c.rumour++; else if (isOpen(s)) c.active++; else if (s.stage === 'done') c.done++; else c.failed++ }
    return c
  }, [w.date, useGame.getState().v])
  const headlines = useMemo(() => [...all].filter((s) => diffDays(w.date, s.updated) <= 4).sort((a, b) => importance(w, b) - importance(w, a)).slice(0, 6), [all])
  const byDay = useMemo(() => {
    const m = new Map<string, TransferStory[]>()
    const sorted = [...all].sort((a, b) => b.updated.localeCompare(a.updated) || importance(w, b) - importance(w, a))
    for (const s of sorted.slice(0, 40 * more)) { const a = m.get(s.updated) || []; a.push(s); m.set(s.updated, a) }
    return [...m.entries()]
  }, [all, more])
  const win = currentWindow(w)
  const deadline = win && win.close === w.date
  const openMine = (s: TransferStory) => {
    const x = mine.find((y) => y.s === s)
    if (!x) return
    if (x.o.userIsSeller) open({ name: 'sellNegotiation', params: { offerId: x.o.id } })
    else open({ name: 'negotiation', params: { playerId: x.o.playerId, offerId: x.o.id, stage: x.s.stage === 'close' ? 'contract' : undefined } })
  }
  const dayLabel = (d: string) => { const n = diffDays(w.date, d); return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : fmtDate(d, 'long') }
  return (
    <div className="tc-wrap">
      <div className="pad">
        <div className={`tc-pulse ${win ? 'live' : ''} ${deadline ? 'deadline' : ''}`}>
          <span className="live-dot" />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small b">{deadline ? 'Deadline day' : win ? `${win.name} window · live` : 'Window closed'}</div>
            <div className="tiny dim">{win ? `${diffDays(win.close, w.date)} days left · ` : ''}{counts.active} in talks · {counts.rumour} rumours · {counts.done} done · {counts.failed} collapsed</div>
          </div>
          {w.meta.editMode && <button className="btn xs ed-open" onClick={() => { haptic('medium'); setCreating(true) }}><Icon name="edit" size={13} /> New story</button>}
        </div>
      </div>
      {headlines.length > 0 && (
        <div className="tc-rail">
          {headlines.map((s) => { const x = mine.find((y) => y.s === s); return <div key={`${s.id}`} className="tc-slide" onClickCapture={x ? (e) => { e.stopPropagation(); e.preventDefault(); openMine(s) } : undefined}><TransferCard w={w} s={s} mine={s.from === me || s.to === me} /></div> })}
        </div>
      )}
      <div className="pad" style={{ marginTop: 6 }}>
        <Chips items={[{ id: 'all', label: 'All' }, { id: 'rumour', label: `Rumours` }, { id: 'active', label: 'Talks' }, { id: 'done', label: 'Done' }, { id: 'failed', label: 'Failed' }]} value={stage} onChange={(v) => { haptic(); setStage(v as StageFilter); setMore(1) }} />
        <div style={{ marginTop: 8 }}><Seg small items={[{ id: 'world', label: 'World' }, { id: 'league', label: 'League' }, { id: 'club', label: 'My club' }, { id: 'watch', label: 'Shortlist' }]} value={scope} onChange={(v) => { setScope(v); setMore(1) }} /></div>
      </div>
      <div className="pad stack" style={{ marginTop: 10 }}>
        {!byDay.length && <div className="card"><Empty icon="transfers" title="Nothing here yet" text={win ? 'Stories appear as clubs start talking.' : 'The window is shut: rumours still fly, deals wait for the next window.'} /></div>}
        {byDay.map(([d, list]) => (
          <div key={d}>
            <div className="label" style={{ margin: '6px 4px 8px' }}>{dayLabel(d)}</div>
            <div className="card list tc-list">{list.map((s) => { const x = mine.find((y) => y.s === s); return <TransferRow key={`${s.id}`} w={w} s={s} mine={s.from === me || s.to === me} onClick={x ? () => openMine(s) : undefined} /> })}</div>
          </div>
        ))}
        {all.length > 40 * more && <button className="btn block" onClick={() => { haptic(); setMore(more + 1) }}>Show more</button>}
      </div>
      {w.meta.editMode && <NewStorySheet w={w} open={creating} onClose={() => setCreating(false)} onMade={(id) => { setCreating(false); if (id) go({ name: 'story', params: { id } }) }} />}
    </div>
  )
}

// ============================================================================ story page
export function TransferStoryScreen({ params }: { params: { id: number } }) {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const s = findStory(w, params.id)
  if (!s) return <Screen title="Transfer" back><Empty icon="transfers" title="This story is no longer in the centre" text="It has run its course, or the deal was reversed." /></Screen>
  const p = w.players[s.playerId]
  const from = w.clubs[s.from], to = w.clubs[s.to]
  const tone = STAGE_TONE[s.stage]
  const live = isOpen(s) && p ? moveAppeal(w, p, s.to) : undefined
  const why = live ? live.reasons.slice(0, 6) : s.why || []
  const mood = live ? (live.score >= 8 ? 'Keen' : live.score >= 0 ? 'Open to it' : live.score >= -10 ? 'Unsure' : 'Not keen') : undefined
  const [lo, hi] = p ? potRange(w, p) : [0, 0]
  const facts: [string, string][] = p ? [
    ['Age', `${ageOn(p.dob, w.date)}`],
    ['Position', p.positions.slice(0, 3).join(' · ')],
    ['Overall', `${p.ovr}`],
    ['Potential', lo === hi ? `${lo}` : `${lo}–${hi}`],
    ['Value', fmtMoney(p.value, { short: true })],
    [s.stage === 'done' ? 'Fee' : s.stage === 'rumour' ? 'Reported fee' : s.stage === 'failed' ? 'Last bid' : 'Fee talks', s.kind === 'loan' ? 'Loan' : s.kind === 'free' ? 'Free' : s.fee ? fmtMoney(s.fee, { short: true }) : '—'],
    [s.stage === 'done' ? 'New contract' : 'Contract', s.stage === 'done' && s.years ? `${s.years} yrs · ${fmtMoney(s.wage || p.wage, { short: true })}/wk` : `Until ${p.contract.until} · ${fmtMoney(p.wage, { short: true })}/wk`],
    ['Nation', p.nation],
  ] : []
  return (
    <Screen title={p ? callName(p.name) : 'Transfer'} sub={`${STAGE_BANNER[s.stage]} · ${from?.short || 'Free agent'} → ${to?.short}`} back>
      <div className="pad">
        <div className={`ts-hero ${tone}`}>
          <span className="tc-glow" aria-hidden />
          <div className={`ts-banner ${tone}`}>{STAGE_BANNER[s.stage]}</div>
          <DealFlow w={w} s={s} face={86} badge={52} />
          <div className="ts-clubs"><button onClick={() => from && go({ name: 'club', params: { id: from.id } })}>{from?.short || 'Free agent'}</button><button onClick={() => to && go({ name: 'club', params: { id: to.id } })}>{to?.short}</button></div>
          {s.stage === 'rumour' && s.source && <div className="ts-src"><Icon name="news" size={13} /><span>{s.source}</span><Reliability n={s.reliability || 2} /></div>}
        </div>
        <div style={{ marginTop: 12 }}><StageTrack s={s} /></div>
      </div>
      <div className="pad stack" style={{ marginTop: 12 }}>
        {p && <button className="card tap ts-player" onClick={() => go({ name: 'player', params: { id: p.id } })}>
          <Face p={p} size={46} radius={23} club={w.clubs[p.clubId]} />
          <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}><div className="b ellipsis">{p.name}</div><div className="tiny dim">{w.clubs[p.clubId]?.name || 'Free agent'} · {ageOn(p.dob, w.date)} · {p.nation}</div></div>
          <PosChip pos={p.positions[0]} /><Ovr v={p.ovr} size="sm" />
        </button>}
        <div className="card ts-facts">{facts.map(([k, v]) => <div key={k}><span className="tiny dim">{k}</span><b className="small">{v}</b></div>)}</div>
        {why.length > 0 && (
          <div className="card">
            <div className="card-h"><span className="label">{s.stage === 'done' ? 'Why he moved' : s.stage === 'failed' ? 'What he weighed up' : 'What he’s weighing up'}</span>{live && <span className={`tiny b ${live.score >= 0 ? 'pos' : 'neg'}`}>{mood}</span>}</div>
            <div className="ts-why">{why.map((r, i) => <div key={i} className={`ts-w ${r.v >= 0 ? 'up' : 'down'}`}><span className="ts-w-bar"><i style={{ width: `${Math.min(100, Math.abs(r.v) * 3)}%` }} /></span><span className="small">{r.text}</span><b className="tiny">{r.v > 0 ? '+' : ''}{r.v}</b></div>)}</div>
          </div>
        )}
        <div className="card">
          <div className="card-h"><span className="label">How it unfolded</span><span className="tiny dim">{s.log.length} update{s.log.length > 1 ? 's' : ''}</span></div>
          <div className="ts-log">
            {[...s.log].reverse().map((l, i) => (
              <div key={i} className={`ts-l ${STAGE_TONE[l.stage]}`}><span className="ts-l-dot" /><div className="grow" style={{ minWidth: 0 }}><div className="small">{l.note}</div><div className="tiny dim">{fmtDate(l.date, 'long')} · {STAGE_LABEL[l.stage]}</div></div></div>
            ))}
          </div>
        </div>
        {w.meta.editMode && <StoryEditor w={w} s={s} />}
      </div>
    </Screen>
  )
}

// ============================================================================ Edit Mode
function StoryEditor({ w, s }: { w: World; s: TransferStory }) {
  const mutate = useGame((st) => st.mutate)
  const notify = useGame((st) => st.notify)
  const back = useGame((st) => st.back)
  const [ask, setAsk] = useState<'reverse' | 'kill' | undefined>()
  const [fee, setFee] = useState(s.fee || 0)
  const [reason, setReason] = useState('')
  const p = w.players[s.playerId]
  const apply = (patch: Parameters<typeof editStory>[2]) => { let r = { ok: false, text: '' }; mutate((x) => { r = editStory(x, s.id, patch) }, { roster: true }); notify(r.text, r.ok ? 'edit' : 'err') }
  if (s.stage === 'done') {
    return (
      <div className="card ed-card">
        <div className="card-h"><div className="row tight"><Icon name="edit" size={14} color="var(--gold)" /><span className="label">Edit Mode</span></div></div>
        <div className="tiny dim" style={{ padding: '0 14px 10px' }}>A completed deal is history. Reversing it undoes everything it changed: {p ? callName(p.name) : 'the player'} goes back on his old contract, the fee returns to the buyer and leaves the seller, both budgets are restored, and the transfer record and its news disappear.</div>
        <div style={{ padding: '0 14px 14px' }}><button className="btn danger block" disabled={!s.undo || !!s.undo.swap} onClick={() => setAsk('reverse')}><Icon name="undo" size={16} /> {s.undo?.swap ? 'Swap deals can’t be reversed' : !s.undo ? 'No record to reverse from' : 'Reverse deal'}</button></div>
        <Confirm open={ask === 'reverse'} title="Reverse this deal?" danger confirm="Reverse" text={`${p?.name} returns to ${w.clubs[s.from]?.name || 'free agency'} as though the move never happened.`} onConfirm={() => { let r = { ok: false, text: '' }; mutate((x) => { r = reverseDeal(x, s.id) }, { roster: true }); notify(r.text, r.ok ? 'edit' : 'err'); if (r.ok) back() }} onClose={() => setAsk(undefined)} />
      </div>
    )
  }
  const frozen = s.ai?.round === -99
  return (
    <div className="card ed-card">
      <div className="card-h"><div className="row tight"><Icon name="edit" size={14} color="var(--gold)" /><span className="label">Edit Mode</span></div></div>
      <div style={{ padding: '0 14px' }}>
        <div className="label" style={{ margin: '4px 0 8px' }}>Move it to</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {(['rumour', 'talks', 'negotiating', 'close'] as StoryStage[]).map((st) => <button key={st} className={`chip sm ${s.stage === st ? 'on' : ''}`} onClick={() => { haptic(); apply({ stage: st }) }}>{STAGE_LABEL[st]}</button>)}
        </div>
        <div className="ed-line" style={{ marginTop: 12 }}><span className="small">{s.stage === 'rumour' ? 'Reported fee' : 'Fee'}</span><Stepper label="Fee" value={fee} min={0} max={500_000_000} step={fee >= 50e6 ? 5e6 : fee >= 5e6 ? 1e6 : 250_000} onChange={setFee} fmt={(v) => fmtMoney(v, { short: true })} /></div>
        {fee !== (s.fee || 0) && <button className="btn sm block ed-apply" style={{ marginTop: 6 }} onClick={() => apply({ fee })}>Apply fee</button>}
        {s.stage === 'rumour' && <div className="ed-line" style={{ marginTop: 10 }}><span className="small">Reliability</span><Stepper value={s.reliability || 2} min={1} max={5} onChange={(v) => apply({ reliability: v })} fmt={(v) => `${v}/5`} /></div>}
      </div>
      <Toggle label="Freeze" sub="Holds it at this stage until you move it" on={frozen} onChange={(v) => apply({ freeze: v })} />
      <div className="row" style={{ padding: 14, gap: 8 }}>
        <button className="btn grow primary" onClick={() => { haptic('medium'); apply({ stage: 'done' }) }}><Icon name="check" size={16} /> Complete</button>
        <button className="btn grow danger" onClick={() => setAsk('kill')}><Icon name="close" size={16} /> Call it off</button>
      </div>
      <Sheet open={ask === 'kill'} onClose={() => setAsk(undefined)} title="Call the deal off">
        <input className="input" style={{ width: '100%' }} placeholder="Why? (shown in the story)" value={reason} maxLength={90} onChange={(e) => setReason(e.target.value)} />
        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>{['He failed his medical', 'The clubs couldn’t agree a fee', 'He turned the move down', 'A late hijack'].map((x) => <button key={x} className={`chip sm ${reason === x ? 'on' : ''}`} onClick={() => setReason(x)}>{x}</button>)}</div>
        <button className="btn danger block" style={{ marginTop: 14 }} onClick={() => { apply({ stage: 'failed', reason: reason || undefined }); setAsk(undefined) }}>Call it off</button>
      </Sheet>
    </div>
  )
}

/** Start a story by hand: player, destination, how far along, fee. */
function NewStorySheet({ w, open, onClose, onMade }: { w: World; open: boolean; onClose: () => void; onMade: (id?: number) => void }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [q, setQ] = useState('')
  const [pid, setPid] = useState<number>()
  const [cq, setCq] = useState('')
  const [to, setTo] = useState<number>()
  const [stage, setStage] = useState<StoryStage>('rumour')
  const [fee, setFee] = useState(0)
  const [kind, setKind] = useState<'transfer' | 'loan' | 'free'>('transfer')
  const [source, setSource] = useState(OUTLETS[0].name)
  const [freeze, setFreeze] = useState(false)
  const p = pid ? w.players[pid] : undefined
  const players = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return allPlayers(w).filter((x) => !x.academy && x.name.toLowerCase().includes(t)).sort((a, b) => b.ovr - a.ovr).slice(0, 8)
  }, [q])
  const clubs = useMemo(() => {
    const t = cq.trim().toLowerCase()
    if (t.length < 2) return []
    return Object.values(w.clubs).filter((c) => !c.national && c.id !== p?.clubId && (c.name.toLowerCase().includes(t) || c.short.toLowerCase().includes(t))).sort((a, b) => b.reputation - a.reputation).slice(0, 8)
  }, [cq, pid])
  const pick = (x: Player) => { haptic(); setPid(x.id); setQ(''); setFee(x.clubId ? Math.round(x.value / 1e5) * 1e5 : 0); setKind(x.clubId ? 'transfer' : 'free') }
  const create = () => {
    if (!pid || !to) return
    let r: { ok: boolean; text: string; id?: number } = { ok: false, text: '' }
    mutate((x) => { r = editStartStory(x, { playerId: pid, to, stage, kind, fee: kind === 'transfer' ? fee : 0, source, freeze }) }, { roster: true })
    notify(r.text, r.ok ? 'edit' : 'err')
    if (r.ok) onMade(r.id)
  }
  return (
    <Sheet open={open} onClose={onClose} title="New transfer story">
      <div className="ns-body">
        <div className="label">Player</div>
        {p ? (
          <button className="ns-pick" onClick={() => setPid(undefined)}><Face p={p} size={36} radius={18} club={w.clubs[p.clubId]} /><div className="grow" style={{ minWidth: 0, textAlign: 'left' }}><div className="small b ellipsis">{p.name}</div><div className="tiny dim row tight">{w.clubs[p.clubId] ? <><Badge club={w.clubs[p.clubId]} size={12} />{w.clubs[p.clubId].short}</> : 'Free agent'} · {p.ovr} · {fmtMoney(p.value, { short: true })}</div></div><Icon name="close" size={16} color="var(--t3)" /></button>
        ) : <>
          <input className="input" style={{ width: '100%' }} placeholder="Search a player" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ns-results">{players.map((x) => <button key={x.id} className="ns-res" onClick={() => pick(x)}><Face p={x} size={30} radius={15} club={w.clubs[x.clubId]} /><span className="small grow ellipsis" style={{ textAlign: 'left' }}>{x.name}</span><span className="tiny dim">{w.clubs[x.clubId]?.short || 'Free'} · {x.ovr}</span></button>)}</div>
        </>}
        <div className="label" style={{ marginTop: 12 }}>Joining</div>
        {to ? (
          <button className="ns-pick" onClick={() => setTo(undefined)}><Badge club={w.clubs[to]} size={32} /><span className="small b grow" style={{ textAlign: 'left' }}>{w.clubs[to].name}</span><Icon name="close" size={16} color="var(--t3)" /></button>
        ) : <>
          <input className="input" style={{ width: '100%' }} placeholder="Search a club" value={cq} onChange={(e) => setCq(e.target.value)} />
          <div className="ns-results">{clubs.map((c) => <button key={c.id} className="ns-res" onClick={() => { haptic(); setTo(c.id); setCq('') }}><Badge club={c} size={26} /><span className="small grow ellipsis" style={{ textAlign: 'left' }}>{c.name}</span><span className="tiny dim">{w.leagues[c.leagueId]?.short || c.country}</span></button>)}</div>
        </>}
        {p && to && <div className="ns-preview"><DealFlow w={w} s={{ id: 0, playerId: p.id, from: p.clubId, to, stage, kind, started: w.date, updated: w.date, log: [] }} face={48} badge={30} /></div>}
        <div className="label" style={{ marginTop: 12 }}>Stage</div>
        <div className="row wrap" style={{ gap: 6 }}>{(['rumour', 'talks', 'negotiating', 'close', 'done'] as StoryStage[]).map((st) => <button key={st} className={`chip sm ${stage === st ? 'on' : ''}`} onClick={() => { haptic(); setStage(st) }}>{st === 'done' ? 'Done deal' : STAGE_LABEL[st]}</button>)}</div>
        <div className="label" style={{ marginTop: 12 }}>Type</div>
        <Seg small items={[{ id: 'transfer', label: 'Transfer' }, { id: 'loan', label: 'Loan' }, { id: 'free', label: 'Free' }]} value={kind} onChange={(v) => setKind(v as typeof kind)} />
        {kind === 'transfer' && <div className="ed-line" style={{ marginTop: 10 }}><span className="small">Fee{p ? <span className="dim"> · value {fmtMoney(p.value, { short: true })}</span> : null}</span><Stepper label="Fee" value={fee} min={0} max={500_000_000} step={fee >= 50e6 ? 5e6 : fee >= 5e6 ? 1e6 : 250_000} onChange={setFee} fmt={(v) => fmtMoney(v, { short: true })} /></div>}
        {stage === 'rumour' && <><div className="label" style={{ marginTop: 12 }}>Reported by</div><div className="row wrap" style={{ gap: 6 }}>{OUTLETS.slice(0, 9).map((o) => <button key={o.name} className={`chip sm ${source === o.name ? 'on' : ''}`} onClick={() => setSource(o.name)}>{o.name}</button>)}</div></>}
        {stage !== 'done' && <div style={{ margin: '10px -16px 0' }}><Toggle label="Freeze at this stage" sub="Otherwise it carries on by itself from here" on={freeze} onChange={setFreeze} /></div>}
        <button className="btn primary block" style={{ marginTop: 14 }} disabled={!pid || !to} onClick={create}><Icon name={stage === 'done' ? 'check' : 'plus'} size={16} /> {stage === 'done' ? 'Complete the deal' : 'Start story'}</button>
      </div>
    </Sheet>
  )
}

void addDays
