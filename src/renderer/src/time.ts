/** Gerrit timestamps are "YYYY-MM-DD HH:MM:SS.mmm" in UTC. */
export function parseGerritDate(s: string): Date {
  return new Date(s.replace(' ', 'T').replace(/\.\d+$/, '') + 'Z')
}

export function ago(s: string | Date, now = Date.now()): string {
  const t = s instanceof Date ? s.getTime() : parseGerritDate(s).getTime()
  const sec = Math.max(0, Math.round((now - t) / 1000))
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 48) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return `${Math.round(day / 30)}mo ago`
}
