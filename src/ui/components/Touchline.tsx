// The touchline: how the game is going in a glance, how it is likely to end from here, the assistant's call with its
// reason, and the shouts a manager makes from the technical area. Every shout says what it would do to the outlook
// before it is made (what the match engine does with that change, measured: see engine/match/response.ts), and once
// made, what it has actually done since (see verdictOf). The full tactics board is one tap further.
import type { TeamTactics, World } from '../../domain/types'
import type { MatchSim } from '../../engine/match/engine'
import { liveOutlook, minutesLeft, shoutEffect, stateOf, type Outlook } from '../../engine/match/response'
import { Chances, Delta, OutlookCard } from './Outlook'
import { SHOUTS, SHOUT, advise, callsInForce, readGame, setShouts, shoutsOn, toggleShout, verdictOf, type ShoutId, type Verdict } from '../shouts'
import { Icon } from '../icons/Icon'
import { haptic } from '../../store/game'


export function Touchline({ sim, side, w, prior, onSet, onSubs, onBoard }: { sim: MatchSim; side: 0 | 1; w: World; prior: [number, number]; onSet: (t: TeamTactics) => void; onSubs: () => void; onBoard: () => void }) {
  const st = shoutsOn(sim, side)
  const g = readGame(sim, side)
  const tips = advise(sim, side, st.on)
  const us = w.clubs[side === 0 ? sim.home.clubId : sim.away.clubId], them = w.clubs[side === 0 ? sim.away.clubId : sim.home.clubId]
  const call = (id: ShoutId) => {
    haptic('medium')
    onSet(setShouts(sim, side, st.base, toggleShout(st.on, id)))
  }
  // the outlook as things stand, and with each shout made (or called off)
  const left = minutesLeft(sim)
  const state = stateOf([sim.score[side], sim.score[1 - side]], sim.minute)
  // (the calls in force count from here at what they were measured to do)
  const held = callsInForce(sim, side, st.on, st.since)
  const now = left > 0 ? liveOutlook(sim, side, prior, held) : undefined
  const withCall = (id: ShoutId) => { if (!now) return undefined; const e = shoutEffect(st.on, toggleShout(st.on, id), state); return liveOutlook(sim, side, prior, { f: held.f * e.f, a: held.a * e.a }) }
  // the call the numbers favour: the most points expected from here (a win 3, a draw 1), if it adds a meaningful amount
  const pts = (o: Outlook) => 3 * o.w + o.d
  const gains = now ? SHOUTS.filter((s) => !st.on.includes(s.id)).map((s) => ({ id: s.id, g: pts(withCall(s.id)!) - pts(now) })).sort((a, b) => b.g - a.g) : []
  const best = gains[0] && gains[0].g >= 0.02 ? gains[0].id : undefined
  const lean = g?.read.lean ?? 0
  return (
    <div className="tl">
      <div className="tl-read card">
        <div className="row between">
          <span className="label">Last 15 minutes</span>
          <span className={`tl-word ${lean > 0.15 ? 'pos' : lean < -0.15 ? 'neg' : ''}`}>{g ? g.read.word : 'Just under way'}</span>
        </div>
        {/* who is on top: our colour pushing from the left, theirs from the right */}
        <div className="tl-lean" aria-label={g?.read.word}>
          <i className="us" style={{ width: `${50 + lean * 50}%` }} /><i className="them" style={{ width: `${50 - lean * 50}%` }} />
          <b style={{ left: `${50 + lean * 50}%` }} />
        </div>
        <div className="row between tiny dim tl-names"><span>{us?.short}</span><span>{them?.short}</span></div>
        {g && (
          <div className="tl-facts">
            <span><b>{Math.round(g.read.poss * 100)}%</b> of the ball</span>
            <span>xG <b>{g.read.xg[0].toFixed(1)}</b>–<b>{g.read.xg[1].toFixed(1)}</b></span>
          </div>
        )}
      </div>

      {now && <OutlookCard o={now} left={left} />}

      {st.on.length > 0 && (
        <>
          <div className="row between tl-head"><span className="label">Your calls</span><span className="tiny dim">What they have done since</span></div>
          {st.on.map((id) => <CallCard key={id} id={id} v={verdictOf(sim, side, id, st.since[id] ?? sim.minute)} off={withCall(id)} now={now} onOff={() => call(id)} />)}
        </>
      )}

      {tips.map((a, i) => {
        const o = a.shout ? withCall(a.shout) : undefined
        // the assistant reads the game; the numbers have the last word: a call that costs points from here isn't offered
        const costs = !!(o && now && pts(o) - pts(now) < -0.02)
        return (
          <div key={i} className={`tl-tip ${a.tone}`}>
            <span className="tl-tip-i"><Icon name="chat" size={16} /></span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="tl-tip-t">{a.text}</div>
              {a.why && <div className="tl-tip-w">{a.why}</div>}
              {a.shout && !costs && <button className="btn sm tl-do" onClick={() => call(a.shout!)}><Icon name={SHOUT[a.shout].icon} size={15} /> {SHOUT[a.shout].label}{o && now && <Delta o={o} now={now} short />}</button>}
              {a.shout && costs && o && now && <div className="tl-tip-n">{SHOUT[a.shout].label} would cost more than it gains from here (<Delta o={o} now={now} />{best ? <>; {SHOUT[best].label} is the better bet</> : ''}).</div>}
              {a.subs && <button className="btn sm tl-do" onClick={() => { haptic(); onSubs() }}><Icon name="sub" size={15} /> Make a change</button>}
            </div>
          </div>
        )
      })}

      <div className="row between tl-head">
        <span className="label">Shouts</span>
        <span className="tiny dim">{now ? 'What each would do from here, on average' : 'Tap to call it, again to call it off'}</span>
      </div>
      <div className="tl-shouts">
        {SHOUTS.map((s) => {
          const on = st.on.includes(s.id)
          const o = !on ? withCall(s.id) : undefined
          return (
            <button key={s.id} className={`tl-shout ${on ? 'on' : ''} ${best === s.id ? 'best' : ''}`} onClick={() => call(s.id)} aria-pressed={on}>
              {best === s.id && <span className="tl-best">Best bet</span>}
              <span className="tl-shout-i"><Icon name={s.icon} size={18} strokeWidth={2.2} /></span>
              <span className="tl-shout-l">{s.label}</span>
              <span className="tl-shout-d">{s.does}</span>
              <span className="tl-shout-c">{s.costs}</span>
              {now && <Chances e={shoutEffect([], [s.id], state)} />}
              {on ? <span className="tl-fc on">On since {st.since[s.id] ?? sim.minute}'</span> : o && now ? <span className="tl-fc"><Delta o={o} now={now} /></span> : null}
            </button>
          )
        })}
      </div>
      <button className="btn block tl-board" onClick={() => { haptic(); onBoard() }}><Icon name="tactics" size={17} /> Every setting <span className="dim">· the full tactics board</span></button>
    </div>
  )
}

const fmtV = (v: number | undefined, f: 'n1' | 'n2' | 'pct') => (v === undefined ? '–' : f === 'pct' ? `${Math.round(v * 100)}%` : f === 'n2' ? v.toFixed(2) : v.toFixed(1))

/** A call that is on: what it has changed since, the verdict, and what calling it off would do. */
function CallCard({ id, v, off, now, onOff }: { id: ShoutId; v: Verdict; off?: Outlook; now?: Outlook; onOff: () => void }) {
  const s = SHOUT[id]
  return (
    <div className={`tl-call ${v.tone}`}>
      <div className="row" style={{ gap: 9 }}>
        <span className="tl-call-i"><Icon name={s.icon} size={16} strokeWidth={2.2} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="tl-call-t">{s.label} <span className="tiny dim">· {v.since}'</span></div>
          <div className="tl-call-w">{v.text}</div>
        </div>
        <span className={`tl-verdict ${v.tone}`}>{v.word}</span>
      </div>
      {v.rows.length > 0 && v.mins >= 3 && (
        <div className="tl-rows">
          <div className="tl-row tl-row-h"><span /><span>Before</span><span>Since</span></div>
          {v.rows.map((r) => (
            <div key={r.label} className={`tl-row ${r.better === true ? 'good' : r.better === false ? 'bad' : ''} ${r.cost ? 'cost' : ''}`}>
              <span>{r.label}{r.cost && <em> · the price</em>}</span>
              <span>{fmtV(r.before, r.fmt)}</span>
              <span>{fmtV(r.after, r.fmt)}</span>
            </div>
          ))}
          <div className="tiny dim tl-rows-n">Per 15 minutes; possession as a share</div>
        </div>
      )}
      <button className="btn xs tl-off" onClick={onOff}><Icon name="close" size={13} /> Call it off{off && now && <Delta o={off} now={now} short />}</button>
    </div>
  )
}
