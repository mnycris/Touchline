// Tile screenshots into one grid image at their own aspect ratio. node scripts/qa/grid.mjs <dir> <out.png> [cols] [filter] [cellWidth]
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
const [dir, out, colsArg, filter, cw] = process.argv.slice(2)
const cols = Number(colsArg || 4), W = Number(cw || 300)
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && (!filter || f.includes(filter))).sort()
const meta = await sharp(path.join(dir, files[0])).metadata()
const H = Math.round((W * meta.height) / meta.width)
const rows = Math.ceil(files.length / cols)
const comps = await Promise.all(files.map(async (f, k) => ({ input: await sharp(path.join(dir, f)).resize(W, H, { fit: 'contain', background: '#000' }).png().toBuffer(), left: (k % cols) * (W + 4), top: Math.floor(k / cols) * (H + 4) })))
await sharp({ create: { width: cols * (W + 4), height: rows * (H + 4), channels: 3, background: '#333' } }).composite(comps).png().toFile(out)
console.log('ok', files.length)
