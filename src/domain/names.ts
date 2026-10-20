import type { Rng } from './rng'
import { CULTURES, NATION_CULTURES, type Culture } from './nameCultures'

// Names for the people the game creates. A nation's young players come from one or more naming cultures in realistic
// proportions (nameCultures); the real names of its players in the database are mixed in, each culture writes a name
// its own way (F. Last, Iberian full names with two surnames, Brazilian single names, family name first in East
// Asia), and the same name is not handed out twice in a row or to two people at once.

const FALLBACK: [string[], string[]] = [
  ['Alex', 'Daniel', 'Marco', 'Lucas', 'Adam', 'Leo', 'Samuel', 'David', 'Noah', 'Victor', 'Adrian', 'Julian', 'Oscar', 'Elias', 'Mateo'],
  ['Silva', 'Novak', 'Keller', 'Moreau', 'Rossi', 'Jensen', 'Kovač', 'Horvat', 'Petrov', 'Costa', 'Weber', 'Nielsen', 'Popescu', 'Varga'],
]

interface Lists { first: string[]; last: string[]; nick: string[]; c: Culture }
const built = new Map<string, Lists>()
const words = (s?: string) => [...new Set((s || '').split(/\s+/).filter(Boolean).map((x) => x.replace(/_/g, ' ')))]
function lists(key: string): Lists | undefined {
  let l = built.get(key)
  if (!l) {
    const c = CULTURES[key]
    if (!c) return undefined
    l = { first: words(c.first), last: words(c.last), nick: words(c.nick), c }
    built.set(key, l)
  }
  return l
}

/** Leaning a little towards the common end of a list, without wearing out its first few names. */
const draw = <T,>(arr: T[], rng: Rng) => arr[Math.min(arr.length - 1, Math.floor(Math.pow(rng.next(), 1.12) * arr.length))]

// names handed out lately, by nation: tried again if they come up too soon
const recent = new Map<string, string[]>()
const seenLately = (nation: string, part: string) => (recent.get(nation) || []).includes(part)
function remember(nation: string, ...parts: string[]) {
  const r = recent.get(nation) || []
  r.push(...parts)
  if (r.length > 90) r.splice(0, r.length - 90)
  recent.set(nation, r)
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export interface GeneratedName { first: string; last: string; full: string; display: string }

/**
 * A new name for someone from `nation`. `taken` holds the (lower-case) full and display names already in use, so
 * nobody shares a name with someone who exists; `pools` are the database's real names by nation.
 */
export function generateName(pools: Record<string, [string[], string[]]>, nation: string, rng: Rng, taken?: Set<string>): GeneratedName {
  const mix = NATION_CULTURES[nation]
  const db = pools[nation]
  let out: GeneratedName | undefined
  for (let attempt = 0; attempt < 8; attempt++) {
    const n = compose(nation, mix, db, rng, attempt)
    const clash = taken && (taken.has(fold(n.full)) || taken.has(fold(n.display)))
    const repeat = attempt < 5 && (seenLately(nation, n.first) || seenLately(nation, n.last))
    out = n
    if (!clash && !repeat) break
  }
  remember(nation, out!.first, out!.last)
  taken?.add(fold(out!.full)); taken?.add(fold(out!.display))
  return out!
}

function compose(nation: string, mix: [string, number][] | undefined, db: [string[], string[]] | undefined, rng: Rng, attempt: number): GeneratedName {
  // which culture this one's name comes from
  let key = mix?.[0]?.[0]
  if (mix && mix.length > 1) {
    let r = rng.next() * mix.reduce((a, [, x]) => a + x, 0)
    for (const [k, x] of mix) { r -= x; if (r <= 0) { key = k; break } }
  }
  const l = key ? lists(key) : undefined
  const primary = !mix || key === mix[0][0]
  // the real names of the nation's players, now and then, for its own culture
  // (only their more common names: a rare surname would hand a newcomer some famous player's name, and names split
  // from East Asian or Gulf records don't come apart the same way)
  const family = l?.c.style === 'family-first' || key === 'gulf'
  const dbShare = primary && db && !family ? 0.25 : 0
  const dbFirst = db?.[0].slice(0, Math.max(8, Math.ceil(db[0].length * 0.4))) || []
  // surnames from the records only where the nation has no culture of its own here
  const dbLast = !l && db ? db[1] : []
  const firsts = l?.first.length ? l.first : db?.[0]?.length ? db[0] : FALLBACK[0]
  const lasts = l?.last.length ? l.last : db?.[1]?.length ? db[1] : FALLBACK[1]
  let first = dbFirst.length && rng.next() < dbShare ? draw(dbFirst, rng) : draw(firsts, rng)
  let last = dbLast.length ? draw(dbLast, rng) : draw(lasts, rng)
  // children of a family from elsewhere often carry a first name from the country they grow up in
  if (!primary && mix && rng.next() < 0.35) { const home = lists(mix[0][0]); if (home) first = draw(home.first, rng) }
  if (last === first) last = draw(lasts, rng)
  if (attempt >= 6) last = lasts[Math.floor(rng.next() * lasts.length)]
  const style = l?.c.style || 'western'
  const initial = `${first.split(/[\s-]/)[0][0]}.`
  if (style === 'family-first') return { first, last, full: `${last} ${first}`, display: `${last} ${first}` }
  if (style === 'iberian') {
    // two surnames on paper, one on the shirt
    const second = l?.c.second && rng.next() < 0.5 ? draw(lasts, rng) : undefined
    const full = `${first} ${last}${second && second !== last ? ` ${second}` : ''}`
    return { first, last, full, display: rng.next() < 0.5 ? `${first} ${last}` : `${initial} ${last}` }
  }
  if (style === 'brazil') {
    const full = `${first} ${last}`
    const r = rng.next()
    // known by one name: a nickname, or simply his first name
    if (r < 0.14 && l?.nick.length) return { first, last, full, display: draw(l.nick, rng) }
    if (r < 0.3 && !first.includes(' ') && first.length <= 8) return { first, last, full, display: first }
    return { first, last, full, display: r < 0.6 ? `${first} ${last}` : `${initial} ${last}` }
  }
  return { first, last, full: `${first} ${last}`, display: `${initial} ${last}` }
}

/** Every name in use in a world (players and prospects), for `generateName`'s `taken`. */
export function namesInUse(people: Iterable<{ name: string; fullName?: string }>): Set<string> {
  const s = new Set<string>()
  for (const p of people) { s.add(fold(p.name)); if (p.fullName) s.add(fold(p.fullName)) }
  return s
}

/** @deprecated kept for older callers: first and last name only. */
export function pickName(pools: Record<string, [string[], string[]]>, nation: string, rng: Rng): { first: string; last: string } {
  const n = generateName(pools, nation, rng)
  return { first: n.first, last: n.last }
}

export function displayName(first: string, last: string, nation: string): string {
  if (nation === 'Brazil' && first.length <= 7) return first
  return `${first[0]}. ${last}`
}

export function staffName(rng: Rng, pools: Record<string, [string[], string[]]>, nation?: string): string {
  const n = generateName(pools, nation || 'England', rng)
  // staff go by first name and surname (one surname; family name first where that is the custom)
  return n.full.startsWith(`${n.last} `) ? n.full : `${n.first} ${n.last}`
}
