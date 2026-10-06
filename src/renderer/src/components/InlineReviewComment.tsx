import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CommentAnchor } from '../../../shared/types.ts'
export interface InlineCommentHost { element: HTMLElement; dispose(): void; reveal(): void }
export type CreateInlineCommentHost = (anchor: CommentAnchor) => InlineCommentHost | null
// The editor owns layout; React owns the thread and its draft state.
export function InlineReviewComment({ anchor, createHost, children, focus = false }: { anchor: CommentAnchor; createHost: CreateInlineCommentHost; children: React.ReactNode; focus?: boolean }) {
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
    host?.reveal()
    let frame = 0
    let attempts = 0
    function focusEditor() {
      const field = element!.querySelector<HTMLTextAreaElement>('textarea')
      if (field && field.getBoundingClientRect().height > 0) { field.focus({ preventScroll: true }); host?.reveal(); return }
      if (++attempts < 30) { host?.reveal(); frame = requestAnimationFrame(focusEditor) }
    }
    frame = requestAnimationFrame(focusEditor)
    return () => cancelAnimationFrame(frame)
  }, [element, focus])
  return element ? createPortal(children, element) : null
}
