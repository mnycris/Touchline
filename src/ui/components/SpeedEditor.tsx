// Match-speed buttons editor: three speeds on log-scale sliders (0.2× – 6×) and which one a match starts at.
import { DEFAULT_SPEEDS, haptic, useGame } from '../../store/game'
import { Icon } from '../icons/Icon'

const MIN = 0.2, MAX = 6
const toSlider = (v: number) => Math.round((Math.log(v / MIN) / Math.log(MAX / MIN)) * 1000)
const fromSlider = (s: number) => snap(MIN * Math.pow(MAX / MIN, s / 1000))
/** Friendly steps: 0.1 below 2×, 0.25 up to 4×, 0.5 above. */
function snap(v: number) {
  const step = v < 2 ? 0.1 : v < 4 ? 0.25 : 0.5
  return Math.min(MAX, Math.max(MIN, Math.round(v / step) * step))
}
export const fmtSpeed = (v: number) => `${Number.isInteger(v) ? v : v < 1 ? v.toFixed(1).replace(/^0/, '0') : v.toFixed(2).replace(/0$/, '')}×`

export function SpeedEditor() {
  const prefs = useGame((s) => s.prefs)
  const setPrefs = useGame((s) => s.setPrefs)
  const speeds = prefs.speeds || DEFAULT_SPEEDS
  const set = (i: number, v: number) => {
    const next = [...speeds] as [number, number, number]
    const wasStart = speeds[i] === prefs.matchSpeed
    next[i] = v
    setPrefs({ speeds: next, matchSpeed: wasStart ? v : next.includes(prefs.matchSpeed) ? prefs.matchSpeed : next[1] })
  }
  const labels = ['Slow', 'Normal', 'Fast']
  return (
    <div className="spd">
      {speeds.map((v, i) => (
        <div key={i} className="spd-row">
          <div className="spd-l"><span className="small b">{labels[i]}</span><span className="tiny dim">Button {i + 1}</span></div>
          <button className="spd-step" aria-label="Slower" onClick={() => { haptic(); set(i, snap(v - (v <= 2 ? 0.1 : v <= 4 ? 0.25 : 0.5))) }}><Icon name="minus" size={14} /></button>
          <input className="spd-range" type="range" min={0} max={1000} value={toSlider(v)} onChange={(e) => set(i, fromSlider(Number(e.target.value)))}
            style={{ ['--p' as any]: `${toSlider(v) / 10}%` }} aria-label={`${labels[i]} speed`} />
          <button className="spd-step" aria-label="Faster" onClick={() => { haptic(); set(i, snap(v + (v < 2 ? 0.1 : v < 4 ? 0.25 : 0.5))) }}><Icon name="plus" size={14} /></button>
          <span className="spd-v num">{fmtSpeed(v)}</span>
        </div>
      ))}
      <div className="spd-start">
        <span className="tiny dim">Matches start at</span>
        <div className="seg" style={{ height: 34 }}>
          {speeds.map((v, i) => <button key={i} className={prefs.matchSpeed === v ? 'on' : ''} onClick={() => { haptic(); setPrefs({ matchSpeed: v }) }}>{fmtSpeed(v)}</button>)}
        </div>
        <button className="tiny dim" onClick={() => setPrefs({ speeds: DEFAULT_SPEEDS, matchSpeed: 1 })}>Reset</button>
      </div>
      <div className="tiny dim" style={{ marginTop: 6 }}>At 1× one match minute takes one second.</div>
    </div>
  )
}
