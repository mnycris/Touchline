// Half-time report, live analysis in Manage Team, and the before/after of a change in the Match Report, on a save.
// node scripts/qa/ht-ui.mjs <save> [outDir]   (dev server on :5173)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-ht'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
for (let i = 0; i < 30; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) { await page.waitForTimeout(600); break }
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.getByText('Play match').first().click()
await page.waitForSelector('.match-screen', { timeout: 20000 })
// seek to the break, dealing with anything that stops the clock on the way (an injury needs a replacement)
const toBreak = async () => {
  await page.getByText(/To half-time|Next break/).first().click()
  for (let i = 0; i < 120; i++) {
    if (await page.locator('.htr').count()) return
    if (await page.locator('.sheet', { hasText: 'Injury:' }).count()) {
      await page.locator('.sheet .card.list > *').first().click()
      await page.waitForTimeout(300)
      await page.locator('.sheet button[aria-label="Close"], .sheet .sheet-close, .sheet-head button').first().click().catch(() => {})
      await page.waitForTimeout(400)
      await page.getByText(/To half-time|Next break/).first().click().catch(() => {})
    }
    await page.waitForTimeout(500)
  }
}
await toBreak()
await page.waitForSelector('.htr', { timeout: 60000 })
const into = (sel, block = 'start') => page.evaluate(([q, b]) => document.querySelector(q)?.scrollIntoView({ block: b }), [sel, block])
await into('.htr')
await shot('ht-report', 900)
await into('.htr-foot', 'center')
await page.evaluate(() => [...document.querySelectorAll('.htr-foot .btn')].find((b) => /More detail/.test(b.textContent))?.click())
await page.waitForTimeout(500)
await into('.htr-detail', 'start')
await shot('ht-detail', 500)
await page.evaluate(() => { const d = document.querySelector('.htr-detail'); d?.scrollIntoView({ block: 'end' }) })
await shot('ht-detail-2', 400)
await into('.htr')
await page.evaluate(() => document.querySelector('.htr-x')?.click())
await shot('ht-closed', 500)
await page.evaluate(() => document.querySelector('.htr-reopen')?.click())
await shot('ht-reopened', 600)
// change the plan at the break, look at the analysis tab, close (the change is announced once)
await page.locator('.ctl-btn.manage').click()
await page.locator('.sheet .seg button', { hasText: 'Analysis' }).click()
await shot('analysis-15', 600)
await page.locator('.sheet .seg button', { hasText: 'Match so far' }).click()
await shot('analysis-all', 500)
await page.locator('.sheet .seg button', { hasText: 'Tactics' }).click()
await page.waitForTimeout(400)
const chase = page.locator('.tb-plan', { hasText: /Chase|Attack|Push/ }).first()
if (await chase.count()) await chase.click()
await page.waitForTimeout(300)
await page.locator('.sheet button[aria-label="Close"]').first().click()
await page.waitForTimeout(600)
await page.getByText('Live', { exact: true }).first().click().catch(() => {})
await page.evaluate(() => document.querySelector('.feed')?.scrollIntoView({ block: 'start' }))
await shot('feed-after-change', 500)
// play on to the end
await page.locator('button', { hasText: 'Sim to end' }).click()
await page.waitForSelector('button:has-text("Full-time")', { timeout: 120000 })
await page.locator('button', { hasText: 'Full-time' }).click()
await page.waitForTimeout(1500)
const chg = page.locator('.chg')
if (await chg.count()) { await chg.scrollIntoViewIfNeeded(); await shot('report-changes', 600); await page.locator('.chg-h').first().click(); await shot('report-changes-open', 600) } else await shot('report-no-changes', 600)
console.log(JSON.stringify({ errors }))
await browser.close()
