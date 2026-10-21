// A trophy won: the Central screen holds it for a while. Still, lit backdrop in the club's and the trophy's colours,
import { useLessMotion } from '../motion'
// confetti with real physics (cannons, flutter, drag, wind) that settles instead of looping, the story of how it was
// won, and a proper send-off when the manager moves on.
import { useEffect, useRef, useState } from 'react'
import type { World } from '../../domain/types'
import { Badge, CompLogo } from './atoms'
import { Icon } from '../icons/Icon'
import { seasonLabel } from '../../domain/dates'
import { sortTable } from '../../engine/competitions/tables'
import { compLogoKey } from '../selectors'
import { haptic, useGame } from '../../store/game'
import { compIdentity } from '../compIdentity'
import { callName } from '../../engine/match/commentary'
import { ordinalOf } from '../../domain/words'
import { leagueDecided } from '../../engine/world/review'
import { assetHref } from '../../services/assets'

interface Piece { x: number; y: number; vx: number; vy: number; r: number; vr: number; flip: number; vf: number; w: number; h: number; c: string; shape: 0 | 1 | 2; life: number; wait: number; z: number }

/**
 * Confetti on a canvas: bursts from two cannons, then pieces flutter down and come to rest out of view. A shower is
 * ticker tape let go above the frame instead: fewer pieces, at different depths (the far ones smaller, dimmer and
 * slower), drifting down through it once.
 */
export function Confetti({ colors, fire, reduce, shower }: { colors: string[]; fire: number; reduce: boolean; shower?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const pieces = useRef<Piece[]>([])
  const raf = useRef(0)
  useEffect(() => {
    const cv = ref.current
    if (!cv || reduce) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = cv.clientWidth, H = cv.clientHeight
    cv.width = W * dpr; cv.height = H * dpr
    const g = cv.getContext('2d')!
    g.scale(dpr, dpr)
    const burst = (big: boolean) => {
      for (const side of [-1, 1]) {
        const n = Math.round((big ? 64 : 30) * Math.min(1.4, Math.max(0.7, (W * H) / 100000)))
        for (let i = 0; i < n; i++) {
          // each cannon aims up and across the card; a spread of speeds fills it from top to bottom
          const ang = -Math.PI / 2 - side * (0.06 + Math.random() * 0.34)
          const sp = Math.sqrt(H) * (0.6 + Math.random() * 0.5) * (big ? 1 : 0.85)
          const shape = (Math.random() < 0.18 ? 1 : Math.random() < 0.12 ? 2 : 0) as Piece['shape']
          pieces.current.push({
            x: side < 0 ? 6 : W - 6, y: H + 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            r: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.3, flip: Math.random() * Math.PI * 2, vf: 0.08 + Math.random() * 0.14,
            w: shape === 1 ? 3 : 6 + Math.random() * 4, h: shape === 1 ? 16 + Math.random() * 10 : 9 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)], shape, life: 0, wait: Math.random() * (big ? 16 : 8), z: 1,
          })
        }
      }
    }
    const rain = () => {
      const n = Math.round(38 * Math.min(1.3, Math.max(0.7, (W * H) / 150000)))
      for (let i = 0; i < n; i++) {
        const z = 0.45 + Math.random() * 0.55
        const shape = (Math.random() < 0.14 ? 1 : 0) as Piece['shape']
        pieces.current.push({
          x: Math.random() * W, y: -12 - Math.random() * 40, vx: (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random() * 0.5,
          r: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.12, flip: Math.random() * Math.PI * 2, vf: 0.05 + Math.random() * 0.1,
          w: (shape === 1 ? 3 : 5 + Math.random() * 3) * z, h: (shape === 1 ? 14 + Math.random() * 8 : 8 + Math.random() * 4) * z, c: colors[Math.floor(Math.random() * colors.length)], shape, life: 0,
          // let go over a couple of seconds, the near ones last
          wait: Math.random() * 150 * (1.2 - z * 0.4), z,
        })
      }
    }
    if (shower) rain(); else burst(fire === 0)
    let last = performance.now(), wind = 0
    const loop = (now: number) => {
      const dt = Math.min(2.2, (now - last) / 16.67)
      last = now
      wind = Math.sin(now / 900) * 0.035
      g.clearRect(0, 0, W, H)
      const ps = pieces.current
      for (const p of ps) {
        if (p.wait > 0) { p.wait -= dt; continue }
        p.life += dt
        const drag = p.shape === 1 ? 0.955 : 0.965
        p.vx = p.vx * drag ** dt + wind * dt
        p.vy = p.vy * drag ** dt + 0.15 * dt
        // falling pieces flutter: terminal speed and a sideways sway as they flip
        if (p.vy > 1.15 * p.z) p.vy = 1.15 * p.z + (p.vy - 1.15 * p.z) * 0.8
        p.flip += p.vf * dt
        p.r += p.vr * dt
        p.x += (p.vx + Math.sin(p.flip) * 0.6) * dt
        p.y += p.vy * dt
        const sx = Math.cos(p.flip)
        g.save()
        g.translate(p.x, p.y)
        g.rotate(p.r)
        g.scale(p.shape === 2 ? 1 : sx, 1)
        g.globalAlpha = Math.min(1, 0.4 + Math.abs(sx) * 0.6) * Math.min(1, (H + 30 - p.y) / 40) * (0.35 + 0.65 * p.z)
        g.fillStyle = p.c
        if (p.shape === 2) { g.beginPath(); g.arc(0, 0, 3.2, 0, Math.PI * 2); g.fill() }
        else if (p.shape === 1) { g.beginPath(); g.moveTo(-p.w / 2, -p.h / 2); g.quadraticCurveTo(p.w * 2.2, 0, -p.w / 2, p.h / 2); g.lineTo(p.w / 2, p.h / 2); g.quadraticCurveTo(p.w * 2.6, 0, p.w / 2, -p.h / 2); g.closePath(); g.fill() }
        else { g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 0.28) }
        g.restore()
      }
      pieces.current = ps.filter((p) => p.y < H + 40 && p.life < 900)
      if (pieces.current.length) raf.current = requestAnimationFrame(loop)
      else g.clearRect(0, 0, W, H)
    }
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [fire])
  return <canvas ref={ref} className="cel-confetti" aria-hidden />
}

export function Celebration({ w }: { w: World }) {
  const mutate = useGame((s) => s.mutate)
  const reduce = useLessMotion()
  const [fire, setFire] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const c = w.competitions[w.flags.celebrate?.compId]
  if (!c) return null
  const club = w.clubs[w.userClubId]
  const kit = club.kit?.[0] || '#1fd67a', kit2 = club.kit?.[1] || '#ffffff'
  const ci = compIdentity(c.key)
  const won = w.flags.celebrate?.date as string | undefined
  // the word on the trophy: a league's champions, a cup's winners, a play-off's promotion
  const kicker = c.format === 'playoff' ? 'Promoted' : c.format === 'league' || c.key === 'UCL' ? 'Champions' : 'Winners'
  const mine = (id: string) => { const f = w.fixtures[id]; return f && (f.home === w.userClubId || f.away === w.userClubId) ? f : undefined }
  // how it was won
  const story = (() => {
    if (c.format === 'league') {
      const t = sortTable(w, c)
      const me = t.find((r) => r.clubId === w.userClubId)
      if (!me) return undefined
      const gap = t[1] ? me.pts - t[1].pts : 0
      // when nobody could catch the club any more (the celebration itself comes when the league ends)
      const left = leagueDecided(w, c, w.userClubId, 0)?.title
      const decider = c.fixtures.map(mine).filter((f) => f?.played && (!won || f.date <= won)).sort((x, y) => y!.date.localeCompare(x!.date))[0]
      return {
        line: `${me.pts} points${gap > 0 ? ` · ${gap} clear of ${w.clubs[t[1].clubId]?.short}` : ''}`,
        line2: left == null ? undefined : left > 0 ? `Sealed with ${left} ${left === 1 ? 'game' : 'games'} to spare` : 'Decided on the final day',
        chips: [`W${me.w} D${me.d} L${me.l}`, `${me.gf} scored`, `${me.ga} conceded`],
        decider,
      }
    }
    const fin = c.rounds[c.rounds.length - 1]
    const f = fin?.fixtures.map((id) => w.fixtures[id]).filter((x) => x?.played && x.result).pop()
    if (!f?.result) return undefined
    const home = f.home === w.userClubId
    const side = home ? 0 : 1
    const opp = w.clubs[home ? f.away : f.home]
    const [a, b] = home ? f.result.score : [f.result.score[1], f.result.score[0]]
    const pens = f.result.pens ? (home ? f.result.pens : [f.result.pens[1], f.result.pens[0]]) : undefined
    // who scored it: the club's goals in the final (an own goal by the other side counts for it)
    const by = new Map<string, string[]>()
    for (const e of f.result.events) {
      if (!(((e.type === 'goal' || e.type === 'penGoal') && e.side === side) || (e.type === 'owngoal' && e.side !== side))) continue
      const p = e.player ? w.players[e.player] : undefined
      if (!p) continue
      const k = e.type === 'owngoal' ? `${callName(p.name)} (o.g.)` : callName(p.name)
      by.set(k, [...(by.get(k) || []), `${e.min}\u2019${e.type === 'penGoal' ? ' pen' : ''}`])
    }
    const scorers = [...by].map(([k, mins]) => `${k} ${mins.join(', ')}`)
    return { line: `Beat ${opp?.short} ${a}–${b}${pens ? ` (${pens[0]}–${pens[1]} pens)` : ''} in the final${f.venue ? ` · ${f.venue}` : ''}`, line2: scorers.length ? scorers.join(' · ') : undefined, chips: [] as string[], decider: f }
  })()
  // who lifts it: the club's captain in the match that won it
  const capId = story?.decider?.result?.captains?.[story.decider.home === w.userClubId ? 0 : 1]
  const captain = capId ? w.players[capId] : undefined
  // which one this is for the manager
  const nth = w.user.trophies.filter((t) => t.compKey === c.key).length
  const tally = w.user.trophies.length === 1 ? 'Your first trophy as a manager' : nth > 1 ? `Your ${ordinalOf(nth)} ${c.short || c.name}` : undefined
  const leave = () => {
    if (leaving) return
    haptic('medium')
    setFire((x) => x + 1)
    setLeaving(true)
    window.setTimeout(() => mutate((x) => { x.flags.celebrate = undefined }), reduce ? 0 : 620)
  }
  return (
    <div className={`cel-wrap ${leaving ? 'out' : ''}`}>
      <div className={`cel${ci ? ' has-ci' : ''}`} style={{ ['--k1' as any]: kit, ['--k2' as any]: kit2, ...(ci ? { ['--ci-rgb' as any]: ci.rgb, ...(ci.mark ? { ['--cel-mark' as any]: `url(${assetHref(`assets/marks/${ci.whole || ci.mark}.svg`)})`, ['--cel-ar' as any]: ci.ar || 1 } : {}) } : {}) }}>
        <div className="cel-bg" aria-hidden>{ci?.mark && <i className="cel-mark" />}<i className="cel-glow" /><i className="cel-beam l" /><i className="cel-beam r" /><i className="cel-motes" /></div>
        <Confetti colors={['#F4C542', '#FFE38A', '#ffffff', kit, kit2, '#F4C542']} fire={fire} reduce={reduce} />
        <div className="cel-body" onClick={() => { haptic(); setFire((x) => x + 1) }}>
          <div className="cel-trophy">
            <span className="cel-ring" />
            <CompLogo k={compLogoKey(c)} size={62} name={c.name} />
          </div>
          <div className="cel-kicker"><Icon name="trophy" size={13} color="#F4C542" />{kicker}<Icon name="trophy" size={13} color="#F4C542" /></div>
          <div className="cel-title">{c.name}</div>
          <div className="cel-club"><Badge club={club} size={22} /><b>{club.name}</b><span className="dim">· {seasonLabel(c.season)}</span></div>
          {story && <div className="cel-story">{story.line}</div>}
          {story?.line2 && <div className="cel-story s2">{story.line2}</div>}
          {story && story.chips.length > 0 && <div className="cel-chips">{story.chips.map((x) => <span key={x}>{x}</span>)}</div>}
          {(captain || tally) && <div className="cel-lift">{captain && <span>Lifted by <b>{captain.name}</b></span>}{captain && tally && <i />}{tally && <span>{tally}</span>}</div>}
        </div>
        <button className="cel-go" onClick={leave} disabled={leaving}>Celebrate & continue</button>
      </div>
    </div>
  )
}
