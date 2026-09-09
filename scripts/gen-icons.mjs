// Generates the app and tray icons as PNGs with no image dependencies.
// Shape: rounded square with a check mark. Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size)
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}
// Signed distance helpers (in unit coordinates 0..1).
const roundedSquare = (u, v, r) => {
  const qx = Math.abs(u - 0.5) - (0.5 - r), qy = Math.abs(v - 0.5) - (0.5 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
const segment = (u, v, ax, ay, bx, by) => {
  const px = u - ax, py = v - ay, dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - dx * t, py - dy * t)
}
const check = (u, v) => Math.min(segment(u, v, 0.27, 0.52, 0.44, 0.69), segment(u, v, 0.44, 0.69, 0.75, 0.33)) - 0.075
const aa = (d, size) => Math.max(0, Math.min(1, 0.5 - d * size)) // 1px anti-alias

function appIcon(x, y, size) {
  const u = x / size, v = y / size
  const body = aa(roundedSquare(u, v, 0.2), size)
  const mark = aa(check(u, v), size)
  // blue body, white check
  const r = 37 + (255 - 37) * mark, g = 99 + (255 - 99) * mark, b = 235 + (255 - 235) * mark
  return [r, g, b, Math.round(255 * body)]
}
function trayTemplate(x, y, size) {
  // macOS template: black with alpha only. Square outline with check cut in.
  const u = x / size, v = y / size
  const outer = aa(roundedSquare(u, v, 0.22), size)
  const inner = aa(roundedSquare(u, v, 0.22) + 0.11, size)
  const mark = aa(check(u, v), size)
  const a = Math.max(outer - inner, mark)
  return [0, 0, 0, Math.round(255 * a)]
}
mkdirSync('resources', { recursive: true })
writeFileSync('resources/icon.png', png(512, appIcon))
writeFileSync('resources/tray.png', png(32, appIcon))
writeFileSync('resources/trayTemplate.png', png(22, trayTemplate))
writeFileSync('resources/trayTemplate@2x.png', png(44, trayTemplate))
console.log('icons written')
