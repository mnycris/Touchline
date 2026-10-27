// Competition identities: each competition's title card and page top, and match day in a league's identity.
// Needs the dev server (the store is exposed there):
//   node scripts/qa/identity-ui.mjs <out-dir> [league to manage in, e.g. Bundesliga] [comp keys, e.g. L19,L20,L2076]
//   (env W sets the width)
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-identity'
const LEAGUE = process.argv[3] || 'Bundesliga'
const KEYS = (process.argv[4] || 'L19,L20,L2076').split(',')
const W = Number(process.env.W || 390)
fs.mkdirSync(OUT, { recursive: true })
const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', ...proxy })
const page = await (await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click()
await page.getByText(LEAGUE, { exact: true }).first().click()
await page.locator('.club-card').nth(0).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
for (const key of KEYS) {
  const id = await page.evaluate((key) => {
    const g = window.__game.getState(), w = g.world
    const c = Object.values(w.competitions).find((c) => (c.key || '').replace(/-\d+$/, '') === key)
    if (!c) return undefined
    g.closeAll(); g.go({ name: 'comp', params: { id: c.id } })
    return c.id
  }, key)
  if (!id) { console.log(`${key}: no such competition`); continue }
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `${OUT}/comp-${key}.png` })
  const hero = page.locator('.comp-hero').first()
  if (await hero.count()) await hero.screenshot({ path: `${OUT}/hero-${key}.png` })
  // the knockout tab, if it has one
  const ko = page.locator('.tab', { hasText: /Knockout/i }).first()
  if (await ko.count()) { await ko.click(); await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/comp-${key}-knockouts.png` }) }
}
// match day in the league's identity (env MD=<key> plays through other matches until one in that competition)
await page.evaluate(() => { const g = window.__game.getState(); g.closeAll(); g.setTab('central') })
await page.waitForTimeout(500)
const MD = process.env.MD
for (let i = 0; i < 40; i++) {
  if (await page.getByText('Play match').count()) {
    const cls = await page.evaluate(() => document.querySelector('.md-head')?.className || '')
    if (!MD || cls.includes(`ci-${MD}`)) break
    await page.getByRole('button', { name: /Quick sim/ }).first().click()
    await page.waitForTimeout(800)
    await page.evaluate(() => { const g = window.__game.getState(); g.closeAll(); g.setTab('central') })
    await page.waitForTimeout(400)
  }
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) { await page.waitForTimeout(900); continue }
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.waitForTimeout(1200)
await page.addStyleTag({ content: '.ci-light { display: none !important; }' })
console.log('match day head:', await page.evaluate(() => document.querySelector('.md-head')?.className))
await page.screenshot({ path: `${OUT}/matchday.png` })
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
