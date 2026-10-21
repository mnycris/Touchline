import type { CSSProperties } from 'react'
import type { Club, Player, World } from '../domain/types'
import compLogos from '../data/compLogos.json'
import crestFitData from '../data/crestFit.json'
import crestsCC from '../data/crestsCC.json'
import eaAssets from '../data/eaAssets.json'
import treatments from '../data/logoTreatments.json'
import { managerMatches } from '../domain/identity'

const BASE = import.meta.env.BASE_URL || '/'
/**
 * A bundled file as a full URL, for a CSS url() set from script. The app is built with relative paths and served from
 * a folder (GitHub Pages puts it under the repository's name), so a root path like /assets/... misses it, and a
 * relative one in a custom property can be resolved against the stylesheet that uses it rather than the page.
 */
export const assetHref = (path: string) => new URL(`${BASE}${path}`, document.baseURI).href
const CC = 'https://assets.football-logos.cc/logos'
const EA = 'https://ratings-images-prod.pulse.ea.com'
const CREST_CC = (crestsCC as { clubs: Record<string, string>; comps: Record<string, string> })
const EA_TEAMS = (eaAssets as { teams: Record<string, string>; playstyles: Record<string, string> }).teams
const EA_PS = (eaAssets as { teams: Record<string, string>; playstyles: Record<string, string> }).playstyles

const ccUrl = (v: string) => { const [country, file] = v.split('/'); return `${CC}/${country}/512x512/${file}.png` }

/** Device pixels needed to show an image `css` pixels wide sharply on this screen. */
export function devicePx(css: number) {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2
  return Math.round(css * Math.min(3, Math.max(1, dpr)))
}

/**
 * Player headshots: this season's EA SPORTS FC 27 face first, wherever it is sharpest, and older images only for a
 * player who has none (checked against every source on 21 Oct 2026; see docs/assets/competition-logos.md):
 *   1. EA's own FC 27 Ultimate Team portraits (the FUT Web App's content store): this season's kit and look, 160px,
 *      exactly what avatars up to ~53 CSS px need. FUTBIN serves byte-identical copies, as the mirror.
 *   2. For big displays, SoFIFA's 240px render of the same FC 27 face goes first (sharper, same image), when the
 *      device can reach it (SoFIFA puts some networks behind a bot challenge; rankSources drops it there).
 *   3. FC 26's faces for anyone FC 27 hasn't scanned.
 *   4. Last, EA's ratings-site portrait: a real photo at 512px, but from 2024/25 (Wirtz in Leverkusen red), so it is
 *      only a fallback. Its CDN resizes with Akamai's `im=Resize` (a `width=` parameter is ignored and sends 365KB).
 * A source is pushed back only when it keeps failing on this device (rankSources). All remote images are requested
 * with `referrerPolicy="no-referrer"` (see ImgChain) so hotlink rules keyed on the Referer header don't reject them.
 */
// the FC 27 FUT Web App's content store (its id is in the web app's page: window.fut_guid; it changes once a year)
const FUT27 = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/27A3C9F1-6B2E-4D7A-8C1F-2E9B5A4D6C7E/2027/fut/items/images/mobile/portraits'
export function faceUrls(p: Pick<Player, 'id' | 'regen'>, css = 48): string[] {
  if (p.regen || p.id >= 9_000_000) return []
  const s = String(p.id).padStart(6, '0')
  const a = s.slice(0, s.length - 3), b = s.slice(-3)
  const px = devicePx(css)
  const big = px > 170
  const sofifa = (y: number) => `https://cdn.sofifa.net/players/${a}/${b}/${y}_${big ? 240 : 120}.png`
  const fc27 = [`${FUT27}/${p.id}.png`, `https://cdn.futbin.com/content/fifa27/img/players/${p.id}.png`]
  return rankSources([
    ...(big ? [sofifa(27), ...fc27] : [...fc27, sofifa(27)]),
    `https://cdn.futbin.com/content/fifa26/img/players/${p.id}.png`,
    `https://cdn.futwiz.com/assets/img/fc26/faces/${p.id}.png`,
    sofifa(26),
    `${EA}/FC25/full/player-portraits/p${p.id}.png?im=Resize,width=${big ? 512 : 256}`,
  ])
}

// ---------------------------------------------------------------- logos on dark surfaces
// How a logo is shown on the app's dark surfaces, measured from the bundled art (scripts/assets/logo_treatments.py):
// 'light', a near-black single-colour mark shown in white (its official treatment on dark backgrounds); 'reverse', a
// dark main colour turned white with the coloured accents kept; 'edge', a crest dark almost all over, its own outer rim
// lifted a shade so the silhouette reads. Anything else is shown exactly as it is: no plates, boxes or glows behind
// any crest (a dark outline round coloured contents, Inter's or Flamengo's, reads by what is inside it).
export type LogoTreatment = 'light' | 'reverse' | 'edge'
const TREAT = treatments as { clubs: Record<string, LogoTreatment>; comps: Record<string, LogoTreatment> }
export const clubLogoTreatment = (id: number): LogoTreatment | undefined => TREAT.clubs[String(id)]
export const compLogoTreatment = (key: string): LogoTreatment | undefined => TREAT.comps[compBase(key)]
const lightened = (t?: LogoTreatment) => t === 'light' || t === 'reverse'
/** the bundled art made for dark surfaces, where the crest has one (the remote copies are the original) */
const darkSurfaceArt = (t?: LogoTreatment) => (lightened(t) ? 'rev' : t === 'edge' ? 'edge' : undefined)

/**
 * Club crests: the bundled 160px art first (precached, instant, works offline), then football-logos.cc's 512px
 * transparent PNGs, EA's crest art and SoFIFA's 120px copy. Big displays upgrade to the 512px art (badgeHiRes).
 * A crest with a light version for dark surfaces shows that one (the remote copies are the dark original).
 */
export function badgeUrls(c: Pick<Club, 'id' | 'badge' | 'sofifaTeamId'>): string[] {
  const out: string[] = []
  const dark = darkSurfaceArt(clubLogoTreatment(c.id))
  if (c.badge && dark) out.push(`${BASE}assets/badges/${c.id}.${dark}.webp`)
  if (c.badge) out.push(`${BASE}assets/badges/${c.id}.webp`)
  const cc = CREST_CC.clubs[String(c.id)]
  if (cc) out.push(ccUrl(cc))
  if (c.sofifaTeamId && EA_TEAMS[String(c.sofifaTeamId)]) out.push(EA_TEAMS[String(c.sofifaTeamId)])
  if (c.sofifaTeamId) out.push(`https://cdn.sofifa.net/teams/${c.sofifaTeamId}/120.png`)
  return out
}
/**
 * How a crest sits in its box: art drawn with a wide margin is scaled up so its long side fills the box like every other
 * crest's, and centred (measured once from the art: scripts/assets/bundle_crests.py). The same for the bundled crest and
 * the sharper one faded in over it, which are the same art.
 */
const FIT = crestFitData as Record<string, number[]>
export function crestFit(id: number): CSSProperties | undefined {
  const f = FIT[String(id)]
  return f ? { transform: `scale(${f[0]}) translate(${(-f[1] * 100).toFixed(1)}%, ${(-f[2] * 100).toFixed(1)}%)` } : undefined
}

/** The sharper crest to fade in over the bundled one when it is shown bigger than the bundled art can carry. */
export function badgeHiRes(c: Pick<Club, 'id' | 'badge'>, css: number): string | undefined {
  const cc = CREST_CC.clubs[String(c.id)]
  return c.badge && cc && devicePx(css) > 170 && !darkSurfaceArt(clubLogoTreatment(c.id)) ? ccUrl(cc) : undefined
}

export function flagUrl(w: World | undefined, nation: string, fallbackCode?: string): string | undefined {
  const code = w?.nations[nation]?.flag || fallbackCode
  return code ? `${BASE}assets/flags/${code}.svg` : undefined
}

export function flagCodeUrl(code: string) {
  return `${BASE}assets/flags/${code}.svg`
}

const LOGOS = compLogos as Record<string, { w: number; h: number; src?: string }>
/**
 * A competition's logo key as the logo files know it: the season suffix of a competition id goes ("FACUP-2026" is the
 * FA Cup), and a tournament with a logo of its own edition keeps it ("EURO@2028").
 */
export const compBase = (key: string) => (LOGOS[key] ? key : key.replace(/[-@]\d+$/, ''))
/** The logo key for a tournament edition, when that edition's own logo is bundled (else the competition's). */
export const editionLogoKey = (key: string, year: number) => (LOGOS[`${key}@${year}`] ? `${key}@${year}` : key)
/**
 * Competition logos: the bundled art, checked and trimmed to the mark (scripts/assets/bundle_comp_logos.py), and its
 * version for dark surfaces where the mark needs one. football-logos.cc's copy is only a fallback for a competition with
 * no bundled art.
 */
export function compLogoUrls(key: string): string[] {
  const k = compBase(key)
  const file = `${BASE}assets/comps/${k.replace('@', '_')}`
  if (LOGOS[k]) return lightened(compLogoTreatment(k)) ? [`${file}.rev.webp`, `${file}.webp`] : [`${file}.webp`]
  return CREST_CC.comps[k] ? [ccUrl(CREST_CC.comps[k])] : []
}
export function compLogoUrl(key: string): string | undefined {
  return compLogoUrls(key)[0]
}
export function compLogoMeta(key: string) {
  return LOGOS[compBase(key)]
}

/** Real EA PlayStyle icon (drop-assets.ea.com) for a PlayStyle name, e.g. "Power Shot" or "Power Shot+". */
export function playStyleIcon(name: string, plus: boolean): string | undefined {
  const t = name.replace(/\+$/, '').trim().toLowerCase()
  const key = Object.keys(EA_PS).find((k) => k.replace(/\+$/, '').toLowerCase() === t && k.endsWith('+') === plus)
  return key ? EA_PS[key] : undefined
}

/** Remember which remote images failed so we don't retry them every render. */
const failed = new Set<string>()
export function markFailed(url: string) { failed.add(url); bump(sourceOf(url), 'fail') }
export function isFailed(url: string) { return failed.has(url) }

// ---------------------------------------------------------------- session image memory
// Once an image has loaded this session it is shown instantly on every later mount (no silhouette, no fade), and a
// reference to the decoded image is held so the browser keeps it in memory while it is in use around the app.
const loaded = new Set<string>()
const held = new Map<string, HTMLImageElement>()
const HOLD = 700
const faceOf = new Map<number, string>()

// the headshot that worked for each player, remembered across sessions so a later launch goes straight to it (no walk
// through sources that fail, no silhouette flashing to a face). A current-season photo is kept; an older one is
// tried again after two weeks, in case a newer one has been published since.
// (v2: the order changed to this season's FC 27 faces first; a remembered older photo is forgotten)
const FACE_KEY = 'opus:faces:v2'
const CURRENT = /\/2027\/fut\/|\/27_\d+\.png|fifa27|fc27/
let faceStore: Record<string, [string, number]> = {}
try { faceStore = JSON.parse(localStorage.getItem(FACE_KEY) || '{}') } catch { faceStore = {} }
let faceTimer: number | undefined
function rememberFace(playerId: number, url: string) {
  const prev = faceStore[playerId]
  if (prev && prev[0] === url) return
  faceStore[playerId] = [url, Date.now()]
  const keys = Object.keys(faceStore)
  if (keys.length > 5000) for (const k of keys.sort((a, b) => faceStore[a][1] - faceStore[b][1]).slice(0, keys.length - 5000)) delete faceStore[k]
  window.clearTimeout(faceTimer)
  faceTimer = window.setTimeout(() => { try { localStorage.setItem(FACE_KEY, JSON.stringify(faceStore)) } catch { /* quota */ } }, 2000)
}
function storedFace(playerId: number): string | undefined {
  const e = faceStore[playerId]
  if (!e) return undefined
  return CURRENT.test(e[0]) || Date.now() - e[1] < 14 * 864e5 ? e[0] : undefined
}

export function markLoaded(url: string, playerId?: number) {
  if (!loaded.has(url)) bump(sourceOf(url), 'ok')
  loaded.add(url)
  if (playerId != null) { faceOf.set(playerId, url); rememberFace(playerId, url) }
  if (!held.has(url) && typeof Image !== 'undefined') {
    const im = new Image()
    im.referrerPolicy = 'no-referrer'
    im.src = url
    held.set(url, im)
    if (held.size > HOLD) held.delete(held.keys().next().value as string)
  } else if (held.has(url)) { const im = held.get(url)!; held.delete(url); held.set(url, im) }
}
export function isLoaded(url: string) { return loaded.has(url) }
/** The headshot that already worked for this player this session. */
export function knownFace(playerId: number) { return faceOf.get(playerId) ?? storedFace(playerId) }

// per-device reliability of each image source
const SRC_KEY = 'opus:imgsrc:v1'
let srcStats: Record<string, { ok: number; fail: number }> = {}
try { srcStats = JSON.parse(localStorage.getItem(SRC_KEY) || '{}') } catch { srcStats = {} }
let srcTimer: number | undefined
function sourceOf(url: string) {
  const m = url.match(/pulse\.ea\.com\/(FC\d+).*width=(\d+)/)
  if (m) return `ea-${m[1]}-${m[2]}`
  const s = url.match(/sofifa\.net\/players\/\d+\/\d+\/(\d+)_(\d+)/)
  if (s) return `sofifa-${s[1]}-${s[2]}`
  const fb = url.match(/futbin\.com\/content\/fifa(\d+)\//)
  if (fb) return `futbin-${fb[1]}`
  const fw = url.match(/futwiz\.com\/assets\/img\/fc(\d+)\//)
  if (fw) return `futwiz-${fw[1]}`
  if (url.includes('/ultimate-team/web-app/content/')) return 'ea-fut-web'
  try { return new URL(url, location.href).host } catch { return url }
}
function bump(key: string, k: 'ok' | 'fail') {
  const e = (srcStats[key] ||= { ok: 0, fail: 0 })
  e[k] = Math.min(10_000, e[k] + 1)
  window.clearTimeout(srcTimer)
  srcTimer = window.setTimeout(() => { try { localStorage.setItem(SRC_KEY, JSON.stringify(srcStats)) } catch { /* quota */ } }, 1500)
}
/**
 * Keep the quality order. A source that has never loaded on this device after a dozen tries is unreachable here
 * (blocked network, dead mirror) and is dropped; one that almost never works goes to the back. A source missing
 * some players is normal and keeps its place: ranking by success rate alone let 120px mirrors jump ahead of
 * sharper sources that simply lack a few faces.
 */
function rankSources(urls: string[]): string[] {
  const poor = (u: string) => { const e = srcStats[sourceOf(u)]; return !!e && e.ok + e.fail >= 30 && e.ok / (e.ok + e.fail) < 0.1 }
  const live = urls.filter((u) => { const e = srcStats[sourceOf(u)]; return !e || e.ok > 0 || e.fail < 12 })
  return [...live.filter((u) => !poor(u)), ...live.filter(poor)]
}

// ---------------------------------------------------------------- Wikipedia photos (managers, fallback players)
const WIKI_KEY = 'opus:wiki:v2' // v2: 400px renditions
let wikiCache: Record<string, string | null> = {}
try { wikiCache = JSON.parse(localStorage.getItem(WIKI_KEY) || '{}') } catch { wikiCache = {} }
const inflight = new Map<string, Promise<string | null>>()
let saveTimer: number | undefined
function persist() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => { try { localStorage.setItem(WIKI_KEY, JSON.stringify(wikiCache)) } catch { /* quota */ } }, 800)
}

/** A 400px rendition of a Wikipedia lead image: vector art at any size, a raster thumbnail only when the original
 *  is bigger (Wikipedia refuses to upscale), otherwise the original file itself. */
function sharpWiki(thumb: string, orig?: { source?: string; width?: number }) {
  if (/\.svg\//i.test(thumb)) return thumb.replace(/\/(\d+)px-/, '/400px-')
  if (orig?.width && orig.width > 400) return thumb.replace(/\/(\d+)px-/, '/400px-')
  return orig?.source || thumb
}

export interface WikiQuery {
  key: string
  titles: string[]
  verify: (description: string, extract: string) => boolean
  asIs?: boolean
  /** the lead image itself must pass this too (its file URL): an article can be right and its picture still not a logo */
  image?: (url: string) => boolean
}

/** Resolve a verified Wikipedia lead image (thumbnail) for a person. Cached per device; null when none verifies. */
export function wikiPhoto(q: WikiQuery): Promise<string | null> {
  if (q.key in wikiCache) return Promise.resolve(wikiCache[q.key])
  const existing = inflight.get(q.key)
  if (existing) return existing
  const run = (async () => {
    for (const title of q.titles) {
      try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`, { headers: { accept: 'application/json' } })
        if (!res.ok) continue
        const j = await res.json()
        if (j.type === 'disambiguation') continue
        const img: string | undefined = j.thumbnail?.source
        if (img && q.verify(String(j.description || ''), String(j.extract || '')) && (!q.image || q.image(String(j.originalimage?.source || img)))) {
          wikiCache[q.key] = sharpWiki(img, j.originalimage)
          persist()
          return wikiCache[q.key]
        }
      } catch { /* offline or blocked */ return null }
    }
    wikiCache[q.key] = null
    persist()
    return null
  })()
  inflight.set(q.key, run)
  return run
}

/** Competitions with no bundled or CDN logo: the logo from the competition's Wikipedia article, resolved on device
 *  (the last resort: everything with licensed art uses it first). */
const COMP_WIKI: Record<string, string> = {
  CDR: 'Copa del Rey', SUPERCOPA: 'Supercopa de España', TDC: 'Trophée des Champions', JCS: 'Johan Cruyff Shield',
  SUPERTACA: 'Supertaça Cândido de Oliveira', CI: 'Coppa Italia', TACA: 'Taça de Portugal', SCOTCUP: 'Scottish Cup',
}
// international tournaments re-brand every edition: only a logo for the tournament itself will do, never the logo of
// one edition (a "2024" in the file name: the game's tournaments are later ones) and never a photo of the trophy
const INTL_WIKI: Record<string, string> = {
  WC: 'FIFA World Cup', EURO: 'UEFA European Championship', UNL: 'UEFA Nations League', CA: 'Copa América',
  AFCON: 'Africa Cup of Nations', ASIAN: 'AFC Asian Cup', GOLD: 'CONCACAF Gold Cup',
}
// a logo is drawn (an SVG or PNG); the lead image of a cup's article is sometimes a photograph of its trophy
const isDrawn = (url: string) => /\.(svg|png)(\/|$|\?)/i.test(url)
const fileName = (url: string) => decodeURIComponent(url.split('/').filter((s) => /\.(svg|png|jpe?g|gif|webp)$/i.test(s))[0] || url).replace(/_/g, ' ')
export function compWikiQuery(key: string): WikiQuery | undefined {
  const base = key.replace(/[-@]\d+$/, '')
  const intl = INTL_WIKI[base]
  const t = COMP_WIKI[base] || intl
  if (!t) return undefined
  return {
    key: `c2:${t}`,
    titles: [t],
    asIs: true,
    verify: (d, e) => /football|soccer|cup|super ?cup|competition|tournament|championship/i.test(`${d} ${e.slice(0, 200)}`),
    image: intl
      ? (u) => isDrawn(u) && /logo|emblem|wordmark/i.test(fileName(u)) && !/(?<!\()\b(19|20)\d\d\b(?!\))/.test(fileName(u))
      : isDrawn,
  }
}

/**
 * A real manager's Wikipedia portrait, accepted only when the article is about the same person: an association football
 * manager or coach (not a namesake in American football or rugby), with his nationality or one of his clubs named.
 * A description that names another nationality and none of his clubs is someone else. With no confirmation the
 * monogram stays: a wrong face is worse than none.
 */
export function managerWikiQuery(name: string, nation?: string, clubs: string[] = []): WikiQuery {
  return {
    // (the checks depend on what is known about him, so a lookup with less to go on is kept apart)
    key: `m3:${name}${nation ? `:${nation}` : ''}`,
    titles: [name, `${name} (football manager)`, `${name} (footballer)`],
    verify: (d, e) => managerMatches(d, e, nation, clubs),
  }
}


export function playerWikiQuery(p: Pick<Player, 'id' | 'name' | 'fullName' | 'dob'>): WikiQuery {
  const year = p.dob.slice(0, 4)
  return {
    key: `p:${p.id}`,
    titles: [p.fullName, p.name].filter((t, i, a) => t && a.indexOf(t) === i && !/^[A-Z]\. /.test(t)),
    verify: (d, e) => {
      if (!/footballer|soccer player/i.test(d)) return false
      const years = (d + ' ' + e.slice(0, 200)).match(/\b(19[6-9]\d|20[01]\d)\b/g)
      return !years || years.includes(year)
    },
  }
}
