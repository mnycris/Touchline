// Swapping two substitutes on the team sheet, tapping the higher one first and then the lower one first: both should
// trade their places (and nobody should end up listed twice). node scripts/qa/bench-swap.mjs <save>
import { openSave } from './load-save.mjs'
const [SAVE] = process.argv.slice(2)
const { page, browser, errors } = await openSave(SAVE)
await page.evaluate(() => window.__game.getState().go({ name: 'tactics' }))
await page.waitForTimeout(800)
await page.locator('.screen .tabs .tab', { hasText: /line-up/i }).click()
await page.waitForTimeout(600)
const bench = () => page.evaluate(() => { const w = window.__game.getState().world; const c = w.clubs[w.userClubId]; return [...(c.sheets.find((s) => s.id === c.activeSheet) || c.sheets[0]).bench] })
// the substitutes list is the first .card.list after the pitch
const rows = page.locator('.card.list').first().locator('.li')
const tapRow = async (i) => { await rows.nth(i).scrollIntoViewIfNeeded(); await rows.nth(i).click(); await page.waitForTimeout(250) }
const b0 = await bench()
await tapRow(1); await tapRow(4)
const b1 = await bench()
console.log('higher first:', b1[1] === b0[4] && b1[4] === b0[1] ? 'swapped' : 'NOT swapped', new Set(b1).size === b1.length ? '' : 'DUPLICATES')
await tapRow(4); await tapRow(1)
const b2 = await bench()
console.log('lower first:', b2[1] === b1[4] && b2[4] === b1[1] ? 'swapped' : 'NOT swapped', new Set(b2).size === b2.length ? '' : 'DUPLICATES')
console.log(errors.filter((e) => !/CORS|wikipedia/.test(e)).join('\n') || 'no errors')
await browser.close()
