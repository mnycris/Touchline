// Transfer centre in the browser: feed mid-window, filters, a story page, Edit Mode new story and reversal.
// node scripts/qa/centre-ui.mjs <out-dir> [date]
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-centre'; fs.mkdirSync(OUT, { recursive: true })
const DATE = process.argv[3] || '2026-07-24'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const scroll = (y) => page.evaluate((y) => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = y }, y)
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
// Edit Mode on
const edit = page.locator('button', { hasText: /Edit Mode/ }).first()
if (await edit.count()) await edit.click().catch(() => {})
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click()
await page.locator('.club-card', { hasText: 'Arsenal' }).first().click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
const res = await page.evaluate(async (date) => {
  const mr = await import('/src/engine/world/matchRunner.ts')
  const adv = await import('/src/engine/world/advance.ts')
  const G = window.__game
  const w = G.getState().world
  w.meta.editMode = true
  for (let i = 0; i < 400 && w.date < date; i++) {
    const r = adv.advance(w, Math.max(1, Math.round((Date.parse(date) - Date.parse(w.date)) / 864e5)))
    if (r.stop === 'match' && r.fixture) adv.afterMatch(w, r.fixture, mr.simulateFixture(w, r.fixture), adv.worldRng(w))
    for (const m of w.inbox) m.read = true
  }
  G.getState().mutate(() => {})
  G.getState().clearNewsDrop()
  const by = {}
  for (const s of w.market.stories) by[s.stage] = (by[s.stage] || 0) + 1
  return { date: w.date, by }
}, DATE)
console.log(res)
await page.locator('.navitem[aria-label="Transfers"]').click()
await shot('centre', 1200)
await scroll(420); await shot('centre-feed', 600)
await scroll(1100); await shot('centre-feed-2', 500)
await scroll(0)
await page.locator('.chips .chip', { hasText: 'Rumours' }).click(); await shot('filter-rumours', 600)
await page.locator('.chips .chip', { hasText: 'Failed' }).click(); await shot('filter-failed', 600)
await page.locator('.chips .chip', { hasText: 'Done deals' }).click(); await shot('filter-done', 600)
// a done deal's story page
await page.locator('.trow').first().click()
await shot('story-done', 900)
await scroll(700); await shot('story-done-2', 500)
await scroll(1600); await shot('story-done-3', 500)
await page.evaluate(() => window.__game.getState().back())
await page.waitForTimeout(500)
await page.locator('.chips .chip', { hasText: 'Talks' }).click(); await page.waitForTimeout(400)
if (await page.locator('.trow').count()) { await page.locator('.trow').first().click(); await shot('story-talks', 900); await scroll(800); await shot('story-talks-2', 500); await page.evaluate(() => window.__game.getState().back()); await page.waitForTimeout(400) }
await page.locator('.chips .chip', { hasText: 'All' }).click()
// Edit Mode: new story
await page.locator('.tc-pulse .btn').click()
await shot('new-story', 600)
await page.locator('.sheet input').first().fill('Mbapp')
await page.waitForTimeout(400)
await page.locator('.ns-res').first().click()
await page.locator('.sheet input').first().fill('Liverpool')
await page.waitForTimeout(400)
await page.locator('.ns-res').first().click()
await page.locator('.sheet .chip', { hasText: 'Negotiating' }).click()
await shot('new-story-filled', 500)
await page.locator('.sheet .stepper-v').first().click()
await shot('numpad', 500)
await page.locator('.np-k', { hasText: /^1$/ }).last().click(); await page.locator('.np-k', { hasText: /^5$/ }).last().click(); await page.locator('.np-k', { hasText: /^0$/ }).last().click(); await page.locator('.np-k', { hasText: 'million' }).last().click()
await shot('numpad-typed', 300)
await page.locator('.sheet .btn.primary', { hasText: /Set/ }).last().click()
await page.waitForTimeout(500)
await page.locator('.sheet .btn.primary', { hasText: /Start story/ }).click()
await shot('made-story', 1000)
// complete it then reverse it
await scroll(2000)
await page.locator('.ed-card .btn.primary', { hasText: 'Complete now' }).click().catch(() => {})
await page.waitForTimeout(700)
await shot('completed', 600)
const after = await page.evaluate(() => { const w = window.__game.getState().world; const p = Object.values(w.players).find((x) => x.name.includes('Mbapp')); return { club: w.clubs[p.clubId]?.short } })
console.log('after complete', after)
await scroll(2000)
await page.locator('.ed-card .btn.danger', { hasText: 'Reverse' }).click().catch(() => {})
await page.waitForTimeout(400)
await shot('reverse-confirm', 500)
await page.locator('.sheet .btn.danger', { hasText: 'Reverse' }).click().catch(() => {})
await page.waitForTimeout(800)
const back = await page.evaluate(() => { const w = window.__game.getState().world; const p = Object.values(w.players).find((x) => x.name.includes('Mbapp')); return { club: w.clubs[p.clubId]?.short } })
console.log('after reverse', back)
await shot('after-reverse', 600)
console.log(JSON.stringify({ errors }))
await browser.close()
