// Telling a real person from a namesake when a photo is looked up by name.
import { DEMONYMS } from './demonyms'

/**
 * Is the article (its short description and opening extract) about this football manager? An association football
 * manager or coach, not a namesake in American football or rugby; and, when his nationality is known, the same
 * person: his nationality or one of his clubs named, and no other nationality leading the description without one of
 * his clubs to back it up.
 */
export function managerMatches(desc: string, extract: string, nation?: string, clubs: string[] = []): boolean {
  const lead = extract.slice(0, 600)
  if (!/football|soccer/i.test(`${desc} ${lead}`) || /american football|gridiron|australian rules|gaelic|rugby|canadian football/i.test(desc)) return false
  if (!/manager|coach/i.test(desc) && !/\b(football manager|head coach|coach|manager)\b/i.test(lead)) return false
  if (!nation) return true
  const has = (adj: string) => new RegExp(`\\b${adj}\\b`, 'i').test(`${desc} ${lead.slice(0, 300)}`)
  const own = (DEMONYMS[nation] || []).some(has)
  const club = clubs.some((c) => c.length >= 4 && lead.includes(c))
  const other = !own && Object.entries(DEMONYMS).some(([n, adjs]) => n !== nation && adjs.some((a) => new RegExp(`^(an? )?${a}\\b`, 'i').test(desc.trim())))
  return (own || club) && !(other && !club)
}
