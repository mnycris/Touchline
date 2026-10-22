// The forecasts as the player sees them: the Team Sheet's overview and tactics board before a match (odds with each
// attitude, the strip that follows the set-up), then in a live match the touchline (outlook, what each shout would do,
// the best bet), a call made and its verdict some minutes on, and the in-match board with its strip.
// Needs the dev server: node scripts/qa/touchline-ui.mjs <out-dir>   (env W sets the width)
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-touchline'
const W = Number(process.env.W || 390)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` })
const scrollTo = (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.sheet-body, .sheet .scroll, .sheet, .screen')].pop(); if (s) s.scrollTop = y }, y)
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(0).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })

// before the match: the team sheet
await page.evaluate(() => window.__game.getState().go({ name: 'tactics' }))
await page.waitForTimeout(1200)
await shot('01-overview')
await page.locator('.to-risk').scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
await shot('02-overview-attitude')
await page.locator('.screen .tabs .tab', { hasText: 'Tactics' }).click(); await page.waitForTimeout(800)
await shot('03-tactics')
await page.locator('.tb-ment button').nth(3).click(); await page.waitForTimeout(400)
await page.locator('.tb .seg button', { hasText: 'Long' }).first().click(); await page.waitForTimeout(400)
await scrollTo(520); await page.waitForTimeout(300)
await shot('04-tactics-changed-scrolled')
console.log('strip:', (await page.locator('.ol-strip').first().innerText()).replace(/\s+/g, ' '))
// put it back
await page.locator('.tb-ment button').nth(2).click(); await page.locator('.tb .seg button', { hasText: 'Balanced' }).first().click()
await page.evaluate(() => window.__game.getState().back?.())
await page.waitForTimeout(600)

// the match
for (let i = 0; i < 14; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
await page.evaluate(() => { const g = window.__game.getState(); const l = g.live; if (l) g.setLive({ ...l, speed: 60 }) })
const openManage = async (min) => {
  await page.waitForFunction((m) => (window.__game.getState().live?.sim?.minute || 0) >= m, min, { timeout: 180000 }).catch(() => {})
  await page.waitForFunction(() => !document.querySelector('.moment, .mm, .goal-card'), null, { timeout: 15000 }).catch(() => {})
  await page.locator('.ctl-btn.manage').click({ force: true }).catch((e) => console.log('manage click', e.message))
  await page.waitForTimeout(1200)
}
await openManage(55)
const score = await page.evaluate(() => { const s = window.__game.getState().live.sim; return `${s.minute}' ${s.score[0]}-${s.score[1]}` })
console.log('opened at', score)
await shot('05-touchline')
await page.locator('.tl-shouts').scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
await shot('06-shouts')
console.log('shouts:', (await page.locator('.tl-shout').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join('\n  '))
const best = page.locator('.tl-shout.best')
const pick = (await best.count()) ? best : page.locator('.tl-shout', { hasText: 'Press them' })
await pick.click(); await page.waitForTimeout(500)
await scrollTo(0); await page.waitForTimeout(300)
await shot('07-call-made')
// the in-match board
await page.locator('.sheet .tabs .tab, .sheet .seg button', { hasText: 'Tactics' }).first().click().catch(() => {})
await page.waitForTimeout(700)
await shot('08-board')
await page.locator('.tb-ment button').nth(4).click(); await page.waitForTimeout(400)
await scrollTo(600); await page.waitForTimeout(300)
await shot('09-board-changed-scrolled')
console.log('board strip:', (await page.locator('.ol-strip').first().innerText()).replace(/\s+/g, ' '))
await page.locator('.tb-ment button').nth(2).click(); await page.waitForTimeout(300)
await page.locator('.sheet .tabs .tab, .sheet .seg button', { hasText: 'Touchline' }).first().click().catch(() => {})
// close and let the call run, then look at its verdict
await page.locator('.sheet button[aria-label="Close"]').first().click({ timeout: 3000 }).catch((e) => console.log('close', e.message))
await page.waitForTimeout(900)
await page.evaluate(() => { const g = window.__game.getState(); const l = g.live; if (l) g.setLive({ ...l, speed: 60 }) })
// (at half-time the match waits for the manager: play on)
if (await page.evaluate(() => window.__game.getState().live?.sim?.phase === 'HT')) await page.locator('.ctl-btn.big').click({ force: true }).catch((e) => console.log('play', e.message))
const m0 = await page.evaluate(() => window.__game.getState().live?.sim?.minute || 0)
await openManage(Math.min(88, m0 + 14))
await shot('10-verdict')
console.log('call card:', (await page.locator('.tl-call').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join('\n  ') || '(none)')
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
