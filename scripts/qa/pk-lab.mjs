// Stills of the penalty scene from the dev lab page. node scripts/qa/pk-lab.mjs <out.png> "<k>" "<times>" [extra query]
import { chromium } from 'playwright'
const [out, k = 'BR,L,goal', t = '0,0.9,1.4,1.62,1.8,2.02,2.3,3.2', extra = ''] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`http://localhost:5173/scripts/qa/lab/pk.html?k=${k}&t=${t}&${extra}`)
await page.waitForSelector('.pk-svg', { timeout: 30000 })
await page.waitForTimeout(600)
await page.locator('#root > div').screenshot({ path: out })
console.log(JSON.stringify({ errors }))
await browser.close()
