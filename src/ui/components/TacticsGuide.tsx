// The tactics guide in the interface: an (i) beside each control that opens what it really does, and a card that
// shows where the whole setup sits on a few tendencies and how its settings combine. Content: ui/tacticsGuide.ts.
import { useState } from 'react'
import type { TeamTactics } from '../../domain/types'
import { combos, currentOption, GUIDES, tendencies, type TacticKey } from '../tacticsGuide'
import { haptic } from '../../store/game'
import { Icon } from '../icons/Icon'
import { Sheet } from './layout'

/** The (i) beside a control; opens its explanation with the current setting picked out. */
export function GuideButton({ k, t }: { k: TacticKey; t?: TeamTactics }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="tb-info" aria-label={`What ${GUIDES[k].title.toLowerCase()} does`} onClick={(e) => { e.stopPropagation(); haptic(); setOpen(true) }}>
        <Icon name="info" size={15} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={GUIDES[k].title}>
        <GuideBody k={k} t={t} />
      </Sheet>
    </>
  )
}

function GuideBody({ k, t }: { k: TacticKey; t?: TeamTactics }) {
  const g = GUIDES[k]
  const cur = t ? currentOption(k, t) : ''
  return (
    <div className="stack guide" style={{ gap: 12 }}>
      <div className="small muted">{g.what}</div>
      {g.options.length > 0 && (
        <div className="guide-opts">
          {g.options.map((o) => (
            <div key={o.id} className={`guide-opt ${o.id === cur ? 'on' : ''}`}>
              <div className="row between"><b className="small">{o.label}</b>{o.id === cur && <span className="guide-now">Current</span>}</div>
              <div className="tiny">{o.text}</div>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="label" style={{ marginBottom: 6 }}>In the match engine</div>
        <ul className="guide-list">{g.engine.map((x) => <li key={x} className="tiny">{x}</li>)}</ul>
      </div>
      {g.moves.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          {g.moves.map(([m, d]) => (
            <span key={m} className={`guide-move ${d}`}><Icon name={d === 'up' ? 'up' : d === 'down' ? 'down' : 'swap'} size={12} strokeWidth={2.4} />{m}</span>
          ))}
          <span className="tiny dim" style={{ alignSelf: 'center' }}>{k === 'mentality' ? 'as it gets more attacking' : g.options.length === 2 ? 'when on / higher' : 'toward the right-hand setting'}</span>
        </div>
      )}
    </div>
  )
}

/** Where the setup sits on each tendency, and the combinations worth knowing about. */
export function PlayStyleCard({ t }: { t: TeamTactics }) {
  const ts = tendencies(t)
  const cs = combos(t)
  return (
    <div className="card pad-card tb-style">
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="label">How you'll play</div>
        <span className="tiny dim">tendencies, not guarantees</span>
      </div>
      <div className="tb-tend">
        {ts.map((x) => (
          <div key={x.id} className="tb-tend-row">
            <div className="row between tiny"><span className="b">{x.label}</span></div>
            <div className="tb-meter" role="img" aria-label={`${x.label}: ${x.v < 0.34 ? x.low : x.v > 0.66 ? x.high : 'in between'}`}>
              <i style={{ left: `${Math.round(x.v * 100)}%` }} />
            </div>
            <div className="row between tb-ends"><span>{x.low}</span><span>{x.high}</span></div>
          </div>
        ))}
      </div>
      {cs.length > 0 && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          {cs.map((c) => (
            <div key={c.title} className="tb-combo">
              <Icon name="tactics" size={14} />
              <div><div className="small b">{c.title}</div><div className="tiny muted">{c.text}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
