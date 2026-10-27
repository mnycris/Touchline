import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.env.OUT || '/tmp/opus-tour2'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
let n = 0
const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const back = async () => { const o = page.locator('.overlay .topbar .iconbtn[aria-label="Back"]'); if (await o.count()) await o.first().click(); else await page.locator('.topbar .iconbtn[aria-label="Back"]').first().click(); await page.waitForTimeout(250) }
const step = async (name, fn) => { try { await fn() } catch (e) { errors.push(`step ${name}: ${e.message.split('\n')[0]}`) } }
await page.goto('http://localhost:4173/')
await page.getByText('New Career').first().click()
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await page.getByText('Continue').first().click(); await page.getByText('LALIGA EA SPORTS').first().click(); await page.locator('.nc-club').nth(0).click()
await page.getByRole('button', { name: /Take the job/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Sign the contract').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
await page.locator('.navitem', { hasText: 'Squad' }).click()
await step('formations', async () => { await page.getByText('Team Sheet').first().click(); await page.locator('.screen .btn.sm').first().click(); await shot('formations'); await page.locator('.formation-card').nth(7).click(); await shot('ts-442'); await back() })
await step('training', async () => { await page.locator('.mini-btn', { hasText: 'Training' }).click(); await shot('training'); await back() })
await step('develop', async () => { await page.locator('.mini-btn', { hasText: 'Develop' }).click(); await shot('development'); await back() })
await step('contracts', async () => { await page.locator('.mini-btn', { hasText: 'Contracts' }).click(); await shot('contracts'); await page.locator('.btn.xs', { hasText: 'Renew' }).first().click(); await shot('renewal'); await back(); await back() })
await step('player', async () => { await page.locator('.squad-row').nth(14).click(); await shot('player-top'); await page.locator('.tab', { hasText: 'PlayStyles' }).click(); await shot('p-playstyles'); await page.locator('.tab', { hasText: 'Stats' }).click(); await shot('p-stats'); await page.locator('.tab', { hasText: 'Development' }).click(); await shot('p-dev'); await back() })
await step('youth', async () => { await page.locator('.navitem', { hasText: 'Academy' }).click(); await page.locator('.tab', { hasText: 'Youth Scouts' }).click(); await shot('youth-scouts'); await page.locator('.btn.xs', { hasText: /Send|Change/ }).first().click(); await shot('youth-mission'); await page.locator('.sheet .btn.primary').click(); await shot('youth-sent') })
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
