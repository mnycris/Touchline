// Try placements for a competition identity's art: each variant's CSS is laid over the page in turn and the title card
// (and the page top) photographed. Needs the dev server (the store is exposed there):
//   node scripts/qa/hero-lab.mjs <out-dir> <league to manage in> <comp key> <variants.json>
// variants.json: [{ "name": "a", "css": ".ci-L19 { --ci-mw: .4 }" }, …]  (a variant named "now" with no css shows
// the current look)
import { chromium } from 'playwright'
import fs from 'node:fs'
const [OUT = '/tmp/opus-hero', LEAGUE = 'Bundesliga', KEY = 'L19', VARS] = process.argv.slice(2)
const variants = VARS ? JSON.parse(fs.readFileSync(VARS, 'utf8')) : [{ name: 'now', css: '' }]
const W = Number(process.env.W || 390)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click()
await page.getByText(LEAGUE, { exact: true }).first().click()
await page.locator('.club-card').nth(0).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
const ok = await page.evaluate((key) => {
  const g = window.__game.getState(), w = g.world
  const c = Object.values(w.competitions).find((c) => (c.key || '').replace(/-\d+$/, '') === key)
  if (!c) return false
  g.closeAll(); g.go({ name: 'comp', params: { id: c.id } })
  return true
}, KEY)
if (!ok) { console.log(`no competition ${KEY}`); process.exit(1) }
await page.waitForTimeout(1500)
// (the light pass and entrance animations off, so every photo is of the card at rest)
await page.addStyleTag({ content: '.ci-light { display: none !important; } * { animation-delay: -10s !important; }' })
for (const v of variants) {
  const h = v.css ? await page.addStyleTag({ content: v.css }) : null
  await page.waitForTimeout(350)
  await page.locator('.comp-hero').first().screenshot({ path: `${OUT}/${KEY}-${v.name}.png` })
  if (v.page) await page.screenshot({ path: `${OUT}/${KEY}-${v.name}-page.png`, clip: { x: 0, y: 0, width: W, height: 420 } })
  if (h) await h.evaluate((el) => el.remove())
}
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
