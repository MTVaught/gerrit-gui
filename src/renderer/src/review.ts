import type { ReviewDiff } from '../../shared/types.ts'

export interface ReviewContents {
  original: string
  modified: string
  originalLines: number
  modifiedLines: number
  rebaseChanges?: RebaseRange[]
}

export interface RebaseRange { pane: 'original' | 'modified'; start: number; end: number }

/** Reconstruct both complete files without allocating an object for each diff row. */
export function diffContents(diff: ReviewDiff): ReviewContents {
  const original: string[] = []
  const modified: string[] = []
  const rebaseChanges: RebaseRange[] = []
  for (const chunk of diff.content) {
    if (chunk.skip) throw new Error('The diff is missing file content')
    if (chunk.due_to_rebase && !chunk.ab) {
      if (chunk.a?.length) rebaseChanges.push({ pane: 'original', start: original.length + 1, end: original.length + chunk.a.length })
      if (chunk.b?.length) rebaseChanges.push({ pane: 'modified', start: modified.length + 1, end: modified.length + chunk.b.length })
    }
    // Avoid spreading a huge chunk into push: JS has an argument-count limit.
    for (const line of chunk.ab ?? chunk.a ?? []) original.push(line)
    for (const line of chunk.ab ?? chunk.b ?? []) modified.push(line)
  }
  return { original: original.join('\n'), modified: modified.join('\n'), originalLines: original.length, modifiedLines: modified.length,
    ...(rebaseChanges.length ? { rebaseChanges } : {}) }
}

/** Only tint edits still visible under the selected whitespace policy. */
export function visibleRebaseRanges(ranges: RebaseRange[], changes: { originalStartLineNumber: number; originalEndLineNumber: number; modifiedStartLineNumber: number; modifiedEndLineNumber: number }[]): RebaseRange[] {
  const visible: RebaseRange[] = []
  for (const pane of ['original', 'modified'] as const) {
    let index = 0
    for (const range of ranges.filter(range => range.pane === pane)) {
      while (index < changes.length && changes[index]![`${pane}EndLineNumber`] < range.start) index++
      for (let i = index; i < changes.length; i++) {
        const start = changes[i]![`${pane}StartLineNumber`]
        const end = changes[i]![`${pane}EndLineNumber`]
        if (start > range.end) break
        if (end >= range.start) visible.push({ pane, start: Math.max(start, range.start), end: Math.min(end, range.end) })
      }
    }
  }
  return visible
}

/** Match Monaco's bundled tokenizers, with plain text as the fallback. */
export function reviewLanguage(path: string): string {
  const name = path.toLowerCase().split('/').at(-1) ?? ''
  const extension = name.split('.').at(-1) ?? ''
  const languages: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp',
    cs: 'csharp', java: 'java', py: 'python', rs: 'rust', go: 'go',
    json: 'json', xml: 'xml', html: 'html', css: 'css', scss: 'scss',
    yaml: 'yaml', yml: 'yaml', sh: 'shell', bash: 'shell', sql: 'sql',
    md: 'markdown', toml: 'ini', ini: 'ini',
  }
  return name === 'dockerfile' ? 'dockerfile' : languages[extension] ?? 'plaintext'
}
