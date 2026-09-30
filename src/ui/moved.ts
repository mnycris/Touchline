import type { Fixture } from '../domain/types'
import { fmtDate } from '../domain/dates'

/** How a moved fixture is described: a short tag and the full explanation. */
export function movedText(f: Fixture): { tag: string; long: string } | undefined {
  const m = f.moved
  if (!m) return undefined
  if (m.source === 'calendar') {
    const tag = m.kind === 'early' ? 'Brought forward' : 'Postponed'
    return { tag, long: `${tag}: ${m.reason}.` }
  }
  const tag = m.kind === 'early' ? 'Brought forward' : 'Rescheduled'
  return { tag, long: `${tag} from ${fmtDate(m.from, 'long')}: ${m.reason}.` }
}
