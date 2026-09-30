// The penalty kick the way television shows it: from high behind the taker, the keeper on his line, the net behind
// him. Where the ball goes, which way the keeper dives and how it ends all come from the simulation (PenaltyKick);
// this only choreographs them: run-up, strike, flight, dive, and the net, glove or post that answers.
// Everything is drawn through one camera projection, so the ball shrinks as it flies away and the net bulges back.
import { useEffect, useRef, useState } from 'react'
import type { Club, PenaltyKick, Player } from '../../domain/types'
import { knownFace } from '../../services/assets'
import { hashString } from '../../domain/rng'
import { useGame } from '../../store/game'

// ------------------------------------------------------------------ camera
// World: X metres across (0 = centre of goal, + = right as the taker sees it), h metres up, d metres from the camera.
const F = 1096, HC = 5.3, HZ = -60, CX = 160, VW = 320, VH = 240
const GL = 34 // goal line
const SPOT = GL - 11
const HW = 3.66, GH = 2.44, DEPTH = 2, BH = 1.85 // half goal width, crossbar height, net depth, back-frame height
const BOARDS = 38.5
const proj = (X: number, h: number, d: number) => ({ x: CX + (X * F) / d, y: HZ + (F * (HC - h)) / d, s: F / d })
const gy = (d: number) => HZ + (F * HC) / d // ground line at depth d

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)
const easeOut = (k: number) => 1 - (1 - k) ** 3
const easeIn = (k: number) => k * k
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))

// ------------------------------------------------------------------ colours
function rgb(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return undefined
  const v = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}
/** Mix towards black (k < 0) or white (k > 0). */
function shade(hex: string, k: number) {
  const c = rgb(hex)
  if (!c) return hex
  const t = k < 0 ? 0 : 255, a = Math.abs(k)
  return `rgb(${c.map((x) => Math.round(x + (t - x) * a)).join(',')})`
}
const lum = (hex: string) => { const c = rgb(hex); return c ? (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 : 0.5 }
/** The printing on a shirt: the club's second colour when it reads, otherwise white or ink. */
const printOn = (shirt: string, trim: string) => (Math.abs(lum(shirt) - lum(trim)) > 0.28 ? trim : lum(shirt) > 0.6 ? '#15181d' : '#ffffff')
const GK_KITS = ['#f5d000', '#2dd36f', '#ff8a1f', '#9b5cff', '#16c7e0', '#ff4fa3']
export const gkKit = (c?: Club) => GK_KITS[(c?.id ?? 0) % GK_KITS.length]

// ------------------------------------------------------------------ the crowd
const crowdCache = new Map<string, string>()
/** A stand full of people behind the goal, painted once per pairing: both clubs' colours, tiers, a touch of depth. */
function crowdTexture(c1: string, c2: string, seed: number): string {
  const key = `${c1}${c2}${seed % 7}`
  const hit = crowdCache.get(key)
  if (hit) return hit
  if (typeof document === 'undefined') return ''
  const W = 720, H = 240
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const g = cv.getContext('2d')
  if (!g) return ''
  let r = seed || 1
  const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296 }
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#05070a'); bg.addColorStop(1, '#10151c')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  const tones = [c1, c1, c1, c2, c2, '#d9dde3', '#8b929c', '#3a4048', '#1d2127']
  for (let y = 4; y < H; y += 6.2) {
    const tier = y / H
    for (let x = -4; x < W + 4; x += 4.6 + rnd() * 2.2) {
      const col = tones[Math.floor(rnd() * tones.length)]
      g.globalAlpha = (0.2 + rnd() * 0.45) * (0.45 + tier * 0.55)
      g.fillStyle = col
      const rr = 1.6 + rnd() * 1.1 + tier * 0.5
      g.beginPath(); g.ellipse(x, y + rnd() * 2.4, rr, rr * 1.15, 0, 0, Math.PI * 2); g.fill()
    }
    if (Math.floor(y / 6.2) % 9 === 8) { g.globalAlpha = 0.5; g.fillStyle = '#05070a'; g.fillRect(0, y + 2, W, 2.2) }
  }
  g.globalAlpha = 1
  const top = g.createLinearGradient(0, 0, 0, H * 0.5)
  top.addColorStop(0, 'rgba(0,0,0,.75)'); top.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = top; g.fillRect(0, 0, W, H * 0.5)
  const url = cv.toDataURL('image/png')
  crowdCache.set(key, url)
  return url
}

// ------------------------------------------------------------------ figures
// Poses are joint positions relative to the pelvis in units of the player's height (y down).
// head neck shL shR elL elR haL haR hipL hipR knL knR ftL ftR
type Pose = number[]
const J = { head: 0, neck: 1, shL: 2, shR: 3, elL: 4, elR: 5, haL: 6, haR: 7, hipL: 8, hipR: 9, knL: 10, knR: 11, ftL: 12, ftR: 13 }
const P = (...xy: number[]): Pose => xy
const mirror = (p: Pose): Pose => {
  const o = [...p]
  const put = (i: number, j: number) => { o[i * 2] = -p[j * 2]; o[i * 2 + 1] = p[j * 2 + 1] }
  put(0, 0); put(1, 1)
  for (let i = 2; i < 14; i += 2) { put(i, i + 1); put(i + 1, i) }
  return o
}
const mix = (a: Pose, b: Pose, k: number): Pose => a.map((v, i) => v + (b[i] - v) * k)

// the taker, from behind (a right-footer; left-footers are mirrored)
const T_STAND = P(0, -0.39, 0, -0.31, -0.125, -0.28, 0.125, -0.28, -0.15, -0.12, 0.15, -0.12, -0.16, 0.02, 0.16, 0.02, -0.07, 0, 0.07, 0, -0.08, 0.26, 0.08, 0.26, -0.085, 0.51, 0.085, 0.51)
const T_RUN = P(0.01, -0.37, 0.01, -0.29, -0.12, -0.26, 0.13, -0.27, -0.17, -0.14, 0.17, -0.1, -0.1, -0.08, 0.21, 0.03, -0.07, 0, 0.07, 0, -0.09, 0.26, 0.06, 0.2, -0.12, 0.29, 0.055, 0.46)
const T_RUN2 = mirror(T_RUN)
const T_PLANT = P(-0.04, -0.36, -0.035, -0.28, -0.17, -0.24, 0.08, -0.29, -0.27, -0.2, 0.15, -0.12, -0.37, -0.19, 0.19, 0, -0.07, 0.01, 0.07, -0.01, -0.03, 0.25, 0.11, 0.23, 0.02, 0.5, 0.16, 0.19)
const T_STRIKE = P(-0.05, -0.36, -0.045, -0.28, -0.18, -0.23, 0.07, -0.29, -0.29, -0.19, 0.12, -0.13, -0.39, -0.16, 0.11, -0.02, -0.07, 0.01, 0.07, -0.01, -0.03, 0.25, 0.13, 0.24, 0.02, 0.5, 0.19, 0.49)
const T_FOLLOW = P(-0.03, -0.38, -0.03, -0.3, -0.16, -0.26, 0.09, -0.29, -0.28, -0.21, 0.12, -0.16, -0.36, -0.25, 0.06, -0.07, -0.07, 0, 0.07, -0.02, -0.03, 0.25, 0.1, 0.1, 0.02, 0.5, 0.06, -0.05)
const T_JOY = P(0, -0.4, 0, -0.32, -0.125, -0.29, 0.125, -0.29, -0.2, -0.45, 0.2, -0.45, -0.26, -0.6, 0.26, -0.6, -0.07, 0, 0.07, 0, -0.1, 0.26, 0.1, 0.26, -0.12, 0.51, 0.12, 0.51)
const T_WOE = P(0, -0.36, 0, -0.3, -0.125, -0.28, 0.125, -0.28, -0.22, -0.4, 0.22, -0.4, -0.06, -0.45, 0.06, -0.45, -0.07, 0, 0.07, 0, -0.08, 0.26, 0.08, 0.26, -0.09, 0.51, 0.09, 0.51)
// the keeper, facing us
const K_READY = P(0, -0.37, 0, -0.3, -0.13, -0.28, 0.13, -0.28, -0.23, -0.15, 0.23, -0.15, -0.29, -0.05, 0.29, -0.05, -0.075, 0, 0.075, 0, -0.16, 0.22, 0.16, 0.22, -0.14, 0.44, 0.14, 0.44)
const K_LOAD = P(0, -0.33, 0, -0.26, -0.13, -0.24, 0.13, -0.24, -0.24, -0.1, 0.24, -0.1, -0.3, 0.0, 0.3, 0.0, -0.075, 0, 0.075, 0, -0.18, 0.2, 0.18, 0.2, -0.16, 0.4, 0.16, 0.4)
const K_DIVE = P(0, -0.36, 0, -0.29, -0.12, -0.27, 0.12, -0.27, -0.1, -0.45, 0.1, -0.45, -0.06, -0.61, 0.06, -0.61, -0.07, 0, 0.07, 0, -0.06, 0.24, 0.11, 0.2, -0.05, 0.47, 0.16, 0.4)
const K_CATCH = P(0, -0.38, 0, -0.31, -0.13, -0.29, 0.13, -0.29, -0.17, -0.12, 0.17, -0.12, -0.05, -0.19, 0.05, -0.19, -0.075, 0, 0.075, 0, -0.09, 0.24, 0.09, 0.24, -0.11, 0.47, 0.11, 0.47)
const K_STAR = P(0, -0.39, 0, -0.32, -0.13, -0.3, 0.13, -0.3, -0.25, -0.4, 0.25, -0.4, -0.34, -0.52, 0.34, -0.52, -0.075, 0, 0.075, 0, -0.13, 0.23, 0.13, 0.23, -0.19, 0.45, 0.19, 0.45)
const HAND_REACH = 0.62 // pelvis to gloves at full stretch, in heights

interface Kit { shirt: string; shorts: string; thigh: string; socks: string; hand: string; print: string; trim: string; boot: string }
interface FigureProps { pose: Pose; x: number; y: number; H: number; rot?: number; kit: Kit; back?: boolean; legBehind?: 'L' | 'R'; name?: string; number?: number; face?: string; uid: string; gloves?: boolean }

/** A player drawn as a posed 2D figure: kit colours, shaded, outlined, with name and number on the back. */
function Figure({ pose, x, y, H, rot = 0, kit, back, legBehind, name, number, face, uid, gloves }: FigureProps) {
  const c = Math.cos(rot), s = Math.sin(rot)
  const pt = (j: number) => { const lx = pose[j * 2] * H, ly = pose[j * 2 + 1] * H; return [x + c * lx - s * ly, y + s * lx + c * ly] as [number, number] }
  const p = Object.fromEntries(Object.entries(J).map(([k, j]) => [k, pt(j)])) as Record<keyof typeof J, [number, number]>
  // a touch broader through the shoulders than the joints: reads as an athlete, not a mannequin
  const wide = (a: [number, number], b: [number, number], k: number): [number, number] => [a[0] + (a[0] - b[0]) * k, a[1] + (a[1] - b[1]) * k]
  p.shL = wide(p.shL, p.shR, 0.06); p.shR = wide(p.shR, p.shL, 0.06)
  const ol = 'rgba(8,10,14,.55)'
  const limb = (a: [number, number], b: [number, number], w: number, col: string, key: string) => [
    <path key={key + 'o'} d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke={ol} strokeWidth={w + H * 0.016} strokeLinecap="round" />,
    <path key={key} d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke={col} strokeWidth={w} strokeLinecap="round" />,
  ]
  const leg = (side: 'L' | 'R') => {
    const hip = side === 'L' ? p.hipL : p.hipR, kn = side === 'L' ? p.knL : p.knR, ft = side === 'L' ? p.ftL : p.ftR
    const ang = Math.atan2(ft[1] - kn[1], ft[0] - kn[0])
    return [
      ...limb(hip, kn, H * 0.092, kit.thigh, `th${side}`),
      ...limb(kn, ft, H * 0.068, kit.socks, `sh${side}`),
      <path key={`sb${side}`} d={`M${lerp(kn[0], ft[0], 0.12)} ${lerp(kn[1], ft[1], 0.12)}L${lerp(kn[0], ft[0], 0.22)} ${lerp(kn[1], ft[1], 0.22)}`} stroke={kit.trim} strokeWidth={H * 0.07} strokeOpacity=".7" />,
      <path key={`sd${side}`} d={`M${lerp(kn[0], ft[0], 0.3)} ${lerp(kn[1], ft[1], 0.3)}L${lerp(kn[0], ft[0], 0.9)} ${lerp(kn[1], ft[1], 0.9)}`} stroke="#000" strokeOpacity=".16" strokeWidth={H * 0.022} strokeLinecap="round" transform={`translate(${H * 0.018} 0)`} />,
      <ellipse key={`bt${side}`} cx={ft[0] + Math.cos(ang) * H * 0.02} cy={ft[1] + Math.sin(ang) * H * 0.02} rx={H * 0.05} ry={H * 0.03} transform={`rotate(${(ang * 180) / Math.PI - 90} ${ft[0]} ${ft[1]})`} fill="#101317" stroke={ol} strokeWidth={H * 0.008} />,
      <ellipse key={`bf${side}`} cx={ft[0] + Math.cos(ang) * H * 0.028} cy={ft[1] + Math.sin(ang) * H * 0.028} rx={H * 0.028} ry={H * 0.011} transform={`rotate(${(ang * 180) / Math.PI - 90} ${ft[0]} ${ft[1]})`} fill={kit.boot} opacity=".9" />,
    ]
  }
  const arm = (side: 'L' | 'R') => {
    const sh = side === 'L' ? p.shL : p.shR, el = side === 'L' ? p.elL : p.elR, ha = side === 'L' ? p.haL : p.haR
    return [
      ...limb(sh, el, H * 0.066, kit.shirt, `ua${side}`),
      ...limb(el, ha, H * 0.056, shade(kit.shirt, -0.1), `fa${side}`),
      <path key={`cf${side}`} d={`M${lerp(el[0], ha[0], 0.78)} ${lerp(el[1], ha[1], 0.78)}L${lerp(el[0], ha[0], 0.9)} ${lerp(el[1], ha[1], 0.9)}`} stroke={kit.trim} strokeWidth={H * 0.058} strokeOpacity=".8" />,
      <circle key={`hd${side}`} cx={ha[0]} cy={ha[1]} r={H * (gloves ? 0.05 : 0.03)} fill={kit.hand} stroke={ol} strokeWidth={H * 0.01} />,
    ]
  }
  // torso and shorts
  const out = (a: [number, number], b: [number, number], k: number): [number, number] => [a[0] + (a[0] - b[0]) * k, a[1] + (a[1] - b[1]) * k]
  const hL = out(p.hipL, p.hipR, 0.22), hR = out(p.hipR, p.hipL, 0.22)
  const mSh: [number, number] = [(p.shL[0] + p.shR[0]) / 2, (p.shL[1] + p.shR[1]) / 2]
  const top: [number, number] = [lerp(mSh[0], p.neck[0], 0.5), lerp(mSh[1], p.neck[1], 0.5)]
  const torso = `M${p.shL[0]} ${p.shL[1]}Q${top[0]} ${top[1] - H * 0.02} ${p.shR[0]} ${p.shR[1]}L${hR[0]} ${hR[1]}L${hL[0]} ${hL[1]}Z`
  const tL: [number, number] = [lerp(p.hipL[0], p.knL[0], 0.5), lerp(p.hipL[1], p.knL[1], 0.5)], tR: [number, number] = [lerp(p.hipR[0], p.knR[0], 0.5), lerp(p.hipR[1], p.knR[1], 0.5)]
  const shorts = `M${hL[0]} ${hL[1] - H * 0.03}L${hR[0]} ${hR[1] - H * 0.03}L${tR[0] + (tR[0] - tL[0]) * 0.22} ${tR[1]}L${lerp(tL[0], tR[0], 0.5)} ${lerp(hL[1], tR[1], 0.55)}L${tL[0] - (tR[0] - tL[0]) * 0.22} ${tL[1]}Z`
  const ang = (Math.atan2(p.shR[1] - p.shL[1], p.shR[0] - p.shL[0]) * 180) / Math.PI
  const mid: [number, number] = [lerp(mSh[0], (hL[0] + hR[0]) / 2, 0.42), lerp(mSh[1], (hL[1] + hR[1]) / 2, 0.42)]
  const hr = H * 0.078
  const legs = legBehind ? [leg(legBehind), leg(legBehind === 'L' ? 'R' : 'L')] : [leg('L'), leg('R')]
  return (
    <g>
      {legBehind && legs[0]}
      <path d={shorts} fill={kit.shorts} stroke={ol} strokeWidth={H * 0.014} strokeLinejoin="round" />
      <path d={shorts} fill={`url(#${uid}shade)`} />
      {legBehind ? legs[1] : legs}
      <path d={torso} fill={kit.shirt} stroke={ol} strokeWidth={H * 0.016} strokeLinejoin="round" />
      <path d={torso} fill={`url(#${uid}shade)`} />
      {back && (
        <g transform={`rotate(${ang} ${mid[0]} ${mid[1]})`} fill={kit.print} style={{ fontFamily: 'var(--display)', fontWeight: 800 }} textAnchor="middle">
          {name && <text x={mid[0]} y={mid[1] - H * 0.085} fontSize={H * (name.length > 9 ? 0.036 : 0.044)} letterSpacing={H * 0.004}>{name}</text>}
          {number != null && <text x={mid[0]} y={mid[1] + H * 0.075} fontSize={H * 0.15}>{number}</text>}
        </g>
      )}
      <path d={`M${lerp(p.neck[0], p.shL[0], 0.4)} ${lerp(p.neck[1], p.shL[1], 0.4)}Q${p.neck[0]} ${p.neck[1] + H * (back ? 0.012 : 0.05)} ${lerp(p.neck[0], p.shR[0], 0.4)} ${lerp(p.neck[1], p.shR[1], 0.4)}`} fill="none" stroke={kit.trim} strokeWidth={H * 0.018} strokeLinecap="round" />
      {arm('L')}{arm('R')}
      {back ? (
        <g transform={`rotate(${ang * 0.6} ${p.head[0]} ${p.head[1]})`}>
          <path d={`M${p.neck[0] - hr * 0.5} ${p.neck[1] + H * 0.01}L${p.head[0] - hr * 0.45} ${p.head[1]}L${p.head[0] + hr * 0.45} ${p.head[1]}L${p.neck[0] + hr * 0.5} ${p.neck[1] + H * 0.01}Z`} fill="#15110f" />
          <ellipse cx={p.head[0]} cy={p.head[1]} rx={hr * 0.9} ry={hr * 1.06} fill="#211a16" stroke={ol} strokeWidth={H * 0.012} />
          <path d={`M${p.head[0] - hr * 0.8} ${p.head[1] - hr * 0.2}Q${p.head[0] - hr * 0.5} ${p.head[1] - hr * 1.02} ${p.head[0] + hr * 0.3} ${p.head[1] - hr * 0.95}`} fill="none" stroke="rgba(255,255,255,.2)" strokeWidth={hr * 0.28} strokeLinecap="round" />
          <path d={`M${p.head[0] - hr * 0.55} ${p.head[1] + hr * 0.72}Q${p.head[0]} ${p.head[1] + hr * 1.02} ${p.head[0] + hr * 0.55} ${p.head[1] + hr * 0.72}`} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth={hr * 0.2} />
        </g>
      ) : (
        <g>
          <clipPath id={`${uid}hc`}><circle cx={p.head[0]} cy={p.head[1]} r={hr} /></clipPath>
          <circle cx={p.head[0]} cy={p.head[1]} r={hr + H * 0.01} fill={ol} />
          <circle cx={p.head[0]} cy={p.head[1]} r={hr} fill="#8793a3" />
          {face && <image href={face} x={p.head[0] - hr * 1.55} y={p.head[1] - hr * 1.2} width={hr * 3.1} height={hr * 3.1} clipPath={`url(#${uid}hc)`} preserveAspectRatio="xMidYMin slice" transform={`rotate(${(rot * 180) / Math.PI} ${p.head[0]} ${p.head[1]})`} />}
        </g>
      )}
    </g>
  )
}

// ------------------------------------------------------------------ the kick
const TARGET: Record<PenaltyKick['spot'], [number, number]> = { BL: [-0.72, 0.13], BR: [0.72, 0.13], TL: [-0.74, 0.8], TR: [0.74, 0.8], C: [0.04, 0.44] }

interface Plan {
  right: boolean // right-footed (runs in from the left)
  tx: number; th: number // where the ball crosses the goal line (m)
  side: -1 | 0 | 1 // keeper's dive
  hand?: [number, number] // where his gloves end up at full stretch (m, on the goal plane)
  hit: 'net' | 'glove' | 'catch' | 'post' | 'bar' | 'wide' | 'over'
  fl: number // flight time
}

function plan(pen: PenaltyKick, foot: string | undefined, seed: number): Plan {
  const j = ((seed % 1000) / 1000 - 0.5) * 0.12, j2 = (((seed >> 10) % 1000) / 1000 - 0.5) * 0.1
  const [u, v] = TARGET[pen.spot]
  const ls = pen.spot === 'C' ? 0 : pen.spot.endsWith('L') ? -1 : 1
  const high = pen.spot.startsWith('T')
  const side = (pen.dive === 'L' ? -1 : pen.dive === 'R' ? 1 : 0) as -1 | 0 | 1
  let tx = (u + j) * HW, th = Math.max(0.12, (v + j2) * GH)
  let hit: Plan['hit'] = 'net', hand: [number, number] | undefined
  if (pen.res === 'post') {
    if (high) { hit = 'bar'; tx = ls * (2.2 + j * 4); th = GH - 0.05 }
    else { hit = 'post'; tx = (ls || 1) * (HW - 0.1); th = 0.55 + j2 * 3 }
  } else if (pen.res === 'miss') {
    if (high && Math.abs(j) < 0.035) { hit = 'over'; tx = ls * 2.3; th = GH + 0.55 }
    else { hit = 'wide'; tx = (ls || (j < 0 ? -1 : 1)) * (HW + 0.55 + Math.abs(j) * 3); th = high ? 1.5 : 0.45 }
  } else if (pen.res === 'saved') {
    if (side === 0) { hit = 'catch'; tx = 0.05; th = 1.2 }
    else { hit = 'glove'; if (Math.sign(tx) !== side) tx = side * Math.abs(tx); hand = [tx, th] }
  }
  // no save: the keeper dives anyway, short of it or the wrong way
  if (!hand && side !== 0) {
    const same = pen.spot !== 'C' && Math.sign(tx) === side && hit === 'net'
    hand = same ? [tx - side * 0.62, Math.min(GH - 0.2, th * 0.8 + 0.12)] : [side * 2.65, high && Math.sign(tx) === side ? 1.55 : 0.55]
  }
  return { right: foot !== 'L', tx, th, side, hand, hit, fl: high || hit === 'over' || hit === 'bar' ? 0.44 : pen.spot === 'C' ? 0.5 : 0.4 }
}

/** Ball height after a drop/rebound from `h0` with upward speed `v0`, bouncing (m). */
function bounce(h0: number, v0: number, t: number, rest = 0.42) {
  const g = 9.8
  let h = h0, v = v0, tt = t
  for (let i = 0; i < 6; i++) {
    const land = (v + Math.sqrt(v * v + 2 * g * Math.max(0, h - 0.11))) / g // time to reach the ground
    if (tt < land) return h + v * tt - 0.5 * g * tt * tt
    tt -= land; h = 0.11; v = (g * land - v) * rest
    if (v < 0.4) return 0.11
  }
  return 0.11
}

// timeline (s)
const RUN = 0.5, PLANT = 1.46, HIT = 1.62

export function PenaltyScene({ pen, taker, keeper, takerClub, keeperClub, eventId, onPhase, at }: { pen: PenaltyKick; taker?: Player; keeper?: Player; takerClub?: Club; keeperClub?: Club; eventId: number; onPhase?: (p: 'flight' | 'result') => void; /** freeze at this time (s), for stills */ at?: number }) {
  const seed = useRef(hashString(`${eventId}:${pen.taker}:${pen.spot}`)).current
  const pl = useRef(plan(pen, taker?.foot, seed)).current
  const uid = `pk${eventId}`
  const TA = HIT + pl.fl
  const END = TA + 2.4
  const reduce = useGame((s) => s.prefs.reduceMotion)
  const [tt, setT] = useState(reduce ? END : 0)
  const t = at ?? tt
  const phased = useRef<string>('')
  useEffect(() => {
    if (reduce || at != null) return
    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      const x = Math.min(END, (now - t0) / 1000)
      setT(x)
      if (x < END) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  useEffect(() => {
    const ph = t >= TA + 0.08 ? 'result' : t >= HIT ? 'flight' : ''
    if (ph && ph !== phased.current) { phased.current = ph; onPhase?.(ph as 'flight' | 'result') }
  }, [t])

  const c1 = takerClub?.kit?.[0] || '#1fd67a', c1b = takerClub?.kit?.[1] || '#ffffff'
  const c2 = keeperClub?.kit?.[0] || '#445066'
  const gk = gkKit(keeperClub)
  const tKit: Kit = { shirt: c1, shorts: c1b, thigh: shade(c1b, -0.22), socks: c1, hand: shade(c1, 0.25), print: printOn(c1, c1b), trim: c1b, boot: '#e9edf2' }
  if (lum(c1) > 0.85 && lum(c1b) > 0.85) tKit.shorts = '#1d2330'
  const kKit: Kit = { shirt: gk, shorts: shade(gk, -0.55), thigh: shade(gk, -0.62), socks: shade(gk, -0.15), hand: '#f2f5f8', print: '#111', trim: shade(gk, 0.35), boot: gk }

  // ---------------------------------------------------------------- the ball
  const ball = (() => {
    if (t < HIT) return { X: 0, h: 0.11, d: SPOT, spin: 0 }
    if (t < TA) {
      const k = (t - HIT) / pl.fl, e = 1 - (1 - k) ** 1.25
      const arc = (pl.hit === 'over' ? 0.7 : pl.th > 1.4 ? 0.28 : 0.16) * 4 * k * (1 - k)
      return { X: lerp(0, pl.tx, e), h: lerp(0.11, pl.th, e) + arc, d: lerp(SPOT, GL, e), spin: k * 900 }
    }
    const a = t - TA
    switch (pl.hit) {
      case 'net': {
        const k = easeOut(clamp01(a / 0.16))
        const back = GL + (DEPTH - 0.25) * k
        const h = a < 0.16 ? lerp(pl.th, pl.th * 0.92, k) : bounce(pl.th * 0.92, -0.4, a - 0.16, 0.25)
        return { X: pl.tx * lerp(1, 0.97, k), h, d: back + Math.max(0, netAmp(a)) * 0.8, spin: 900 + a * 200 * (1 - k) }
      }
      case 'glove': {
        const k = easeOut(clamp01(a / 0.95))
        return { X: pl.tx + pl.side * 1.25 * k, h: bounce(pl.th, pl.th > 1.4 ? 1.3 : 1.0, a), d: GL - 0.3 - 4.8 * k, spin: 900 - a * 700 }
      }
      case 'catch': return { X: 0.05, h: 1.2 - Math.min(0.08, a * 0.4), d: GL - 0.55, spin: 900 }
      case 'post': case 'bar': {
        const k = easeOut(clamp01(a / 1.1))
        return { X: pl.tx - Math.sign(pl.tx) * 1.3 * k, h: bounce(pl.th, pl.hit === 'bar' ? -0.8 : 0.7, a), d: GL - 0.15 - 8.5 * k, spin: 900 - a * 900 }
      }
      case 'wide': {
        const k = clamp01(a / 0.2)
        const d = lerp(GL, BOARDS - 0.25, easeOut(k))
        return { X: pl.tx * lerp(1, 1.1, k), h: a < 0.2 ? lerp(pl.th, pl.th * 0.85, k) : bounce(pl.th * 0.85, 0, a - 0.2, 0.3), d: a < 0.2 ? d : BOARDS - 0.4 - Math.min(0.6, (a - 0.2) * 0.8), spin: 900 + a * 300 }
      }
      default: { // over the bar, into the crowd
        const k = clamp01(a / 0.5)
        return { X: pl.tx * lerp(1, 1.25, k), h: lerp(pl.th, pl.th + 2.2, easeOut(k)), d: lerp(GL, 46, easeOut(k)), spin: 900 + a * 400, fade: k }
      }
    }
  })()
  function netAmp(a: number) { return pl.hit === 'net' && a > 0.13 ? 1.5 * Math.exp(-(a - 0.13) / 0.26) * Math.cos((a - 0.13) * 14) : pl.hit === 'net' && a > 0.06 ? 1.5 * ((a - 0.06) / 0.07) : 0 }
  function gauss(X: number, h: number) { const dx = X - pl.tx, dh = h - pl.th * 0.92; return Math.exp(-(dx * dx + dh * dh) / (2 * 0.62 * 0.62)) }
  const amp = t >= TA ? netAmp(t - TA) : 0
  const netD = (X: number, h: number, d: number) => d + (d > GL + 0.5 ? amp * gauss(X, h) : amp * gauss(X, h) * ((d - GL) / DEPTH))

  // ---------------------------------------------------------------- the keeper
  const sKG = F / (GL - 0.2)
  const KH = 1.9 * sKG
  const ground = gy(GL - 0.2)
  const keeperState = (() => {
    const baseX = CX
    const readyY = ground - 0.44 * KH
    const tDive = TA - 0.44
    const sway = t < tDive ? Math.sin(t * 5.4) * 0.1 * sKG * seg(t, 0, 0.4) : 0
    if (pl.side === 0) {
      // stands his ground: a small spring, then either the catch or a star jump as it flies past
      const k = seg(t, TA - 0.28, TA - 0.02)
      if (pl.hit === 'catch') {
        const pose = mix(K_READY, K_CATCH, easeOut(k))
        return { pose, x: baseX, y: readyY - 0.03 * KH * easeOut(k) + (t > TA ? Math.min(2, (t - TA) * 8) : 0), rot: 0 }
      }
      const jump = Math.sin(Math.PI * clamp01(k * 1.1)) * 0.1 * KH
      return { pose: mix(K_READY, K_STAR, Math.sin(Math.PI * clamp01(k * 0.9)) ** 0.6), x: baseX + sway, y: readyY - jump, rot: 0 }
    }
    if (t < tDive) {
      const load = seg(t, tDive - 0.12, tDive)
      return { pose: mix(K_READY, K_LOAD, load), x: baseX + sway + pl.side * load * 0.05 * sKG, y: readyY + load * 0.04 * KH + Math.abs(Math.sin(t * 5.4)) * -0.012 * KH, rot: 0 }
    }
    // the dive: gloves reach `hand` exactly as the ball arrives
    const [hx, hh] = pl.hand!
    const hp = proj(hx, hh, GL - 0.2)
    const high = hh > 1.3
    const th = pl.side * ((high ? 50 : hh > 0.8 ? 64 : 80) * Math.PI) / 180
    let ex = hp.x - Math.sin(th) * HAND_REACH * KH, ey = hp.y + Math.cos(th) * HAND_REACH * KH
    ey = Math.min(ey, ground - 0.1 * KH)
    const k = seg(t, tDive, TA), e = easeOut(k)
    if (t <= TA) {
      const arc = Math.sin(Math.PI * k) * (high ? 0.1 : 0.05) * KH
      return { pose: mix(K_LOAD, K_DIVE, Math.min(1, e * 1.3)), x: lerp(baseX, ex, e), y: lerp(readyY + 0.04 * KH, ey, e) - arc, rot: lerp(0, th, e) }
    }
    // down he comes
    const f = easeIn(seg(t, TA, TA + 0.42))
    const lieY = ground - 0.1 * KH
    return { pose: K_DIVE, x: ex + pl.side * 0.3 * sKG * f, y: lerp(ey, lieY, f), rot: lerp(th, pl.side * (Math.PI / 2) * 1.04, f) }
  })()

  // ---------------------------------------------------------------- the taker
  const takerState = (() => {
    const dir = pl.right ? 1 : -1
    const S = { X: -2.3 * dir, d: SPOT - 2.8 }, Q = { X: -0.34 * dir, d: SPOT - 0.2 }
    const ru = seg(t, RUN, PLANT)
    const e = easeInOut(ru) * 0.85 + ru * 0.15
    let X = lerp(S.X, Q.X, e), d = lerp(S.d, Q.d, e)
    let pose: Pose, bob = 0, legBehind: 'L' | 'R' | undefined
    const m = (p: Pose) => (pl.right ? p : mirror(p))
    if (t < RUN) pose = m(T_STAND)
    else if (t < PLANT) {
      const ph = ru * 4.5 * Math.PI
      pose = mix(m(T_RUN), m(T_RUN2), (Math.sin(ph) + 1) / 2)
      pose = mix(m(T_STAND), pose, clamp01(ru * 6))
      pose = mix(pose, m(T_PLANT), seg(ru, 0.82, 1))
      bob = Math.abs(Math.cos(ph)) * 0.022 * (1 - seg(ru, 0.82, 1))
    } else if (t < HIT) pose = mix(m(T_PLANT), m(T_STRIKE), easeIn(seg(t, PLANT, HIT)))
    else if (t < HIT + 0.3) { pose = mix(m(T_STRIKE), m(T_FOLLOW), easeOut(seg(t, HIT, HIT + 0.22))); legBehind = seg(t, HIT, HIT + 0.22) > 0.35 ? (pl.right ? 'R' : 'L') : undefined; d += 0.2 * seg(t, HIT, HIT + 0.3) }
    else {
      d += 0.2
      const r = seg(t, TA + 0.32, TA + 0.75)
      const goal = pl.hit === 'net'
      const settle = mix(m(T_FOLLOW), m(T_STAND), easeOut(seg(t, HIT + 0.3, HIT + 0.6)))
      pose = mix(settle, goal ? T_JOY : T_WOE, easeOut(r))
      legBehind = seg(t, HIT + 0.3, HIT + 0.5) < 0.5 ? (pl.right ? 'R' : 'L') : undefined
      if (goal) { bob = Math.max(0, Math.sin((t - TA - 0.5) * 9)) * 0.06 * r; X += dir * -0.9 * easeInOut(seg(t, TA + 0.6, END)) }
      else d -= 0.4 * easeOut(seg(t, TA + 0.4, TA + 1.2))
    }
    const sT = F / d, H = 1.8 * sT
    const pel = proj(X, 0.52 * 1.8 + bob * 1.8, d)
    return { pose, x: pel.x, y: pel.y, H, legBehind, fx: proj(X, 0, d), s: sT }
  })()

  // ---------------------------------------------------------------- camera
  const push = easeInOut(seg(t, 0, HIT + 0.2)) * 0.06 + easeOut(seg(t, TA, TA + 0.6)) * 0.02
  const shake = (pl.hit === 'post' || pl.hit === 'bar') && t > TA ? Math.exp(-(t - TA) / 0.16) * Math.sin((t - TA) * 70) * 1.4 : 0
  const cam = `translate(${CX} 76) scale(${1 + push}) translate(${-CX + shake} ${-76})`
  const postWob = (pl.hit === 'post' || pl.hit === 'bar') && t > TA ? Math.exp(-(t - TA) / 0.2) * Math.sin((t - TA) * 90) * 1.1 : 0

  // ---------------------------------------------------------------- net geometry
  const netLine = (pts: [number, number, number][]) => pts.map(([X, h, d], i) => { const q = proj(X, h, netD(X, h, d)); return `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}` }).join('')
  const lines: string[] = []
  const backD = GL + DEPTH
  const topAt = (d: number) => lerp(GH, BH, (d - GL) / DEPTH)
  for (let i = 0; i <= 16; i++) { const X = -HW + (i / 16) * 2 * HW; lines.push(netLine(Array.from({ length: 9 }, (_, k) => [X, (k / 8) * BH, backD]))) }
  for (let j = 1; j <= 7; j++) { const h = (j / 7) * BH; lines.push(netLine(Array.from({ length: 13 }, (_, k) => [-HW + (k / 12) * 2 * HW, h, backD]))) }
  for (const sx of [-1, 1]) {
    for (let i = 1; i <= 3; i++) { const d = GL + (i / 4) * DEPTH; lines.push(netLine(Array.from({ length: 6 }, (_, k) => [sx * HW, (k / 5) * topAt(d), d]))) }
    for (let j = 1; j <= 5; j++) { const h = (j / 6) * GH; lines.push(netLine(Array.from({ length: 6 }, (_, k) => { const d = GL + (k / 5) * DEPTH; return [sx * HW, Math.min(h, topAt(d)), d] as [number, number, number] }))) }
  }
  for (let i = 0; i <= 8; i++) { const X = -HW + (i / 8) * 2 * HW; lines.push(netLine(Array.from({ length: 5 }, (_, k) => { const d = GL + (k / 4) * DEPTH; return [X, topAt(d), d] as [number, number, number] }))) }
  const q = (X: number, h: number, d: number) => { const r = proj(X, h, d); return `${r.x.toFixed(1)} ${r.y.toFixed(1)}` }
  const backFill = `M${q(-HW, 0, backD)}L${q(-HW, BH, backD)}L${q(HW, BH, backD)}L${q(HW, 0, backD)}Z`
  const g0 = proj(-HW, 0, GL), g1 = proj(HW, GH, GL)
  const postW = 0.12 * g0.s

  // ---------------------------------------------------------------- the ball, drawn
  const B = proj(ball.X, ball.h, ball.d)
  const Bs = proj(ball.X, 0, Math.min(ball.d, GL + DEPTH - 0.1))
  const br = 0.11 * B.s
  const trail = t > HIT && t < TA + 0.05 ? [0.03, 0.06].map((dt) => { const k = clamp01((t - dt - HIT) / pl.fl), e = 1 - (1 - k) ** 1.25; return proj(lerp(0, pl.tx, e), lerp(0.11, pl.th, e), lerp(SPOT, GL, e)) }) : []
  const ballEl = (
    <g opacity={1 - ((ball as { fade?: number }).fade || 0)}>
      {trail.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={br * (0.85 - i * 0.2)} fill="#fff" opacity={0.18 - i * 0.07} />)}
      <circle cx={B.x} cy={B.y} r={br} fill={`url(#${uid}ball)`} stroke="rgba(0,0,0,.45)" strokeWidth={br * 0.12} />
      <g transform={`rotate(${ball.spin} ${B.x} ${B.y})`} fill="#1a1d22" opacity=".85">
        <circle cx={B.x} cy={B.y - br * 0.05} r={br * 0.3} />
        <circle cx={B.x + br * 0.62} cy={B.y + br * 0.42} r={br * 0.22} />
        <circle cx={B.x - br * 0.64} cy={B.y + br * 0.38} r={br * 0.22} />
      </g>
    </g>
  )
  const ballShadow = <ellipse cx={Bs.x} cy={Bs.y} rx={br * 1.15} ry={br * 0.38} fill="#000" opacity={Math.max(0, 0.42 - (ball.h - 0.11) * 0.12)} />
  const ballBehind = ball.d > GL + 0.05

  // ---------------------------------------------------------------- stadium
  const flashes = useRef(Array.from({ length: 30 }, (_, i) => { const r = hashString(`${seed}f${i}`); const late = i >= 14; return { x: (r % 3200) / 10, y: 4 + ((r >> 12) % 540) / 10, at: late ? TA + 0.15 + (((r >> 5) % 1000) / 1000) * 1.6 : RUN + (((r >> 5) % 1000) / 1000) * 2.4, late } })).current
  const lineY = (d: number) => gy(d)
  const stripes = [BOARDS, GL, GL - 5.5, SPOT, SPOT - 5.5, SPOT - 11]
  const kFace = keeper ? knownFace(keeper.id) : undefined
  const crowd = useRef(crowdTexture(c1, c2, seed)).current
  const surname = taker ? taker.name.split(/\s+/).pop()!.toUpperCase() : ''

  return (
    <svg className="pk-svg" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`${uid}shade`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".16" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".3" /></linearGradient>
        <radialGradient id={`${uid}ball`} cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#fff" /><stop offset=".7" stopColor="#e3e8ee" /><stop offset="1" stopColor="#9aa3ae" /></radialGradient>
        <radialGradient id={`${uid}glare`}><stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${uid}stand`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#06080b" /><stop offset="1" stopColor="#121820" /></linearGradient>
        <linearGradient id={`${uid}grass`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#123a22" /><stop offset="1" stopColor="#1d5532" /></linearGradient>
        <radialGradient id={`${uid}light`} cx=".5" cy=".42" r=".6"><stop offset="0" stopColor="#fff" stopOpacity=".1" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${uid}vig`} cx=".5" cy=".5" r=".75"><stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" /></radialGradient>
        <linearGradient id={`${uid}board`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={shade(c1, -0.55)} /><stop offset=".5" stopColor="#0b0f15" /><stop offset="1" stopColor={shade(c2, -0.55)} /></linearGradient>
      </defs>
      <g transform={cam}>
        {/* stands, flashes, boards */}
        <rect x="-20" y="-20" width={VW + 40} height={lineY(BOARDS) - 4} fill={`url(#${uid}stand)`} />
        {crowd && <image href={crowd} x="-20" y="-20" width={VW + 40} height={proj(0, 0.9, BOARDS).y + 21} preserveAspectRatio="none" />}
        <ellipse cx="18" cy="-6" rx="70" ry="26" fill={`url(#${uid}glare)`} /><ellipse cx={VW - 18} cy="-6" rx="70" ry="26" fill={`url(#${uid}glare)`} />
        {flashes.map((f, i) => { if (f.late && pl.hit !== 'net') return null; const o = Math.max(0, 1 - Math.abs(t - f.at) / 0.07); return o > 0 ? <circle key={i} cx={f.x} cy={f.y} r={1 + o * 1.2} fill="#fff" opacity={o * 0.9} /> : null })}
        <rect x="-20" y={proj(0, 0.95, BOARDS).y} width={VW + 40} height={lineY(BOARDS) - proj(0, 0.95, BOARDS).y} fill={`url(#${uid}board)`} />
        <g opacity=".5" fill="#fff" style={{ fontFamily: 'var(--display)', fontWeight: 800 }} fontSize="10" letterSpacing="2.2">
          {[-1, 0, 1, 2, 3].map((i) => <text key={i} x={i * 110 + ((t * 18) % 110)} y={lineY(BOARDS) - 7.5}>TOUCHLINE</text>)}
        </g>
        <path d={`M-20 ${proj(0, 0.95, BOARDS).y}H${VW + 20}`} stroke="rgba(255,255,255,.18)" strokeWidth=".8" />
        {/* grass: mown stripes in perspective, the goal line, the six-yard line, the spot */}
        <rect x="-20" y={lineY(BOARDS)} width={VW + 40} height={VH} fill={`url(#${uid}grass)`} />
        {stripes.slice(0, -1).map((d, i) => i % 2 === 0 ? <rect key={d} x="-20" y={lineY(d)} width={VW + 40} height={lineY(stripes[i + 1]) - lineY(d)} fill="#fff" opacity=".035" /> : null)}
        <path d={`M-20 ${lineY(GL)}H${VW + 20}M-20 ${lineY(GL - 5.5)}H${VW + 20}`} stroke="rgba(255,255,255,.62)" strokeWidth=".9" />
        <ellipse cx={CX} cy={lineY(SPOT)} rx={0.12 * (F / SPOT)} ry={0.12 * (F / SPOT) * (HC / SPOT)} fill="rgba(255,255,255,.75)" />
        <rect x="-20" y={lineY(BOARDS)} width={VW + 40} height={VH} fill={`url(#${uid}light)`} />
        {/* the net behind the keeper */}
        <path d={backFill} fill="rgba(0,0,0,.28)" />
        <g stroke="rgba(255,255,255,.26)" strokeWidth=".55" fill="none">{lines.map((d, i) => <path key={i} d={d} />)}</g>
        <path d={`M${q(-HW, BH, backD)}L${q(-HW, 0, backD)}M${q(HW, BH, backD)}L${q(HW, 0, backD)}M${q(-HW, GH, GL)}L${q(-HW, BH, backD)}L${q(HW, BH, backD)}L${q(HW, GH, GL)}`} stroke="rgba(220,226,234,.5)" strokeWidth="1" fill="none" />
        {ballBehind && ballShadow}
        {ballBehind && ballEl}
        {/* the frame */}
        <g transform={`translate(${pl.hit === 'post' ? postWob * Math.sign(pl.tx) : 0} ${pl.hit === 'bar' ? postWob : 0})`}>
          <path d={`M${g0.x} ${g0.y}V${g1.y}H${g1.x}V${g0.y}`} fill="none" stroke="rgba(0,0,0,.4)" strokeWidth={postW + 1.4} strokeLinejoin="round" />
          <path d={`M${g0.x} ${g0.y}V${g1.y}H${g1.x}V${g0.y}`} fill="none" stroke="#f4f6f8" strokeWidth={postW} strokeLinejoin="round" />
          <path d={`M${g0.x - postW * 0.2} ${g0.y}V${g1.y - postW * 0.2}H${g1.x - postW * 0.2}`} fill="none" stroke="#fff" strokeWidth={postW * 0.3} opacity=".7" />
        </g>
        {/* the keeper */}
        <ellipse cx={keeperState.x} cy={ground} rx={KH * (0.2 + Math.abs(Math.sin(keeperState.rot)) * 0.22)} ry={KH * 0.04} fill="#000" opacity={0.35 - Math.max(0, ground - 0.1 * KH - keeperState.y) / KH * 0.25} />
        <Figure pose={keeperState.pose} x={keeperState.x} y={keeperState.y} H={KH} rot={keeperState.rot} kit={kKit} face={kFace} uid={`${uid}k`} gloves />
        {!ballBehind && ballShadow}
        {!ballBehind && ballEl}
        {/* the taker */}
        <ellipse cx={takerState.fx.x} cy={takerState.fx.y} rx={takerState.H * 0.2} ry={takerState.H * 0.045} fill="#000" opacity=".38" />
        <Figure pose={takerState.pose} x={takerState.x} y={takerState.y} H={takerState.H} kit={tKit} back legBehind={takerState.legBehind} name={surname} number={taker?.jersey} uid={`${uid}t`} />
      </g>
      <rect width={VW} height={VH} fill={`url(#${uid}vig)`} pointerEvents="none" />
    </svg>
  )
}
