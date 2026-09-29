import { useEffect, useMemo, useState } from 'react'
import { Fx } from '../components/Fx'
import { useGame, useWorld, haptic } from '../../store/game'
import type { InboxMessage, NewsItem, World } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Avatar, Badge, CompLogo, Empty, Face, Ovr, PosChip, UserAvatar } from '../components/atoms'
import { Chips, Screen, Stepper } from '../components/layout'
import { fmtDate } from '../../domain/dates'
import { fmtMoney, roundValue } from '../../domain/finance'
import { runAction } from '../actions'
import { respondConversation } from '../../engine/world/morale'
import { applyPress, pressQuestions, type PressOption, type PressQuestion } from '../../engine/world/press'
import { counterIncomingBid } from '../../engine/world/userActions'
import { staffNames } from '../../engine/world/messages'
import { hashString } from '../../domain/rng'
import { askingPrice } from '../../engine/world/transfers'
import { ChatLog, MoodMeter, useTypingChat } from '../components/Chat'
import { MessageContext } from '../components/MessageContext'

const CAT_ICON: Record<string, string> = {
  Board: 'board', Transfers: 'transfers', Squad: 'squad', Scouting: 'scout', Youth: 'youth', Medical: 'injury', Competitions: 'trophy',
  Player: 'chat', Assistant: 'manager', Media: 'news', Finance: 'money',
}

function MsgAvatar({ w, m, size = 42 }: { w: World; m: InboxMessage; size?: number }) {
  const img = m.image
  if (img?.kind === 'player' && w.players[img.id as number]) { const p = w.players[img.id as number]; return <Face p={p} size={size} radius={12} club={w.clubs[p.clubId]} /> }
  if (img?.kind === 'club' && w.clubs[img.id as number]) return <div className="msg-av"><Badge club={w.clubs[img.id as number]} size={size - 10} /></div>
  if (img?.kind === 'comp') return <div className="msg-av"><CompLogo k={String(img.id)} size={size - 14} /></div>
  const staff = /Chairman|Director|Assistant|Medical|Youth|Scout/.test(m.fromRole)
  if (staff) return <Avatar name={m.from.replace(/^Dr\. /, '')} size={size} radius={12} />
  return <div className="msg-av"><Icon name={CAT_ICON[m.category] || 'inbox'} size={20} /></div>
}

export function Inbox() {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const mutate = useGame((s) => s.mutate)
  const [cat, setCat] = useState<string>('All')
  const cats = ['All', 'Unread', 'Transfers', 'Squad', 'Player', 'Board', 'Medical', 'Scouting', 'Youth', 'Competitions']
  const list = w.inbox.filter((m) => cat === 'All' || (cat === 'Unread' ? !m.read : m.category === cat || (cat === 'Squad' && m.category === 'Assistant')))
  const unread = w.inbox.filter((m) => !m.read).length
  return (
    <Screen title="Inbox" sub={`${unread} unread`} back right={unread ? <button className="btn xs" onClick={() => mutate((w) => w.inbox.forEach((m) => (m.read = true)))}>Mark all read</button> : undefined}>
      <Chips items={cats.map((c) => ({ id: c, label: c }))} value={cat} onChange={setCat} />
      {!list.length && <Empty icon="inbox" title="Nothing here" text="Messages from your staff, players, the board and other clubs appear here." />}
      <div className="pad" style={{ marginTop: 10 }}>
        <div className="card list">
          {list.slice(0, 150).map((m) => (
            <button key={m.id} className={`li tap msg-row ${m.read ? '' : 'unread'}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => { mutate((w) => { const x = w.inbox.find((y) => y.id === m.id); if (x) x.read = true }, { save: false }); go({ name: 'message', params: { id: m.id } }) }}>
              <MsgAvatar w={w} m={m} />
              <div className="meta">
                <div className="row between"><span className="tiny dim ellipsis">{m.from} · {m.fromRole}</span><span className="tiny dim" style={{ flex: 'none' }}>{fmtDate(m.date, 'dm')}</span></div>
                <div className="t ellipsis" style={{ marginTop: 2 }}>{m.subject}</div>
                <div className="s ellipsis">{m.body}</div>
              </div>
              {!m.read && <span className="status-dot" style={{ background: 'var(--acc)' }} />}
              {m.actions.length > 0 && !m.resolved && m.read && <Icon name="forward" size={16} color="var(--t3)" />}
            </button>
          ))}
        </div>
      </div>
    </Screen>
  )
}

export function Message({ params }: { params: { id: string } }) {
  const w = useWorld()
  const back = useGame((s) => s.back)
  const mutate = useGame((s) => s.mutate)
  const m = w.inbox.find((x) => x.id === params.id)
  if (!m) return <Screen title="Message" back><Empty icon="inbox" title="Message not found" /></Screen>
  const expired = m.expires && w.date > m.expires
  return (
    <Screen title={m.category} back right={<button className="iconbtn" aria-label="Delete" onClick={() => { mutate((w) => { w.inbox = w.inbox.filter((x) => x.id !== m.id) }); back() }}><Icon name="trash" size={19} /></button>}>
      <div className="pad stack fade-up">
        <div className="row" style={{ gap: 12 }}>
          <MsgAvatar w={w} m={m} size={52} />
          <div className="grow"><div className="b">{m.from}</div><div className="tiny dim">{m.fromRole} · {fmtDate(m.date, 'long')}</div></div>
        </div>
        <div className="h2" style={{ fontSize: 26 }}>{m.subject}</div>
        <div className="msg-body">{m.body}</div>
        <MessageContext w={w} m={m} />
        {m.actions.length > 0 && (
          <div className="stack" style={{ gap: 8, marginTop: 6 }}>
            {m.resolved || expired ? <div className="tiny dim row tight"><Icon name="check" size={14} /> {expired && !m.resolved ? 'This request has expired.' : 'Actioned'}</div> : null}
            {m.actions.map((a) => {
              const decision = ['acceptBid', 'rejectBid', 'negotiateBid', 'acceptCounter'].includes(a.action)
              const disabled = decision && (m.resolved || !!expired)
              return <button key={a.label} className={`btn block ${a.primary ? 'club' : a.danger ? 'danger' : ''}`} disabled={disabled} onClick={() => { haptic('medium'); runAction(a, m.id) }}>{a.label}</button>
            })}
          </div>
        )}
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------- conversation
export function ConversationScreen({ params }: { params: { id: string; msgId?: string } }) {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const back = useGame((s) => s.back)
  const c = w.conversations.find((x) => x.id === params.id)
  const chat = useTypingChat(c ? [{ by: 'them', text: c.prompt }, ...(c.resolved && c.choice ? [{ by: 'me' as const, text: c.options.find((o) => o.id === c.choice)?.text || '' }] : [])] : [])
  const [answered, setAnswered] = useState(!!c?.resolved)
  if (!c) return <Screen title="Conversation" back><Empty icon="chat" title="Conversation not found" /></Screen>
  const p = w.players[c.playerId]
  const club = w.clubs[p?.clubId]
  return (
    <Screen title="Player Conversation" sub={c.kind} back>
      <div className="pad stack fade-up">
        <div className="row" style={{ gap: 12 }}>
          {p && <Face p={p} size={60} radius={30} club={club} />}
          <div className="grow"><div className="h3">{p?.name}</div><div className="tiny dim">{p?.contract.role} · Morale {Math.round(p?.morale || 0)}</div></div>
        </div>
        <ChatLog lines={chat.lines} typing={chat.typing} avatar={() => p ? <Face p={p} size={30} radius={15} club={club} /> : null} />
        {answered ? (
          !chat.busy && <button className="btn block" onClick={back}>Done</button>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <div className="label">Your response</div>
            {c.options.map((o) => (
              <button key={o.id} className="btn block answer" onClick={() => {
                haptic('medium')
                let r = ''
                mutate((w) => {
                  r = respondConversation(w, c.id, o.id)
                  const m = w.inbox.find((x) => x.id === params.msgId || x.actions.some((a) => a.payload === c.id))
                  if (m) { m.resolved = true; m.read = true }
                })
                setAnswered(true)
                const renew = useGame.getState().world?.flags.openRenewal === c.playerId
                chat.send({ by: 'me', text: o.text }, r ? [{ by: 'them', text: r.replace(/^"|"$/g, '') }] : [], () => {
                  if (renew) {
                    mutate((w) => { w.flags.openRenewal = undefined })
                    useGame.getState().open({ name: 'renewal', params: { id: c.playerId } })
                  }
                })
              }}>{o.text}</button>
            ))}
          </div>
        )}
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------- press conference
export function PressConference({ params }: { params: { kind: 'pre' | 'post'; fixtureId: string } }) {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const close = useGame((s) => s.close)
  const base = useMemo(() => pressQuestions(w, params.kind, params.fixtureId), [params.fixtureId, params.kind])
  const [qs, setQs] = useState<PressQuestion[]>(base)
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [summary, setSummary] = useState<string[]>()
  const chat = useTypingChat([])
  const [asked, setAsked] = useState(-1)
  const q = qs[i]
  const f = w.fixtures[params.fixtureId]
  const opp = f ? w.clubs[f.home === w.userClubId ? f.away : f.home] : undefined
  // each question is "typed" by the reporter before it can be answered
  useEffect(() => {
    if (!q || summary || asked === i) return
    setAsked(i)
    chat.send(null, [{ by: 'them', who: `${q.reporter} · ${q.outlet}`, text: q.text }])
  }, [i, q?.id, summary])
  const answer = (o: PressOption) => {
    haptic()
    const next = { ...answers, [q.id]: o.id }
    setAnswers(next)
    chat.setLines((l) => [...l, { by: 'me', text: o.text }])
    let list = qs
    if (o.followUp) { list = [...qs.slice(0, i + 1), o.followUp, ...qs.slice(i + 1)]; setQs(list) }
    if (i + 1 < list.length) setI(i + 1)
    else { let out: string[] = []; mutate((w) => { out = applyPress(w, params.kind, params.fixtureId, list, next) }); setSummary(out) }
  }
  return (
    <Screen title="Press Conference" sub={`${params.kind === 'pre' ? 'Pre-match' : 'Post-match'}${opp ? ` · ${opp.short}` : ''}`} back onBack={close} noNav>
      <div className="pad stack fade-up">
        <div className="press-stage">
          <Fx kind="spotlight" />
          <UserAvatar w={w} size={78} radius={39} />
          <div className="press-mics"><Icon name="chat" size={20} /></div>
        </div>
        {!summary && q && <div className="row between"><span className="label">Question {i + 1} of {qs.length}</span>{q.playerId && w.players[q.playerId] ? <span className="row tight tiny b"><Face p={w.players[q.playerId]} size={22} radius={11} club={w.clubs[w.players[q.playerId].clubId]} />{w.players[q.playerId].name}</span> : <span className="tiny dim">{q.outlet}</span>}</div>}
        <ChatLog lines={chat.lines} typing={chat.typing} avatar={(who) => <Avatar name={(who || 'Press').split(' · ')[0]} size={30} />} />
        {!summary && q && !chat.busy && asked === i && (
          <div className="stack" style={{ gap: 8 }}>
            {q.options.map((o) => (
              <button key={o.id} className="btn block answer" onClick={() => answer(o)}>
                <span className="tone">{o.tone}</span>{o.text}
              </button>
            ))}
          </div>
        )}
        {!q && !summary && <Empty icon="chat" title="No questions today" />}
        {summary && (
          <div className="card pad-card stack" style={{ gap: 8 }}>
            <div className="h3">Press conference over</div>
            {summary.length ? summary.map((s) => <div key={s} className="row tight small"><Icon name="info" size={14} color="var(--info)" />{s}</div>) : <div className="muted small">Your comments were well received.</div>}
            <button className="btn primary block" style={{ marginTop: 8 }} onClick={close}>Done</button>
          </div>
        )}
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------- selling negotiation (user counters an AI bid)
export function SellNegotiation({ params }: { params: { offerId: string; msgId?: string } }) {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const close = useGame((s) => s.close)
  const o = w.transfers.offers[params.offerId]
  const p = o ? w.players[o.playerId] : undefined
  const [fee, setFee] = useState(() => o ? roundValue(Math.max(o.fee * 1.25, p ? askingPrice(w, p) : 0)) : 0)
  const buyer = o ? w.clubs[o.fromClubId] : undefined
  const chat = useTypingChat(o && buyer ? [{ by: 'them', who: buyer.short, text: `We'd like to sign ${p?.name}. Our offer is ${fmtMoney(o.fee)}.` }] : [])
  if (!o || !p || !buyer) return <Screen title="Negotiation" back onBack={close} noNav><Empty icon="handshake" title="Offer no longer available" /></Screen>
  const done = !['Offer Submitted', 'Counter Offer'].includes(o.status)
  const step = fee >= 50e6 ? 1e6 : fee >= 10e6 ? 5e5 : fee >= 2e6 ? 1e5 : 25e3
  const counter = () => {
    haptic('medium')
    let r = { ok: false, text: '' } as { ok: boolean; text: string; status?: string }
    mutate((w) => { r = counterIncomingBid(w, o.id, fee) }, { roster: true })
    chat.send({ by: 'me', text: `We want ${fmtMoney(fee)} for ${p.name}.` }, [{ by: 'them', who: buyer.short, text: r.text, tone: r.ok ? 'good' : r.status === 'Negotiations Failed' ? 'bad' : 'neutral' }], () => { if (r.ok) useGame.getState().notify(r.text, 'ok') })
  }
  return (
    <Screen title="Negotiation" sub={`${buyer.name} for ${p.name}`} back onBack={close} noNav>
      <div className="pad stack fade-up">
        <div className="card pad-card row" style={{ gap: 12 }}>
          <Face p={p} size={56} radius={28} club={w.clubs[p.clubId]} />
          <div className="grow"><div className="b">{p.name}</div><div className="tiny dim">Value {fmtMoney(p.value)} · Contract to {p.contract.until + 1}</div></div>
          <Badge club={buyer} size={42} />
        </div>
        <div className="card pad-card row between">
          <div><div className="label">Their offer</div><div className="display" style={{ fontSize: 30, marginTop: 4 }}>{fmtMoney(o.fee)}</div></div>
          <div style={{ width: 130 }}><MoodMeter v={o.patience} label="Their patience" /></div>
        </div>
        <ChatLog lines={chat.lines} typing={chat.typing} avatar={() => <Badge club={buyer} size={28} />} />
        {!done && (
          <div className="card pad-card stack" style={{ gap: 12, opacity: chat.busy ? 0.55 : 1, pointerEvents: chat.busy ? 'none' : undefined }}>
            <div className="label">Your asking price</div>
            <Stepper value={fee} min={Math.max(0, o.fee)} max={o.fee * 4 + 1e6} step={step} onChange={setFee} fmt={(v) => fmtMoney(v)} />
            <button className="btn primary block" onClick={counter} disabled={chat.busy}>Counter-offer</button>
            <div className="row">
              <button className="btn grow" onClick={() => { runAction({ label: '', action: 'acceptBid', payload: o.id }, params.msgId); close() }}>Accept {fmtMoney(o.fee, { short: true })}</button>
              <button className="btn danger grow" onClick={() => { runAction({ label: '', action: 'rejectBid', payload: o.id }, params.msgId); close() }}>Reject</button>
            </div>
          </div>
        )}
        {done && !chat.busy && <button className="btn primary block" onClick={close}>Done</button>}
      </div>
    </Screen>
  )
}

void staffNames
