// One competition's title card under several CSS variants, each injected over the real page and cropped, for choosing
// between treatments. node scripts/qa/hero-variants.mjs <club> <KEY> <variants.json> <out-dir>
//   variants.json: { "name": "css...", ... }   (needs the dev server)
import fs from 'node:fs'
import { chromium } from 'playwright'
const [CLUB, KEY, VARIANTS, OUT = '/tmp/opus-hero-variants'] = process.argv.slice(2)
const variants = JSON.parse(fs.readFileSync(VARIANTS, 'utf8'))
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
await page.goto('http://localhost:5173/')
await page.waitForFunction(() => window.__game, null, { timeout: 30000 })
await page.evaluate(async (club) => {
  const s = window.__game.getState()
  const raw = await s.loadDb()
  const c = raw.clubs.find((x) => x.short === club || x.name === club || x.name.includes(club))
  await s.startCareer({ clubId: c.id, seed: 11, manager: { firstName: 'Jo', lastName: 'Silva', nationality: 'England', dob: '1984-04-11', avatar: {}, avatarColor: '#10b981', style: 'Balanced' }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, saveName: 'Variants' })
}, CLUB)
await page.waitForSelector('.continue-btn', { timeout: 90000 })
await page.evaluate(() => window.__game.getState().clearNewsDrop?.())
const id = await page.evaluate((k) => { const w = window.__game.getState().world; return Object.values(w.competitions).find((c) => c.key.replace(/-\d+$/, '') === k && c.season === w.season)?.id }, KEY)
await page.evaluate((id) => { const s = window.__game.getState(); s.closeAll(); s.go({ name: 'comp', params: { id } }) }, id)
await page.waitForTimeout(1800)
// the entrance and the slow light held still, so every variant is seen the same way
await page.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 4000 } })
for (const [name, css] of Object.entries(variants)) {
  await page.evaluate(([css]) => { let st = document.getElementById('variant-css'); if (!st) { st = document.createElement('style'); st.id = 'variant-css'; document.head.appendChild(st) } st.textContent = css }, [css])
  await page.waitForTimeout(250)
  const b = await page.locator('.comp-hero').first().boundingBox()
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: b.x - 6, y: b.y - 6, width: b.width + 12, height: b.height + 12 } })
}
await browser.close()
