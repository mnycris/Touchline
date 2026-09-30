import type { Club, Player, World } from '../domain/types'
import compLogos from '../data/compLogos.json'
import crestsCC from '../data/crestsCC.json'
import eaAssets from '../data/eaAssets.json'

const BASE = import.meta.env.BASE_URL || '/'
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
 * Official EA SPORTS FC headshots, sharpest and newest first:
 *   1. EA's own ratings portrait CDN (the cleanest cut-outs, resized on request: 512px for big displays)
 *   2. the SoFIFA mirror of the same scans (240px for retina, 120px otherwise)
 *   3. FUTBIN and FUTWIZ mirrors, then last year's scans for players EA hasn't re-photographed.
 * The order stays quality-first on every device; a source is only pushed back when it keeps failing here (see
 * rankSources). All remote images are requested with `referrerPolicy="no-referrer"` (see ImgChain) so hotlink
 * rules keyed on the Referer header don't reject them.
 */
export function faceUrls(p: Pick<Player, 'id' | 'regen'>, css = 48): string[] {
  if (p.regen || p.id >= 9_000_000) return []
  const s = String(p.id).padStart(6, '0')
  const a = s.slice(0, s.length - 3), b = s.slice(-3)
  const px = devicePx(css)
  const ea = (v: string) => (px > 260 ? [512, 256] : [256]).map((wd) => `${EA}/${v}/full/player-portraits/p${p.id}.png?width=${wd}`)
  const sofifa = (y: number) => (px > 130 ? [240, 120] : [120]).map((wd) => `https://cdn.sofifa.net/players/${a}/${b}/${y}_${wd}.png`)
  return rankSources([
    ...ea('FC27'), ...ea('FC26'),
    ...sofifa(27), ...sofifa(26),
    `https://cdn.futbin.com/content/fifa27/img/players/${p.id}.png`,
    `https://cdn.futwiz.com/assets/img/fc27/faces/${p.id}.png`,
    `https://cdn.futbin.com/content/fifa26/img/players/${p.id}.png`,
    `https://cdn.futwiz.com/assets/img/fc26/faces/${p.id}.png`,
    ...ea('FC25'), ...sofifa(25),
    `https://cdn.futwiz.com/assets/img/fc25/faces/${p.id}.png`,
    `https://cdn.futbin.com/content/fifa25/img/players/${p.id}.png`,
  ])
}

/**
 * Club crests: the bundled 160px art first (precached, instant, works offline), then football-logos.cc's 512px
 * transparent PNGs, EA's crest art and SoFIFA's 120px copy. Big displays upgrade to the 512px art (badgeHiRes).
 */
export function badgeUrls(c: Pick<Club, 'id' | 'badge' | 'sofifaTeamId'>): string[] {
  const out: string[] = []
  if (c.badge) out.push(`${BASE}assets/badges/${c.id}.webp`)
  const cc = CREST_CC.clubs[String(c.id)]
  if (cc) out.push(ccUrl(cc))
  if (c.sofifaTeamId && EA_TEAMS[String(c.sofifaTeamId)]) out.push(EA_TEAMS[String(c.sofifaTeamId)])
  if (c.sofifaTeamId) out.push(`https://cdn.sofifa.net/teams/${c.sofifaTeamId}/120.png`)
  return out
}
/** The sharper crest to fade in over the bundled one when it is shown bigger than the bundled art can carry. */
export function badgeHiRes(c: Pick<Club, 'id' | 'badge'>, css: number): string | undefined {
  const cc = CREST_CC.clubs[String(c.id)]
  return c.badge && cc && devicePx(css) > 170 ? ccUrl(cc) : undefined
}

export function flagUrl(w: World | undefined, nation: string, fallbackCode?: string): string | undefined {
  const code = w?.nations[nation]?.flag || fallbackCode
  return code ? `${BASE}assets/flags/${code}.svg` : undefined
}

export function flagCodeUrl(code: string) {
  return `${BASE}assets/flags/${code}.svg`
}

const LOGOS = compLogos as Record<string, { w: number; h: number }>
/** Competition logo sources in official colours (football-logos.cc first, bundled art second). */
export function compLogoUrls(key: string): string[] {
  const out: string[] = []
  if (CREST_CC.comps[key]) out.push(ccUrl(CREST_CC.comps[key]))
  if (LOGOS[key]) out.push(`${BASE}assets/comps/${key}.webp`)
  return out
}
export function compLogoUrl(key: string): string | undefined {
  return compLogoUrls(key)[0]
}
export function compLogoMeta(key: string) {
  return LOGOS[key]
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
export function markLoaded(url: string, playerId?: number) {
  if (!loaded.has(url)) bump(sourceOf(url), 'ok')
  loaded.add(url)
  if (playerId != null) faceOf.set(playerId, url)
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
export function knownFace(playerId: number) { return faceOf.get(playerId) }

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

export interface WikiQuery { key: string; titles: string[]; verify: (description: string, extract: string) => boolean; asIs?: boolean }

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
        if (img && q.verify(String(j.description || ''), String(j.extract || ''))) {
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
export function compWikiQuery(key: string): WikiQuery | undefined {
  const t = COMP_WIKI[key.replace(/-\d+$/, '')]
  if (!t) return undefined
  return { key: `c:${t}`, titles: [t], asIs: true, verify: (d, e) => /football|soccer|cup|super ?cup|competition|tournament/i.test(`${d} ${e.slice(0, 200)}`) }
}

export function managerWikiQuery(name: string): WikiQuery {
  return {
    key: `m:${name}`,
    titles: [name, `${name} (football manager)`, `${name} (footballer)`],
    verify: (d, e) => /football|soccer|coach|manager/i.test(d) || /football (manager|coach)|head coach/i.test(e.slice(0, 300)),
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
