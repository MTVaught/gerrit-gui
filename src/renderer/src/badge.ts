/**
 * Draws the tray / taskbar-overlay icon with the needs-review count baked in.
 * Used on Windows and Linux, where tray icons cannot show text beside them.
 * Matches the generated app icon: blue rounded square, white check.
 */
export function renderBadgeIcon(count: number, size = 32): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const r = size * 0.2
  ctx.fillStyle = '#2563eb'
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, r)
  ctx.fill()

  if (count <= 0) {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = size * 0.15
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(size * 0.27, size * 0.52)
    ctx.lineTo(size * 0.44, size * 0.69)
    ctx.lineTo(size * 0.75, size * 0.33)
    ctx.stroke()
  } else {
    const text = count > 99 ? '99+' : String(count)
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${text.length > 2 ? size * 0.5 : size * 0.68}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, size / 2, size / 2 + size * 0.04)
  }
  return canvas.toDataURL('image/png')
}
