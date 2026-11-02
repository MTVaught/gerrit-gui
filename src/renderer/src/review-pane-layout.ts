import type { editor } from 'monaco-editor/editor/editor.api'

// Monaco 0.57 has no public option for a modified-only diff. Keep its sash
// ratio and diff rendering, but let the original pane reach zero width.
// The packaged review-pane UI check covers this private layout contract.
const layouts = new WeakMap<editor.IStandaloneDiffEditor, (hidden: boolean) => void>()

export function hideOriginalPane(diff: editor.IStandaloneDiffEditor, hidden: boolean) {
  let apply = layouts.get(diff)
  if (!apply) {
    const sash = (diff as unknown as { _sashLayout: { _computeSashLeft: (...args: unknown[]) => number } })._sashLayout
    const compute = sash._computeSashLeft.bind(sash)
    let originalHidden = false
    let originalWrap = diff.getOriginalEditor().getRawOptions().wordWrap
    sash._computeSashLeft = (...args) => {
      const normal = compute(...args)
      return originalHidden ? 0 : normal
    }
    apply = value => {
      const code = diff.getOriginalEditor()
      if (value) {
        const wrap = code.getRawOptions().wordWrap
        if (wrap !== 'off') originalWrap = wrap
        // A zero-width source must not wrap and add blank alignment rows.
        code.updateOptions({ wordWrap: 'off' })
      } else if (originalHidden) code.updateOptions({ wordWrap: originalWrap })
      originalHidden = value
      // Invalidate the layout without replacing the retained sash ratio.
      diff.updateOptions({ enableSplitViewResizing: !value })
      const original = diff.getOriginalEditor().getDomNode()!
      original.inert = value
      if (value) original.setAttribute('aria-hidden', 'true')
      else original.removeAttribute('aria-hidden')
      diff.getContainerDomNode().classList.toggle('review-original-hidden', value)
    }
    layouts.set(diff, apply)
  }
  apply(hidden)
}
