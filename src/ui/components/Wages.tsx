// Wages explained: what the club pays each week, the room the board allows, what a contract offer does to it, and
// how all of that sits beside the transfer budget. Every number is the club's own.
import { useState } from 'react'
import type { World } from '../../domain/types'
import { fmtMoney } from '../../domain/finance'
import { rosterOf, wageShare } from '../../engine/world/roster'
import { wageBill } from '../../engine/world/userActions'
import { boardReinvest } from '../../engine/world/transfers'
import { Face } from './atoms'
import { Sheet } from './layout'
import { Icon } from '../icons/Icon'
import { callName } from '../../engine/match/commentary'
import { haptic } from '../../store/game'

/** The bill against the budget, with this offer on top (renewal: only the raise counts). */
export function WageImpact({ w, wage, current = 0, bonus = 0, years = 1, share = 100 }: { w: World; wage: number; current?: number; bonus?: number; years?: number; share?: number }) {
  const [open, setOpen] = useState(false)
  const club = w.clubs[w.userClubId]
  const budget = club.finance.wageBudget
  const bill = wageBill(w)
  const added = Math.max(0, Math.round(wage * share / 100) - current)
  const after = bill + added
  const room = budget - after
  const max = Math.max(budget, after) * 1.04
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  return (
    <div className={`wi ${room < 0 ? 'over' : ''}`}>
      <div className="wi-bar" role="img" aria-label={`Wage bill ${fmtMoney(bill)} plus ${fmtMoney(added)} against a budget of ${fmtMoney(budget)} a week`}>
        <i className="wi-bill" style={{ width: pct(Math.min(bill, max)) }} />
        <i className="wi-add" style={{ left: pct(bill), width: pct(added) }} />
        <b style={{ left: pct(budget) }} />
      </div>
      <div className="wi-line tiny">
        <span>Bill {fmtMoney(bill)}{added ? <> <span className="wi-plus">+ {fmtMoney(added)}</span></> : null}</span>
        <span className="dim">Budget {fmtMoney(budget)}/wk</span>
      </div>
      <div className={`wi-verdict small ${room < 0 ? 'neg' : 'pos'}`}>
        {room < 0 ? `${fmtMoney(-room)}/wk over your wage budget: this offer can't be made` : `${fmtMoney(room)}/wk of room left after this offer`}
      </div>
      <div className="tiny dim">
        {current ? `Only the raise counts against your room (he earns ${fmtMoney(current)} now). ` : ''}
        About {fmtMoney(Math.round(wage * share / 100) * 52)} a season{years > 1 ? `, ${fmtMoney(Math.round(wage * share / 100) * 52 * years)} over ${years} years` : ''}, paid weekly from the club's balance.
        {bonus > 0 ? ` The ${fmtMoney(bonus)} bonus is paid once, at signing, from the balance (${fmtMoney(club.finance.balance)}): it doesn't use wage room.` : ''}
      </div>
      <button className="wi-how tiny" onClick={() => { haptic(); setOpen(true) }}><Icon name="info" size={13} /> How wages work</button>
      <WageSheet w={w} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

/** The whole picture: budget, bill, the biggest earners, and how wages and transfer money relate. */
export function WageSheet({ w, open, onClose }: { w: World; open: boolean; onClose: () => void }) {
  const club = w.clubs[w.userClubId]
  const budget = club.finance.wageBudget
  const bill = wageBill(w)
  const room = budget - bill
  const squad = rosterOf(w, club.id)
  const pays = (p: (typeof squad)[number]) => wageShare(p, club.id)
  const top = [...squad].sort((a, b) => pays(b) - pays(a)).slice(0, 5)
  const loanees = squad.filter((p) => p.loan && p.loan.fromClubId !== club.id)
  const obj = w.board.objectives?.find((o) => o.metric === 'wageBudget' && o.status === 'active')
  const reinvest = Math.round(boardReinvest(w) * 100)
  return (
    <Sheet open={open} onClose={onClose} title="Wages">
      <div className="stack" style={{ gap: 14 }}>
        <div className="ws-nums">
          <div><span className="tiny dim">Wage budget</span><b>{fmtMoney(budget)}</b><span className="tiny dim">a week</span></div>
          <div><span className="tiny dim">Wage bill</span><b>{fmtMoney(bill)}</b><span className="tiny dim">{squad.length} players</span></div>
          <div className={room < 0 ? 'neg' : ''}><span className="tiny dim">{room < 0 ? 'Over budget' : 'Room'}</span><b>{fmtMoney(Math.abs(room))}</b><span className="tiny dim">a week</span></div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Biggest earners</div>
          {top.map((p) => (
            <div key={p.id} className="ws-row"><Face p={p} size={26} radius={13} club={club} /><span className="small grow ellipsis">{callName(p.name)}</span><span className="tiny dim">until {p.contract.until}</span><b className="small num">{fmtMoney(pays(p))}</b></div>
          ))}
          {loanees.length > 0 && <div className="tiny dim" style={{ marginTop: 6 }}>Loanees count at the share you pay: {loanees.map((p) => `${callName(p.name)} ${p.loan!.wageSplit ?? 50}%`).join(' · ')}</div>}
        </div>
        <div className="ws-facts">
          <div><Icon name="board" size={15} /><span className="small">The board sets the wage budget each summer, at 8% above what the squad earns then. Room is what is left of it.</span></div>
          <div><Icon name="contract" size={15} /><span className="small">A new contract has to fit in the room. For a renewal only the raise counts.</span></div>
          <div><Icon name="money" size={15} /><span className="small">Wages are paid every week from the club's balance. Fees come from the transfer budget. The two are separate: money not spent on fees can't be moved into wages.</span></div>
          <div><Icon name="transfers" size={15} /><span className="small">Selling a player frees his wage at once, and {reinvest}% of the fee is added to your transfer budget.</span></div>
          <div><Icon name="handshake" size={15} /><span className="small">Signing-on and loyalty bonuses are paid once, from the balance, so a bonus can bring a weekly wage down without using room.</span></div>
          {obj && <div><Icon name="objective" size={15} /><span className="small">The board has set an objective to keep the wage bill within budget ({obj.priority} priority): {room >= 0 ? 'you are within it' : 'you are over it, and it counts against their confidence'}.</span></div>}
        </div>
      </div>
    </Sheet>
  )
}
