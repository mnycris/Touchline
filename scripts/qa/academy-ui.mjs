// The Academy: squad rows with their growth bars, and the scouted prospects with their ranges.
// Needs the dev server (the store is exposed there): node scripts/qa/academy-ui.mjs <out-dir>   (env W sets the width)
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-academy'
const W = Number(process.env.W || 390)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(0).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
// a few academy players (the youngest at the club, moved down), and the scouted prospects of a few weeks' scouting
await page.evaluate(() => {
  const g = window.__game.getState()
  g.mutate((w) => {
    const young = Object.values(w.players).filter((p) => p.clubId === w.userClubId).sort((a, b) => b.dob.localeCompare(a.dob)).slice(0, 6)
    // (shown as the youngsters they would be: lower now, growing)
    young.forEach((p, i) => { p.academy = true; p.ovr = 52 + i * 5; p.pot = Math.min(92, p.ovr + 12 + (i % 3) * 6) })
  }, { roster: true })
  g.setTab('academy')
})
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/academy.png` })
const list = page.locator('.ac-list').first()
if (await list.count()) { await list.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/academy-list.png` }) }
// a close-up of two rows
const row = page.locator('.ac-row').first()
if (await row.count()) await row.screenshot({ path: `${OUT}/academy-row.png` })
const tabs = page.locator('.screen .tabs .tab')
for (let i = 0; i < await tabs.count(); i++) {
  const t = (await tabs.nth(i).innerText()).trim()
  await tabs.nth(i).click(); await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/academy-tab-${i}-${t.replace(/[^a-z0-9]+/gi, '-')}.png` })
}
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
