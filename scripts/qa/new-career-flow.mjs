// The new-career flow as a player meets it, one screenshot per step: the manager (made up, then a real one), the
// league, the club, the club opened, the rules (a preset, then custom), the appointment, the signature and the world
// being built, then the first Central.
// node scripts/qa/new-career-flow.mjs <out-dir> [league] [club]   (needs the dev server)
import fs from 'node:fs'
import { chromium } from 'playwright'
const [OUT = '/tmp/opus-newcareer', LEAGUE = 'Premier League', CLUB = 'Sunderland'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', ...proxy })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
let n = 0
const shot = async (name, wait = 600) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
// every screenful of the step (or of the opened club), top to bottom, then back to the top
const scrollAll = async (name, sel = '.nc-body') => {
  const h = await page.evaluate((sel) => { const s = [...document.querySelectorAll(sel)].pop(); return s ? s.scrollHeight - s.clientHeight : 0 }, sel)
  for (let y = 640, i = 1; y < h + 640 && i < 5; y += 640, i++) { await page.evaluate(([sel, y]) => { const s = [...document.querySelectorAll(sel)].pop(); if (s) s.scrollTop = y }, [sel, y]); await shot(`${name}-${i}`, 350) }
  await page.evaluate((sel) => { const s = [...document.querySelectorAll(sel)].pop(); if (s) s.scrollTop = 0 }, sel)
}
await page.goto('http://localhost:5173/')
await shot('menu', 1500)
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await shot('you-empty', 900)
await scrollAll('you-empty')
await page.fill('input[placeholder="First name"]', 'Jo')
await page.fill('input[placeholder="Last name"]', 'Silva')
await page.locator('.nc-style', { hasText: 'Gegenpress' }).click()
await page.locator('.nc-swatches .swatch').nth(3).click()
await shot('you-filled', 900)
// the nationality sheet
await page.locator('.nc-pick').click()
await shot('you-nation', 700)
await page.locator('.sheet [aria-label="Close"]').first().click().catch(() => {})
await page.waitForTimeout(400)
// a real manager, then back to his own
await page.locator('.nc-mode', { hasText: 'A real manager' }).click()
await shot('you-real', 700)
await page.locator('.nc-reals .li').nth(1).click()
await shot('you-real-picked', 900)
await page.locator('.nc-mode', { hasText: 'Your own' }).click()
await page.fill('input[placeholder="First name"]', 'Jo')
await page.fill('input[placeholder="Last name"]', 'Silva')
await page.waitForTimeout(300)
await page.locator('.nc-go').click()
await shot('league', 900)
await scrollAll('league')
await page.locator('.nc-lg, .nc-more .li', { hasText: LEAGUE }).first().click()
await shot('club', 900)
await scrollAll('club')
// the system's back closes the club that is open, then goes back a step
await page.locator('.nc-club', { hasText: CLUB }).first().click()
await page.waitForTimeout(600)
await page.goBack()
await page.waitForTimeout(400)
const afterBack1 = await page.evaluate(() => ({ preview: !!document.querySelector('.nc-cp'), step: document.querySelector('.nc-kicker')?.textContent }))
await page.goBack()
await page.waitForTimeout(600)
const afterBack2 = await page.evaluate(() => document.querySelector('.nc-kicker')?.textContent)
console.log(`system back: preview closed ${!afterBack1.preview} on "${afterBack1.step}", then "${afterBack2}"`)
await page.locator('.nc-lg, .nc-more .li', { hasText: LEAGUE }).first().click()
await page.waitForTimeout(700)
await page.locator('.nc-club', { hasText: CLUB }).first().click()
await shot('preview', 1000)
await scrollAll('preview', '.nc-cp-scroll')
await page.getByRole('button', { name: /Take the job/ }).click()
await shot('rules', 900)
await page.locator('.nc-preset', { hasText: 'Custom' }).click()
await shot('rules-custom', 500)
await scrollAll('rules-custom')
await page.locator('.nc-preset', { hasText: 'Classic' }).click()
await page.locator('.nc-go').click()
await shot('sign', 1000)
await scrollAll('sign')
// in the page: when the build screen comes, each line is ticked, and Central opens
await page.evaluate(() => {
  const t0 = performance.now(), marks = (window.__ncMarks = [])
  let lines = -1
  new MutationObserver(() => {
    const t = Math.round(performance.now() - t0)
    if (!marks.some((m) => m[0] === 'build') && document.querySelector('.nc-build')) marks.push(['build', t])
    const on = document.querySelectorAll('.nc-build-line.on').length
    if (document.querySelector('.nc-build') && on !== lines) { lines = on; marks.push([`lines ${on}`, t]) }
    if (!marks.some((m) => m[0] === 'central') && document.querySelector('.continue-btn')) marks.push(['central', t])
  }).observe(document.body, { subtree: true, childList: true, attributes: true })
})
await page.getByRole('button', { name: /Sign the contract/ }).click()
const t0 = Date.now()
// (TIMING=1: no screenshots while it builds, so the time is the player's)
if (!process.env.TIMING) { await shot('signing', 450); await shot('building', 750); await shot('building-2', 700) }
await page.waitForSelector('.nc-build, .continue-btn', { timeout: 10000 })
const t1 = Date.now()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
console.log(`signed to the build screen ${t1 - t0} ms, to Central ${Date.now() - t0} ms`)
console.log('in the page: ' + (await page.evaluate(() => window.__ncMarks)).map(([k, t]) => `${k} ${t}`).join(', '))
await shot('first-central', 1200)
console.log(errors.filter((e) => !/CORS|wikipedia|ERR_|Failed to load resource/.test(e)).join('\n') || 'no errors')
await browser.close()
