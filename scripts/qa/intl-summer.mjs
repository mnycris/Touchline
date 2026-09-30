// June with a tournament on: the off-season hub card, the tournament pages. Sims fast (engine directly, no autosaves).
// node scripts/qa/intl-summer.mjs <out-dir> [date]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-intl-summer'; fs.mkdirSync(OUT, { recursive: true })
const DATE = process.argv[3] || '2027-06-10'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scroll = (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = y }, y)
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click()
await page.locator('.club-card', { hasText: 'Arsenal' }).first().click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
const res = await page.evaluate(async (date) => {
  const mr = await import('/src/engine/world/matchRunner.ts')
  const adv = await import('/src/engine/world/advance.ts')
  const G = window.__game
  const w = G.getState().world
  for (let i = 0; i < 3000 && w.date < date; i++) {
    const r = adv.advance(w, Math.max(1, Math.round((Date.parse(date) - Date.parse(w.date)) / 864e5)))
    if (r.stop === 'match' && r.fixture) adv.afterMatch(w, r.fixture, mr.simulateFixture(w, r.fixture), adv.worldRng(w))
    if (r.stop === 'season-end') break
    for (const m of w.inbox) m.read = true
  }
  G.getState().mutate(() => {})
  G.getState().clearNewsDrop()
  return { date: w.date, running: Object.values(w.competitions).filter((c) => c.intl?.kind === 'tournament' && c.status !== 'finished').map((c) => c.key) }
}, DATE)
console.log(res)
await page.evaluate(() => { const G = window.__game.getState(); G.closeAll(); G.setTab('central'); window.__game.getState().setTab('central') })
await page.waitForTimeout(1500)
await page.evaluate(() => window.__game.getState().clearNewsDrop())
await shot('hub-june', 900)
await scroll(500); await shot('hub-june-2', 500)
const id = await page.evaluate(() => Object.values(window.__game.getState().world.competitions).find((c) => c.intl?.kind === 'tournament' && c.status !== 'finished')?.id)
if (id) {
  await page.evaluate((id) => window.__game.getState().go({ name: 'comp', params: { id } }), id)
  await shot('tournament', 900)
  await page.locator('.tabs button', { hasText: 'Fixtures' }).first().click(); await shot('tournament-fixtures', 700)
}
console.log(JSON.stringify({ errors }))
await browser.close()
