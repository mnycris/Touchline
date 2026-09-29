// Renders icons large for visual review: npx tsx --tsconfig tsconfig.app.json scripts/qa/icons.tsx <out.png> name1 name2 ...
// A name prefixed with "ball:" renders the colour Ball at that pixel size (e.g. ball:10), "boot:" the assist boot.
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { Icon } from '../../src/ui/icons/Icon'
import { Ball, Boot } from '../../src/ui/components/Glyphs'

const [out, ...names] = process.argv.slice(2)
const cell = 120
const svgs = names.map((n, i) => {
  const [kind, arg] = n.split(':')
  const px = Number(arg) || 96
  const el = kind === 'ball' ? h(Ball, { size: px }) : kind === 'boot' ? h(Boot, { size: px }) : h(Icon, { name: n, size: 96, color: '#e9edf1' })
  const inner = renderToStaticMarkup(el)
  // small colour icons are drawn at their real size and then scaled up, so the preview shows what the phone shows
  const scale = kind === 'ball' || kind === 'boot' ? 96 / px : 1
  return `<g transform="translate(${i * cell + 12},12) scale(${scale})">${inner}</g><text x="${i * cell + 60}" y="${cell + 8}" fill="#8a94a3" font-size="13" font-family="sans-serif" text-anchor="middle">${n}</text>`
})
const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${names.length * cell}" height="${cell + 20}"><rect width="100%" height="100%" fill="#131820"/>${svgs.join('')}</svg>`
await sharp(Buffer.from(doc)).png().toFile(out)
console.log('ok')
