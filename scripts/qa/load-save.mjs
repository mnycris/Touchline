// Shared helper: open the app, import a .touchline save and load it. Returns { page, browser, errors }.
import { chromium } from 'playwright'
export async function openSave(file, { width = 390, height = 844 } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(`console: ${m.text()}`) })
  await page.goto('http://localhost:5173/')
  await page.locator('button', { hasText: /Load/ }).first().click()
  await page.setInputFiles('input[type=file]', file)
  await page.waitForFunction(() => document.body.innerText.includes('imported'), null, { timeout: 60000 })
  await page.waitForTimeout(500)
  await page.locator('.save-row, .card', { hasText: /imported|·/ }).first().click().catch(() => {})
  const loadBtn = page.locator('button', { hasText: /^Load$|Continue/ }).first()
  if (await loadBtn.count()) await loadBtn.click().catch(() => {})
  await page.waitForSelector('.continue-btn', { timeout: 90000 })
  await page.evaluate(() => window.__game.getState().clearNewsDrop?.())
  return { page, browser, errors }
}
