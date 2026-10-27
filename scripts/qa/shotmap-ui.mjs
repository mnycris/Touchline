// The shot map after a live match: the selected shot's path (no ball at its end), and shots on top of each other picked
// in turn by tapping the same spot. node scripts/qa/shotmap-ui.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-shotmap'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
await page.goto('http://localhost:4173/')
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
await page.waitForTimeout(1500)
await page.getByText('Sim to end').click()
await page.waitForTimeout(1200)
await page.locator('.tab', { hasText: 'Stats' }).first().click()
await page.waitForTimeout(600)
const map = page.locator('.shotmap').first()
await map.scrollIntoViewIfNeeded()
await page.waitForTimeout(600)
await map.screenshot({ path: `${OUT}/map-default.png` })
// the closest pair of shot marks on screen
const pair = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.shotmap .sm-svg .sm-shot')]
  const pts = els.map((g) => { const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  let best
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)
    if (!best || d < best.d) best = { d, x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2 }
  }
  return best
})
console.log('closest pair of shots', pair && `${pair.d.toFixed(1)} px apart`)
if (pair) console.log('under the tap:', await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); const svg = document.querySelector('.shotmap .sm-svg'); const m = svg.getScreenCTM(); const p = new DOMPoint(x, y).matrixTransform(m.inverse()); return `${el?.tagName}.${el?.getAttribute('class')} → svg units ${p.x.toFixed(1)},${p.y.toFixed(1)}` }, pair))
const who = async () => (await page.locator('.shotmap .sm-who').first().innerText()).replace(/\s+/g, ' ')
if (pair) {
  for (let k = 0; k < 4; k++) {
    await page.mouse.click(pair.x, pair.y)
    // a tap must only change the chosen shot: no mark replays its entrance
    const replay = await page.evaluate(() => document.getAnimations().filter((a) => a.animationName === 'smIn' && a.playState === 'running').length)
    await page.waitForTimeout(650)
    console.log(`tap ${k + 1}: ${await who()} (entrances replayed: ${replay})`)
    await map.screenshot({ path: `${OUT}/map-tap-${k + 1}.png` })
  }
}
// the longest shot on the map, picked with the arrows, with the whole card in view above the bottom bar
const far = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.shotmap .sm-svg .sm-shot')]
  return els.length
})
for (let k = 0; k < far; k++) {
  const txt = await who()
  await page.locator('.shotmap .sm-nav').last().click()
  await page.waitForTimeout(250)
  if (/Saved|Off target|Goal/.test(await page.locator('.shotmap .sm-facts').first().innerText()) && k > 2) break
}
await page.getByText('Hide pitch').first().click().catch(() => {})
await page.waitForTimeout(500)
await page.evaluate(() => { const m = document.querySelector('.shotmap'); const sc = [...document.querySelectorAll('.screen')].pop(); sc.scrollTop += m.getBoundingClientRect().top - 260 })
await page.waitForTimeout(900)
await page.locator('.shotmap').first().screenshot({ path: `${OUT}/map-line.png` })
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
