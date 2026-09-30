// Match report: timeline, POTM, top stats, goal replay frames, shot map. node scripts/qa/report-ui.mjs <out-dir> [seed-matches]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-report'; fs.mkdirSync(OUT, { recursive: true })
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
// play user matches until one has at least two goals
const id = await page.evaluate(async () => {
  const mr = await import('/src/engine/world/matchRunner.ts')
  const adv = await import('/src/engine/world/advance.ts')
  const G = window.__game
  G.setState({ prefs: { ...G.getState().prefs, reduceMotion: false } })
  for (let i = 0; i < 40; i++) {
    await G.getState().advance(); G.getState().closeAll()
    const w = G.getState().world
    const f = adv.userFixtureOn(w, w.date)
    if (f && !f.played) {
      const sim = mr.createSim(w, f, true); sim.ctx.assistantSubs = true
      const r = sim.runToEnd()
      G.getState().finishUserMatch(f.id, r); G.getState().closeAll()
      if (r.score[0] + r.score[1] >= 2 && r.events.some((e) => e.chain)) return f.id
    }
  }
  return null
})
console.log('fixture', id)
await page.evaluate(() => window.__game.getState().clearNewsDrop())
await page.evaluate((id) => window.__game.getState().go({ name: 'fixture', params: { id } }), id)
await shot('report', 1000)
await scroll(600); await shot('report-2', 500)
await scroll(1300); await shot('report-3', 500)
await scroll(300)
await page.locator('.rp-row.tap').first().click()
for (const ms of [300, 700, 800, 900, 1200, 2000]) await shot(`replay-${ms}`, ms)
await page.locator('.gr-x').click()
await page.waitForTimeout(400)
await scroll(0)
await page.locator('.tabs button', { hasText: 'Stats' }).first().click()
await shot('stats', 900)
await scroll(250); await shot('shotmap', 500)
await page.locator('.sm-nav').last().click(); await shot('shotmap-next', 500)
await page.locator('.sm-seg button', { hasText: '2nd' }).click(); await shot('shotmap-2nd', 600)
console.log(JSON.stringify({ errors }))
await browser.close()
