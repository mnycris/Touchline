// The production build served from a folder, the way GitHub Pages serves it (https://<user>.github.io/<repo>/): every
// request the app makes to its own server is checked (a root path like /assets/... misses the app there), and every
// competition card's big mark is checked to have actually loaded, since a CSS mask whose image fails hides it silently.
//   npm run build && node scripts/qa/subpath.mjs <save> <out-dir>
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { openSave } from './load-save.mjs'
const [save, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const DIST = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../dist')
const DIR = '/Touchline/'
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' }
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  // only the folder exists, as on GitHub Pages: anything outside it is a 404
  const file = p.startsWith(DIR) ? path.join(DIST, p.slice(DIR.length) || 'index.html') : ''
  if (!file || !file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(4180, r))
const ORIGIN = 'http://localhost:4180'
const { page, browser, errors } = await openSave(save, { url: `${ORIGIN}${DIR}` })
const misses = new Set()
page.on('response', (r) => { if (r.url().startsWith(ORIGIN) && r.status() >= 400) misses.add(`${r.status()} ${r.url().slice(ORIGIN.length)}`) })
page.on('requestfailed', (r) => { if (r.url().startsWith(ORIGIN)) misses.add(`failed ${r.url().slice(ORIGIN.length)}`) })
let bad = 0
/** each mark on screen: the URL its mask asks for, and whether that URL loads */
const marks = () => page.evaluate(async () => Promise.all([...document.querySelectorAll('.ci-mark, .cel-mark')].map(async (el) => {
  const m = getComputedStyle(el).webkitMaskImage || getComputedStyle(el).maskImage
  const url = /url\("?([^")]+)"?\)/.exec(m)?.[1]
  const status = url ? await fetch(url).then((r) => r.status, () => 0) : 0
  return { url, status }
})))
await page.locator('.bottomnav .navitem[aria-label="Season"]').click()
await page.waitForTimeout(1200)
const n = await page.locator('.comp-card').count()
for (let i = 0; i < n; i++) {
  const card = page.locator('.comp-card').nth(i)
  await card.scrollIntoViewIfNeeded()
  await card.click()
  await page.waitForTimeout(1400)
  const name = (await page.locator('.comp-hero .ch-name').first().textContent({ timeout: 3000 }).catch(() => '')) || `card ${i + 1}`
  const ms = await marks()
  for (const m of ms) {
    const ok = m.status === 200
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.trim()}: mark ${m.url?.replace(ORIGIN, '')} → ${m.status}`)
  }
  if (!ms.length) console.log(`     ${name.trim()}: no identity mark on this card`)
  await page.screenshot({ path: `${OUT}/comp-${i}.png`, clip: { x: 0, y: 0, width: 390, height: 420 } })
  // (the screens kept for transitions are aria-hidden, so the role query finds the live one)
  await page.getByRole('button', { name: 'Back', exact: true }).last().click()
  await page.waitForTimeout(700)
}
for (const m of misses) { bad++; console.log(`FAIL request ${m}`) }
console.log(errors.length ? errors : 'no page errors')
console.log(bad ? `${bad} failures` : 'all ok')
await browser.close()
server.close()
process.exit(bad ? 1 : 0)
