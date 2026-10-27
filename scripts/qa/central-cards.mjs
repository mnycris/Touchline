// Central's two cards: the next match, and each page of the competitions card (swiped to in turn), each cropped.
// node scripts/qa/central-cards.mjs <save | "fresh:<club>"> <out-dir>   (needs the dev server)
import fs from 'node:fs'
import { chromium } from 'playwright'
import { openSave } from './load-save.mjs'
const [SAVE, OUT = '/tmp/opus-central-cards'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
let page, browser, errors = []
if (SAVE.startsWith('fresh:')) {
  // a career started there and then, the same way every time
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.goto('http://localhost:5173/')
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 })
  await page.evaluate(async (club) => {
    const s = window.__game.getState()
    const raw = await s.loadDb()
    const c = raw.clubs.find((x) => x.short === club || x.name === club || x.name.includes(club))
    await s.startCareer({ clubId: c.id, seed: 11, manager: { firstName: 'Jo', lastName: 'Silva', nationality: 'England', dob: '1984-04-11', avatar: {}, avatarColor: '#10b981', style: 'Balanced' }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, saveName: 'Cards' })
  }, SAVE.slice(6))
  await page.waitForSelector('.continue-btn', { timeout: 90000 })
  await page.evaluate(() => window.__game.getState().clearNewsDrop?.())
} else ({ page, browser, errors } = await openSave(SAVE))
await page.evaluate(() => { const s = window.__game.getState(); s.closeAll(); s.setTab('central') })
await page.waitForTimeout(1000)
const clip = async (sel, name) => {
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), sel)
  await page.waitForTimeout(350)
  const b = await page.locator(sel).first().boundingBox()
  if (b) await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: Math.max(0, b.x - 8), y: Math.max(0, b.y - 8), width: b.width + 16, height: b.height + 16 } })
}
await clip('.nm', 'next-match')
const n = await page.locator('.cpg-page').count()
for (let i = 0; i < n; i++) {
  await page.evaluate((i) => { const t = document.querySelector('.cpg-track'); t.scrollTo({ left: i * t.clientWidth }) }, i)
  await page.waitForTimeout(450)
  await clip('.cpg', `pager-${i}`)
}
console.log(`${n} pages`)
console.log(errors.join('\n') || 'no errors')
await browser.close()
