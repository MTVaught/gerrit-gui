/** Gerrit 3.11 bindings: https://gerrit.googlesource.com/gerrit/+/refs/heads/stable-3.11/polygerrit-ui/app/services/shortcuts/shortcuts-config.ts */
export type ReviewShortcut = 'blame' | 'preferences' | 'toggleReviewed' | 'nextUnreviewed' | 'review' | 'toggleComments' | 'nextThread' | 'previousThread' | 'comment' | 'nextLine' | 'previousLine' | 'visibleLine' | 'nextChunk' | 'previousChunk' | 'nextFile' | 'previousFile' | 'leftPane' | 'rightPane' | 'fileList' | 'nextFileCursor' | 'previousFileCursor' | 'openFile' | 'toggleMode' | 'up' | 'help'

export const REVIEW_SHORTCUT_HELP = [
  ['j / Down', 'Next line; next file entry while the file list is focused'],
  ['k / Up', 'Previous line; previous file entry while the file list is focused'],
  ['a', 'Open the review and vote dialog'],
  ['Shift+N / Shift+P', 'Next / previous comment thread'],
  ['h', 'Show / hide inline comments'],
  ['Ctrl+Enter / Cmd+Enter / Ctrl+S / Cmd+S', 'Save the comment being edited'],
  ['c', 'Comment on the selected line or range'],
  ['n / p', 'Next / previous diff chunk'],
  ['] / [', 'Next / previous file'],
  ['Shift+Left / Shift+Right', 'Select the left / right pane'],
  ['.', 'Move the cursor to visible code'],
  ['f', 'Focus the file list'],
  ['o / Enter', 'Open the focused file entry'],
  ['b', 'Show / hide blame'],
  [',', 'Open diff preferences'],
  ['r', 'Mark / unmark the current file as reviewed'],
  ['Shift+M', 'Mark reviewed and open the next unreviewed file'],
  ['m', 'Toggle unified / side-by-side diff'],
  ['u', 'Return to the dashboard'],
  ['?', 'Show keyboard shortcuts'],
] as const

export interface ReviewKey {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  isComposing?: boolean
  repeat?: boolean
}

export function reviewShortcut(event: ReviewKey, context: { textEntry?: boolean; fileList?: boolean } = {}): ReviewShortcut | null {
  if (context.textEntry || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return null
  const { key } = event
  if (event.shiftKey && !['?', 'ArrowLeft', 'ArrowRight', 'N', 'P', 'M'].includes(key)) return null
  if (event.repeat && !['j', 'k', 'ArrowDown', 'ArrowUp'].includes(key)) return null
  if (event.shiftKey && key === 'ArrowLeft') return 'leftPane'
  if (event.shiftKey && key === 'ArrowRight') return 'rightPane'
  if (key === 'j' || key === 'ArrowDown') return context.fileList ? 'nextFileCursor' : 'nextLine'
  if (key === 'k' || key === 'ArrowUp') return context.fileList ? 'previousFileCursor' : 'previousLine'
  if (context.fileList && (key === 'o' || key === 'Enter')) return 'openFile'
  const bindings: Record<string, ReviewShortcut> = { b: 'blame', ',': 'preferences', r: 'toggleReviewed', M: 'nextUnreviewed', a: 'review', h: 'toggleComments', N: 'nextThread', P: 'previousThread', c: 'comment', n: 'nextChunk', p: 'previousChunk', ']': 'nextFile', '[': 'previousFile', '.': 'visibleLine', f: 'fileList', m: 'toggleMode', u: 'up', '?': 'help' }
  return bindings[key] ?? null
}
