// Real loading on the production build with its service worker: app start, then the Squad screen's faces, on a first
// visit and again after a reload (cached). Prints times and where the face images came from.
import { chromium } from 'playwright'
// npm run build && npx vite preview --port 4173, then: node scripts/qa/perf-load.mjs <dir> <save file in it> http://localhost:4173/ [ms]
// (ms: how long to stay on Central before opening the squad, as someone reading it would; 0 by default)
const [S, save, url, linger = '0'] = process.argv.slice(2)
const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ...proxy })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const reqs = []
page.on('requestfinished', async (r) => { if (r.resourceType() === 'image') { const resp = await r.response(); reqs.push({ url: r.url(), fromSW: resp?.fromServiceWorker(), t: r.timing().responseEnd }) } })
const t0 = Date.now()
await page.goto(url)
await page.locator('button', { hasText: /Load/ }).first().click()
await page.setInputFiles('input[type=file]', `${S}/${save}`)
await page.waitForFunction(() => document.body.innerText.includes('imported'), null, { timeout: 60000 })
await page.locator('.save-row, .card', { hasText: /imported|·/ }).first().click().catch(() => {})
const lb = page.locator('button', { hasText: /^Load$|Continue/ }).first(); if (await lb.count()) await lb.click().catch(() => {})
await page.waitForSelector('.continue-btn', { timeout: 90000 })
const faces = async (label) => {
  const t = Date.now()
  await page.locator('.bottomnav .navitem[aria-label="Squad"]').click()
  // until every face on screen has an image that loaded (or the list has settled for 8 s)
  let n = 0, done = 0
  for (let i = 0; i < 80; i++) {
    const st = await page.evaluate(() => { const ims = [...document.querySelectorAll('.screen .face img')].filter((im) => { const r = im.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 }); return [ims.length, ims.filter((im) => im.complete && im.naturalWidth > 0).length] })
    ;[n, done] = st
    if (n && done === n) break
    await page.waitForTimeout(100)
  }
  console.log(`${label}: ${done}/${n} faces on screen loaded in ${Date.now() - t} ms`)
}
console.log('first start to Central', Date.now() - t0, 'ms')
await page.waitForTimeout(+linger)
await faces('squad, first visit')
await page.waitForTimeout(3000)
const swReady = await page.evaluate(() => !!navigator.serviceWorker?.controller)
console.log('service worker in control:', swReady)
// reload: the app starts from its stored save, the service worker serves the shell and cached images
const t1 = Date.now()
await page.reload()
const cont = page.locator('button', { hasText: /Continue/ }).first()
await cont.waitFor({ timeout: 30000 }).catch(() => {})
if (await cont.count()) await cont.click()
await page.waitForSelector('.continue-btn', { timeout: 90000 })
console.log('restart to Central', Date.now() - t1, 'ms')
await page.waitForTimeout(+linger)
reqs.length = 0
await faces('squad, after reload')
const sw = reqs.filter((r) => r.fromSW).length
console.log('images after reload:', reqs.length, 'from service worker cache:', sw)
await browser.close()
