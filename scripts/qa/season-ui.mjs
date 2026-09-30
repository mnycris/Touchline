// Season hub (overview, cup paths, leaders) and calendar after some quick-simmed matches.
// node scripts/qa/season-ui.mjs <out-dir> [matches] [league] [clubIdx]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-season'; fs.mkdirSync(OUT, { recursive: true })
const N = Number(process.argv[3] || 14)
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
await page.getByText('Continue').first().click(); await page.getByText(process.argv[4] || 'Premier League').first().click(); await page.locator('.club-card').nth(Number(process.argv[5] || 2)).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
const played = await page.evaluate(async (N) => {
  const mr = await import('/src/engine/world/matchRunner.ts')
  const adv = await import('/src/engine/world/advance.ts')
  const G = window.__game
  G.setState({ prefs: { ...G.getState().prefs, reduceMotion: true } })
  let m = 0
  for (let i = 0; i < N * 4 && m < N; i++) {
    const stop = await G.getState().advance()
    G.getState().closeAll()
    const w = G.getState().world
    const f = adv.userFixtureOn(w, w.date)
    if (f && !f.played) { const sim = mr.createSim(w, f, true); sim.ctx.assistantSubs = true; G.getState().finishUserMatch(f.id, sim.runToEnd()); G.getState().closeAll(); m++ }
    if (stop === 'season-end') break
  }
  G.getState().clearNewsDrop()
  return m
}, N)
console.log('played', played)
await page.waitForTimeout(2200)
await page.evaluate(() => window.__game.getState().clearNewsDrop())
await page.locator('.navitem[aria-label="Season"]').click()
await shot('season', 900)
await scroll(700); await shot('season-2')
await page.evaluate(() => window.__game.getState().go({ name: 'calendar' }))
await shot('calendar', 900)
await scroll(700); await shot('calendar-2')
await scroll(0)
await page.locator('.iconbtn[aria-label="Next month"]').click()
await shot('calendar-next', 600)
await page.locator('.cal-cell.has-fx').first().click()
await shot('calendar-sel', 500)
await page.evaluate(() => window.__game.getState().go({ name: 'manager' }))
await shot('career', 1100)
console.log(JSON.stringify({ errors }))
await browser.close()
