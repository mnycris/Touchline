// Player match panel + lineup icons: live (at half-time and full-time) and in the match report.
// Needs the dev server: npx vite --port 5173 --strictPort
// node scripts/qa/panel.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-panel'
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
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(Number(process.argv[3] || 1)).click()
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
await page.getByText('To half-time').click()
await page.waitForTimeout(600)
await page.locator('.tab', { hasText: 'Line-ups' }).first().click().catch(async () => { await page.getByText('Line-ups').first().click() })
await shot('ht-lineups')
const scr = () => page.evaluate(() => { const el = document.querySelector('.match-body') || [...document.querySelectorAll('.screen')].pop(); if (el) el.scrollTop = 99999 })
// the best-rated outfield player on the pitch
const tapBest = async () => {
  const idx = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.fl-pl')]
    let best = 0, bi = 1
    nodes.forEach((nd, i) => { const v = parseFloat(nd.querySelector('.rt-pill')?.textContent || '0'); if (v > best && i % 11 !== 0) { best = v; bi = i } })
    return bi
  })
  await page.locator('.fl-pl').nth(idx).click()
}
await tapBest()
await shot('ht-panel', 600)
await page.evaluate(() => { const s = document.querySelector('.sheet'); if (s) s.scrollTop = 600 })
await shot('ht-panel-2')
await page.evaluate(() => { const s = document.querySelector('.sheet'); if (s) s.scrollTop = 99999 })
await shot('ht-panel-3')
await page.locator('.sheet-backdrop').click({ position: { x: 20, y: 20 } })
// keeper
await page.locator('.fl-pl').first().click()
await shot('ht-gk', 600)
await page.locator('.sheet-backdrop').click({ position: { x: 20, y: 20 } })
await page.getByText('Sim to end').click()
await page.waitForTimeout(800)
await shot('ft-lineups')
await page.evaluate(() => { const el = document.querySelector('.match-body'); if (el) el.scrollTop = 700 })
await shot('ft-lineups-2')
await page.evaluate(() => { const el = document.querySelector('.match-body'); if (el) el.scrollTop = 0 })
await tapBest()
await shot('ft-panel', 600)
await page.locator('.sheet-backdrop').click({ position: { x: 20, y: 20 } })
await page.getByText('Full-time · Continue').click()
await page.waitForTimeout(1200)
await shot('report')
await page.locator('.tab', { hasText: 'Line-ups' }).first().click().catch(() => {})
await shot('report-lineups')
await tapBest()
await shot('report-panel', 600)
console.log(JSON.stringify({ errors }, null, 1))
await browser.close()
