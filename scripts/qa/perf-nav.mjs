// How long common screens take to open on a production build: from the tap to the screen's content on screen.
//   node scripts/qa/perf-nav.mjs <dir> <save file in it> http://localhost:4173/
import { chromium } from 'playwright'
const [S, save, url] = process.argv.slice(2)
const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', ...proxy })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage()
await page.goto(url)
await page.locator('button', { hasText: /Load/ }).first().click()
await page.setInputFiles('input[type=file]', `${S}/${save}`)
await page.waitForFunction(() => document.body.innerText.includes('imported'), null, { timeout: 60000 })
await page.locator('.save-row, .card', { hasText: /imported|·/ }).first().click().catch(() => {})
const lb = page.locator('button', { hasText: /^Load$|Continue/ }).first(); if (await lb.count()) await lb.click().catch(() => {})
await page.waitForSelector('.continue-btn', { timeout: 90000 })
await page.waitForTimeout(2500)
// time from a tap to the moment the new screen's content has painted
const timed = async (label, tap, ready) => {
  const t = await page.evaluate(() => performance.now())
  await tap()
  await page.waitForSelector(ready, { timeout: 20000 })
  const done = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))))
  console.log(`${label.padEnd(34)} ${Math.round(done - t)} ms`)
  await page.waitForTimeout(900)
}
const back = () => page.getByRole('button', { name: 'Back', exact: true }).last().click()
for (const round of ['first', 'again']) {
  console.log(`-- ${round}`)
  await timed('Squad tab', () => page.locator('.bottomnav .navitem[aria-label="Squad"]').click(), '.screen .squad-row, .screen .li')
  await timed('Team Sheet', () => page.locator('button', { hasText: /^Team Sheet$/i }).first().click(), '.screen .tabs')
  await back(); await page.waitForTimeout(500)
  await timed('Season tab', () => page.locator('.bottomnav .navitem[aria-label="Season"]').click(), '.screen .comp-card')
  await timed('Competition page (first card)', () => page.locator('.comp-card').first().click(), '.screen .comp-hero')
  await back(); await page.waitForTimeout(500)
  await timed('Central tab', () => page.locator('.bottomnav .navitem[aria-label="Central"]').click(), '.continue-btn')
}
await browser.close()
