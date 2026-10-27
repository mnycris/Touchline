// The live match as the player sees it: the pitch at kick-off and mid-game, each tab, and the in-match tactics panel.
// Needs the dev server: node scripts/qa/live-ui.mjs <out-dir>   (env W sets the width)
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-live'
const W = Number(process.env.W || 390)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
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
for (let i = 0; i < 14; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/01-kickoff.png` })
// let it run a while at the fastest speed
await page.evaluate(() => { const g = window.__game.getState(); const l = g.live; if (l) g.setLive({ ...l, speed: 60 }) })
await page.waitForTimeout(9000)
await page.screenshot({ path: `${OUT}/02-running.png` })
// every tab
const tabs = page.locator('.screen .tabs .tab')
const n = await tabs.count()
for (let i = 0; i < n; i++) {
  const name = (await tabs.nth(i).innerText()).trim().replace(/[^a-z0-9]+/gi, '-')
  await tabs.nth(i).click(); await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/03-tab-${i}-${name}.png` })
  await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 700 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/03-tab-${i}-${name}-b.png` })
  await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 0 })
}
// the manage panel, top to bottom, and each of its tabs (opened once the game is a while in, between moments)
await page.waitForFunction(() => (window.__game.getState().live?.sim?.minute || 0) >= 35, null, { timeout: 120000 }).catch(() => {})
await page.waitForFunction(() => !document.querySelector('.moment, .mm, .goal-card'), null, { timeout: 15000 }).catch(() => {})
await page.locator('.ctl-btn.manage').click({ force: true }).catch((e) => console.log('manage click', e.message))
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/04-manage.png` })
for (let k = 1; k < 4; k++) {
  await page.evaluate((k) => { const s = [...document.querySelectorAll('.sheet-body, .sheet .scroll, .sheet, .screen')].pop(); if (s) s.scrollTop = k * 650 }, k)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/04-manage-${k}.png` })
}
// call a shout and check it moved the set-up, then call it off
const before = await page.evaluate(() => { const l = window.__game.getState().live; return { ...l.sim.sideTactics(l.sim.home.clubId === window.__game.getState().world.userClubId ? 0 : 1) } })
await page.evaluate(() => { const s = [...document.querySelectorAll('.sheet-body, .sheet .scroll, .sheet, .screen')].pop(); if (s) s.scrollTop = 0 })
await page.locator('.tl-shout', { hasText: 'Press them' }).click()
await page.waitForTimeout(500)
const after = await page.evaluate(() => { const l = window.__game.getState().live; return { ...l.sim.sideTactics(l.sim.home.clubId === window.__game.getState().world.userClubId ? 0 : 1) } })
console.log('press shout: pressing', before.pressing, '→', after.pressing, '· line', before.lineHeight, '→', after.lineHeight, '· approach', before.defApproach, '→', after.defApproach, '· shout on:', await page.locator('.tl-shout.on').count())
await page.locator('.tl-shout', { hasText: 'Drop off' }).click()
await page.waitForTimeout(400)
const swap = await page.evaluate(() => { const l = window.__game.getState().live; return { ...l.sim.sideTactics(l.sim.home.clubId === window.__game.getState().world.userClubId ? 0 : 1) } })
console.log('drop shout replaces it: pressing', swap.pressing, '· on:', (await page.locator('.tl-shout.on').allInnerTexts()).map((t) => t.split('\n')[0]).join(','))
await page.screenshot({ path: `${OUT}/05-shout-on.png` })
await page.locator('.tl-shout', { hasText: 'Drop off' }).click()
await page.waitForTimeout(400)
const off = await page.evaluate(() => { const l = window.__game.getState().live; return { ...l.sim.sideTactics(l.sim.home.clubId === window.__game.getState().world.userClubId ? 0 : 1) } })
console.log('called off: back to', off.pressing, off.lineHeight, off.defApproach, JSON.stringify(off) === JSON.stringify(before) ? '(identical to before)' : '(DIFFERENT)')
const mtabs = await page.locator('.sheet .seg button, .sheet .tabs .tab, .tb .seg button').allInnerTexts().catch(() => [])
console.log('manage tabs:', mtabs.join(' | '))
// what the buttons at the bottom open
const btns = await page.locator('.match-controls button, .mc-bar button, .lm-bar button').allInnerTexts().catch(() => [])
console.log('bottom controls:', btns.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | '))
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
