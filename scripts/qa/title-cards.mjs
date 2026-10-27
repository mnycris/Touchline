// The title cards of a few competitions side by side, as their pages open them (a fresh career at one club, the same
// way every time), each cropped to the card: for judging one identity against the rest of the family.
// node scripts/qa/title-cards.mjs <club> <out-dir> <KEY> [<KEY> ...]   e.g. Arsenal /tmp/h L13 UCL FACUP EFLCUP
import fs from 'node:fs'
import { chromium } from 'playwright'
const [CLUB = 'Arsenal', OUT = '/tmp/opus-comp-heroes', ...KEYS] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
await page.goto('http://localhost:5173/')
await page.waitForFunction(() => window.__game, null, { timeout: 30000 })
await page.evaluate(async (club) => {
  const s = window.__game.getState()
  const raw = await s.loadDb()
  const c = raw.clubs.find((x) => x.short === club || x.name === club || x.name.includes(club))
  await s.startCareer({ clubId: c.id, seed: 11, manager: { firstName: 'Jo', lastName: 'Silva', nationality: 'England', dob: '1984-04-11', avatar: {}, avatarColor: '#10b981', style: 'Balanced' }, settings: { difficulty: 'Professional', transferDifficulty: 'Normal', injuries: 'Normal', growth: 'Normal', sacking: true, aiTransfers: true, startingBudget: 'Default' }, saveName: 'Heroes' })
}, CLUB)
await page.waitForSelector('.continue-btn', { timeout: 90000 })
await page.evaluate(() => window.__game.getState().clearNewsDrop?.())
for (const k of KEYS) {
  const id = await page.evaluate((k) => { const w = window.__game.getState().world; return Object.values(w.competitions).find((c) => c.key.replace(/-\d+$/, '') === k && c.season === w.season)?.id }, k)
  if (!id) { console.log(`${k}: not in this world`); continue }
  await page.evaluate((id) => { const s = window.__game.getState(); s.closeAll(); s.go({ name: 'comp', params: { id } }) }, id)
  await page.waitForTimeout(1600)
  if (!(await page.locator('.comp-hero').count())) { console.log(`${k}: no title card (no identity of its own)`); continue }
  const b = await page.locator('.comp-hero').first().boundingBox()
  if (b) await page.screenshot({ path: `${OUT}/${k}.png`, clip: { x: b.x - 6, y: b.y - 6, width: b.width + 12, height: b.height + 12 } })
}
console.log(errors.join('\n') || 'no errors')
await browser.close()
