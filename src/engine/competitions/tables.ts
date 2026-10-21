import type { Competition, Fixture, StandingRow, World } from '../../domain/types'

export function emptyRow(clubId: number, group?: string): StandingRow {
  return { clubId, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [], group }
}

const H2H_COUNTRIES = new Set(['Spain', 'Italy', 'Türkiye', 'Portugal'])

export function applyResultToTable(comp: Competition, f: Fixture) {
  if (!comp.table || !f.result) return
  const [hs, as] = f.result.score
  const h = comp.table.find((r) => r.clubId === f.home)
  const a = comp.table.find((r) => r.clubId === f.away)
  if (!h || !a) return
  h.p++; a.p++
  h.gf += hs; h.ga += as; a.gf += as; a.ga += hs
  if (hs > as) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L') }
  else if (hs < as) { a.w++; h.l++; a.pts += 3; a.form.push('W'); h.form.push('L') }
  else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D') }
  if (h.form.length > 5) h.form.shift()
  if (a.form.length > 5) a.form.shift()
}

export function sortTable(w: World, comp: Competition, rows = comp.table || []): StandingRow[] {
  const h2h = H2H_COUNTRIES.has(comp.country) && comp.format === 'league'
  const pts = (r: StandingRow) => r.pts - (r.ded || 0)
  const sorted = [...rows].sort((a, b) => {
    if (pts(b) !== pts(a)) return pts(b) - pts(a)
    if (h2h) {
      const hd = headToHead(w, comp, a.clubId, b.clubId)
      if (hd !== 0) return -hd
    }
    const gd = b.gf - b.ga - (a.gf - a.ga)
    if (gd !== 0) return gd
    if (b.gf !== a.gf) return b.gf - a.gf
    if (b.w !== a.w) return b.w - a.w
    return (w.clubs[a.clubId]?.name || '').localeCompare(w.clubs[b.clubId]?.name || '')
  })
  return sorted
}

/** Positive if club a beats b on head-to-head record in this competition. */
function headToHead(w: World, comp: Competition, a: number, b: number): number {
  let pa = 0, pb = 0, ga = 0, gb = 0
  for (const id of comp.fixtures) {
    const f = w.fixtures[id]
    if (!f?.played || !f.result) continue
    if (!((f.home === a && f.away === b) || (f.home === b && f.away === a))) continue
    const [hs, as] = f.result.score
    const sa = f.home === a ? hs : as, sb = f.home === a ? as : hs
    ga += sa; gb += sb
    if (sa > sb) pa += 3; else if (sa < sb) pb += 3; else { pa++; pb++ }
  }
  if (pa !== pb) return pa - pb
  return ga - gb
}

const matchdayOf = (roundName: string) => { const m = roundName.match(/(?:Matchday|MD)\s*(\d+)\s*$/i); return m ? Number(m[1]) : undefined }

/**
 * Where each club stood before the latest matchday, to show who moved: the table with that matchday's results taken
 * back out. Undefined when there is nothing honest to compare with: no matchday before it yet (the start of a
 * season), or a table without matchdays. A postponed game from an earlier matchday counts as already in the table.
 */
export function previousPositions(w: World, comp: Competition): Map<number, number> | undefined {
  if (!comp.table?.length) return undefined
  let last = 0
  const played: [Fixture, number][] = []
  for (const id of comp.fixtures) {
    const f = w.fixtures[id]
    if (!f?.played || !f.result || f.tieId) continue
    const md = matchdayOf(f.roundName)
    if (md == null) continue
    played.push([f, md])
    if (md > last) last = md
  }
  if (last < 2) return undefined
  const rows = new Map(comp.table.map((r) => [r.clubId, { ...r, form: [] as StandingRow['form'] }]))
  for (const [f, md] of played) {
    if (md !== last) continue
    const h = rows.get(f.home), a = rows.get(f.away)
    if (!h || !a) continue
    const [hs, as] = f.result!.score
    h.p--; a.p--
    h.gf -= hs; h.ga -= as; a.gf -= as; a.ga -= hs
    if (hs > as) { h.w--; a.l--; h.pts -= 3 } else if (hs < as) { a.w--; h.l--; a.pts -= 3 } else { h.d--; a.d--; h.pts--; a.pts-- }
  }
  const prev = new Map<number, number>()
  sortTable(w, comp, [...rows.values()]).forEach((r, i) => prev.set(r.clubId, i + 1))
  return prev
}

export function sortedTable(w: World, comp: Competition): StandingRow[] {
  return sortTable(w, comp)
}

export function positionOf(w: World, comp: Competition, clubId: number): number {
  const t = sortTable(w, comp)
  return t.findIndex((r) => r.clubId === clubId) + 1
}

export type Zone = 'champion' | 'ucl' | 'uel' | 'uecl' | 'promo' | 'playoff' | 'releplayoff' | 'rele' | 'ko' | 'kopo' | 'out' | ''

/** Qualification / relegation zone for a league position (real league rules). */
export function zoneFor(w: World, comp: Competition, pos: number, total: number): Zone {
  const r = comp.rules
  if (comp.format === 'uefa') {
    if (pos <= 8) return 'ko'
    if (pos <= 24) return 'kopo'
    return 'out'
  }
  if (r.promo && pos <= r.promo) return 'promo'
  if (r.playoff && pos >= r.playoff[0] && pos <= r.playoff[1]) return 'playoff'
  if (r.promoplayoff && pos === r.promoplayoff) return 'playoff'
  if (r.rele && pos > total - r.rele) return 'rele'
  if (r.releplayoff && pos === r.releplayoff) return 'releplayoff'
  if (r.uefa && pos <= r.uefa.length) {
    const z = r.uefa[pos - 1]
    if (pos === 1) return 'champion'
    return z === 'UCL' ? 'ucl' : z === 'UEL' ? 'uel' : 'uecl'
  }
  if (pos === 1) return 'champion'
  return ''
}

export const ZONE_COLOR: Record<Zone, string> = {
  champion: '#F4C542', ucl: '#2F7BFF', uel: '#FF8A1F', uecl: '#1FCB6B', promo: '#1FCB6B', playoff: '#53B9FF',
  releplayoff: '#FF9F43', rele: '#FF4D5E', ko: '#2F7BFF', kopo: '#53B9FF', out: '#FF4D5E', '': 'transparent',
}
export const ZONE_LABEL: Record<Zone, string> = {
  champion: 'Champions', ucl: 'Champions League', uel: 'Europa League', uecl: 'Conference League', promo: 'Promotion',
  playoff: 'Play-offs', releplayoff: 'Relegation play-off', rele: 'Relegation', ko: 'Round of 16', kopo: 'Knockout play-offs',
  out: 'Eliminated', '': '',
}
