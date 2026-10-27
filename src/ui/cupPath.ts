// A club's road through a knockout competition, and the short names of its rounds (R3, QF, SF, F), for the cards that
// show where it stands in a cup: the competition cards in Season and the pager in Central.
import type { Competition, World } from '../domain/types'
import { sortTable } from '../engine/competitions/tables'

export const shortRound = (name: string) => {
  const n = name.toLowerCase()
  if (/semi/.test(n)) return 'SF'
  if (/quarter/.test(n)) return 'QF'
  if (/final/.test(n)) return 'F'
  if (/league phase/.test(n)) return 'LP'
  if (/play-?off/.test(n)) return 'PO'
  const m = n.match(/round of (\d+)/); if (m) return `R${m[1]}`
  const ord = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'].findIndex((x) => n.startsWith(x)); if (ord >= 0) return `R${ord + 1}`
  const d = n.match(/(\d+)/); if (d) return `R${d[1]}`
  return name.split(/\s+/).map((x) => x[0]).join('').toUpperCase().slice(0, 3)
}

/** The user's road through a cup: rounds played (won or lost), the current one and the ones still ahead. */
export function cupPath(w: World, c: Competition): { id: string; name: string; short: string; state: 'won' | 'lost' | 'now' | 'ahead' }[] {
  const me = w.userClubId
  const mine = (id: string) => { const f = w.fixtures[id]; return !!f && (f.home === me || f.away === me) }
  const out: ReturnType<typeof cupPath> = []
  if (c.format === 'uefa' && c.table?.some((r) => r.clubId === me)) {
    const row = c.table.find((r) => r.clubId === me)!
    const pos = sortTable(w, c).findIndex((r) => r.clubId === me) + 1
    const lpDone = row.p >= 8
    out.push({ id: 'lp', name: 'League phase', short: 'LP', state: !lpDone ? 'now' : pos <= 24 ? 'won' : 'lost' })
    if (out[0].state === 'lost') return out
  }
  const first = c.rounds.findIndex((r) => r.fixtures.some(mine) || r.entrants?.includes(me))
  const start = first >= 0 ? first : out.length ? 0 : -1
  if (start < 0) return out
  for (let i = start; i < c.rounds.length; i++) {
    const r = c.rounds[i]
    const played = r.fixtures.filter(mine).map((id) => w.fixtures[id])
    // a drawn round we are not in (a bye, or a play-off round skipped by finishing high enough) is not on our road
    if (r.drawn && !played.length && (r.byes?.includes(me) || c.format === 'uefa' || r.winners?.length)) continue
    const done = played.length > 0 && played.every((f) => f.played) && !!r.winners?.length
    const current = out.some((x) => x.state === 'now')
    const state = done ? (r.winners!.includes(me) ? 'won' : 'lost') : current ? 'ahead' : 'now'
    out.push({ id: r.id, name: r.name, short: shortRound(r.name), state })
    if (state === 'lost') break
  }
  return out
}
