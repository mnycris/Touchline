// The Team Sheet's overview tab on a real save, screen by screen down the page. node scripts/qa/team-overview-ui.mjs <save> <out-dir> [url]
import fs from 'node:fs'
import { openSave } from './load-save.mjs'
const [save, OUT, url = 'http://localhost:4173/'] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const { page, browser, errors } = await openSave(save, { url, width: Number(process.env.W || 390), height: 844 })
await page.locator('.bottomnav .navitem[aria-label="Squad"]').click()
await page.waitForTimeout(800)
await page.locator('button', { hasText: /^Team Sheet$/i }).first().click()
await page.waitForTimeout(1600)
const h = await page.evaluate(() => [...document.querySelectorAll('.screen')].pop().scrollHeight)
for (let i = 0, y = 0; y < h && i < 6; i++, y += 700) {
  await page.evaluate((y) => { [...document.querySelectorAll('.screen')].pop().scrollTop = y }, y)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/to-${i}.png` })
}
console.log(errors.length ? errors : 'no page errors')
await browser.close()
