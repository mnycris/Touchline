// How a match is likely to end, and what a change does to it: the touchline's outlook card, the strip that follows a
// set-up on the tactics board, and the small "Win +3 · Lose −2" a call or a change shows. The numbers come from
// engine/match/response.ts (what the match engine does with each change, measured).
import type { Effect, Outlook } from '../../engine/match/response'

export const pc = (x: number) => Math.round(x * 100)
const sg = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${-x}` : '±0')

/** How the match is likely to end from here: win, draw, lose, and the goals still expected at each end. */
export function OutlookCard({ o, left }: { o: Outlook; left: number }) {
  return (
    <div className="tl-out card">
      <div className="row between"><span className="label">From here</span><span className="tiny dim">{Math.round(left)} min left</span></div>
      <div className="tl-wdl">
        <div><b className="pos">{pc(o.w)}%</b><span>Win</span></div>
        <div><b>{pc(o.d)}%</b><span>Draw</span></div>
        <div><b className="neg">{pc(o.l)}%</b><span>Lose</span></div>
      </div>
      <WdlBar o={o} />
      <div className="tiny dim tl-out-goals">Goals still expected: <b>{o.gf.toFixed(1)}</b> for, <b>{o.ga.toFixed(1)}</b> against</div>
    </div>
  )
}

const WdlBar = ({ o }: { o: Outlook }) => (
  <div className="tl-wdl-bar" aria-hidden><i className="w" style={{ width: `${o.w * 100}%` }} /><i className="d" style={{ width: `${o.d * 100}%` }} /><i className="l" style={{ width: `${o.l * 100}%` }} /></div>
)

/** The change a call makes to the chances of winning and of losing (percentage points), coloured by whether it helps. */
export function Delta({ o, now, short }: { o: Outlook; now: Outlook; short?: boolean }) {
  const dw = pc(o.w) - pc(now.w), dl = pc(o.l) - pc(now.l)
  if (Math.abs(dw) < 1 && Math.abs(dl) < 1) return <span className="tl-dl flat">{short ? ' · little change' : 'Little change'}</span>
  return (
    <span className="tl-dl">
      {short && ' · '}
      <span className={dw > 0 ? 'up' : dw < 0 ? 'down' : ''}>Win {sg(dw)}</span>
      <span className="sep">·</span>
      <span className={dl < 0 ? 'up' : dl > 0 ? 'down' : ''}>Lose {sg(dl)}</span>
    </span>
  )
}

/** A rate multiplier as a percentage change, in words ("+6%", "no change"). */
const rate = (x: number) => { const p = Math.round((x - 1) * 100); return p === 0 ? 'no change' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%` }

/** What a call does to the chances at each end, as measured ("For +19% · against +27%"). */
export function Chances({ e }: { e: Effect }) {
  const cls = (x: number, good: 1 | -1) => (Math.abs(x - 1) < 0.015 ? 'flat' : (x - 1) * good > 0 ? 'up' : 'down')
  return (
    <span className="tl-ch">
      <span className={cls(e.f, 1)}>For {rate(e.f)}</span><span className="sep">·</span><span className={cls(e.a, -1)}>against {rate(e.a)}</span>
    </span>
  )
}

/**
 * The tactics board's forecast: the result chances with the set-up as it is now, what the changes made since `was` did
 * to them, and why (`eff`: the chances you create and allow). Sticks to the top of the board while the settings scroll by.
 */
export function OutlookStrip({ label, now, was, eff, note }: { label: string; now: Outlook; was?: Outlook; eff?: Effect; note?: string }) {
  const d = (k: 'w' | 'd' | 'l') => (was ? pc(now[k]) - pc(was[k]) : 0)
  const cell = (k: 'w' | 'd' | 'l', name: string, good: number) => {
    const x = d(k)
    return (
      <div className={`ol-c ${k}`}>
        <span className="ol-k">{name}</span>
        <b>{pc(now[k])}%</b>
        {x !== 0 && <em className={k === 'd' ? '' : x * good > 0 ? 'up' : 'down'}>{sg(x)}</em>}
      </div>
    )
  }
  const changed = !!eff && (Math.abs(eff.f - 1) >= 0.005 || Math.abs(eff.a - 1) >= 0.005)
  return (
    <div className="ol-strip">
      <div className="row between ol-top"><span className="label">{label}</span>{note && <span className="tiny dim ellipsis">{note}</span>}</div>
      <div className="ol-wdl">{cell('w', 'Win', 1)}{cell('d', 'Draw', 0)}{cell('l', 'Lose', -1)}</div>
      <WdlBar o={now} />
      {eff && (
        <div className="ol-why tiny">
          {changed
            ? <>Chances you create <b className={eff.f > 1.004 ? 'up' : eff.f < 0.996 ? 'down' : ''}>{rate(eff.f)}</b><span className="sep">·</span>you allow <b className={eff.a < 0.996 ? 'up' : eff.a > 1.004 ? 'down' : ''}>{rate(eff.a)}</b></>
            : <span className="dim">These changes make no measurable difference in the match engine</span>}
        </div>
      )}
    </div>
  )
}
