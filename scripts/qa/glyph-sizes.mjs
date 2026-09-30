// Renders the colour ball/boot glyphs at real sizes in the browser (dev server on 5173): node scripts/qa/glyph-sizes.mjs <out.png>
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await b.newContext({ viewport: { width: 420, height: 200 }, deviceScaleFactor: 3 })).newPage()
await p.goto('http://localhost:5173/')
await p.waitForTimeout(1500)
await p.evaluate(async () => {
  const m = await import('/src/ui/components/Glyphs.tsx')
  const R0 = await import('/node_modules/.vite/deps/react.js'); const R = R0.default || R0
  const D0 = await import('/node_modules/.vite/deps/react-dom_client.js'); const D = D0.default || D0
  document.body.innerHTML = '<div id="t" style="display:flex;flex-direction:column;gap:0;color:#fff;font:600 12px sans-serif"></div>'
  const h = R.createElement
  const row = (bg, fg) => h('div', { style: { background: bg, color: fg, padding: '10px 14px', display: 'flex', gap: '12px', alignItems: 'center' } },
    h('span', null, 'Rice'), h(m.Ball, { size: 11 }), h(m.Ball, { size: 15 }), h(m.Boot, { size: 13 }), h(m.Boot, { size: 15 }), h(m.Boot, { size: 17 }), h(m.Boot, { size: 19 }), h(m.Boot, { size: 24 }), h(m.Boot, { size: 64 }))
  D.createRoot(document.getElementById('t')).render(h('div', null, row('#16191f', '#fff'), row('#252930', '#fff'), row('#e9edf1', '#111')))
})
await p.waitForTimeout(500)
await p.locator('#t').screenshot({ path: process.argv[2] })
await b.close()
