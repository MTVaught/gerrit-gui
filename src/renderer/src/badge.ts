import type { ActionCounts } from '../../shared/types.ts'
import { ACTION_CATEGORIES } from '../../shared/model.ts'

const ICON_BLUE = '#2563eb'

/** The app icon: blue rounded square, white check. Coordinates in the caller's units. */
function drawIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = ICON_BLUE
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, size * 0.2)
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = size * 0.15
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x + size * 0.27, y + size * 0.52)
  ctx.lineTo(x + size * 0.44, y + size * 0.69)
  ctx.lineTo(x + size * 0.75, y + size * 0.33)
  ctx.stroke()
}

/**
 * Draws the tray / taskbar-overlay icon with the total count baked in.
 * Used on Windows and Linux, where tray icons cannot show text beside them.
 */
export function renderBadgeIcon(count: number, size = 32): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  if (count <= 0) {
    drawIcon(ctx, 0, 0, size)
  } else {
    ctx.fillStyle = ICON_BLUE
    ctx.beginPath()
    ctx.roundRect(0, 0, size, size, size * 0.2)
    ctx.fill()
    const text = count > 99 ? '99+' : String(count)
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${text.length > 2 ? size * 0.5 : size * 0.68}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, size / 2, size / 2 + size * 0.04)
  }
  return canvas.toDataURL('image/png')
}

// macOS menu bar strip geometry, in points.
const STRIP_H = 22
const STRIP_ICON = 16
const PILL_H = 16
const PILL_MIN_W = 22
const GAP = 4
const SCALE = 2

/**
 * Draws the macOS menu bar item for the color badge style: the app icon
 * followed by one colored pill per category that has something pending, in
 * the fixed category order. Rendered at 2x for Retina; the main process adds
 * the 1x representation. Returns null when nothing is pending, so the tray
 * can fall back to the plain template icon.
 */
export function renderTrayStrip(counts: ActionCounts): { dataUrl: string; width: number; height: number } | null {
  const active = ACTION_CATEGORIES.filter((k) => counts[k.id] > 0)
  if (active.length === 0) return null

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = 'bold 11px system-ui, -apple-system, sans-serif'
  ctx.font = font
  const pills = active.map((k) => {
    const text = counts[k.id] > 99 ? '99+' : String(counts[k.id])
    return { color: k.color, text, w: Math.max(PILL_MIN_W, Math.ceil(ctx.measureText(text).width) + 12) }
  })
  const width = STRIP_ICON + pills.reduce((sum, p) => sum + GAP + p.w, 0)

  canvas.width = width * SCALE
  canvas.height = STRIP_H * SCALE
  ctx.scale(SCALE, SCALE) // resizing reset the context; draw in points from here on
  drawIcon(ctx, 0, (STRIP_H - STRIP_ICON) / 2, STRIP_ICON)

  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let x = STRIP_ICON
  for (const p of pills) {
    x += GAP
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.roundRect(x, (STRIP_H - PILL_H) / 2, p.w, PILL_H, PILL_H / 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(p.text, x + p.w / 2, STRIP_H / 2 + 0.5)
    x += p.w
  }
  return { dataUrl: canvas.toDataURL('image/png'), width, height: STRIP_H }
}
