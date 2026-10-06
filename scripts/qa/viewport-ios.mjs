// Viewport check: a browser tab, and a simulated iOS 26+ installed app laid out 47px short of an 844px screen with the top inset reported as 0. node scripts/qa/viewport-ios.mjs <outdir>
import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [label, vw, vh, standalone] of [['browser', 390, 844, false], ['installed-short', 390, 797, true]]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  if (standalone) await ctx.addInitScript(() => {
    const mm = window.matchMedia.bind(window)
    window.matchMedia = (q) => (/display-mode: (standalone|fullscreen)/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : mm(q))
    Object.defineProperty(screen, 'height', { get: () => 844 }); Object.defineProperty(screen, 'width', { get: () => 390 })
  })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5173/')
  await page.waitForTimeout(3000)
  const m = await page.evaluate(() => {
    const app = document.querySelector('.app').getBoundingClientRect()
    const cs = getComputedStyle(document.documentElement)
    const probe = document.createElement('div'); probe.style.paddingTop = 'var(--sat)'; document.body.appendChild(probe); const sat = getComputedStyle(probe).paddingTop; probe.remove()
    return { appH: app.height, appTop: app.top, varH: cs.getPropertyValue('--app-h'), satMin: cs.getPropertyValue('--sat-min'), sat, docScroll: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight }
  })
  console.log(label, JSON.stringify(m))
  await page.screenshot({ path: `${out}/${label}.png` })
  await ctx.close()
}
await browser.close()
