// Club editor (Edit Mode): every tab for an AI club and the user's club, then apply a change and check it stuck.
// node scripts/qa/club-edit.mjs <save> <out-dir>
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [file, OUT = '/tmp/opus-clubedit'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(file, { width: 375, height: 740 })
let n = 0
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }) }
const ids = await page.evaluate(() => { const G = window.__game; G.getState().mutate((w) => { w.meta.editMode = true }); const w = G.getState().world; const ai = Object.values(w.clubs).find((c) => c.leagueId === w.clubs[w.userClubId].leagueId && c.id !== w.userClubId && c.short === 'Chelsea') || Object.values(w.clubs).find((c) => c.leagueId === w.clubs[w.userClubId].leagueId && c.id !== w.userClubId); return { ai: ai.id, me: w.userClubId, before: { rep: ai.reputation, avg: ai.squadAvg } } })
for (const [who, id] of [['ai', ids.ai], ['me', ids.me]]) {
  await page.evaluate((id) => window.__game.getState().go({ name: 'club', params: { id } }), id)
  await page.waitForTimeout(600)
  await page.locator('button', { hasText: /Edit club/ }).first().click().catch(async () => { await page.locator('.ed-toggle, [aria-label="Edit club"]').first().click() })
  await shot(`${who}-club`, 500)
  for (const t of who === 'ai' ? ['Standing', 'Money', 'Squad', 'Market'] : ['Squad', 'Board']) {
    await page.locator('.ed-tabs .seg button', { hasText: t }).click()
    if (t === 'Squad' && who === 'ai') await page.locator('.ed-card .stepper button[aria-label=Increase]').first().click({ clickCount: 3 })
    if (t === 'Market') await page.locator('.ed-card .seg button', { hasText: 'Splurge' }).click()
    await shot(`${who}-${t}`, 350)
  }
  if (who === 'ai') { await page.locator('.ed-card .btn.ed-apply').click(); await shot('ai-applied', 500) }
  else await page.locator('.ed-card .btn', { hasText: 'Cancel' }).click()
}
const after = await page.evaluate((id) => { const c = window.__game.getState().world.clubs[id]; return { rep: c.reputation, avg: c.squadAvg, market: c.market } }, ids.ai)
console.log('before', ids.before, 'after', after)
console.log(JSON.stringify({ errors }))
await browser.close()
