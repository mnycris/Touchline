// Visual tour of secondary screens.
import { chromium } from 'playwright'
import fs from 'node:fs'
const URL = process.env.URL || 'http://localhost:4173/'
const OUT = process.env.OUT || '/tmp/opus-tour'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`))
let n = 0
const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const tap = async (sel) => { await page.locator(sel).first().click({ timeout: 8000 }) }
const text = async (t, exact = false) => { await page.getByText(t, { exact }).first().click({ timeout: 8000 }) }
const back = async () => { const o = page.locator('.overlay .topbar .iconbtn[aria-label="Back"]'); if (await o.count()) await o.first().click(); else await page.locator('.topbar .iconbtn[aria-label="Back"]').first().click() ; await page.waitForTimeout(250) }
const nav = async (t) => { await page.locator('.navitem', { hasText: t }).click(); await page.waitForTimeout(250) }
const step = async (name, fn) => { try { await fn() } catch (e) { errors.push(`step ${name}: ${e.message.split('\n')[0]}`) } }
await page.goto(URL)
await text('New Career')
await page.waitForSelector('input[placeholder="First name"]', { timeout: 30000 })
await page.fill('input[placeholder="First name"]', 'Jo'); await page.fill('input[placeholder="Last name"]', 'Silva')
await text('Continue'); await text('Premier League'); await page.locator('.club-card').nth(2).click()
await page.getByRole('button', { name: /^Manage/ }).click(); await text('Continue'); await text('Start Career')
await page.waitForSelector('.continue-btn', { timeout: 60000 })
await step('tactics', async () => { await nav('Squad'); await text('Team Sheet'); await shot('ts-lineup'); await text('Roles', true); await shot('ts-roles'); await page.locator('.tab', { hasText: 'Tactics' }).click(); await shot('ts-tactics'); await page.mouse.wheel(0, 700); await shot('ts-tactics2'); await text('Set Pieces', true); await shot('ts-setpieces'); await text('Sheets', true); await shot('ts-sheets'); await page.locator('.tab', { hasText: 'Line-up' }).click(); await page.locator('.topbar .btn', { hasText: 'Auto' }).click(); await page.locator('.topbar .btn', { hasText: /\d-\d/ }).count(); await page.locator('.btn.sm', { hasText: /\(/ }).first().click(); await shot('ts-formations'); await page.locator('.formation-card').nth(7).click(); await shot('ts-442'); await back() })
await step('training', async () => { await text('Training'); await shot('training'); await back(); await text('Develop'); await shot('development'); await back(); await text('Contracts'); await shot('contracts'); await page.locator('.btn.xs', { hasText: 'Renew' }).first().click(); await shot('renewal'); await back(); await back() })
await step('player-tabs', async () => { await page.locator('.squad-row').nth(12).click(); await page.locator('.tab', { hasText: 'PlayStyles' }).click(); await shot('p-playstyles'); await page.locator('.tab', { hasText: 'Development' }).click(); await shot('p-dev'); await back() })
await step('office', async () => { await nav('Central'); await page.locator('.mini-btn', { hasText: 'Office' }).click(); await shot('office-board'); await text('Finances', true); await shot('office-finance'); await back(); await page.locator('.mini-btn', { hasText: 'Career' }).click(); await shot('manager-career'); await text('Job market'); await shot('jobs'); await back(); await back(); await page.locator('.mini-btn', { hasText: 'Awards' }).click(); await shot('awards'); await back() })
await step('news-settings', async () => { await page.locator('.news-card').click(); await shot('news'); await back(); await page.locator('.iconbtn[aria-label="Settings"]').click(); await shot('settings'); await back() })
await step('transfers', async () => { await nav('Transfers'); await text('Scouting', true); await shot('scouting'); await page.locator('.btn.xs', { hasText: 'Assign' }).first().click(); await shot('scout-assign'); await page.locator('.sheet .btn.primary').click(); await back(); await text('Search', true); await page.locator('.iconbtn[aria-label="Filters"]').click(); await shot('search-filters'); await page.locator('.sheet .btn.primary').click(); await back(); await text('History', true); await shot('history'); await back() })
await step('academy', async () => { await nav('Academy'); await text('Youth Scouts'); await shot('youth-scouts'); await page.locator('.btn.xs', { hasText: /Send|Change/ }).first().click(); await shot('youth-mission'); await page.locator('.sheet .btn.primary').click() })
await step('season', async () => { await nav('Season'); await page.locator('.comp-card').nth(1).click(); await shot('ucl-table'); await page.locator('.tab', { hasText: 'Knockouts' }).click(); await shot('ucl-bracket'); await page.locator('.tab', { hasText: 'Fixtures' }).click(); await shot('ucl-fixtures'); await back(); await page.locator('.comp-card').nth(2).click(); await shot('cup'); await back(); await text('World', true); await shot('world'); await text('Fixtures', true); await shot('club-fixtures') })
await step('club', async () => { await text('Competitions', true); await page.locator('.comp-card').first().click(); await page.locator('.tbl tbody tr').nth(3).click(); await shot('club-profile'); await text('Club', true); await shot('club-info') })
await step('calendar', async () => { await nav('Central'); await page.locator('.cal-strip').click(); await page.locator('.iconbtn[aria-label="Next month"]').click(); await shot('calendar-aug'); await back() })
await step('press', async () => { for (let i = 0; i < 12; i++) { if (await page.getByText('Play Match').count()) break; const b = page.locator('.continue-btn'); if (/Match Day/.test(await b.innerText())) { await b.click(); break } await b.click(); await page.waitForTimeout(200); await page.waitForFunction(() => !document.querySelector('.continue-btn.busy'), null, { timeout: 120000 }) } await page.waitForSelector('text=Play Match', { timeout: 20000 }); await page.locator('.btn', { hasText: 'Press' }).click(); await shot('press'); await page.locator('.btn.answer').first().click(); await page.locator('.btn.answer').first().click(); await page.locator('.btn.answer').first().click().catch(() => {}); await shot('press-done') })
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
