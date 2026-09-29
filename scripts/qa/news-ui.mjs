// News feed, article view and the latest-news drop. Dev server: npx vite --port 5173 --strictPort
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-news'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 350) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(Number(process.argv[3] || 4)).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
let drops = 0, matches = 0
for (let i = 0; i < 40 && matches < 4; i++) {
  if (await page.getByText('Quick sim').count()) {
    await page.getByText('Quick sim').click(); matches++
    await page.waitForTimeout(2500)
    if (await page.locator('.ndrop').count()) { drops++; await shot(`drop-after-match-${matches}`, 200) }
    await page.evaluate(() => window.__game.getState().closeAll())
    await page.waitForTimeout(300)
    continue
  }
  const b = page.locator('.continue-btn')
  if (!(await b.count())) { await page.evaluate(() => window.__game.getState().closeAll()); await page.waitForTimeout(300); continue }
  await b.click(); await page.waitForTimeout(250)
  await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
  await page.waitForTimeout(400)
  if (await page.locator('.ndrop').count() && drops < 3) { drops++; await shot(`drop-${i}`, 150) }
}
await page.evaluate(() => { const g = window.__game.getState(); g.clearNewsDrop(); g.closeAll(); g.go({ name: 'news' }) })
await shot('news-top', 600)
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 800 })
await shot('news-top-2')
// open one article of each kind we can find
const kinds = await page.evaluate(() => { const w = window.__game.getState().world; const out = {}; for (const n of w.news) if (!out[n.kind]) out[n.kind] = n.id; return out })
console.log('kinds', JSON.stringify(Object.keys(kinds)), 'news', await page.evaluate(() => window.__game.getState().world.news.length), 'drops', drops)
for (const k of ['result', 'transfer', 'award', 'title', 'milestone', 'injury', 'manager', 'youth']) {
  if (!kinds[k]) continue
  await page.evaluate((id) => window.__game.getState().go({ name: 'article', params: { id } }), kinds[k])
  await shot(`article-${k}`, 700)
  await page.evaluate(() => window.__game.getState().back())
}
await page.evaluate(() => window.__game.getState().go({ name: 'news' }))
await page.locator('.chip', { hasText: 'World' }).first().click()
await shot('news-world', 500)
console.log(JSON.stringify({ errors }))
await browser.close()
