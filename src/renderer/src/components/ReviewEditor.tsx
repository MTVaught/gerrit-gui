import { useEffect, useRef, useState } from 'react'
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
import { reviewLanguage, type ReviewContents } from '../review.ts'

// Bundle the worker with the app. No CDN, server-side completion or source uploads.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
jsonDefaults.setModeConfiguration({ tokens: true })

export interface LoadedReviewFile extends ReviewContents {
  path: string
  loadMs: number
  prepareMs: number
  nameA: string
  nameB: string
  viewState?: monaco.editor.IDiffEditorViewState | null
}

export default function ReviewEditor({ file }: { file: LoadedReviewFile }) {
  const container = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
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
    const diff = monaco.editor.createDiffEditor(container.current!, {
      automaticLayout: true,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: false,
      hideUnchangedRegions: { enabled: false },
      folding: false,
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
    const updated = diff.onDidUpdateDiff(() => setDiffMs(performance.now() - start))
    diff.setModel({ original, modified })
    if (file.viewState) diff.restoreViewState(file.viewState)
    diff.getModifiedEditor().focus()
    const frame = requestAnimationFrame(() => setReadyMs(performance.now() - start))
    return () => {
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

  function focusedEditor() {
    const diff = editor.current
    return lastFocus.current === 'original' ? diff?.getOriginalEditor() : diff?.getModifiedEditor()
  }
  function action(id: string) {
    const code = focusedEditor()
    code?.focus()
    void code?.getAction(id)?.run()
  }
  return <>
    <div className="review-tools">
      <button className="btn" data-review-find onClick={() => action('actions.find')} title="Ctrl+F / Cmd+F">Find in file</button>
      <button className="btn" onClick={() => action('editor.action.gotoLine')} title="Ctrl+G">Go to line</button>
      <button className="btn" onClick={() => editor.current?.goToDiff('previous')}>Previous change</button>
      <button className="btn" onClick={() => editor.current?.goToDiff('next')}>Next change</button>
      <span className="muted small">Select a symbol to highlight matching text. F1 opens editor commands.</span>
    </div>
    <div className="review-side-head"><span title={file.nameA}>{file.nameA}</span><span title={file.nameB}>{file.nameB}</span></div>
    <div ref={container} className="review-editor" />
    <footer className="review-stats">{file.originalLines.toLocaleString()} → {file.modifiedLines.toLocaleString()} lines · Complete file loaded · Load {Math.round(file.loadMs)} ms · Prepare {Math.round(file.prepareMs)} ms{readyMs !== null && ` · Editor ${Math.round(readyMs)} ms`}{diffMs !== null && ` · Diff ${Math.round(diffMs)} ms`}</footer>
  </>
}
