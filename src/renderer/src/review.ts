import type { ReviewDiff } from '../../shared/types.ts'

export interface ReviewContents {
  original: string
  modified: string
  originalLines: number
  modifiedLines: number
}

/** Reconstruct both complete files without allocating an object for each diff row. */
export function diffContents(diff: ReviewDiff): ReviewContents {
  const original: string[] = []
  const modified: string[] = []
  for (const chunk of diff.content) {
    if (chunk.skip) throw new Error('The diff is missing file content')
    // Avoid spreading a huge chunk into push: JS has an argument-count limit.
    for (const line of chunk.ab ?? chunk.a ?? []) original.push(line)
    for (const line of chunk.ab ?? chunk.b ?? []) modified.push(line)
  }
  return { original: original.join('\n'), modified: modified.join('\n'), originalLines: original.length, modifiedLines: modified.length }
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
