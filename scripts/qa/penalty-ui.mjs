// The penalty kick scene: every kind of outcome, captured as frame bursts. node scripts/qa/penalty-ui.mjs <out-dir> [only]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-pens'
const ONLY = process.argv[3]
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(`console: ${m.text()}`) })
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card', { hasText: 'Arsenal' }).first().click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
for (let i = 0; i < 14; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.waitForSelector('text=Play match', { timeout: 20000 })
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
const KICKS = [
  ['goal-BR', 0, 'BR', 'L', 'goal'], ['beaten-BL', 1, 'BL', 'L', 'goal'], ['saved-TL', 0, 'TL', 'L', 'saved'], ['saved-BR', 1, 'BR', 'R', 'saved'],
  ['catch-C', 0, 'C', 'C', 'saved'], ['post-BL', 1, 'BL', 'R', 'post'], ['bar-TR', 0, 'TR', 'L', 'post'], ['wide-BR', 1, 'BR', 'L', 'miss'], ['over-TL', 0, 'TL', 'R', 'miss'], ['goal-C', 1, 'C', 'R', 'goal'],
].filter((k) => !ONLY || k[0].startsWith(ONLY))
await page.evaluate((kicks) => {
  const sim = window.__game.getState().live.sim
  const orig = sim.step.bind(sim)
  let k = 0
  sim.step = () => {
    const evs = orig()
    const i = k % 3 === 2 ? Math.floor(k / 3) : -1
    if (i >= 0 && i < kicks.length) {
      const [, side, spot, dive, res] = kicks[i]
      const X = sim.onPitchIds(side), Y = sim.onPitchIds(1 - side)
      evs.push({ min: sim.minute, score: [...sim.score], type: res === 'goal' ? 'penGoal' : 'penMiss', side, player: X[10], player2: Y[0], text: 'Pen', pen: { taker: X[10], keeper: Y[0], spot, dive, res } })
    }
    k++
    return evs
  }
}, KICKS)
for (const [name] of KICKS) {
  await page.waitForSelector('.mm-kick', { timeout: 60000 })
  const el = page.locator('.mm-kick')
  const t0 = Date.now()
  let n = 0
  while (Date.now() - t0 < 4600) {
    const ms = Date.now() - t0
    await el.screenshot({ path: `${OUT}/${name}-${String(++n).padStart(2, '0')}-${String(ms).padStart(4, '0')}.png` }).catch(() => {})
  }
  await el.click().catch(() => {})
  await page.waitForTimeout(250)
  if (await page.locator('.goal-card').count()) { await page.locator('.goal-card').first().click().catch(() => {}); await page.waitForTimeout(250) }
}
console.log(JSON.stringify({ errors }))
await browser.close()
