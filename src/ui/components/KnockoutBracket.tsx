// Knockout brackets the traditional way: the last rounds as a connected tree (Round of 16 → Final), each tie showing
// both legs, the aggregate, extra time and penalties, who went through and where the winner goes next. Cups drawn
// afresh every round only connect what the draw has decided; fixed brackets (UEFA from the last 16, tournaments,
// any semi-final to its final) show the path ahead. Earlier rounds sit below as lists.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Competition, Fixture, Round, World } from '../../domain/types'
import { Badge, Empty } from './atoms'
import { Sheet } from './layout'
import { Icon } from '../icons/Icon'
import { fmtDate } from '../../domain/dates'
import { tieWinner } from '../../engine/competitions/cups'
import { FixtureRow } from '../screens/Match'
import { haptic, useGame } from '../../store/game'

interface TieV {
  key: string
  legs: Fixture[]
  a?: number
  b?: number
  winner?: number
  agg?: [number, number]
  pens?: [number, number]
  et?: boolean
  state: 'draw' | 'scheduled' | 'half' | 'done'
  date?: string
  time?: string
  /** indices of the ties in the previous column that feed this one */
  feed: [number | undefined, number | undefined]
  /** undecided slot: the clubs that could still fill it, or which tie's winner it waits for */
  maybeA?: number[]
  maybeB?: number[]
  waitA?: string
  waitB?: string
}
interface ColV { name: string; date?: string; date2?: string; ties: TieV[]; drawn: boolean; current: boolean; final: boolean }

const KO_NAMES: Record<number, string> = { 1: 'Final', 2: 'Semi-finals', 4: 'Quarter-finals', 8: 'Round of 16', 16: 'Round of 32' }

function tieOf(w: World, fx: Fixture[]): TieV {
  const legs = [...fx].sort((x, y) => (x.leg || 0) - (y.leg || 0))
  const a = legs[0].home, b = legs[0].away
  const played = legs.filter((f) => f.played && f.result)
  const g = (club: number) => played.reduce((s, f) => s + (f.home === club ? f.result!.score[0] : f.result!.score[1]), 0)
  const last = legs[legs.length - 1]
  const lp = last.played ? last.result?.pens : undefined
  const winner = played.length === legs.length ? tieWinner(w, [...legs]) : undefined
  const next = legs.find((f) => !f.played) || last
  return {
    key: legs[0].tieId || legs[0].id, legs, a, b, winner,
    agg: played.length ? [g(a), g(b)] : undefined,
    pens: lp ? (last.home === a ? [lp[0], lp[1]] : [lp[1], lp[0]]) : undefined,
    et: !!(last.played && last.result && (last.result as { et?: unknown }).et != null),
    state: !played.length ? 'scheduled' : played.length < legs.length ? 'half' : 'done',
    date: next.date, time: next.time, feed: [undefined, undefined],
  }
}

function tiesOf(w: World, r: Round): TieV[] {
  const map = new Map<string, Fixture[]>()
  for (const id of r.fixtures) { const f = w.fixtures[id]; if (!f) continue; const k = f.tieId || f.id; const arr = map.get(k) || []; arr.push(f); map.set(k, arr) }
  return [...map.values()].map((fx) => tieOf(w, fx))
}
const has = (t: TieV, club?: number) => club != null && (t.a === club || t.b === club)
const pool = (t?: TieV) => (t ? (t.winner != null ? [t.winner] : t.a != null ? [t.a, t.b!].filter((x) => x != null) : [...(t.maybeA || []), ...(t.maybeB || [])]) : [])

/** The connected part of the knockouts plus the rounds before it. */
function build(w: World, c: Competition) {
  const real = c.rounds
  const future = c.format === 'intl' && c.intl?.koDates ? Math.max(0, c.intl.koDates.length - real.length) : 0
  const N = real.length + future
  const ties = real.map((r) => (r.drawn ? tiesOf(w, r) : []))
  // the tree: up to the last four rounds, each with half the ties of the one before
  let start = Math.max(0, N - 4)
  for (let i = start; i < real.length; i++) {
    const want = 2 ** (N - 1 - i)
    if (real[i].drawn && ties[i].length !== want) start = i + 1
  }
  const fixedInto = (j: number) => c.format === 'uefa' || c.format === 'intl' || j === N - 1 // is round j paired from round j-1 in order?
  const cols: ColV[] = []
  for (let i = start; i < N; i++) {
    const r = real[i]
    const n = 2 ** (N - 1 - i)
    const date = r?.date ?? c.intl?.koDates?.[i]
    cols.push({ name: r?.name ? plural(r.name, n) : KO_NAMES[n] || `Round of ${n * 2}`, date, date2: r?.date2, ties: r?.drawn ? ties[i] : [], drawn: !!r?.drawn, current: false, final: i === N - 1 })
  }
  // order drawn columns backwards from the latest drawn one, so every tie sits next to the two it came from
  const lastDrawn = cols.map((x) => x.drawn).lastIndexOf(true)
  for (let j = lastDrawn - 1; j >= 0; j--) {
    const prev = cols[j].ties, used = new Set<number>(), order: TieV[] = []
    for (const t of cols[j + 1].ties) {
      const fa = prev.findIndex((p, k) => !used.has(k) && has(p, t.a)), fb = prev.findIndex((p, k) => !used.has(k) && k !== fa && has(p, t.b))
      for (const k of [fa, fb]) if (k >= 0) { used.add(k); order.push(prev[k]) }
    }
    prev.forEach((p, k) => { if (!used.has(k)) order.push(p) })
    cols[j].ties = order
  }
  // feeders for drawn columns
  for (let j = 1; j <= lastDrawn; j++) for (const t of cols[j].ties) {
    const prev = cols[j - 1].ties
    const ia = prev.findIndex((p) => has(p, t.a)), ib = prev.findIndex((p) => has(p, t.b))
    t.feed = [ia >= 0 ? ia : undefined, ib >= 0 ? ib : undefined]
  }
  // the rounds still to come: fixed brackets pair neighbours, open draws are empty slots
  for (let j = Math.max(0, lastDrawn + 1); j < cols.length; j++) {
    const n = 2 ** (cols.length - 1 - j)
    const prev = j > 0 ? cols[j - 1].ties : []
    const fixed = j > 0 && fixedInto(start + j) && prev.length === n * 2
    cols[j].ties = Array.from({ length: n }, (_, i) => {
      const fa = fixed ? prev[2 * i] : undefined, fb = fixed ? prev[2 * i + 1] : undefined
      const wa = fa?.winner, wb = fb?.winner
      const one = singular(cols[j - 1]?.name || '')
      const pa = wa == null ? pool(fa) : undefined, pb = wb == null ? pool(fb) : undefined
      return {
        key: `${j}-${i}`, legs: [], a: wa, b: wb, state: 'draw', feed: fixed ? [2 * i, 2 * i + 1] : [undefined, undefined],
        maybeA: pa && pa.length <= 2 ? pa : undefined, maybeB: pb && pb.length <= 2 ? pb : undefined,
        waitA: fixed && pa && pa.length > 2 ? `${one} ${2 * i + 1} winner` : undefined, waitB: fixed && pb && pb.length > 2 ? `${one} ${2 * i + 2} winner` : undefined,
      } as TieV
    })
  }
  // "now" is a drawn round still being played: nothing is current while the league phase or groups go on
  const cur = cols.findIndex((x) => x.drawn && x.ties.some((t) => t.state !== 'done'))
  if (cur >= 0) cols[cur].current = true
  const earlier = real.slice(0, start).map((r, i) => ({ r, ties: ties[i] })).filter((x) => x.r.drawn)
  const champion = cols.length && cols[cols.length - 1].ties[0]?.winner
  return { cols, earlier, champion, start }
}
const plural = (name: string, n: number) => (n > 1 && /-final$/i.test(name) ? `${name}s` : name)
const singular = (name: string) => name.replace(/-finals$/i, '-final').replace(/^Round of (\d+)$/, 'Last-$1 tie')

// ---------------------------------------------------------------- geometry
const COL_W = 154, GAP = 30, TIE_H = 70, SLOT = 82, HEAD = 46, PAD = 16

export function Bracket({ w, c }: { w: World; c: Competition }) {
  const { cols, earlier, champion } = useMemo(() => build(w, c), [w, c, c.rounds.length, c.fixtures.length, w.flags.fxRev, w.date])
  const [open, setOpen] = useState<{ t: TieV; col: number } | undefined>()
  const scroller = useRef<HTMLDivElement>(null)
  const ci = cols.findIndex((x) => x.current)
  // all played: the semi-finals, the final and the winners; nothing drawn yet: the start of the bracket
  const cur = ci >= 0 ? ci : cols.some((x) => x.drawn) ? cols.length - 1 : 0
  useLayoutEffect(() => {
    const el = scroller.current
    // the round just played and the current one side by side
    if (el) el.scrollLeft = Math.max(0, (cur - 1) * (COL_W + GAP))
  }, [cur, cols.length])
  if (!c.rounds.length && c.intl?.koDates?.length) return <Empty icon="bracket" title="Knockouts to come" text={`The draw follows the group stage; the knockouts start on ${fmtDate(c.intl.koDates[0], 'long')}.`} />
  if (!c.rounds.length) return <Empty icon="bracket" title="No knockout rounds" />
  const n0 = Math.max(1, cols[0]?.ties.length || 1)
  const cy = (j: number, i: number) => HEAD + SLOT * 2 ** j * (i + 0.5)
  const cx = (j: number) => PAD + j * (COL_W + GAP)
  const width = PAD * 2 + cols.length * COL_W + (cols.length - 1) * GAP + (champion != null ? GAP + 104 : 0)
  const height = HEAD + n0 * SLOT + 6
  const me = w.userClubId
  const treeDrawn = cols.some((x) => x.drawn)
  const earlierList = earlier.length > 0 && <EarlierRounds w={w} list={earlier} onOpen={(t) => setOpen({ t, col: -1 })} />
  return (
    <div className="bk" style={{ marginTop: 12 }}>
      {!treeDrawn && earlierList}
      {!treeDrawn && <div className="label" style={{ padding: '14px 16px 0' }}>Road to the final</div>}
      <div className="bk-scroll" ref={scroller}>
        <div className="bk-canvas" style={{ width, height }}>
          <svg className="bk-lines" width={width} height={height} aria-hidden>
            {cols.map((col, j) => j > 0 && col.ties.map((t, i) => t.feed.map((f, s) => {
              if (f == null) return null
              const from = cols[j - 1].ties[f]
              const y1 = cy(j - 1, f), y2 = cy(j, i), x1 = cx(j - 1) + COL_W, x2 = cx(j), xm = x1 + GAP / 2
              const went = from?.winner != null && (s === 0 ? t.a : t.b) === from.winner
              const mine = went && from.winner === me
              return <path key={`${j}-${i}-${s}`} d={`M${x1} ${y1}H${xm}V${y2}H${x2}`} className={`bk-line ${went ? 'went' : ''} ${mine ? 'mine' : ''}`} style={{ ['--d' as any]: `${j * 90 + i * 20}ms` }} />
            })))}
            {cols.map((col, j) => j < cols.length - 1 && !cols[j + 1].ties.some((t) => t.feed[0] != null) && col.ties.map((_, i) => <path key={`s${j}-${i}`} d={`M${cx(j) + COL_W} ${cy(j, i)}h${GAP / 2 - 4}`} className="bk-line stub" />))}
            {champion != null && <path d={`M${cx(cols.length - 1) + COL_W} ${cy(cols.length - 1, 0)}H${cx(cols.length - 1) + COL_W + GAP}`} className={`bk-line went ${champion === me ? 'mine' : ''}`} />}
          </svg>
          {cols.map((col, j) => (
            <div key={j} className={`bk-head ${col.current ? 'cur' : ''}`} style={{ left: cx(j), width: COL_W }}>
              <span className="b ellipsis">{col.name}</span>
              <span className="tiny dim">{col.date ? `${fmtDate(col.date, 'dm')}${col.date2 ? ` & ${fmtDate(col.date2, 'dm')}` : ''}` : ''}{col.current && <i className="bk-now">Now</i>}</span>
            </div>
          ))}
          {cols.map((col, j) => col.ties.map((t, i) => (
            <TieCard key={t.key} w={w} t={t} me={me} style={{ left: cx(j), top: cy(j, i) - TIE_H / 2, width: COL_W, height: TIE_H, ['--d' as any]: `${j * 90 + i * 30}ms` }}
              drawDate={!col.drawn ? col.date : undefined} onOpen={t.legs.length ? () => { haptic(); setOpen({ t, col: j }) } : undefined} />
          )))}
          {champion != null && (
            <div className={`bk-champ ${champion === me ? 'mine' : ''}`} style={{ left: cx(cols.length - 1) + COL_W + GAP, top: cy(cols.length - 1, 0) - 52 }}>
              <Icon name="trophy" size={18} color="var(--gold)" />
              <Badge club={w.clubs[champion]} size={40} />
              <b className="small ellipsis">{w.clubs[champion]?.short}</b>
              <span className="tiny dim">Winners</span>
            </div>
          )}
        </div>
      </div>
      {treeDrawn && earlierList}
      {open && <TieSheet w={w} c={c} cols={cols} at={open} onClose={() => setOpen(undefined)} />}
    </div>
  )
}

function Side({ w, club, maybe, wait, score, win, lose, pens, me }: { w: World; club?: number; maybe?: number[]; wait?: string; score?: number; win: boolean; lose: boolean; pens?: number; me: number }) {
  if (club == null) {
    const m = (maybe || []).slice(0, 2)
    return (
      <div className="bk-row tbd">
        <span className="bk-maybe">{m.length ? m.map((id) => <Badge key={id} club={w.clubs[id]} size={13} />) : <i />}</span>
        <span className="grow ellipsis tiny dim">{m.length === 2 ? `${w.clubs[m[0]]?.short} / ${w.clubs[m[1]]?.short}` : wait || 'To be decided'}</span>
      </div>
    )
  }
  return (
    <div className={`bk-row ${win ? 'win' : ''} ${lose ? 'lose' : ''} ${club === me ? 'me' : ''}`}>
      <Badge club={w.clubs[club]} size={17} />
      <span className="grow ellipsis small">{w.clubs[club]?.short}</span>
      {pens != null && <span className="bk-pens">({pens})</span>}
      {score != null && <b className="num">{score}</b>}
      {win && <Icon name="forward" size={11} color="var(--acc)" />}
    </div>
  )
}

function TieCard({ w, t, me, style, onOpen, drawDate }: { w: World; t: TieV; me: number; style: React.CSSProperties; onOpen?: () => void; drawDate?: string }) {
  const done = t.state === 'done'
  const legs = t.legs.length
  const meta = (() => {
    if (t.state === 'draw') return t.feed[0] != null ? (drawDate ? `${fmtDate(drawDate, 'day')} ${fmtDate(drawDate, 'dm')}` : 'To come') : 'Draw to come'
    if (t.state === 'scheduled') return `${fmtDate(t.date!, 'day')} ${fmtDate(t.date!, 'dm')} · ${t.time}`
    if (t.state === 'half') { const l1 = t.legs[0].result!.score; return `1st leg ${l1[0]}–${l1[1]} · 2nd ${fmtDate(t.date!, 'dm')}` }
    if (legs === 2) { const [l1, l2] = t.legs.map((f) => f.result!.score); return `${l1[0]}–${l1[1]}, ${l2[1]}–${l2[0]}${t.pens ? ' · pens' : t.et ? ' · aet' : ''}` }
    return t.pens ? 'Penalties' : t.et ? 'After extra time' : 'Full-time'
  })()
  const mine = has(t, me)
  return (
    <button className={`bk-tie ${mine ? 'mine' : ''} ${done ? 'done' : ''} ${t.state}`} style={style} onClick={onOpen} disabled={!onOpen}>
      <Side w={w} club={t.a} maybe={t.maybeA} wait={t.waitA} score={t.agg?.[0]} pens={t.pens?.[0]} win={t.winner != null && t.winner === t.a} lose={t.winner != null && t.winner !== t.a} me={me} />
      <Side w={w} club={t.b} maybe={t.maybeB} wait={t.waitB} score={t.agg?.[1]} pens={t.pens?.[1]} win={t.winner != null && t.winner === t.b} lose={t.winner != null && t.winner !== t.b} me={me} />
      <div className="bk-meta tiny">{legs === 2 && t.state !== 'scheduled' && t.state !== 'draw' && <span className="bk-agg">{t.state === 'done' ? 'Agg' : 'Leg 1'}</span>}<span className="ellipsis">{meta}</span></div>
    </button>
  )
}

/** One tie: both legs, the aggregate, who went through and who they meet next. */
function TieSheet({ w, c, cols, at, onClose }: { w: World; c: Competition; cols: ColV[]; at: { t: TieV; col: number }; onClose: () => void }) {
  const go = useGame((s) => s.go)
  const { t, col } = at
  const A = t.a != null ? w.clubs[t.a] : undefined, B = t.b != null ? w.clubs[t.b] : undefined
  const round = t.legs[0]?.roundName
  const final = col >= 0 && cols[col].final
  // where the winner goes
  const next = (() => {
    if (col < 0 || final) return undefined
    const nc = cols[col + 1]
    const i = cols[col].ties.indexOf(t)
    const nt = nc?.ties.find((x) => x.feed.includes(i)) || (t.winner != null ? nc?.ties.find((x) => has(x, t.winner)) : undefined)
    if (!nt) return { text: `${nc?.name || 'Next round'}${nc?.date ? ` · draw before ${fmtDate(nc.date, 'dm')}` : ''}` }
    const otherIdx = nt.feed[0] === i ? nt.feed[1] : nt.feed[0]
    const other = nt.a != null && nt.a !== t.winner && !has(t, nt.a) ? nt.a : nt.b != null && nt.b !== t.winner && !has(t, nt.b) ? nt.b : undefined
    const otherTie = otherIdx != null ? cols[col].ties[otherIdx] : undefined
    const vs = other != null ? w.clubs[other]?.short : otherTie && otherTie.a != null ? `${w.clubs[otherTie.a]?.short} or ${w.clubs[otherTie.b!]?.short}` : 'to be decided'
    return { text: `${nc.name} v ${vs}${nc.date ? ` · ${fmtDate(nc.date, 'dm')}` : ''}` }
  })()
  const verdict = t.winner != null ? `${w.clubs[t.winner]?.short} ${final ? `win the ${c.short}` : 'go through'}${t.pens ? ' on penalties' : t.et ? ' after extra time' : t.legs.length === 2 ? ' on aggregate' : ''}` : t.state === 'half' ? 'Second leg to come' : undefined
  return (
    <Sheet open onClose={onClose} title={<span>{c.short} · {round}</span>}>
      <div className="md-teams">
        <button className="md-team" onClick={() => { if (A) { onClose(); go({ name: 'club', params: { id: A.id } }) } }}><Badge club={A} size={52} /><b>{A?.short}</b></button>
        <div className="col center" style={{ minWidth: 96 }}>
          {t.agg ? <div className="display" style={{ fontSize: 30 }}>{t.agg[0]}–{t.agg[1]}</div> : <div className="display" style={{ fontSize: 22 }}>{t.time}</div>}
          <div className="tiny dim">{t.agg ? (t.legs.length === 2 ? (t.state === 'done' ? 'Aggregate' : 'After the 1st leg') : t.pens ? `${t.pens[0]}–${t.pens[1]} on penalties` : t.et ? 'After extra time' : 'Full-time') : t.date ? fmtDate(t.date, 'long') : ''}</div>
          {t.pens && t.legs.length === 2 && <div className="tiny dim">{t.pens[0]}–{t.pens[1]} on penalties</div>}
        </div>
        <button className="md-team" onClick={() => { if (B) { onClose(); go({ name: 'club', params: { id: B.id } }) } }}><Badge club={B} size={52} /><b>{B?.short}</b></button>
      </div>
      {verdict && <div className={`bk-verdict ${t.winner === w.userClubId ? 'good' : t.winner != null && has(t, w.userClubId) ? 'bad' : ''}`}>{t.winner != null && <Icon name={final ? 'trophy' : 'check'} size={15} color={final ? 'var(--gold)' : 'var(--acc)'} />}<span>{verdict}</span></div>}
      <div className="card list" style={{ marginTop: 12 }}>
        {t.legs.map((f) => <div key={f.id}>{t.legs.length === 2 && <div className="tiny dim bk-leg">{f.leg === 1 ? '1st leg' : '2nd leg'}</div>}<FixtureRow w={w} f={f} clubId={has(t, w.userClubId) ? w.userClubId : undefined} /></div>)}
      </div>
      {next && <div className="bk-next"><Icon name="bracket" size={15} color="var(--t2)" /><span className="small"><span className="dim">Winner: </span>{next.text}</span></div>}
    </Sheet>
  )
}

/** Rounds before the bracket: pick a round, see every tie with its aggregate. */
function EarlierRounds({ w, list, onOpen }: { w: World; list: { r: Round; ties: TieV[] }[]; onOpen: (t: TieV) => void }) {
  const rounds = [...list].reverse() // latest first
  const [sel, setSel] = useState(0)
  const cur = rounds[Math.min(sel, rounds.length - 1)]
  const me = w.userClubId
  const ties = [...cur.ties].sort((x, y) => Number(has(y, me)) - Number(has(x, me)))
  return (
    <div className="bk-earlier">
      <div className="label" style={{ padding: '0 16px' }}>Earlier rounds</div>
      <div className="chips bk-chips">{rounds.map((x, i) => <button key={x.r.id} className={`chip ${i === sel ? 'on' : ''}`} onClick={() => { haptic(); setSel(i) }}>{x.r.name}</button>)}</div>
      <div className="card list" style={{ margin: '0 16px' }} key={cur.r.id}>
        {ties.map((t) => (
          <button key={t.key} className={`li tap bk-line-row ${has(t, me) ? 'mine' : ''}`} onClick={() => { haptic(); onOpen(t) }}>
            <span className={`grow ellipsis small ${t.winner === t.a ? 'b' : t.winner != null ? 'dim' : ''}`} style={{ textAlign: 'right' }}>{w.clubs[t.a!]?.short}</span>
            <Badge club={w.clubs[t.a!]} size={20} />
            <span className="score-pill sm">{t.agg ? `${t.agg[0]}–${t.agg[1]}` : t.time}</span>
            <Badge club={w.clubs[t.b!]} size={20} />
            <span className={`grow ellipsis small ${t.winner === t.b ? 'b' : t.winner != null ? 'dim' : ''}`}>{w.clubs[t.b!]?.short}</span>
            <span className="tiny dim bk-note">{t.pens ? `${t.pens[0]}–${t.pens[1]}p` : t.legs.length === 2 && t.state === 'done' ? 'agg' : t.et ? 'aet' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
