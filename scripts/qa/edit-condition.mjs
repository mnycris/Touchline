// Edit Mode: a player's condition (energy, sharpness, morale) and injuries, given and healed.
// Needs the dev server (the store is exposed there): node scripts/qa/edit-condition.mjs <out-dir>
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = process.argv[2] || '/tmp/opus-edit-cond'
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
await page.getByText('Continue').first().click(); await page.getByText('Premier League').first().click(); await page.locator('.nc-club').nth(0).click()
await page.getByRole('button', { name: /Take the job/ }).click(); await page.getByText('Continue').first().click(); await page.getByText('Sign the contract').first().click()
await page.waitForSelector('.continue-btn', { timeout: 60000 })
const id = await page.evaluate(() => {
  const g = window.__game.getState(), w = g.world
  w.meta.editMode = true
  const p = Object.values(w.players).filter((x) => x.clubId === w.userClubId).sort((a, b) => b.ovr - a.ovr)[0]
  g.bump?.()
  g.go({ name: 'player', params: { id: p.id } })
  return p.id
})
await page.waitForTimeout(900)
await page.getByRole('button', { name: /^Edit/ }).first().click()
await page.waitForTimeout(500)
await page.locator('.seg button, .seg-item, button', { hasText: /^Condition$/ }).first().click()
await page.waitForTimeout(500)
const card = page.locator('.ed-card').first()
await card.scrollIntoViewIfNeeded()
await card.screenshot({ path: `${OUT}/condition.png` })
// tired, rusty, and a hamstring strain
await page.locator('.ed-cond').nth(0).getByText('Tired').click()
await page.locator('.ed-cond').nth(1).getByText('Rusty').click()
await page.locator('.ed-inj-opt', { hasText: 'Hamstring Strain' }).click()
await page.waitForTimeout(400)
await card.screenshot({ path: `${OUT}/condition-set.png` })
await page.getByRole('button', { name: /Apply changes/ }).click()
await page.waitForTimeout(700)
const after = await page.evaluate((id) => { const p = window.__game.getState().world.players[id]; return { fitness: p.fitness, sharpness: p.sharpness, injury: p.injury } }, id)
console.log('after apply', JSON.stringify(after))
await page.screenshot({ path: `${OUT}/player-after.png` })
// heal him again
await page.getByRole('button', { name: /^Edit/ }).first().click()
await page.waitForTimeout(400)
await page.locator('button', { hasText: /^Condition$/ }).first().click()
await page.waitForTimeout(300)
await page.locator('.ed-card').first().screenshot({ path: `${OUT}/condition-injured.png` })
await page.getByRole('button', { name: /Heal him/ }).click()
await page.getByRole('button', { name: /Apply changes/ }).click()
await page.waitForTimeout(500)
console.log('after heal', JSON.stringify(await page.evaluate((id) => window.__game.getState().world.players[id].injury || null, id)))
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
