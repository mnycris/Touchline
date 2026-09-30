import { useState } from 'react'
import { useGame, useWorld, haptic } from '../../store/game'
import { useRemember } from '../memory'
import type { TrainingPlan } from '../../domain/types'
import { Icon } from '../icons/Icon'
import { Face, Ovr, PosChip, Sparkline } from '../components/atoms'
import { Screen, Seg, Sheet } from '../components/layout'
import { DEV_PLANS, POS_GROUP, POS_ORDER, TRAINING_PLANS } from '../../domain/constants'
import { rosterOf } from '../../engine/world/roster'
import { ageOf, userClub } from '../selectors'
import { fmtDate } from '../../domain/dates'

const PLAN_SHORT: Record<TrainingPlan, string> = { 'All Out Energy': 'Energy+', 'Energy Focused': 'Energy', Balanced: 'Balanced', 'Performance Focused': 'Perform', 'All Out Performance': 'Perform+' }
const PLAN_COLOR: Record<TrainingPlan, string> = { 'All Out Energy': '#2F8CFF', 'Energy Focused': '#53B9FF', Balanced: '#9BE15D', 'Performance Focused': '#FFB020', 'All Out Performance': '#FF4D5E' }

export function TrainingScreen() {
  const w = useWorld()
  const mutate = useGame((s) => s.mutate)
  const club = userClub(w)
  const squad = [...rosterOf(w, club.id)].filter((p) => !p.loan || p.loan.fromClubId !== club.id).sort((a, b) => POS_ORDER[a.positions[0]] - POS_ORDER[b.positions[0]] || b.ovr - a.ovr)
  const [pick, setPick] = useState<number>()
  const setAll = (t: TrainingPlan) => { haptic('medium'); mutate((w) => rosterOf(w, w.userClubId).forEach((p) => { p.trainingPlan = t })); useGame.getState().notify(`Whole squad set to ${t}`, 'ok') }
  const auto = () => {
    haptic('medium')
    mutate((w) => rosterOf(w, w.userClubId).forEach((p) => {
      const age = ageOf(w, p)
      p.trainingPlan = p.fitness < 70 ? 'Energy Focused' : age <= 22 && p.pot - p.ovr >= 5 ? 'Performance Focused' : p.fitness > 92 && p.sharpness < 60 ? 'Performance Focused' : age >= 31 ? 'Energy Focused' : 'Balanced'
    }))
    useGame.getState().notify('Assistant set individual plans', 'ok')
  }
  return (
    <Screen title="Training" sub="Energy, sharpness and development" back>
      <div className="pad stack">
        <div className="card pad-card small muted">Each player follows a weekly training plan. Energy-focused plans aid recovery between matches; performance plans build match sharpness and accelerate development, at a fatigue and injury cost.</div>
        <div className="row wrap" style={{ gap: 7 }}>
          <button className="chip on" onClick={auto}><Icon name="manager" size={14} /> Assistant auto-plan</button>
          {TRAINING_PLANS.map((t) => <button key={t.id} className="chip" onClick={() => setAll(t.id)}>All: {PLAN_SHORT[t.id]}</button>)}
        </div>
        <div className="card list">
          {squad.map((p) => (
            <button key={p.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => setPick(p.id)}>
              <Face p={p} size={38} radius={10} club={club} />
              <div className="meta">
                <div className="t small ellipsis">{p.name}</div>
                <div className="row tight" style={{ marginTop: 4, gap: 10 }}>
                  <MiniBar label="EN" v={p.fitness} />
                  <MiniBar label="SH" v={p.sharpness} color="var(--info)" />
                </div>
              </div>
              <span className="pill" style={{ background: `${PLAN_COLOR[p.trainingPlan]}33`, color: PLAN_COLOR[p.trainingPlan] }}>{PLAN_SHORT[p.trainingPlan]}</span>
            </button>
          ))}
        </div>
      </div>
      <Sheet open={pick !== undefined} onClose={() => setPick(undefined)} title={pick ? w.players[pick]?.name : ''}>
        <div className="card list">
          {TRAINING_PLANS.map((t) => (
            <button key={t.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => { mutate((w) => { w.players[pick!].trainingPlan = t.id }); setPick(undefined) }}>
              <span className="status-dot" style={{ background: PLAN_COLOR[t.id] }} />
              <div className="meta"><div className="t small">{t.id}</div><div className="s">{t.desc}</div></div>
              {pick && w.players[pick]?.trainingPlan === t.id && <Icon name="check" size={18} color="var(--acc)" />}
            </button>
          ))}
        </div>
      </Sheet>
    </Screen>
  )
}

function MiniBar({ label, v, color }: { label: string; v: number; color?: string }) {
  const c = color || (v >= 75 ? 'var(--pos)' : v >= 50 ? 'var(--warn)' : 'var(--neg)')
  return <span className="row tight tiny" style={{ gap: 4 }}><span className="dim">{label}</span><span style={{ width: 46 }}><span className="bar" style={{ height: 4, display: 'block' }}><i style={{ width: `${v}%`, background: c }} /></span></span><b className="num">{Math.round(v)}</b></span>
}

export function DevelopmentScreen() {
  const w = useWorld()
  const go = useGame((s) => s.go)
  const club = userClub(w)
  const [grp, setGrp] = useRemember<'young' | 'all'>('devGroup', 'young')
  const squad = [...rosterOf(w, club.id)].filter((p) => grp === 'all' || ageOf(w, p) <= 23).sort((a, b) => (b.pot - b.ovr) - (a.pot - a.ovr))
  return (
    <Screen title="Player Development" back>
      <div className="pad stack">
        <Seg small items={[{ id: 'young', label: 'Under 24' }, { id: 'all', label: 'Whole squad' }]} value={grp} onChange={setGrp} />
        <div className="card list">
          {squad.map((p) => {
            const plan = DEV_PLANS.find((d) => d.id === p.devPlan)
            const hist = p.growthHistory.map((g) => g.ovr)
            const gained = hist.length ? p.ovr - hist[0] : 0
            return (
              <button key={p.id} className="li tap" style={{ width: '100%', textAlign: 'left' }} onClick={() => go({ name: 'player', params: { id: p.id } })}>
                <Face p={p} size={40} radius={10} club={club} />
                <div className="meta">
                  <div className="t small ellipsis">{p.name} <span className="dim">· {ageOf(w, p)}</span></div>
                  <div className="s">{plan?.name || 'Balanced'}{p.devTargetPos ? ` · → ${p.devTargetPos}` : ''} · {POS_GROUP[p.positions[0]]}</div>
                </div>
                <Sparkline values={hist.length > 1 ? hist : [p.ovr, p.ovr]} w={50} h={24} color={gained > 0 ? 'var(--pos)' : gained < 0 ? 'var(--neg)' : 'var(--t3)'} />
                <div className="col" style={{ alignItems: 'center' }}><Ovr v={p.ovr} size="sm" /><span className="tiny dim">{p.pot}</span></div>
              </button>
            )
          })}
        </div>
        <div className="tiny dim">Growth is applied on the 1st and 15th of every month, driven by age, potential, minutes, match ratings and training intensity. Last update: {fmtDate(w.date, 'long')}.</div>
      </div>
    </Screen>
  )
}

void PosChip
