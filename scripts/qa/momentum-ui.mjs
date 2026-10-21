// The momentum graph in a live match: goal markers drawn as round balls above (home) and below (away) the graph, never
// stretched with it. node scripts/qa/momentum-ui.mjs <out-dir>   (env W sets the width)
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-momentum'
const W = Number(process.env.W || 390)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
await page.goto('http://localhost:4173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(0).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
for (let i = 0; i < 14; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
await page.waitForTimeout(1500)
await page.getByText('Sim to end').click()
await page.waitForTimeout(1500)
const g = page.locator('.mom-graph-w').first()
await g.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await page.locator('.mom-wrap').first().screenshot({ path: `${OUT}/momentum-live.png` })
// every marker should be square (a round ball), whatever the graph's aspect
const shapes = await page.evaluate(() => [...document.querySelectorAll('.mom-goal svg')].map((s) => { const r = s.getBoundingClientRect(); return `${r.width.toFixed(1)}×${r.height.toFixed(1)}` }))
console.log('goal markers', shapes.join(' ') || 'none')
// and in the match report
await page.locator('.tab', { hasText: 'Report' }).first().click().catch(() => {})
await page.waitForTimeout(700)
const card = page.locator('.card', { hasText: 'Momentum' }).first()
if (await card.count()) { await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await card.screenshot({ path: `${OUT}/momentum-report.png` }) }
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
