// The live transfer centre: the world's window as it happens, and every story in depth.
import { useMemo, useState } from 'react'
import { useGame, useWorld, haptic } from '../../store/game'
import type { Player, StoryStage, TransferOffer, TransferStory, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Badge, Empty, Face, Ovr, PosChip } from '../components/atoms'
import { Chips, Confirm, Screen, Seg, Sheet, Stepper, Toggle } from '../components/layout'
import { FollowBtn } from '../components/Follow'
import { followSets } from '../../engine/world/follow'
import { DealFlow, Reliability, StageTrack, STAGE_BANNER, STAGE_TONE, TransferCard, TransferRow } from '../components/TransferCard'
import { OUTLETS, STAGE_LABEL, editStartStory, editStory, editUserDeal, isOpen, moveAppeal, notable, offerStory, reverseDeal, stageOfOffer, story as findStory, type StoryPatch, type UserDealPatch } from '../../engine/world/market'
import { editClub } from '../../engine/world/edit'
import { fmtMoney } from '../../domain/finance'
import { addDays, ageOn, diffDays, fmtDate } from '../../domain/dates'
import { currentWindow } from '../../engine/competitions/calendar'
import { potRange } from '../../engine/world/scouting'
import { useRemember } from '../memory'
import { callName } from '../../engine/match/commentary'
import { allPlayers } from '../../engine/world/roster'

type StageFilter = 'all' | 'rumour' | 'active' | 'done' | 'failed'
type Scope = 'world' | 'league' | 'club' | 'watch'

/** An offer still in play, that a tap should open the negotiation for. */
const LIVE_OFFER = ['Offer Submitted', 'Counter Offer', 'Offer Rejected', 'Offer Accepted', 'Contract Negotiation', 'Contract Offered']
export function liveOffer(w: World, s: TransferStory): TransferOffer | undefined {
  const o = s.offerId ? w.transfers.offers[s.offerId] : undefined
  return o && LIVE_OFFER.includes(o.status) && !(o.userIsSeller && o.status === 'Offer Rejected') ? o : undefined
}

/**
 * The manager's own business is in the feed as real stories that follow his offers (market.syncOfferStory). An offer
 * from an older save that has no story yet is shown from the offer itself.
 */
function userDeals(w: World): { s: TransferStory; o: TransferOffer }[] {
  const out: { s: TransferStory; o: TransferOffer }[] = []
  let k = 0
  for (const o of Object.values(w.transfers.offers)) {
    if (!o.userIsBuyer && !o.userIsSeller) continue
    if (o.status === 'Completed' || offerStory(w, o)) continue
    const last = o.history[o.history.length - 1]
    const stage: StoryStage = stageOfOffer(o)
    if (stage === 'failed' && last && diffDays(w.date, last.date) > 8) continue
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
  const [sort, setSort] = useRemember<'latest' | 'biggest'>('tcSort', 'latest')
  const [more, setMore] = useState(1)
  const [creating, setCreating] = useState(false)
  const me = w.userClubId
  const lg = w.clubs[me]?.leagueId
  const mine = useMemo(() => userDeals(w), [w.date, useGame.getState().v])
  // the scope first (whose stories), then the stage; the chips count what each stage holds within the scope
  const inScope = useMemo(() => {
    // what he follows: the players on his shortlist and the ones he follows, clubs he follows, the stories themselves
    const fs = followSets(w)
    const followed = new Set([...w.transfers.shortlist, ...fs.player])
    return [...(w.market?.stories || []), ...mine.map((x) => x.s)].filter((s) => {
      const p = w.players[s.playerId]
      if (!p) return false
      if (scope === 'world' && s.stage === 'done' && !notable(w, p, s.from, s.to, s.fee || 0)) return false
      if (scope === 'league' && !(w.clubs[s.from]?.leagueId === lg || w.clubs[s.to]?.leagueId === lg)) return false
      if (scope === 'club' && s.from !== me && s.to !== me) return false
      if (scope === 'watch' && !followed.has(s.playerId) && !fs.club.has(s.from) && !fs.club.has(s.to) && !fs.story.has(s.id) && s.from !== me && s.to !== me) return false
      return true
    })
  }, [w.date, scope, mine, useGame.getState().v])
  const tone = (s: TransferStory): StageFilter => (s.stage === 'rumour' ? 'rumour' : s.stage === 'done' ? 'done' : s.stage === 'failed' ? 'failed' : 'active')
  const counts = useMemo(() => {
    const c = { all: inScope.length, rumour: 0, active: 0, done: 0, failed: 0 }
    for (const s of inScope) (c as Record<string, number>)[tone(s)]++
    return c
  }, [inScope])
  const all = useMemo(() => (stage === 'all' ? inScope : inScope.filter((s) => tone(s) === stage)), [inScope, stage])
  const headlines = useMemo(() => [...all].filter((s) => diffDays(w.date, s.updated) <= 4).sort((a, b) => importance(w, b) - importance(w, a)).slice(0, 6), [all])
  // latest: day by day, the bigger stories first within a day; biggest: one list by size of the deal
  const byDay = useMemo(() => {
    const m = new Map<string, TransferStory[]>()
    if (sort === 'biggest') {
      const size = (s: TransferStory) => (s.fee || w.players[s.playerId]?.value || 0) + (w.players[s.playerId]?.ovr || 0) * 1e5
      return [['', [...all].sort((a, b) => size(b) - size(a)).slice(0, 40 * more)]] as [string, TransferStory[]][]
    }
    const sorted = [...all].sort((a, b) => b.updated.localeCompare(a.updated) || importance(w, b) - importance(w, a))
    for (const s of sorted.slice(0, 40 * more)) { const a = m.get(s.updated) || []; a.push(s); m.set(s.updated, a) }
    return [...m.entries()]
  }, [all, more, sort])
  const win = currentWindow(w)
  const deadline = win && win.close === w.date
  // the manager's live deals open their negotiation; everything else opens the story
  const offerOf = (s: TransferStory) => mine.find((y) => y.s === s)?.o || liveOffer(w, s)
  const openMine = (s: TransferStory) => {
    const o = offerOf(s)
    if (!o) return
    if (o.userIsSeller) open({ name: 'sellNegotiation', params: { offerId: o.id } })
    else open({ name: 'negotiation', params: { playerId: o.playerId, offerId: o.id, stage: s.stage === 'close' ? 'contract' : undefined } })
  }
  const dayLabel = (d: string) => { const n = diffDays(w.date, d); return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : fmtDate(d, 'long') }
  return (
    <div className="tc-wrap">
      <div className="pad">
        <div className={`tc-pulse ${win ? 'live' : ''} ${deadline ? 'deadline' : ''}`}>
          <span className="live-dot" />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small b">{deadline ? 'Deadline day' : win ? `${win.name} window · live` : 'Window closed'}</div>
            <div className="tiny dim">{win ? `${diffDays(win.close, w.date)} days left · ` : ''}{(w.market?.stories || []).filter((x) => isOpen(x) && x.stage !== 'rumour').length} in talks · {(w.market?.stories || []).filter((x) => x.stage === 'rumour').length} rumours</div>
          </div>
          {w.meta.editMode && <button className="btn xs ed-open" onClick={() => { haptic('medium'); setCreating(true) }}><Icon name="edit" size={13} /> New story</button>}
        </div>
      </div>
      {headlines.length > 0 && (
        <div className="tc-rail">
          {headlines.map((s) => { const x = offerOf(s); return <div key={`${s.id}`} className="tc-slide" onClickCapture={x ? (e) => { e.stopPropagation(); e.preventDefault(); openMine(s) } : undefined}><TransferCard w={w} s={s} mine={s.from === me || s.to === me} /></div> })}
        </div>
      )}
      <div className="pad" style={{ marginTop: 6 }}>
        <Seg small items={[{ id: 'world', label: 'World' }, { id: 'league', label: 'League' }, { id: 'club', label: 'My club' }, { id: 'watch', label: 'Following' }]} value={scope} onChange={(v) => { setScope(v); setMore(1) }} />
        <div style={{ marginTop: 8 }}>
          <Chips items={([['all', 'All'], ['rumour', 'Rumours'], ['active', 'Talks'], ['done', 'Done'], ['failed', 'Failed']] as const).map(([id, l]) => ({ id, label: <>{l}<span className="chip-n">{counts[id]}</span></> }))} value={stage} onChange={(v) => { haptic(); setStage(v as StageFilter); setMore(1) }} />
        </div>
        <div className="row between tc-sort">
          <span className="tiny dim">{scope === 'watch' ? 'What you follow, your shortlist and your own business' : scope === 'club' ? `${w.clubs[me]?.short}'s business` : scope === 'league' ? `In the ${w.leagues[lg]?.short || 'league'}` : 'The notable moves everywhere'}</span>
          <span className="tc-sort-t" role="group" aria-label="Sort">
            {(['latest', 'biggest'] as const).map((k) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => { haptic(); setSort(k); setMore(1) }}>{k === 'latest' ? 'Latest' : 'Biggest'}</button>)}
          </span>
        </div>
      </div>
      <div className="pad stack" style={{ marginTop: 10 }}>
        {!byDay.length && <div className="card"><Empty icon="transfers" title="Nothing here yet" text={win ? 'Stories appear as clubs start talking.' : 'The window is shut: rumours still fly, deals wait for the next window.'} /></div>}
        {byDay.map(([d, list]) => (
          <div key={d}>
            {d && <div className="label" style={{ margin: '6px 4px 8px' }}>{dayLabel(d)}</div>}
            <div className="card list tc-list">{list.map((s) => { const x = offerOf(s); return <TransferRow key={`${s.id}`} w={w} s={s} mine={s.from === me || s.to === me} onClick={x ? () => openMine(s) : undefined} /> })}</div>
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
  const open = useGame((s) => s.open)
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
    <Screen title={p ? callName(p.name) : 'Transfer'} sub={`${STAGE_BANNER[s.stage]} · ${from?.short || 'Free agent'} → ${to?.short}`} back right={p ? <FollowBtn w={w} kind="story" id={s.id} name={`${callName(p.name)} to ${to?.short}`} /> : undefined}>
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
        {(() => {
          // the manager's own deal, still in play: straight to the negotiation
          const o = liveOffer(w, s)
          if (!o) return null
          return (
            <button className="btn club block" onClick={() => { haptic(); if (o.userIsSeller) open({ name: 'sellNegotiation', params: { offerId: o.id } }); else open({ name: 'negotiation', params: { playerId: o.playerId, offerId: o.id, stage: s.stage === 'close' ? 'contract' : undefined } }) }}>
              <Icon name="handshake" size={17} /> {o.userIsSeller ? 'Answer the offer' : s.stage === 'close' ? 'Agree personal terms' : 'Open the negotiation'}
            </button>
          )
        })()}
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
const STANCE: { v: -1 | 0 | 1; label: string }[] = [{ v: -1, label: "Won't sell key players" }, { v: 0, label: 'Normal' }, { v: 1, label: 'Happy to sell' }]

function StoryEditor({ w, s }: { w: World; s: TransferStory }) {
  const mutate = useGame((st) => st.mutate)
  const notify = useGame((st) => st.notify)
  const back = useGame((st) => st.back)
  const go = useGame((st) => st.go)
  const [ask, setAsk] = useState<'reverse' | 'kill' | 'more' | undefined>()
  const [fee, setFee] = useState(s.fee || 0)
  const [cap, setCap] = useState(s.ai?.cap || s.fee || 0)
  const [reason, setReason] = useState('')
  const p = w.players[s.playerId]
  const apply = (patch: StoryPatch) => { let r = { ok: false, text: '' }; mutate((x) => { r = editStory(x, s.id, patch) }, { roster: true }); notify(r.text, r.ok ? 'edit' : 'err') }
  const applyDeal = (patch: UserDealPatch) => { let r = { ok: false, text: '' }; mutate((x) => { r = editUserDeal(x, s.id, patch) }, { roster: true }); notify(r.text, r.ok ? 'edit' : 'err') }
  const head = <div className="card-h"><div className="row tight"><Icon name="edit" size={14} color="var(--gold)" /><span className="label">Edit Mode</span></div></div>
  if (s.stage === 'done') {
    return (
      <div className="card ed-card">
        {head}
        <div className="tiny dim" style={{ padding: '0 14px 10px' }}>A completed deal is history. Reversing it undoes everything it changed: {s.undo && !w.clubs[s.undo.fromClub] ? <>{p ? callName(p.name) : 'the player'} is a free agent again, his signing bonus goes back to {w.clubs[s.to]?.short || 'the club'}</> : s.kind === 'loan' ? <>{p ? callName(p.name) : 'the player'} returns to {w.clubs[s.from]?.short || 'his club'} as though the loan never happened, any loan fee goes back</> : <>{p ? callName(p.name) : 'the player'} goes back on his old contract, the fee returns to the buyer and leaves the seller, both budgets are restored (a sell-on paid out of it too)</>}, and the transfer record and its news disappear.</div>
        <div style={{ padding: '0 14px 14px' }}><button className="btn danger block" disabled={!s.undo || !!s.undo.swap} onClick={() => setAsk('reverse')}><Icon name="undo" size={16} /> {s.undo?.swap ? 'Swap deals can’t be reversed' : !s.undo ? 'No record to reverse from' : 'Reverse deal'}</button></div>
        <Confirm open={ask === 'reverse'} title="Reverse this deal?" danger confirm="Reverse" text={`${p?.name} returns to ${w.clubs[s.from]?.name || 'free agency'} as though the move never happened.`} onConfirm={() => { let r = { ok: false, text: '' }; mutate((x) => { r = reverseDeal(x, s.id) }, { roster: true }); notify(r.text, r.ok ? 'edit' : 'err'); if (r.ok) back() }} onClose={() => setAsk(undefined)} />
      </div>
    )
  }
  // the other clubs in for him: each one its own story
  const rivals = (w.market?.stories || []).filter((x) => x.playerId === s.playerId && x.id !== s.id && isOpen(x))
  const interest = (
    <div style={{ padding: '4px 14px 14px' }}>
      <div className="row between" style={{ marginBottom: 6 }}><span className="label">Other clubs in for him</span><button className="btn xs" onClick={() => { haptic(); setAsk('more') }}><Icon name="plus" size={13} /> Add a club</button></div>
      {rivals.length ? <div className="card list">{rivals.map((x) => <TransferRow key={x.id} w={w} s={x} onClick={() => go({ name: 'story', params: { id: x.id } })} />)}</div> : <div className="tiny dim">Nobody else, so far.</div>}
      <NewStorySheet w={w} open={ask === 'more'} preset={s.playerId} onClose={() => setAsk(undefined)} onMade={(id) => { setAsk(undefined); if (id) go({ name: 'story', params: { id } }) }} />
    </div>
  )
  // the manager's own deals: the offer is what changes, the story follows it
  const o = s.offerId ? w.transfers.offers[s.offerId] : undefined
  if (o) {
    return (
      <div className="card ed-card">
        {head}
        <div className="tiny dim" style={{ padding: '0 14px 10px' }}>This story follows a real offer, so edits change the offer itself and the story records them.</div>
        <div style={{ padding: '0 14px 12px' }} className="stack">
          {o.userIsBuyer ? <>
            <div className="label">{w.clubs[o.toClubId]?.short}'s answer to your {fmtMoney(o.fee, { short: true })}</div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm grow ed-apply" onClick={() => applyDeal({ answer: 'accept' })}><Icon name="check" size={15} /> They accept</button>
              <button className="btn sm grow" onClick={() => applyDeal({ answer: 'reject' })}><Icon name="close" size={15} /> They refuse</button>
            </div>
            <div className="ed-line"><span className="small">They ask for</span><Stepper label="Counter" value={fee} min={0} max={500_000_000} step={fee >= 50e6 ? 5e6 : fee >= 5e6 ? 1e6 : 250_000} onChange={setFee} fmt={(v) => fmtMoney(v, { short: true })} /></div>
            <button className="btn sm block" onClick={() => applyDeal({ counter: fee })}>Counter at {fmtMoney(fee, { short: true })}</button>
          </> : <>
            <div className="label">{w.clubs[o.fromClubId]?.short}'s bid</div>
            <div className="ed-line"><span className="small">They offer</span><Stepper label="Bid" value={fee} min={0} max={500_000_000} step={fee >= 50e6 ? 5e6 : fee >= 5e6 ? 1e6 : 250_000} onChange={setFee} fmt={(v) => fmtMoney(v, { short: true })} /></div>
            {fee !== o.fee && <button className="btn sm block ed-apply" onClick={() => applyDeal({ fee })}>They offer {fmtMoney(fee, { short: true })}</button>}
            <div className="ed-line"><span className="small">Your reply by</span><Stepper value={Math.max(0, diffDays(o.respondBy || w.date, w.date))} min={0} max={30} onChange={(v) => applyDeal({ replyIn: v })} fmt={(v) => (v ? `${v} day${v > 1 ? 's' : ''}` : 'Today')} /></div>
            <button className="btn sm block danger" onClick={() => applyDeal({ withdraw: true })}><Icon name="close" size={15} /> They withdraw</button>
          </>}
        </div>
        {interest}
      </div>
    )
  }
  const frozen = s.ai?.round === -99
  const seller = w.clubs[s.from]
  const stance = (seller?.market?.sell ?? 0) as -1 | 0 | 1
  return (
    <div className="card ed-card">
      {head}
      <div style={{ padding: '0 14px' }}>
        <div className="label" style={{ margin: '4px 0 8px' }}>Move it to</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {(['rumour', 'talks', 'negotiating', 'close'] as StoryStage[]).map((st) => <button key={st} className={`chip sm ${s.stage === st ? 'on' : ''}`} onClick={() => { haptic(); apply({ stage: st }) }}>{STAGE_LABEL[st]}</button>)}
        </div>
        {s.stage === 'rumour' && <>
          <div className="label" style={{ margin: '12px 0 8px' }}>Reported by</div>
          <div className="chips ed-chips-x">{[...OUTLETS].sort((a, b) => Number(b.name === s.source) - Number(a.name === s.source)).map((x) => <button key={x.name} className={`chip sm ${s.source === x.name ? 'on' : ''}`} onClick={() => { haptic(); apply({ source: x.name }) }}>{x.name}</button>)}</div>
          <div className="ed-line" style={{ marginTop: 10 }}><span className="small">Reliability</span><Stepper value={s.reliability || 2} min={1} max={5} onChange={(v) => apply({ reliability: v })} fmt={(v) => `${v}/5`} /></div>
        </>}
        {s.kind !== 'free' && <>
          <div className="ed-line" style={{ marginTop: 12 }}><span className="small">{s.kind === 'loan' ? 'Loan fee' : s.stage === 'rumour' ? 'Reported fee' : 'Fee on the table'}</span><Stepper label="Fee" value={fee} min={0} max={500_000_000} step={fee >= 50e6 ? 5e6 : fee >= 5e6 ? 1e6 : 250_000} onChange={setFee} fmt={(v) => fmtMoney(v, { short: true })} /></div>
          {fee !== (s.fee || 0) && <button className="btn sm block ed-apply" style={{ marginTop: 6 }} onClick={() => apply({ fee })}>Apply fee</button>}
        </>}
        {s.kind === 'transfer' && (s.stage === 'talks' || s.stage === 'negotiating') && <>
          <div className="ed-line" style={{ marginTop: 10 }}><span className="small">{w.clubs[s.to]?.short}'s limit</span><Stepper label="Limit" value={cap} min={0} max={500_000_000} step={cap >= 50e6 ? 5e6 : cap >= 5e6 ? 1e6 : 250_000} onChange={setCap} fmt={(v) => fmtMoney(v, { short: true })} /></div>
          {cap !== (s.ai?.cap || 0) && <button className="btn sm block ed-apply" style={{ marginTop: 6 }} onClick={() => apply({ cap })}>Set their limit</button>}
        </>}
        <div className="label" style={{ margin: '12px 0 8px' }}>{p ? callName(p.name) : 'The player'}</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {([[null, 'Lets the move decide'], ['keen', 'Wants the move'], ['against', 'Refuses to go']] as const).map(([v, l]) => <button key={l} className={`chip sm ${(s.mood || null) === v ? 'on' : ''}`} onClick={() => { haptic(); apply({ mood: v }) }}>{l}</button>)}
        </div>
        {seller && <>
          <div className="label" style={{ margin: '12px 0 8px' }}>{seller.short} as sellers</div>
          <div className="row wrap" style={{ gap: 6 }}>{STANCE.map((x) => <button key={x.v} className={`chip sm ${stance === x.v ? 'on' : ''}`} onClick={() => { haptic(); mutate((wd) => editClub(wd, seller.id, { market: { ...(wd.clubs[seller.id].market || {}), sell: x.v === 0 ? undefined : x.v } })); notify(`${seller.short}: ${x.label.toLowerCase()}`, 'edit') }}>{x.label}</button>)}</div>
        </>}
        {s.stage === 'rumour' && <div style={{ margin: '10px -14px 0' }}><Toggle label="Real interest" sub="Off: paper talk that may come to nothing" on={(s.ai?.round ?? -1) >= 0} onChange={(v) => apply({ real: v })} /></div>}
        <div className="ed-line" style={{ marginTop: 10 }}><span className="small">Next step</span><Stepper value={Math.max(0, s.ai ? diffDays(s.ai.nextStep, w.date) : 1)} min={0} max={30} onChange={(v) => apply({ nextIn: v })} fmt={(v) => (v ? `in ${v} day${v > 1 ? 's' : ''}` : 'today')} /></div>
        <button className="btn sm block" style={{ marginTop: 6 }} onClick={() => { haptic('medium'); apply({ advanceNow: true }) }}><Icon name="ffwd" size={15} /> Take the next step now</button>
      </div>
      <Toggle label="Freeze" sub="Holds it at this stage until you move it" on={frozen} onChange={(v) => apply({ freeze: v })} />
      <div className="row" style={{ padding: 14, gap: 8 }}>
        <button className="btn grow primary" onClick={() => { haptic('medium'); apply({ stage: 'done' }) }}><Icon name="check" size={16} /> Complete</button>
        <button className="btn grow danger" onClick={() => setAsk('kill')}><Icon name="close" size={16} /> Call it off</button>
      </div>
      {interest}
      <Sheet open={ask === 'kill'} onClose={() => setAsk(undefined)} title="Call the deal off">
        <input className="input" style={{ width: '100%' }} placeholder="Why? (shown in the story)" value={reason} maxLength={90} onChange={(e) => setReason(e.target.value)} />
        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>{['He failed his medical', 'The clubs couldn’t agree a fee', 'He turned the move down', 'A late hijack'].map((x) => <button key={x} className={`chip sm ${reason === x ? 'on' : ''}`} onClick={() => setReason(x)}>{x}</button>)}</div>
        <button className="btn danger block" style={{ marginTop: 14 }} onClick={() => { apply({ stage: 'failed', reason: reason || undefined }); setAsk(undefined) }}>Call it off</button>
      </Sheet>
    </div>
  )
}

/** Start a story by hand: player, destination, how far along, fee. */
function NewStorySheet({ w, open, onClose, onMade, preset }: { w: World; open: boolean; onClose: () => void; onMade: (id?: number) => void; preset?: number }) {
  const mutate = useGame((s) => s.mutate)
  const notify = useGame((s) => s.notify)
  const [q, setQ] = useState('')
  const [pid, setPid] = useState<number | undefined>(preset)
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
