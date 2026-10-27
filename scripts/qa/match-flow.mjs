// A watched match end to end, for the details around it: the half-time report on the Live tab only, a substitution
// made from the bench first, the goal card's ball, and the line-ups at full time (the XIs as they started, the
// substitutes on the bench, every change marked). node scripts/qa/match-flow.mjs <save> <out-dir>   (dev server)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-flow'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(SAVE)
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
for (let i = 0; i < 20; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) break
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.getByText('Play match').click()
await page.waitForSelector('.lp', { timeout: 20000 })
const state = () => page.evaluate(() => { const s = window.__game.getState().live?.sim; return s ? { min: s.minute, ph: s.phase, fin: s.finished } : null })
const speed = (v) => page.evaluate((v) => { const g = window.__game.getState(); const l = g.live; if (l) g.setLive({ ...l, speed: v }) }, v)
await speed(60)
let goalShot = false
// to half-time, catching a goal card on the way
for (let k = 0; k < 200; k++) {
  const s = await state()
  if (!goalShot && (await page.locator('.gc-face').count())) { await shot('goal-card', 100); goalShot = true }
  if (!s || s.ph === 'HT') break
  await page.waitForTimeout(250)
}
await shot('ht-live-tab', 900)
for (const t of ['Line-ups', 'Stats']) {
  await page.locator('.tabs .tab', { hasText: t }).first().click()
  await shot(`ht-${t}-tab`, 600)
}
console.log('report outside Live:', await page.locator('.htr-wrap, .htr-reopen').count())
await page.locator('.tabs .tab', { hasText: 'Live' }).first().click()
await page.waitForTimeout(300)
// second half to about an hour, then a substitution made from the bench first
await page.locator('.ctl-btn.big').click().catch(() => {})
for (let k = 0; k < 200; k++) {
  const s = await state()
  if (!goalShot && (await page.locator('.gc-face').count())) { await shot('goal-card', 100); goalShot = true }
  if (!s || s.min >= 62) break
  await page.waitForTimeout(250)
}
await page.locator('.ctl-btn.big').click().catch(() => {})
await page.waitForFunction(() => !document.querySelector('.moment, .mm, .goal-card'), null, { timeout: 15000 }).catch(() => {})
await page.locator('.ctl-btn.manage').click({ force: true })
await page.waitForTimeout(700)
await page.locator('.sheet .seg button', { hasText: /^Subs/ }).click()
await page.waitForTimeout(500)
const subsBefore = await page.evaluate(() => window.__game.getState().live.sim.events.filter((e) => e.type === 'sub').length)
await page.locator('.sheet .fl-bench-row').first().click()
await shot('bench-first-picked', 400)
await page.locator('.sheet .fl-pl').nth(8).click()
await page.waitForTimeout(500)
const subsAfter = await page.evaluate(() => window.__game.getState().live.sim.events.filter((e) => e.type === 'sub').length)
console.log('bench-first substitution:', subsAfter > subsBefore ? 'made' : 'NOT made')
await shot('after-sub', 300)
await page.locator('.sheet button[aria-label="Close"]').first().click().catch(() => {})
await page.waitForTimeout(500)
// to full time
await page.locator('.ctl-btn.big').click().catch(() => {})
for (let k = 0; k < 300; k++) {
  const s = await state()
  if (!goalShot && (await page.locator('.gc-face').count())) { await shot('goal-card', 100); goalShot = true }
  if (!s || s.fin) break
  if (s.ph === 'HT') await page.locator('.ctl-btn.big').click().catch(() => {})
  await page.waitForTimeout(300)
}
await page.waitForTimeout(1500)
await page.locator('.tabs .tab', { hasText: 'Line-ups' }).first().click()
await shot('ft-lineups', 800)
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 900 })
await shot('ft-lineups-bench', 400)
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
