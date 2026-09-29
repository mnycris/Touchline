// Red card → move an on-pitch player into the vacated position (Manage Team → Subs).
// Needs the dev server: npx vite --port 5173 --strictPort
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-redslot'
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
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(1).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
for (let i = 0; i < 14; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
const info = await page.evaluate(() => {
  const g = window.__game.getState()
  const sim = g.live.sim
  const f = g.world.fixtures[g.live.fixtureId]
  const us = f.home === g.world.userClubId ? 0 : 1
  const cb = sim.sides[us].lps.find((l) => l.on && l.pos === 'CB')
  sim.sendOff(cb, false)
  return { us, name: cb.p.name, slot: cb.slot }
})
console.log(info)
await page.locator('.ctl-btn.manage').click()
await shot('manage-red', 600)
// select the right-sided midfielder/winger (a node on our pitch) and tap the sent-off node
const nodes = page.locator('.sheet .fl-pl')
await nodes.nth(6).click()
await shot('selected')
await page.locator('.sheet .fl-pl.sent').click()
await shot('moved', 500)
const after = await page.evaluate((us) => { const sim = window.__game.getState().live.sim; return sim.sides[us].on.map((l) => `${l.slot}:${l.pos}:${l.p.name}`) }, info.us)
console.log(after.join(' | '))
console.log(JSON.stringify({ errors }))
await browser.close()
