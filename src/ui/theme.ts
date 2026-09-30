import type { Club } from '../domain/types'

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex)
  return (r * 299 + g * 587 + b * 114) / 1000
}

function mix(hex: string, target: [number, number, number], t: number): string {
  const [r, g, b] = hexToRgb(hex)
  const m = (a: number, b2: number) => Math.round(a + (b2 - a) * t)
  return `#${[m(r, target[0]), m(g, target[1]), m(b, target[2])].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

/** Pick a vivid, readable accent from a club's palette (avoids near-white / near-black primaries). */
export function clubAccent(club: Pick<Club, 'theme' | 'kit'>): string {
  const cands = [club.theme, club.kit?.[0], club.kit?.[1]].filter(Boolean) as string[]
  for (const c of cands) {
    const l = luminance(c)
    if (l > 40 && l < 215) return c
  }
  const c = cands[0] || '#2a5caa'
  return luminance(c) >= 215 ? mix(c, [40, 60, 110], 0.55) : mix(c, [90, 110, 150], 0.45)
}

export function applyTheme(club?: Pick<Club, 'theme' | 'kit'>) {
  const root = document.documentElement
  if (!club) {
    root.style.setProperty('--club', '#1f7a55')
    root.style.setProperty('--club-rgb', '31, 122, 85')
    root.style.setProperty('--club-ink', '#ffffff')
    root.style.setProperty('--club2', '#ffffff')
    root.style.setProperty('--club-deep', '#06231a')
    return
  }
  const acc = clubAccent(club)
  const [r, g, b] = hexToRgb(acc)
  const second = [club.kit?.[1], club.kit?.[0], '#ffffff'].find((c) => c && Math.abs(luminance(c) - luminance(acc)) > 60) || '#ffffff'
  root.style.setProperty('--club', acc)
  root.style.setProperty('--club-rgb', `${r}, ${g}, ${b}`)
  root.style.setProperty('--club-ink', luminance(acc) > 165 ? '#0b0d11' : '#ffffff')
  root.style.setProperty('--club2', luminance(second) < 60 ? '#ffffff' : second)
  root.style.setProperty('--club-deep', mix(acc, [5, 7, 12], 0.78))
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', mix(acc, [5, 7, 12], 0.85))
}

/** A club colour made safe to sit under white text: light kits (white, yellow, sky blue) are pulled towards the
 *  app's slate; dark and mid colours pass unchanged. */
export function underWhite(hex?: string): string {
  if (!hex) return '#2a3346'
  const l = luminance(hex)
  const k = l > 200 ? 0.62 : l > 150 ? 0.42 : l > 100 ? 0.2 : 0
  return k ? mix(hex, [26, 32, 48], k) : hex
}
