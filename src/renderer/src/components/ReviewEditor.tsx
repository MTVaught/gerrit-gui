import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import * as monaco from 'monaco-editor/editor/editor.api'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import 'monaco-editor/editor/browser/coreCommands'
import 'monaco-editor/editor/contrib/find/browser/findController'
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter'
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution'
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching'
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu'
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess'
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess'
import 'monaco-editor/languages/definitions/typescript/register'
import 'monaco-editor/languages/definitions/javascript/register'
import 'monaco-editor/languages/definitions/cpp/register'
import 'monaco-editor/languages/definitions/csharp/register'
import 'monaco-editor/languages/definitions/java/register'
import 'monaco-editor/languages/definitions/python/register'
import 'monaco-editor/languages/definitions/rust/register'
import 'monaco-editor/languages/definitions/go/register'
import { jsonDefaults } from 'monaco-editor/languages/features/json/register'
import 'monaco-editor/languages/definitions/xml/register'
import 'monaco-editor/languages/definitions/html/register'
import 'monaco-editor/languages/definitions/css/register'
import 'monaco-editor/languages/definitions/scss/register'
import 'monaco-editor/languages/definitions/yaml/register'
import 'monaco-editor/languages/definitions/shell/register'
import 'monaco-editor/languages/definitions/sql/register'
import 'monaco-editor/languages/definitions/markdown/register'
import 'monaco-editor/languages/definitions/ini/register'
import 'monaco-editor/languages/definitions/dockerfile/register'
import type { InlineCommentHost } from './InlineReviewComment.tsx'
import type { CommentRange } from '../../../shared/types.ts'
import type { ReviewShortcut } from '../review-shortcuts.ts'
import { reviewLanguage, type ReviewContents } from '../review.ts'
import type { ReviewPreferences } from '../review-preferences.ts'
import { reviewDiffFactory, configureReviewDiff } from '../review-diff-provider.ts'
import { StandaloneServices } from 'monaco-editor/editor/standalone/browser/standaloneServices'

// Bundle the worker with the app. No CDN, server-side completion or source uploads.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
jsonDefaults.setModeConfiguration({ tokens: true })
StandaloneServices.initialize({ diffProviderFactoryService: reviewDiffFactory })

const inlineZoneAria = new WeakMap<HTMLElement, string | null>()
function exposeInlineZone(node: HTMLElement) {
  const parent = node.parentElement
  if (!parent) return () => undefined
  if (!inlineZoneAria.has(parent)) inlineZoneAria.set(parent, parent.getAttribute('aria-hidden'))
  parent.removeAttribute('aria-hidden')
  return () => {
    if (parent.querySelector('.review-inline-zone')) return
    const previous = inlineZoneAria.get(parent)
    if (previous == null) parent.removeAttribute('aria-hidden'); else parent.setAttribute('aria-hidden', previous)
    inlineZoneAria.delete(parent)
  }
}

export interface LoadedReviewFile extends ReviewContents {
  comparison: string
  path: string
  loadMs: number
  prepareMs: number
  nameA: string
  nameB: string
  viewState?: monaco.editor.IDiffEditorViewState | null
}

export interface ReviewEditorHandle { createInlineHost(pane: 'original' | 'modified', line: number): InlineCommentHost | null; navigate(shortcut: ReviewShortcut): void; addComment(): void; revealComment(pane: 'original' | 'modified', line: number): void }
export interface EditorCommentLocation { pane: 'original' | 'modified'; line: number; range?: CommentRange; existing?: boolean }

export default function ReviewEditor({ file, preferences, onReady, onComment, markers, ref }: { markers: { pane: 'original' | 'modified'; line: number; draft: boolean; unresolved: boolean }[]; onComment: (location: EditorCommentLocation) => void; file: LoadedReviewFile; preferences: ReviewPreferences; onReady: () => void; ref?: Ref<ReviewEditorHandle> }) {
  const commentCallback = useRef(onComment)
  commentCallback.current = onComment
  const container = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const inlineLayouts = useRef(new Set<() => void>())
  const sideBySide = useRef(true)
  const [unified, setUnified] = useState(false)
  const lastFocus = useRef<'original' | 'modified'>('modified')
  const [readyMs, setReadyMs] = useState<number | null>(null)
  const [diffMs, setDiffMs] = useState<number | null>(null)
  useEffect(() => {
    const start = performance.now()
    const language = reviewLanguage(file.path)
    const original = monaco.editor.createModel(file.original, language)
    const modified = monaco.editor.createModel(file.modified, language)
    const appearance = matchMedia('(prefers-color-scheme: dark)')
    const setTheme = () => monaco.editor.setTheme(appearance.matches ? 'vs-dark' : 'vs')
    setTheme()
    appearance.addEventListener('change', setTheme)
    configureReviewDiff(original, preferences.ignoreWhitespace)
    const diff = monaco.editor.createDiffEditor(container.current!, {
      automaticLayout: true,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: false,
      hideUnchangedRegions: { enabled: false },
      folding: false,
      glyphMargin: true,
      minimap: { enabled: false },
      stickyScroll: { enabled: false },
      scrollBeyondLastLine: false,
      smoothScrolling: false,
      mouseWheelScrollSensitivity: 1,
      scrollbar: { vertical: 'visible', horizontal: 'visible', useShadows: false },
      ignoreTrimWhitespace: false,
      diffAlgorithm: 'advanced',
      maxFileSize: 0,
      maxComputationTime: 10000,
      fontSize: 13,
      lineHeight: 22,
      wordWrap: 'off',
      renderWhitespace: 'selection',
      renderMarginRevertIcon: false,
      contextmenu: true,
      selectionHighlight: true,
      occurrencesHighlight: 'singleFile',
      ariaLabel: 'Full file review comparison',
    })
    editor.current = diff
    const originalFocus = diff.getOriginalEditor().onDidFocusEditorText(() => { lastFocus.current = 'original' })
    const modifiedFocus = diff.getModifiedEditor().onDidFocusEditorText(() => { lastFocus.current = 'modified' })
    const commentActions = [diff.getOriginalEditor(), diff.getModifiedEditor()].flatMap((code, index) => [
      code.addAction({ id: 'review.addComment', label: 'Add review comment', contextMenuGroupId: 'navigation', contextMenuOrder: 0, run: () => {
        lastFocus.current = index === 0 ? 'original' : 'modified'
        const selection = code.getSelection()
        if (selection) commentCallback.current({ pane: lastFocus.current, line: selection.endLineNumber, range: selection.isEmpty() ? undefined : { start_line: selection.startLineNumber, start_character: selection.startColumn - 1, end_line: selection.endLineNumber, end_character: selection.endColumn - 1 } })
      } }),
      code.onMouseDown(event => {
        if (![monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN, monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS].includes(event.target.type) || !event.target.position) return
        lastFocus.current = index === 0 ? 'original' : 'modified'
        code.setPosition(event.target.position)
        commentCallback.current({ pane: lastFocus.current, line: event.target.position.lineNumber, existing: true })
      }),
    ])
    const updated = diff.onDidUpdateDiff(() => setDiffMs(performance.now() - start))
    diff.setModel({ original, modified })
    if (file.viewState) diff.restoreViewState(file.viewState)
    diff.getModifiedEditor().focus()
    const frame = requestAnimationFrame(() => { setReadyMs(performance.now() - start); onReady() })
    return () => {
      commentActions.forEach(action => action.dispose())
      file.viewState = diff.saveViewState()
      cancelAnimationFrame(frame)
      updated.dispose()
      originalFocus.dispose()
      modifiedFocus.dispose()
      appearance.removeEventListener('change', setTheme)
      editor.current = null
      diff.dispose()
      original.dispose()
      modified.dispose()
    }
  }, [file])

  useEffect(() => {
    const diff = editor.current
    if (!diff) return
    configureReviewDiff(diff.getOriginalEditor().getModel()!, preferences.ignoreWhitespace)
    diff.updateOptions({
      fontSize: preferences.fontSize, lineHeight: Math.round(preferences.fontSize * 1.65),
      wordWrap: 'wordWrapColumn', wordWrapColumn: preferences.diffWidth,
      diffWordWrap: 'inherit',
      renderWhitespace: preferences.showTrailingWhitespace ? 'trailing' : 'none',
      hideUnchangedRegions: { enabled: preferences.context !== -1, contextLineCount: Math.max(0, preferences.context), minimumLineCount: 1, revealLineCount: 20 },
    })
    for (const code of [diff.getOriginalEditor(), diff.getModifiedEditor()]) {
      const model = code.getModel()!
      model.updateOptions({ tabSize: preferences.tabWidth })
      monaco.editor.setModelLanguage(model, preferences.syntaxHighlighting ? reviewLanguage(file.path) : 'plaintext')
    }
    // Use the same wrap column for both panes. Independent viewport wrapping
    // can create a spacer for every line when pane widths straddle a wrap point.
    let wrapFrame = 0
    let wrapColumn = preferences.diffWidth
    function fitColumns() {
      wrapFrame = 0
      if (!preferences.fitToScreen) return
      const panes = sideBySide.current ? [diff!.getOriginalEditor(), diff!.getModifiedEditor()] : [diff!.getModifiedEditor()]
      const column = Math.max(1, Math.min(...panes.map((code) => Math.floor(code.getLayoutInfo().contentWidth / code.getOption(monaco.editor.EditorOption.fontInfo).typicalHalfwidthCharacterWidth))) - 1)
      if (column !== wrapColumn) { wrapColumn = column; diff!.updateOptions({ wordWrapColumn: column }) }
    }
    function scheduleFit() { if (!wrapFrame) wrapFrame = requestAnimationFrame(fitColumns) }
    fitColumns()
    // Decorate visible tabs only. No DOM or decoration allocation per full-file line.
    const disposables = [diff.getOriginalEditor(), diff.getModifiedEditor()].flatMap((code) => {
      const decorations = code.createDecorationsCollection()
      let lastTabs = ''
      function updateTabs() {
        const tabs: monaco.editor.IModelDeltaDecoration[] = []
        if (preferences.showTabs) {
          for (const range of code.getVisibleRanges()) {
            for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
              const text = code.getModel()!.getLineContent(line)
              for (let index = text.indexOf('\t'); index !== -1; index = text.indexOf('\t', index + 1)) {
                tabs.push({ range: new monaco.Range(line, index + 1, line, index + 2), options: { inlineClassName: 'review-visible-tab' } })
              }
            }
          }
        }
        const signature = tabs.map((tab) => `${tab.range.startLineNumber}:${tab.range.startColumn}`).join(',')
        if (signature !== lastTabs) { lastTabs = signature; decorations.set(tabs) }
      }
      updateTabs()
      return [code.onDidScrollChange(event => { updateTabs(); if (preferences.fitToScreen && event.scrollLeft !== 0) code.setScrollLeft(0) }), code.onDidLayoutChange(() => { updateTabs(); scheduleFit() }), { dispose: () => decorations.clear() }]
    })
    return () => { cancelAnimationFrame(wrapFrame); disposables.forEach((d) => d.dispose()) }
  }, [preferences, file])
  useEffect(() => {
    const diff = editor.current
    if (!diff) return
    const collections = [diff.getOriginalEditor(), diff.getModifiedEditor()].map((code, index) => code.createDecorationsCollection(markers.filter(m => m.pane === (index === 0 ? 'original' : 'modified')).map(m => ({
      range: new monaco.Range(m.line, 1, m.line, 1), options: { glyphMarginClassName: m.draft ? 'review-glyph-draft' : 'review-glyph-comment', glyphMarginHoverMessage: { value: m.draft ? 'Draft comment' : m.unresolved ? 'Unresolved comment' : 'Comment' } },
    }))))
    return () => collections.forEach(collection => collection.clear())
  }, [file, markers])
  function focusedEditor() {
    const diff = editor.current
    return lastFocus.current === 'original' ? diff?.getOriginalEditor() : diff?.getModifiedEditor()
  }
  function navigateChunk(direction: 'next' | 'previous') {
    const code = focusedEditor()
    if (!code) return
    const position = code.getPosition()?.lineNumber ?? 1
    const lines = (editor.current?.getLineChanges() ?? []).map((change) => lastFocus.current === 'original'
      ? change.originalStartLineNumber : change.modifiedStartLineNumber)
    const line = direction === 'next' ? lines.find((line) => line > position) ?? lines[0]
      : [...lines].reverse().find((line) => line < position) ?? lines.at(-1)
    if (line === undefined) return
    code.setPosition({ lineNumber: Math.max(1, line), column: 1 })
    code.revealPositionInCenterIfOutsideViewport(code.getPosition()!)
    code.focus()
  }
  function addComment() {
    const selection = focusedEditor()?.getSelection()
    if (!selection) return
    onComment({ pane: lastFocus.current, line: selection.endLineNumber, range: selection.isEmpty() ? undefined : { start_line: selection.startLineNumber, start_character: selection.startColumn - 1, end_line: selection.endLineNumber, end_character: selection.endColumn - 1 } })
  }
  useImperativeHandle(ref, () => ({ createInlineHost(pane, line) {
    const diff = editor.current
    if (!diff) return null
    const node = document.createElement('div')
    node.className = 'review-inline-zone'
    node.setAttribute('role', 'region')
    node.setAttribute('aria-label', `${pane === 'original' ? 'Original' : 'Modified'} ${line === 0 ? 'file comments' : `comments after line ${line}`}`)
    const content = document.createElement('div')
    content.className = 'review-inline-content'
    node.append(content)
    node.addEventListener('mousedown', event => event.stopPropagation())
    let code: monaco.editor.IStandaloneCodeEditor | null = null
    let zoneId = ''
    let restoreAria = () => undefined as void
    let height = 1
    let disposed = false
    const zone: monaco.editor.IViewZone = { afterLineNumber: line, heightInPx: height, domNode: node, showInHiddenAreas: true }
    function layout() {
      if (disposed || editor.current !== diff) return
      const target = pane === 'original' && sideBySide.current ? diff!.getOriginalEditor() : diff!.getModifiedEditor()
      let afterLine = line
      if (pane === 'original' && !sideBySide.current && line > 0) {
        let offset = 0
        for (const change of diff!.getLineChanges() ?? []) {
          if (line < change.originalStartLineNumber) break
          if (change.originalEndLineNumber && line <= change.originalEndLineNumber) { afterLine = change.modifiedEndLineNumber || change.modifiedStartLineNumber; offset = 0; break }
          offset = (change.modifiedEndLineNumber || change.modifiedStartLineNumber) - (change.originalEndLineNumber || change.originalStartLineNumber)
        }
        afterLine += offset
      }
      zone.afterLineNumber = Math.max(0, Math.min(target.getModel()!.getLineCount(), afterLine))
      if (code !== target) {
        if (code && zoneId) code.changeViewZones(accessor => accessor.removeZone(zoneId))
        restoreAria()
        code = target
        code.changeViewZones(accessor => { zoneId = accessor.addZone(zone) })
        restoreAria = exposeInlineZone(node)
      } else code.changeViewZones(accessor => accessor.layoutZone(zoneId))
    }
    inlineLayouts.current.add(layout)
    layout()
    function reveal() { if (code && editor.current === diff) code.setScrollTop(zone.afterLineNumber === 0 ? 0 : Math.max(0, code.getBottomForLineNumber(zone.afterLineNumber) - 50)) }
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const measured = Math.max(1, Math.ceil(content.getBoundingClientRect().height))
        if (measured > 0 && measured !== height) { height = measured; zone.heightInPx = height; layout(); if (content.contains(document.activeElement)) reveal() }
      })
    })
    observer.observe(content)
    return { element: content, reveal, dispose() {
      disposed = true; observer.disconnect(); cancelAnimationFrame(frame); inlineLayouts.current.delete(layout)
      if (editor.current === diff && code && zoneId) code.changeViewZones(accessor => accessor.removeZone(zoneId))
      restoreAria()
    } }
  }, addComment, revealComment(pane, line) {
    const code = pane === 'original' ? editor.current?.getOriginalEditor() : editor.current?.getModifiedEditor()
    code?.setPosition({ lineNumber: line, column: 1 }); code?.revealLineInCenter(line); code?.focus()
  }, navigate(shortcut) {
    const diff = editor.current
    const code = focusedEditor()
    if (!diff || !code) return
    switch (shortcut) {
      case 'nextLine': case 'previousLine':
        code.focus()
        code.trigger('gerrit-review', shortcut === 'nextLine' ? 'cursorDown' : 'cursorUp', {})
        break
      case 'nextChunk': case 'previousChunk':
        code.focus()
        navigateChunk(shortcut === 'nextChunk' ? 'next' : 'previous')
        break
      case 'visibleLine': {
        const lineNumber = code.getVisibleRanges()[0]?.startLineNumber
        if (lineNumber !== undefined) {
          code.setPosition({ lineNumber, column: 1 })
          code.focus()
        }
        break
      }
      case 'leftPane': case 'rightPane': {
        // Map the cursor through the diff, rather than assuming line numbers align.
        const position = code.getPosition()
        const target = shortcut === 'leftPane' ? diff.getOriginalEditor() : diff.getModifiedEditor()
        if (target === code) { target.focus(); break }
        if (!sideBySide.current) { sideBySide.current = true; setUnified(false); diff.updateOptions({ renderSideBySide: true }); inlineLayouts.current.forEach(layout => layout()) }
        if (position) {
          const fromOriginal = lastFocus.current === 'original'
          let line = position.lineNumber
          let offset = 0
          for (const change of diff.getLineChanges() ?? []) {
            const start = fromOriginal ? change.originalStartLineNumber : change.modifiedStartLineNumber
            const end = fromOriginal ? change.originalEndLineNumber : change.modifiedEndLineNumber
            const otherStart = fromOriginal ? change.modifiedStartLineNumber : change.originalStartLineNumber
            const otherEnd = fromOriginal ? change.modifiedEndLineNumber : change.originalEndLineNumber
            if (line < start || end === 0 && line === start) break
            if (end !== 0 && line <= end) {
              line = otherEnd === 0 ? Math.max(1, otherStart) : Math.min(otherEnd, otherStart + line - start)
              offset = 0
              break
            }
            offset = (otherEnd || otherStart) - (end || start)
          }
          target.setPosition({ lineNumber: Math.max(1, line + offset), column: position.column })
          target.revealPositionInCenterIfOutsideViewport(target.getPosition()!)
        }
        target.focus()
        break
      }
      case 'toggleMode':
        sideBySide.current = !sideBySide.current
        setUnified(!sideBySide.current)
        diff.updateOptions({ renderSideBySide: sideBySide.current })
        inlineLayouts.current.forEach(layout => layout())
        if (!sideBySide.current) diff.getModifiedEditor().focus()
        break
    }
  } }))
  function action(id: string) {
    const code = focusedEditor()
    code?.focus()
    void code?.getAction(id)?.run()
  }
  return <>
    <div className="review-tools">
      <button className="btn" onClick={addComment} title="Comment on the selected line or range (c)">Add comment</button>
      <button className="btn" data-review-find onClick={() => action('actions.find')} title="Ctrl+F / Cmd+F">Find in file</button>
      <button className="btn" onClick={() => action('editor.action.gotoLine')} title="Ctrl+G">Go to line</button>
      <button className="btn" onClick={() => navigateChunk('previous')} title="Previous diff chunk (p)">Previous change</button>
      <button className="btn" onClick={() => navigateChunk('next')} title="Next diff chunk (n)">Next change</button>
      <span className="muted small">Select a symbol to highlight matching text. F1 opens editor commands.</span>
    </div>
    <div className={'review-side-head' + (unified ? ' unified' : '')}>{!unified && <button className="review-file-comment-header" aria-label="File comments on original" disabled={file.nameA === 'File added'} title="File-level comments" onClick={() => commentCallback.current({ pane: 'original', line: 0, existing: true })}>{file.nameA}</button>}<button className="review-file-comment-header" aria-label="File comments on modified" disabled={file.nameB === 'File deleted'} title="File-level comments" onClick={() => commentCallback.current({ pane: 'modified', line: 0, existing: true })}>{file.nameB}</button></div>
    <div ref={container} className="review-editor" />
    <footer className="review-stats">{file.originalLines.toLocaleString()} → {file.modifiedLines.toLocaleString()} lines · Complete file loaded · Load {Math.round(file.loadMs)} ms · Prepare {Math.round(file.prepareMs)} ms{readyMs !== null && ` · Editor ${Math.round(readyMs)} ms`}{diffMs !== null && ` · Diff ${Math.round(diffMs)} ms`}</footer>
  </>
}
