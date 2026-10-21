import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CommentAnchor } from '../../../shared/types.ts'
export interface InlineCommentHost { element: HTMLElement; dispose(): void; reveal(preserveScroll?: boolean): void }
export type CreateInlineCommentHost = (anchor: CommentAnchor) => InlineCommentHost | null
// The editor owns layout; React owns the thread and its draft state.
export function InlineReviewComment({ anchor, createHost, children, focus = false, preserveScroll = false }: { anchor: CommentAnchor; createHost: CreateInlineCommentHost; children: React.ReactNode; focus?: boolean; preserveScroll?: boolean }) {
  const [host, setHost] = useState<InlineCommentHost | null>(null)
  const [element, setElement] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const host = createHost(anchor)
    setHost(host)
    setElement(host?.element ?? null)
    return () => host?.dispose()
  }, [createHost, anchor.patchSet, anchor.path, anchor.side, anchor.line, anchor.range?.end_line])
  useLayoutEffect(() => {
    if (!focus || !element) return
    // Monaco hides offscreen view zones. Reveal before focusing, then wait for
    // its render so a newly opened editor can receive focus.
    host?.reveal(preserveScroll)
    let frame = 0
    let attempts = 0
    let settled = 0
    let focused = false
    function focusEditor() {
      const field = element!.querySelector<HTMLTextAreaElement>('textarea')
      if (field && field.getBoundingClientRect().height > 0) {
        // Once focus is established, respect an explicit move to another
        // control, such as the editor's Go to line widget.
        if (focused && document.activeElement !== field && !document.activeElement?.matches('.monaco-editor textarea.inputarea')) return
        field.focus({ preventScroll: true }); host?.reveal(preserveScroll)
        focused = true
        if (++settled >= 3 && attempts >= 30) return
      } else settled = 0
      // Large diffs can lay out again after the view zone first appears.
      // Keep the initial reveal active until focus survives that layout.
      if (++attempts < 120) { host?.reveal(preserveScroll); frame = requestAnimationFrame(focusEditor) }
    }
    frame = requestAnimationFrame(focusEditor)
    return () => cancelAnimationFrame(frame)
  }, [host, element, focus, preserveScroll])
  return element ? createPortal(children, element) : null
}
