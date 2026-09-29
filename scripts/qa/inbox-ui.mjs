// Inbox context panels and development emails. Dev server: npx vite --port 5173 --strictPort
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-inbox'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 350) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto('http://localhost:5173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(Number(process.argv[3] || 6)).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
for (let i = 0; i < 40; i++) {
  const have = await page.evaluate(() => { const w = window.__game.getState().world; return { dev: w.inbox.some((m) => m.dev?.length), n: w.inbox.length, date: w.date } })
  if (have.dev && have.date > '2026-09-20') break
  if (await page.getByText('Quick sim').count()) { await page.getByText('Quick sim').click(); await page.waitForTimeout(1200); await page.evaluate(() => window.__game.getState().closeAll()); continue }
  const b = page.locator('.continue-btn')
  if (!(await b.count())) { await page.evaluate(() => window.__game.getState().closeAll()); await page.waitForTimeout(300); continue }
  await b.click(); await page.waitForTimeout(250)
  await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
const picks = await page.evaluate(() => {
  const w = window.__game.getState().world
  const out = []
  const want = [(m) => m.dev?.length, (m) => m.category === 'Medical', (m) => /offer received/i.test(m.subject), (m) => /contract/i.test(m.subject + m.body), (m) => /loan|minutes|playing/i.test(m.subject + m.body)]
  for (const f of want) { const m = w.inbox.find((x) => f(x) && !out.includes(x.id)); if (m) out.push(m.id) }
  return { ids: out, subjects: w.inbox.slice(0, 25).map((m) => `${m.category}: ${m.subject}`) }
})
console.log(picks.subjects.join('\n'))
for (const id of picks.ids) {
  await page.evaluate((id) => window.__game.getState().go({ name: 'message', params: { id } }), id)
  await shot(`msg-${id}`, 600)
  await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 99999 })
  await shot(`msg-${id}-b`, 250)
  await page.evaluate(() => window.__game.getState().back())
}
// profile with gains
const pid = await page.evaluate(() => { const w = window.__game.getState().world; return Object.values(w.players).find((p) => p.clubId === w.userClubId && p.attrGains?.length)?.id })
if (pid) {
  await page.evaluate((id) => window.__game.getState().go({ name: 'player', params: { id } }), pid)
  await page.waitForTimeout(500)
  await page.getByText('Attributes').first().click().catch(() => {})
  await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); if (s) s.scrollTop = 380 })
  await shot('profile-gains', 500)
}
console.log(JSON.stringify({ errors }))
await browser.close()
