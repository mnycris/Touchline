// The touchline: how the game is going in a glance, the assistant's one call with its reason, and the shouts a manager
// makes from the technical area, each a single tap that moves the team's whole set-up the way that call would. The full
// tactics board is one tap further for anyone who wants every setting.
import type { TeamTactics, World } from '../../domain/types'
import type { MatchSim } from '../../engine/match/engine'
import { SHOUTS, SHOUT, advise, readGame, setShouts, shoutsOn, toggleShout, type ShoutId } from '../shouts'
import { Icon } from '../icons/Icon'
import { haptic } from '../../store/game'

export function Touchline({ sim, side, w, onSet, onSubs, onBoard }: { sim: MatchSim; side: 0 | 1; w: World; onSet: (t: TeamTactics) => void; onSubs: () => void; onBoard: () => void }) {
  const st = shoutsOn(sim, side)
  const g = readGame(sim, side)
  const tips = advise(sim, side, st.on)
  const us = w.clubs[side === 0 ? sim.home.clubId : sim.away.clubId], them = w.clubs[side === 0 ? sim.away.clubId : sim.home.clubId]
  const call = (id: ShoutId) => {
    haptic('medium')
    onSet(setShouts(sim, side, st.base, toggleShout(st.on, id)))
  }
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

      {tips.map((a, i) => (
        <div key={i} className={`tl-tip ${a.tone}`}>
          <span className="tl-tip-i"><Icon name="chat" size={16} /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="tl-tip-t">{a.text}</div>
            {a.why && <div className="tl-tip-w">{a.why}</div>}
            {a.shout && <button className="btn sm tl-do" onClick={() => call(a.shout!)}><Icon name={SHOUT[a.shout].icon} size={15} /> {SHOUT[a.shout].label}</button>}
            {a.subs && <button className="btn sm tl-do" onClick={() => { haptic(); onSubs() }}><Icon name="sub" size={15} /> Make a change</button>}
          </div>
        </div>
      ))}

      <div className="row between" style={{ margin: '14px 2px 8px' }}>
        <span className="label">Shouts</span>
        <span className="tiny dim">Tap to call it, again to call it off</span>
      </div>
      <div className="tl-shouts">
        {SHOUTS.map((s) => {
          const on = st.on.includes(s.id)
          return (
            <button key={s.id} className={`tl-shout ${on ? 'on' : ''}`} onClick={() => call(s.id)} aria-pressed={on}>
              <span className="tl-shout-i"><Icon name={s.icon} size={18} strokeWidth={2.2} /></span>
              <span className="tl-shout-l">{s.label}</span>
              <span className="tl-shout-d">{s.does}</span>
              <span className="tl-shout-c">{s.costs}</span>
            </button>
          )
        })}
      </div>
      <button className="btn block tl-board" onClick={() => { haptic(); onBoard() }}><Icon name="tactics" size={17} /> Every setting <span className="dim">· the full tactics board</span></button>
    </div>
  )
}
