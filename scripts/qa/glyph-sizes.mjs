// Renders the colour ball/boot glyphs at real sizes in the browser (dev server on 5173): node scripts/qa/glyph-sizes.mjs <out.png>
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await b.newContext({ viewport: { width: 300, height: 80 }, deviceScaleFactor: 2 })).newPage()
await p.goto('http://localhost:5173/')
await p.waitForTimeout(1500)
await p.evaluate(async () => {
  const m = await import('/src/ui/components/Glyphs.tsx')
  const R0 = await import('/node_modules/.vite/deps/react.js'); const R = R0.default || R0
  const D0 = await import('/node_modules/.vite/deps/react-dom_client.js'); const D = D0.default || D0
  document.body.innerHTML = '<div id="t" style="background:#1c2027;padding:16px;display:flex;gap:14px;align-items:center;color:#fff;font:600 12px sans-serif"></div>'
  const h = R.createElement
  D.createRoot(document.getElementById('t')).render(h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
    h('span', null, 'Sadiq 45+2\''), h(m.Ball, { size: 10 }), h(m.Ball, { size: 11 }), h(m.Ball, { size: 12 }), h(m.Ball, { size: 13 }), h(m.Ball, { size: 16 }), h(m.Boot, { size: 13 }), h(m.Boot, { size: 14 })))
})
await p.waitForTimeout(500)
await p.locator('#t').screenshot({ path: process.argv[2] })
await b.close()
