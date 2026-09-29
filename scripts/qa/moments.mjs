// Live-match moments: yellow, red, penalty award, kick (goal + save) and the goal card.
// Needs the dev server (store hook): npx vite --port 5173 --strictPort
// node scripts/qa/moments.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-moments'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(`console: ${m.text()}`) })
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
await page.waitForSelector('text=Play match', { timeout: 20000 })
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
// inject a scripted sequence into the next minute: penalty → yellow for the fouler → scored kick, then a red, then a saved kick
await page.evaluate(() => {
  const sim = window.__game.getState().live.sim
  const orig = sim.step.bind(sim)
  let k = 0
  sim.step = () => {
    const evs = orig()
    const h = sim.onPitchIds(0), a = sim.onPitchIds(1)
    const base = { min: sim.minute, score: [...sim.score] }
    if (k === 2) evs.push(
      { ...base, type: 'penalty', side: 0, player: h[10], player2: a[3], text: 'Penalty!' },
      { ...base, type: 'yellow', side: 1, player: a[3], player2: h[10], text: 'Booked' },
      { ...base, type: 'penGoal', side: 0, player: h[10], text: 'Scores', pen: { taker: h[10], keeper: a[0], spot: 'BR', dive: 'L', res: 'goal' } },
    )
    if (k === 5) evs.push({ ...base, type: 'red', side: 1, player: a[5], text: 'Sent off' })
    if (k === 8) evs.push({ ...base, type: 'penMiss', side: 1, player: a[9], player2: h[0], text: 'Saved', pen: { taker: a[9], keeper: h[0], spot: 'TL', dive: 'L', res: 'saved' } })
    if (k === 11) evs.push({ ...base, type: 'penMiss', side: 0, player: h[9], text: 'Post', pen: { taker: h[9], keeper: a[0], spot: 'TR', dive: 'L', res: 'post' } })
    k++
    return evs
  }
})
const waitFor = async (sel, name, delays) => {
  await page.waitForSelector(sel, { timeout: 60000 })
  for (const [i, d] of delays.entries()) await shot(`${name}-${i}`, d)
}
await waitFor('.mm-pen', 'penalty', [250, 1200])
await waitFor('.mm-card.yellow', 'yellow', [120, 900])
await waitFor('.mm-kick', 'kick-goal', [300, 2300, 700, 1000])
await waitFor('.goal-card.is-goal', 'goal', [600])
await waitFor('.mm-card.red', 'red', [150, 1200])
await waitFor('.mm-kick', 'kick-saved', [2700, 800])
await waitFor('.mm-kick.res-post', 'kick-post', [3500])
await page.locator('.mm-kick').click()
await shot('dismissed', 300)
// pitch hidden: moments live in the body
console.log(JSON.stringify({ errors }, null, 1))
await browser.close()
