// Central match card (both clubs' colours), match-day preview (stakes, absentees), competition-context table.
// node scripts/qa/matchday-ui.mjs <out-dir> [league] [clubIdx] [maxMatches]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-matchday'; fs.mkdirSync(OUT, { recursive: true })
const LEAGUE = process.argv[3] || 'LaLiga', IDX = Number(process.argv[4] || 0), MAX = Number(process.argv[5] || 6)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scroll = (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = y }, y)
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText(LEAGUE).first().click(); await page.locator('.club-card').nth(IDX).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
await shot('central', 800)
const toMatchDay = async () => {
  for (let i = 0; i < 40; i++) {
    if (await page.getByText('Play match').count()) return true
    const b = page.locator('.continue-btn'); if (!(await b.count())) { await page.waitForTimeout(300); continue }
    await b.click()
    await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
  }
  return false
}
for (let m = 0; m < MAX; m++) {
  if (!(await toMatchDay())) break
  const info = await page.evaluate(() => { const g = window.__game.getState(); const w = g.world; const f = Object.values(w.fixtures).find((x) => x.date === w.date && (x.home === w.userClubId || x.away === w.userClubId)); const c = w.competitions[f.compId]; return { comp: c.short, fmt: c.format, round: f.roundName, tie: !!f.tieId } })
  console.log(m, JSON.stringify(info))
  const tag = `${m}-${info.comp.replace(/\W/g, '')}`
  await shot(`${tag}-preview`, 700)
  await scroll(520); await shot(`${tag}-preview-2`)
  await scroll(1100); await shot(`${tag}-preview-3`)
  await scroll(0)
  const t = page.locator('.tab', { hasText: /Table|League phase|Knockouts/ }).first()
  if (await t.count()) { await t.click(); await shot(`${tag}-table`, 500) }
  await page.locator('.tab', { hasText: 'Preview' }).first().click()
  if (m === 0) { await page.evaluate(() => window.__game.getState().closeAll()); await shot('central-matchday', 700); await page.locator('button', { hasText: 'Match Day' }).first().click(); await page.waitForTimeout(600) }
  await page.getByText('Quick sim').click()
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.__game.getState().closeAll())
  await page.waitForTimeout(500)
}
await shot('central-after', 800)
console.log(JSON.stringify({ errors }))
await browser.close()
