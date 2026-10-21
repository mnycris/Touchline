// Hold Continue: the quick-advance sheet, its presets, where each would stop, changing the presets, a jump, and a tap
// still being a tap. Needs a save that isn't on a match day. node scripts/qa/quick-advance.mjs <save> [out-dir]
import { openSave } from './load-save.mjs'
const out = process.argv[3]
const { page, browser, errors } = await openSave(process.argv[2])
let fails = 0
const ok = (c, what) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`) }
const st = () => page.evaluate(() => { const g = window.__game.getState(); return { date: g.world.date, advancing: g.advancing } })
const btn = page.locator('.continue-btn')
const press = async (ms) => { const b = await btn.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); await page.waitForTimeout(450) }
console.log(`     ${JSON.stringify(await st())} ${await btn.getAttribute('class')}`)

await press(650)
const labels = await page.locator('.qa-btn').allInnerTexts()
ok(labels.length === 4, `held: the sheet with four jumps (${labels.map((l) => l.replace(/\s+/g, ' ')).join(' | ')})`)
ok(!(await st()).advancing, 'holding did not also advance')
if (out) await page.screenshot({ path: `${out}/qa-sheet.png` })

// change the presets: they stay distinct, within 1-30, and are kept
await page.locator('button', { hasText: 'Change the presets' }).click(); await page.waitForTimeout(300)
for (let i = 0; i < 3; i++) await page.locator('.qa-e').nth(3).locator('button[aria-label="More days"]').click()
await page.locator('.qa-e').nth(0).locator('button[aria-label="More days"]').click()
await page.locator('.qa-e').nth(1).locator('button[aria-label="More days"]').click() // 5 -> 6
await page.locator('.qa-e').nth(1).locator('button[aria-label="More days"]').click() // 6 -> 8 (7 is taken)
if (out) await page.screenshot({ path: `${out}/qa-edit.png` })
await page.locator('.sheet button.club', { hasText: /^Save$/ }).click(); await page.waitForTimeout(300)
const saved = await page.evaluate(() => window.__game.getState().prefs.advanceDays)
ok(JSON.stringify(saved) === JSON.stringify([2, 7, 8, 13]), `presets changed, distinct and kept: ${JSON.stringify(saved)}`)
const shown = await page.locator('.qa-btn .display').allInnerTexts()
ok(shown.join(',') === '2,7,8,13', `the sheet shows them: ${shown.join(',')}`)

// a jump: lands on the target day, or earlier on a match day or a stop
const d0 = (await st()).date
const next = await page.evaluate(() => { const w = window.__game.getState().world, me = w.userClubId; return Object.values(w.fixtures).filter((f) => !f.played && (f.home === me || f.away === me)).map((f) => f.date).sort()[0] })
await page.locator('.qa-btn').nth(0).click()
await page.waitForFunction(() => !window.__game.getState().advancing, null, { timeout: 60000 })
const after = await st()
const target = new Date(Date.parse(d0) + 2 * 864e5).toISOString().slice(0, 10)
ok(after.date === target || (next && after.date === next && next <= target) || after.date < target, `2 days from ${d0}: now ${after.date} (target ${target}, next match ${next})`)
await page.evaluate(() => window.__game.getState().setPrefs({ advanceDays: undefined }))
await page.evaluate(() => window.__game.getState().closeAll()); await page.waitForTimeout(400)

// a quick tap is still Continue
if (!(await btn.getAttribute('class')).includes('match')) {
  await press(100)
  ok(await page.locator('.qa-grid').count() === 0, 'a quick tap does not open the presets')
  await page.evaluate(() => window.__game.getState().stopAdvance())
  await page.waitForFunction(() => !window.__game.getState().advancing, null, { timeout: 60000 })
  ok((await st()).date > after.date, `and it advanced (${after.date} → ${(await st()).date})`)
}
console.log(errors.join('\n') || 'no errors')
console.log(fails ? `${fails} FAILED` : 'all ok')
await browser.close()
process.exit(fails ? 1 : 0)
