// Layout tour: the major screens at a given phone size, top and scrolled to the bottom, to catch clipping under the
// status bar, the bottom bar or a footer. With --installed it simulates an iOS 26+ Home Screen app (the page laid out
// short by the top inset, the inset reported as 0). node scripts/qa/layout-tour.mjs <save> <out-dir> [w] [h] [--installed]
import fs from 'node:fs'
import { chromium } from 'playwright'
const args = process.argv.slice(2)
const installed = args.includes('--installed')
const [file, OUT, W = '390', H = '844'] = args.filter((a) => !a.startsWith('--'))
fs.mkdirSync(OUT, { recursive: true })
const width = Number(W), height = Number(H)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width, height: installed ? height - 47 : height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
if (installed) await ctx.addInitScript(([sw, sh]) => {
  const mm = window.matchMedia.bind(window)
  window.matchMedia = (q) => (/display-mode: (standalone|fullscreen)/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : mm(q))
  Object.defineProperty(screen, 'height', { get: () => sh }); Object.defineProperty(screen, 'width', { get: () => sw })
}, [width, height])
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:5173/')
await page.locator('button', { hasText: /Load/ }).first().click()
await page.setInputFiles('input[type=file]', file)
await page.waitForFunction(() => document.body.innerText.includes('imported'), null, { timeout: 60000 })
await page.waitForTimeout(400)
await page.locator('.save-row, .card', { hasText: /imported|·/ }).first().click().catch(() => {})
const loadBtn = page.locator('button', { hasText: /^Load$|Continue/ }).first()
if (await loadBtn.count()) await loadBtn.click().catch(() => {})
await page.waitForSelector('.continue-btn', { timeout: 90000 })
const ids = await page.evaluate(() => {
  const w = window.__game.getState().world, me = w.userClubId
  const lg = Object.values(w.competitions).find((c) => c.format === 'league' && c.clubs.includes(me) && c.season === w.season)
  const next = Object.values(w.fixtures).filter((f) => !f.played && (f.home === me || f.away === me)).sort((a, b) => a.date.localeCompare(b.date))[0]
  const p = Object.values(w.players).find((x) => x.clubId === me && x.ovr >= 80)
  return { lg: lg.id, next: next.id, p: p.id, me }
})
const cases = [
  ['central', { tab: 'central' }], ['squad', { tab: 'squad' }], ['transfers', { tab: 'transfers' }], ['academy', { tab: 'academy' }], ['season', { tab: 'season' }],
  ['league', { go: { name: 'comp', params: { id: ids.lg } } }], ['player', { go: { name: 'player', params: { id: ids.p } } }],
  ['club', { go: { name: 'club', params: { id: ids.me } } }], ['tactics', { go: { name: 'tactics' } }], ['training', { go: { name: 'training' } }],
  ['inbox', { go: { name: 'inbox' } }], ['calendar', { go: { name: 'calendar' } }], ['preview', { open: { name: 'prematch', params: { id: ids.next } } }],
  ...(process.env.EXTRA ? JSON.parse(process.env.EXTRA) : []),
]
let n = 0
for (const [label, c] of cases) {
  await page.evaluate((c) => {
    const s = window.__game.getState()
    s.closeAll(); for (const t of ['central', 'squad', 'transfers', 'academy', 'season']) window.__game.setState({ stacks: { ...window.__game.getState().stacks, [t]: [] } })
    if (c.tab) s.setTab(c.tab); else { s.setTab('central'); if (c.go) window.__game.getState().go(c.go); if (c.open) window.__game.getState().open(c.open) }
  }, c)
  await page.waitForTimeout(700)
  const tag = String(++n).padStart(2, '0')
  await page.screenshot({ path: `${OUT}/${tag}a-${label}.png` })
  await page.evaluate(() => { const els = [...document.querySelectorAll('.app .screen')]; const s = els[els.length - 1]; if (s) s.scrollTop = s.scrollHeight })
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${OUT}/${tag}b-${label}-bottom.png` })
}
console.log(`${cases.length} screens at ${width}x${height}${installed ? ' (installed, simulated)' : ''} · errors: ${errors.length ? errors.join(' | ') : 'none'}`)
await browser.close()
