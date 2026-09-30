// Academy squad: readiness against the first-team bar, pace, next improvement, graduates. node scripts/qa/academy-ui.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-academy'; fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText(process.argv[3] || 'Premier League').first().click(); await page.locator('.club-card').nth(Number(process.argv[4] || 8)).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
// fill the academy through the real scouting path: a mission, generated prospects, signed; then promote the best one
await page.evaluate(async () => {
  const sc = await import('/src/engine/world/scouting.ts')
  const { worldRng } = await import('/src/engine/world/advance.ts')
  const g = window.__game.getState()
  g.mutate((w) => {
    const s = w.youthScouts[0]
    sc.sendYouthScout(w, s.id, 'Brazil', 'Technically Gifted', 3)
    const rng = worldRng(w)
    for (let i = 0; i < 7; i++) { const pr = sc.generateProspect(w, s, rng); w.prospects.push(pr); sc.signProspect(w, pr.id) }
    const best = Object.values(w.players).filter((p) => p.academy && p.clubId === w.userClubId).sort((a, b) => b.ovr - a.ovr)[0]
    if (best) sc.promoteYouth(w, best.id)
  }, { roster: true })
})
await page.locator('.navitem[aria-label="Academy"]').click()
await shot('academy', 800)
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 600 })
await shot('academy-2')
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 99999 })
await shot('academy-3')
console.log(JSON.stringify({ errors }))
await browser.close()
