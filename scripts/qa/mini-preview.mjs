import { chromium } from 'playwright'
const OUT = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
await page.goto('http://localhost:4173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(3).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
await page.getByText('Preview').first().click()
await shot('preview')
await page.getByText('Line-ups').first().click(); await shot('preview-lineups')
await page.locator('.topbar .iconbtn[aria-label="Back"]').last().click()
for (let i = 0; i < 12; i++) {
  if (await page.getByText('Play match').count()) { await page.getByText('Quick sim').click(); await page.waitForSelector('text=Full-time', { timeout: 30000 }); await page.locator('.md-footer .btn.primary').click(); await page.waitForTimeout(300); continue }
  const b = page.locator('.continue-btn'); if (!(await b.count())) { await shot('stuck-' + i); const bk = page.locator('.topbar .iconbtn[aria-label="Back"]'); if (await bk.count()) await bk.last().click(); continue } await b.click(); await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
}
if (await page.getByText('Play match').count()) { await page.getByText('Quick sim').click(); await page.waitForSelector('text=Full-time', { timeout: 30000 }); await page.locator('.md-footer .btn.primary').click() }
await page.locator('.navitem', { hasText: 'Squad' }).click()
await page.locator('.seg button', { hasText: 'List' }).first().click()
await page.locator('.screen .squad-row, .screen .li.tap').nth(0).click()
await page.locator('.tab', { hasText: 'Stats' }).first().click()
await shot('player-stats')
await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(); s.scrollTop = 500 })
await shot('player-matchlog')
await page.locator('.navitem', { hasText: 'Squad' }).click()
await page.getByText('Team Sheet').first().click(); await shot('teamsheet')
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
