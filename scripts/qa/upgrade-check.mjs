// Old-version save → new-version load, in one persistent browser profile. node scripts/qa/upgrade-check.mjs <profileDir> <phase: old|new> [shot]
import { chromium } from 'playwright'
const [dir, phase, shotPath] = process.argv.slice(2)
const ctx = await chromium.launchPersistentContext(dir, { executablePath: '/opt/pw-browsers/chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = ctx.pages()[0] || await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push('console: ' + m.text()) })
await page.goto('http://localhost:4182/')
if (phase === 'old') {
  await page.getByText('New Career').first().click()
  await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
  await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
  await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.club-card').nth(0).click()
  await page.getByRole('button', { name: /^Manage/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Start Career').first().click()
  await page.waitForSelector('.continue-btn', { timeout: 60000 })
  for (let i = 0; i < 12; i++) {
    if (await page.getByText(/Play Match|Play match/).count()) { await page.getByText(/Quick Sim|Quick sim/).click(); await page.waitForTimeout(1500); await page.locator('.btn.primary', { hasText: 'Continue' }).click(); await page.waitForTimeout(500); continue }
    const b = page.locator('.continue-btn'); if (!(await b.count())) break
    await b.click(); await page.waitForTimeout(300); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 })
  }
  await page.waitForTimeout(3000)
} else {
  await page.waitForTimeout(3000)
  await page.reload()
  await page.waitForTimeout(5000)
  const cont = page.getByText('Continue').first()
  if (await cont.count()) { await cont.click(); await page.waitForTimeout(5000) }
  console.log('new build running:', await page.evaluate(() => [...document.scripts].map((s) => s.src).join(' ')))
}
console.log(phase, 'TEXT:', JSON.stringify(await page.evaluate(() => document.body.innerText.slice(0, 160))))
if (shotPath) await page.screenshot({ path: shotPath })
console.log(errs.join('\n') || 'no errors')
await ctx.close()
