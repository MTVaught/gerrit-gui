import type { ChangeInfo } from './types.ts'

/** One `Key: value` line from the footer of a commit message. */
export interface Trailer {
  key: string
  value: string
}

/**
 * Trailers Gerrit or git add to every commit; they say nothing about the
 * change, so the button does not count them and the popover fades them.
 */
export const NOISE_TRAILERS: ReadonlySet<string> = new Set(['Change-Id', 'Signed-off-by'])

/** The message of the current patch set's commit, when it was fetched (CURRENT_COMMIT). */
export function commitMessage(change: ChangeInfo): string | undefined {
  const rev = change.current_revision ? change.revisions?.[change.current_revision] : undefined
  return rev?.commit?.message
}

const TRAILER = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/

/**
 * The trailers of a commit message: the `Key: value` lines of its last
 * paragraph, as git interpret-trailers reads them. A paragraph counts only
 * when every line is a trailer or a continuation of one (indented), so a
 * body paragraph that happens to end with "Note: ..." is left alone. The
 * subject alone is never a footer.
 */
export function parseTrailers(message: string): Trailer[] {
  const paragraphs = message.replace(/\r\n/g, '\n').trimEnd().split(/\n[ \t]*\n/)
  if (paragraphs.length < 2) return []
  const lines = paragraphs[paragraphs.length - 1]!.split('\n')
  const out: Trailer[] = []
  for (const line of lines) {
    const m = TRAILER.exec(line)
    if (m) {
      out.push({ key: m[1]!, value: m[2]!.trim() })
    } else if (/^[ \t]/.test(line) && out.length > 0) {
      out[out.length - 1]!.value += ' ' + line.trim()
    } else {
      return []
    }
  }
  return out
}

/** The body of the message: everything between the subject and the trailers. */
export function messageBody(message: string): string {
  const paragraphs = message.replace(/\r\n/g, '\n').trimEnd().split(/\n[ \t]*\n/)
  const hasFooter = parseTrailers(message).length > 0
  return paragraphs.slice(1, hasFooter ? -1 : undefined).join('\n\n').trim()
}

/** The trailers worth showing: everything but the noise. */
export function shownTrailers(trailers: Trailer[]): Trailer[] {
  return trailers.filter((t) => !NOISE_TRAILERS.has(t.key))
}
