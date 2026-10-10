// Matchday batch: XI ratings, live shot map, position suitability on a swap, tactics undo, a player's own shots and
// highlighted stats, the full-time Press/Continue footer, goal and penalty replays.
// node scripts/qa/md-ui.mjs <save> [outDir]   (dev server on :5173)
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-md'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file)
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const js = (fn, arg) => page.evaluate(fn, arg)
const clickText = (sel, re) => js(([s, r]) => { const el = [...document.querySelectorAll(s)].find((b) => new RegExp(r).test(b.textContent)); el?.click(); return !!el }, [sel, re])
for (let i = 0; i < 30; i++) {
  if (await page.getByText('Play match').count()) break
  const b = page.locator('.continue-btn'); const t = await b.innerText()
  await b.click(); if (/Match Day/i.test(t)) { await page.waitForTimeout(600); break }
  await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
await page.getByText('Play match').first().click()
await page.waitForSelector('.match-screen', { timeout: 20000 })
// play to the break (replacing anyone injured on the way)
await clickText('button', 'To half-time')
for (let i = 0; i < 120; i++) {
  if (await page.locator('.htr').count()) break
  if (await page.locator('.sheet', { hasText: 'Injury:' }).count()) { await js(() => document.querySelector('.sheet .card.list > *')?.click()); await page.waitForTimeout(300); await js(() => document.querySelector('.sheet button[aria-label="Close"]')?.click()); await page.waitForTimeout(300); await clickText('button', 'To half-time|Next break') }
  await page.waitForTimeout(500)
}
// line-ups with the XI ratings (the half-time report closed first, it sits above the tabs)
await js(() => document.querySelector('.htr-x')?.click())
await page.waitForTimeout(400)
await clickText('.tabs button, [role=tab], button', '^Line-ups$')
await js(() => document.querySelector('.fl-wrap, .fl-team')?.scrollIntoView({ block: 'start' }))
await shot('lineups', 600)
// stats with the live shot map; pick another shot to see its flight
await clickText('.tabs button, [role=tab], button', '^Stats$')
await js(() => document.querySelector('.shotmap')?.scrollIntoView({ block: 'start' }))
await shot('shotmap-live', 700)
await js(() => { const s = [...document.querySelectorAll('.sm-pitch .sm-shot')]; s[Math.floor(s.length / 2)]?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
await page.waitForTimeout(250)
await shot('shotmap-flight-mid', 80)
await shot('shotmap-flight-end', 600)
await js(() => document.querySelector('.shotmap .sm-pitch')?.scrollIntoView({ block: 'start' }))
await shot('shotmap-whole', 300)
await js(() => document.querySelector('.sm-detail')?.scrollIntoView({ block: 'center' }))
await shot('shotmap-detail', 300)
// manage: a swap that puts a player out of position
await js(() => document.querySelector('.ctl-btn.manage')?.click())
await page.waitForTimeout(500)
const nodes = page.locator('.sheet .fl-pl')
const cnt = await nodes.count()
if (cnt >= 11) { await nodes.nth(1).click(); await page.waitForTimeout(200); await nodes.nth(cnt - 1).click(); await page.waitForTimeout(400) }
await shot('swap-suit', 300)
await nodes.nth(1).click().catch(() => {})
await shot('suit-note', 400)
await js(() => document.querySelector('.sheet .fl-pl.sel')?.click())
// tactics: change, undo bar, undo, change again and close
await clickText('.sheet .seg button', '^Tactics$')
await page.waitForTimeout(400)
await clickText('.sheet .tb-plan', 'Chase|Protect')
await page.waitForTimeout(300)
await shot('undo-bar', 300)
await clickText('.sheet .undo-bar button', 'Undo')
await shot('after-undo', 400)
await clickText('.sheet .tb-plan', 'Chase|Protect')
await js(() => document.querySelector('.sheet button[aria-label="Close"]')?.click())
await page.waitForTimeout(500)
await js(() => document.querySelector('.ctl-btn.manage')?.click())
await page.waitForTimeout(400)
await clickText('.sheet .seg button', '^Tactics$')
await shot('undo-last', 500)
await js(() => document.querySelector('.sheet button[aria-label="Close"]')?.click())
await page.waitForTimeout(400)
// a player with shots: open his panel from the line-ups
await clickText('.tabs button, [role=tab], button', '^Line-ups$')
await page.waitForTimeout(300)
const pls = page.locator('.match-body .fl-pl')
const pc = await pls.count()
for (let i = 0; i < pc; i++) {
  await pls.nth(i).click(); await page.waitForTimeout(350)
  if (await page.locator('.pmp-shots').count()) break
  await js(() => document.querySelector('.pmp-pill.x')?.click()); await page.waitForTimeout(250)
}
await js(() => document.querySelector('.pmp-shots')?.scrollIntoView({ block: 'start' }))
await shot('player-shots', 700)
await js(() => document.querySelector('.pmp-sec .pmp-row')?.closest('.pmp-sec')?.scrollIntoView({ block: 'start' }))
await shot('player-stats', 400)
await js(() => document.querySelector('.pmp-pill.x')?.click())
await page.waitForTimeout(300)
// to the end, then the report
await clickText('button', 'Sim to end')
await page.waitForSelector('button:has-text("Full-time")', { timeout: 120000 })
await clickText('button', 'Full-time')
await page.waitForTimeout(1500)
await shot('fulltime', 500)
const replayable = page.locator('.rp-row.tap')
if (await replayable.count()) { await replayable.first().click(); await page.waitForTimeout(1200); await shot('replay-early', 100); await page.waitForTimeout(1000); await shot('replay', 100); await page.waitForTimeout(2500); await shot('replay-end', 200); await js(() => document.querySelector('.gr-x')?.click()); await page.waitForTimeout(400) }
// a penalty goal, replayed as the kick
const rows = await replayable.count()
for (let i = 0; i < rows; i++) {
  await replayable.nth(i).click(); await page.waitForTimeout(350)
  const pen = await page.locator('[aria-label="Penalty replay"]').count()
  if (pen) { await shot('pen-replay-early', 600); await page.waitForTimeout(2600); await shot('pen-replay', 100) }
  await js(() => document.querySelector('.gr-x')?.click()); await page.waitForTimeout(400)
  if (pen) break
}
console.log(JSON.stringify({ errors }))
await browser.close()
