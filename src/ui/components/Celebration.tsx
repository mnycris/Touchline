// A trophy won: the Central screen holds it for a while. Still, lit backdrop in the club's and the trophy's colours,
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

interface Piece { x: number; y: number; vx: number; vy: number; r: number; vr: number; flip: number; vf: number; w: number; h: number; c: string; shape: 0 | 1 | 2; life: number; wait: number }

/** Confetti on a canvas: bursts from two cannons, then pieces flutter down and come to rest out of view. */
function Confetti({ colors, fire, reduce }: { colors: string[]; fire: number; reduce: boolean }) {
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
            w: shape === 1 ? 3 : 6 + Math.random() * 4, h: shape === 1 ? 16 + Math.random() * 10 : 9 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)], shape, life: 0, wait: Math.random() * (big ? 16 : 8),
          })
        }
      }
    }
    burst(fire === 0)
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
        if (p.vy > 1.15) p.vy = 1.15 + (p.vy - 1.15) * 0.8
        p.flip += p.vf * dt
        p.r += p.vr * dt
        p.x += (p.vx + Math.sin(p.flip) * 0.6) * dt
        p.y += p.vy * dt
        const sx = Math.cos(p.flip)
        g.save()
        g.translate(p.x, p.y)
        g.rotate(p.r)
        g.scale(p.shape === 2 ? 1 : sx, 1)
        g.globalAlpha = Math.min(1, 0.4 + Math.abs(sx) * 0.6) * Math.min(1, (H + 30 - p.y) / 40)
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
  const reduce = useGame((s) => s.prefs.reduceMotion)
  const [fire, setFire] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const c = w.competitions[w.flags.celebrate?.compId]
  if (!c) return null
  const club = w.clubs[w.userClubId]
  const kit = club.kit?.[0] || '#1fd67a', kit2 = club.kit?.[1] || '#ffffff'
  // how it was won
  const story = (() => {
    if (c.format === 'league') {
      const t = sortTable(w, c)
      const me = t.find((r) => r.clubId === w.userClubId)
      if (!me) return undefined
      const gap = t[1] ? me.pts - t[1].pts : 0
      return { line: `${me.pts} points${gap > 0 ? ` · ${gap} clear of ${w.clubs[t[1].clubId]?.short}` : ''}`, chips: [`W${me.w} D${me.d} L${me.l}`, `${me.gf} scored`, `${me.ga} conceded`] }
    }
    const fin = c.rounds[c.rounds.length - 1]
    const f = fin?.fixtures.map((id) => w.fixtures[id]).find((x) => x?.played && x.result)
    if (!f?.result) return undefined
    const home = f.home === w.userClubId
    const opp = w.clubs[home ? f.away : f.home]
    const [a, b] = home ? f.result.score : [f.result.score[1], f.result.score[0]]
    const pens = f.result.pens ? (home ? f.result.pens : [f.result.pens[1], f.result.pens[0]]) : undefined
    return { line: `Beat ${opp?.short} ${a}–${b}${pens ? ` (${pens[0]}–${pens[1]} pens)` : ''} in the final${f.venue ? ` · ${f.venue}` : ''}`, chips: [] as string[] }
  })()
  const leave = () => {
    if (leaving) return
    haptic('medium')
    setFire((x) => x + 1)
    setLeaving(true)
    window.setTimeout(() => mutate((x) => { x.flags.celebrate = undefined }), reduce ? 0 : 620)
  }
  return (
    <div className={`cel-wrap ${leaving ? 'out' : ''}`}>
      <div className="cel" style={{ ['--k1' as any]: kit, ['--k2' as any]: kit2 }}>
        <div className="cel-bg" aria-hidden><i className="cel-glow" /><i className="cel-beam l" /><i className="cel-beam r" /><i className="cel-motes" /></div>
        <Confetti colors={['#F4C542', '#FFE38A', '#ffffff', kit, kit2, '#F4C542']} fire={fire} reduce={reduce} />
        <div className="cel-body" onClick={() => { haptic(); setFire((x) => x + 1) }}>
          <div className="cel-trophy">
            <span className="cel-ring" />
            <CompLogo k={compLogoKey(c)} size={62} name={c.name} />
          </div>
          <div className="cel-kicker"><Icon name="trophy" size={13} color="#F4C542" />Champions<Icon name="trophy" size={13} color="#F4C542" /></div>
          <div className="cel-title">{c.name}</div>
          <div className="cel-club"><Badge club={club} size={22} /><b>{club.name}</b><span className="dim">· {seasonLabel(c.season)}</span></div>
          {story && <div className="cel-story">{story.line}</div>}
          {story && story.chips.length > 0 && <div className="cel-chips">{story.chips.map((x) => <span key={x}>{x}</span>)}</div>}
        </div>
        <button className="cel-go" onClick={leave} disabled={leaving}>Celebrate & continue</button>
      </div>
    </div>
  )
}
