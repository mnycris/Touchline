// Checkpoints, restore, an older-version save being updated on load, and export → import. node scripts/qa/saves-ui.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-saves'; fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const G = (fn, arg) => page.evaluate(fn, arg)
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click()
await page.locator('.club-card', { hasText: 'Arsenal' }).first().click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
await page.waitForTimeout(1500)
await G(() => window.__game.getState().go({ name: 'settings' }))
await page.waitForSelector('.cp-card')
await page.locator('.cp-card').scrollIntoViewIfNeeded()
await shot('settings-checkpoints', 600)
await page.locator('.cp-card .btn.club').click()
await shot('create-sheet', 500)
await page.locator('.sheet .btn.primary').click()
await page.waitForTimeout(1500)
await shot('created', 500)
const before = await G(() => window.__game.getState().world.date)
// move on a week, then go back
await G(async () => { const s = window.__game.getState(); await s.advance(new Date(Date.parse(s.world.date) + 7 * 864e5).toISOString().slice(0, 10)); s.closeAll() })
await page.waitForTimeout(800)
const moved = await G(() => window.__game.getState().world.date)
await G(() => { const s = window.__game.getState(); s.setTab('central'); s.go({ name: 'settings' }) })
await page.waitForSelector('.cp-card .cp-row')
await page.locator('.cp-card').scrollIntoViewIfNeeded()
await page.locator('.cp-card .cp-row .btn.xs').first().click()
await shot('restore-confirm', 450)
await page.locator('.sheet .btn.primary').click()
await page.waitForTimeout(2500)
const restored = await G(() => window.__game.getState().world.date)
await shot('after-restore', 600)
console.log({ before, moved, restored })
// make this an "old" save: schema 1, no international football, no transfer centre
await G(async () => {
  const s = window.__game.getState(); const w = s.world
  for (const [id, c] of Object.entries(w.competitions)) if (c.format === 'intl') { for (const f of c.fixtures) delete w.fixtures[f]; delete w.competitions[id] }
  for (const id of Object.keys(w.clubs)) if (Number(id) >= 9500000) delete w.clubs[id]
  delete w.intl; delete w.market; w.meta.version = 1
  await s.save(false)
  s.exitToMenu()
})
await page.waitForTimeout(1200)
await page.locator('button', { hasText: /Load/ }).first().click()
await shot('load-old', 800)
await page.locator('.save-actions .btn.xs').first().click()
await shot('load-checkpoints', 700)
await page.locator('.card .row.tap').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
await shot('migrated-hub', 900)
const mig = await G(async () => {
  const s = window.__game.getState(); const w = s.world
  const sv = await import('/src/services/saves.ts')
  const cps = await sv.listCheckpoints(s.saveId)
  return { schema: w.meta.version, nts: Object.keys(w.intl?.nt || {}).length, market: !!w.market, msg: w.inbox.find((m) => /updated to/.test(m.subject))?.subject, cps: cps.map((c) => c.name) }
})
console.log(mig)
await G(() => window.__game.getState().go({ name: 'inbox' }))
await shot('inbox', 800)
// export → import
const imp = await G(async () => {
  const s = window.__game.getState()
  const sv = await import('/src/services/saves.ts')
  await s.save(true)
  const out = await sv.exportCareer(s.saveId)
  const file = new File([out.blob], out.filename)
  const n0 = (await sv.listSaves()).length
  const ok = await s.importSave(file)
  const n1 = (await sv.listSaves()).length
  return { filename: out.filename, kb: Math.round(out.blob.size / 1024), ok, n0, n1 }
})
console.log(imp)
console.log(JSON.stringify({ errors }))
await browser.close()
