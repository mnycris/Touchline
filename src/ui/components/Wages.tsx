// Wages explained: what the squad earns against what the club takes in, what a contract would do to it, and what the
// board makes of it. There is no separate budget to fit inside: any wage can be offered, and the share of the club's
// income the bill takes is what counts (the board's line, then the point it becomes unsustainable).
import { useState } from 'react'
import type { World } from '../../domain/types'
import { fmtMoney } from '../../domain/finance'
import { rosterOf, wageShare } from '../../engine/world/roster'
import { bonusRoom, wageBill } from '../../engine/world/userActions'
import { boardReinvest } from '../../engine/world/transfers'
import { seasonIncome, WAGES_LIMIT, wageLine, wagesToIncome, wageTone } from '../../engine/world/clubFinance'
import { pct } from '../selectors'
import { Face } from './atoms'
import { Sheet } from './layout'
import { Icon } from '../icons/Icon'
import { callName } from '../../engine/match/commentary'
import { haptic } from '../../store/game'

/** The bill as a share of income: the board's line marked, an offer's addition on top. */
export function ShareBar({ now, after, line }: { now: number; after?: number; line: number }) {
  const top = Math.max(after ?? now, line + 0.18, 1) * 1.04
  const x = (v: number) => Math.min(100, (v / top) * 100)
  const add = after != null && after > now ? x(after) - x(now) : 0
  return (
    <div className="wi-bar" role="img" aria-label={`Wages ${pct(now)} of income${add ? `, ${pct(after!)} with this contract` : ''}; the board's line is ${pct(line)}`}>
      <i className="wi-past" style={{ left: `${x(line)}%` }} />
      <i className="wi-bill" style={{ width: `${x(now)}%` }} />
      {add > 0 && <i className="wi-add" style={{ left: `${x(now)}%`, width: `${add}%` }} />}
      <b style={{ left: `${x(line)}%` }} />
    </div>
  )
}

/** The bill at a glance: a week of it, and its share of income against the board's line (the whole picture a tap away). */
export function WageSummary({ w, bill }: { w: World; bill: number }) {
  const [open, setOpen] = useState(false)
  const now = wagesToIncome(w, w.clubs[w.userClubId], bill)
  const line = wageLine(w)
  const tone = wageTone(now, line)
  return (
    <div className="wsum">
      <div className="row between">
        <span className="row tight"><span className="label">Wage bill</span><button type="button" className="tb-info" aria-label="How wages work" onClick={() => { haptic(); setOpen(true) }}><Icon name="info" size={15} /></button></span>
        <b className="num">{fmtMoney(bill)}/wk</b>
      </div>
      <ShareBar now={now} line={line} />
      <div className="row between tiny dim"><span className={tone === 'ok' ? '' : tone}>{pct(now)} of the club's income</span><span>Board's line {pct(line)}</span></div>
      <WageSheet w={w} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

/** What this contract does to the wage bill (a renewal: only the raise), and what it costs over its length. */
export function WageImpact({ w, wage, current = 0, bonus = 0, years = 1, share = 100, offerId }: { w: World; wage: number; current?: number; bonus?: number; years?: number; share?: number; offerId?: string }) {
  const [open, setOpen] = useState(false)
  const club = w.clubs[w.userClubId]
  const bill = wageBill(w)
  const weekly = Math.round(wage * share / 100)
  const added = Math.max(0, weekly - current)
  const now = wagesToIncome(w, club, bill)
  const after = wagesToIncome(w, club, bill + added)
  const line = wageLine(w)
  const tone = wageTone(after, line)
  const room = bonusRoom(w, offerId)
  return (
    <div className={`wi ${tone}`}>
      <div className="wi-head">
        <span className="label">Wage bill</span>
        <span className="small num grow"><b>{pct(now)}</b>{after > now + 0.0005 && <> <Icon name="forward" size={11} /> <b className="wi-plus">{pct(after)}</b></>} <span className="dim">of income</span></span>
        <button type="button" className="tb-info" aria-label="How wages work" onClick={() => { haptic(); setOpen(true) }}><Icon name="info" size={15} /></button>
      </div>
      <ShareBar now={now} after={after} line={line} />
      <div className={`wi-verdict tiny ${tone}`}>{tone === 'ok' ? `Within the board's ${pct(line)}` : tone === 'warn' ? `Past the board's ${pct(line)}: it counts against their confidence` : 'More than the club can sustain: the board would hold back transfer money'}</div>
      <div className="wi-cost tiny dim">
        <span>{fmtMoney(weekly * 52, { short: true })} a season{years > 1 ? ` · ${fmtMoney(weekly * 52 * years, { short: true })} over ${years} years` : ''}{current ? ` · +${fmtMoney(added, { short: true })}/wk on now` : ''}</span>
        {bonus > 0 && <span className={bonus > room ? 'neg' : ''}>{fmtMoney(bonus, { short: true })} signing-on from the transfer budget ({fmtMoney(room, { short: true })} left)</span>}
      </div>
      <WageSheet w={w} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

/** The whole picture: the bill against income, the board's line, the biggest earners, and how the money fits together. */
export function WageSheet({ w, open, onClose }: { w: World; open: boolean; onClose: () => void }) {
  const club = w.clubs[w.userClubId]
  const bill = wageBill(w)
  const income = seasonIncome(w, club)
  const now = wagesToIncome(w, club, bill)
  const line = wageLine(w)
  const tone = wageTone(now, line)
  const squad = rosterOf(w, club.id)
  const pays = (p: (typeof squad)[number]) => wageShare(p, club.id)
  const top = [...squad].sort((a, b) => pays(b) - pays(a)).slice(0, 5)
  const loanees = squad.filter((p) => p.loan && p.loan.fromClubId !== club.id)
  const reinvest = Math.round(boardReinvest(w) * 100)
  return (
    <Sheet open={open} onClose={onClose} title="Wages">
      <div className="stack" style={{ gap: 14 }}>
        <div className="ws-nums">
          <div><span className="tiny dim">Wage bill</span><b>{fmtMoney(bill, { short: true })}</b><span className="tiny dim">a week</span></div>
          <div><span className="tiny dim">Income</span><b>{fmtMoney(income, { short: true })}</b><span className="tiny dim">a season</span></div>
          <div className={tone}><span className="tiny dim">Share</span><b>{pct(now)}</b><span className="tiny dim">board's line {pct(line)}</span></div>
        </div>
        <ShareBar now={now} line={line} />
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Biggest earners</div>
          {top.map((p) => (
            <div key={p.id} className="ws-row"><Face p={p} size={26} radius={13} club={club} /><span className="small grow ellipsis">{callName(p.name)}</span><span className="tiny dim">until {p.contract.until}</span><b className="small num">{fmtMoney(pays(p))}</b></div>
          ))}
          {loanees.length > 0 && <div className="tiny dim" style={{ marginTop: 6 }}>Loanees count at the share you pay: {loanees.map((p) => `${callName(p.name)} ${p.loan!.wageSplit ?? 50}%`).join(' · ')}</div>}
        </div>
        <div className="ws-facts">
          <div><Icon name="contract" size={15} /><span className="small">There is no wage budget: any wage can be offered. Wages are paid every week from the club's balance.</span></div>
          <div><Icon name="board" size={15} /><span className="small">The board judges the bill against what the club earns in a season (broadcasting, commercial, the gate). Within {pct(line)} is their line this season; past {pct(WAGES_LIMIT)} no club can carry for long.</span></div>
          <div><Icon name="objective" size={15} /><span className="small">Past their line, every week counts against the board's confidence, and next summer part of the transfer budget is held back to pay the wages.</span></div>
          <div><Icon name="money" size={15} /><span className="small">Transfer fees, signing-on and loyalty bonuses come from the transfer budget. Selling a player frees his wage at once, and {reinvest}% of the fee is added to the budget.</span></div>
        </div>
      </div>
    </Sheet>
  )
}
