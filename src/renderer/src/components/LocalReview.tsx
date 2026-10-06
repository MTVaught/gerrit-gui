import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ChangeLink, FileInfo, ReviewComment, ReviewDiscussion } from '../../../shared/types.ts'
import { api } from '../api.ts'
import { diffContents } from '../review.ts'
import { reviewShortcut, REVIEW_SHORTCUT_HELP } from '../review-shortcuts.ts'
import type { ReviewEditorHandle, LoadedReviewFile } from './ReviewEditor.tsx'
import type { CreateInlineCommentHost } from './InlineReviewComment.tsx'
import { ReviewComments, type ReviewCommentsHandle } from './ReviewComments.tsx'
import { commentAnchor, commentPane } from '../review-comments.ts'
import { ReviewFileList } from './ReviewFileList.tsx'
import { DiffPreferences } from './DiffPreferences.tsx'
import { loadReviewPreferences, saveReviewPreferences, type ReviewPreferences } from '../review-preferences.ts'

const ReviewEditor = lazy(() => import('./ReviewEditor.tsx'))

export function LocalReview({ link: initialLink, subject, onClose, onPublished }: { link: ChangeLink; subject: string; onClose: () => void; onPublished: () => Promise<void> }) {
  const [discussion, setDiscussion] = useState<ReviewDiscussion | null>(null)
  const pendingComment = useRef<ReviewComment | null>(null)
  const comments = useRef<ReviewCommentsHandle>(null)
  const [commentsOpen, setCommentsOpen] = useState(true)
  function closeReview() { if (comments.current?.canClose() !== false) onClose() }
  const [link, setLink] = useState(initialLink)
  const [patchSets, setPatchSets] = useState<number[] | null>(null)
  const [patchSetError, setPatchSetError] = useState('')
  const [preferences, setPreferences] = useState(loadReviewPreferences)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [preferenceError, setPreferenceError] = useState('')
  const [reviewed, setReviewed] = useState<{ patchSet: number; paths: Set<string> } | null>(null)
  const [reviewedError, setReviewedError] = useState('')
  const [reviewedRetry, setReviewedRetry] = useState(0)
  const [editorGeneration, setEditorGeneration] = useState(0)
  const [readyFile, setReadyFile] = useState('')
  const [marking, setMarking] = useState(false)
  const autoMarkedVisit = useRef('')
  const pendingMarks = useRef(new Set<string>())
  const currentPatchSet = useRef(link.patchSet)
  currentPatchSet.current = link.patchSet
  const comparison = `${link.basePatchSet ?? 0}:${link.patchSet}`
  const fileLists = useRef(new Map<string, Record<string, FileInfo>>())
  const dialog = useRef<HTMLDialogElement>(null)
  const editor = useRef<ReviewEditorHandle>(null)
  const fileList = useRef<HTMLElement>(null)
  const [help, setHelp] = useState(false)
  const [filesComparison, setFilesComparison] = useState('')
  const [files, setFiles] = useState<Record<string, FileInfo> | null>(null)
  const [path, setPath] = useState('')
  const [loaded, setLoaded] = useState<LoadedReviewFile | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  // Session-only cache: changing files never fetches a file already opened here.
  const cache = useRef(new Map<string, LoadedReviewFile>())
  useEffect(() => {
    const elements = [document.documentElement, document.body]
    const overflow = elements.map((el) => el.style.overflow)
    elements.forEach((el) => { el.style.overflow = 'hidden' })
    dialog.current?.showModal()
    return () => { elements.forEach((el, index) => { el.style.overflow = overflow[index]! }) }
  }, [])
  useEffect(() => {
    let active = true
    void api.reviewPatchSets(link.id).then((sets) => { if (active) setPatchSets(sets) })
      .catch((e: Error) => { if (active) setPatchSetError(e.message) })
    return () => { active = false }
  }, [link.id])
  useEffect(() => {
    let active = true
    setReviewed(null)
    setReviewedError('')
    void api.reviewReviewedFiles(link).then((paths) => { if (active) setReviewed({ patchSet: link.patchSet!, paths: new Set(paths) }) })
      .catch((e: Error) => { if (active) setReviewedError(e.message) })
    return () => { active = false }
  }, [link.id, link.patchSet, reviewedRetry])
  useEffect(() => {
    let active = true
    setFiles(null)
    setLoaded(null)
    setError('')
    const cached = fileLists.current.get(comparison)
    void (cached ? Promise.resolve(cached) : api.reviewFiles(link)).then((result) => {
      if (!active) return
      fileLists.current.set(comparison, result)
      setFilesComparison(comparison)
      setFiles(result)
      setPath((previous) => previous in result ? previous : Object.keys(result).filter((p) => p !== '/MERGE_LIST').sort()[0] ?? '')
    }).catch((e: Error) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [link, retry])
  useEffect(() => {
    let active = true
    setLoaded(null)
    if (!path || !files || filesComparison !== comparison) return
    setError('')
    const fileKey = `${comparison}:${path}`
    const cached = cache.current.get(fileKey)
    if (cached) { setLoaded(cached); return }
    if (files?.[path]?.binary) { setError('Binary files cannot be displayed here. Open in Gerrit to review this file.'); return }
    const start = performance.now()
    void api.reviewDiff(link, path).then((diff) => {
      if (!active) return
      const received = performance.now()
      const contents = diffContents(diff)
      const file: LoadedReviewFile = { ...contents, path, loadMs: received - start, prepareMs: performance.now() - received,
        comparison, nameA: diff.meta_a?.name ?? 'File added', nameB: diff.meta_b?.name ?? 'File deleted' }
      cache.current.set(fileKey, file)
      setLoaded(file)
    }).catch((e: Error) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [link, path, files, filesComparison, retry])
  const markers = [...(discussion?.comments ?? []), ...(discussion?.drafts ?? [])].flatMap(comment => {
    if (!comment.line && !comment.range) return []
    const pane = commentPane(link, path, loaded?.nameA ?? path, comment)
    return pane ? [{ pane, line: comment.line ?? comment.range?.end_line ?? 1, draft: Boolean(discussion?.drafts.some(draft => draft.id === comment.id)), unresolved: Boolean(comment.unresolved) }] : []
  })
  const fileKey = `${comparison}:${path}`
  const createInlineHost = useCallback<CreateInlineCommentHost>(anchor => {
    if (!loaded || loaded.path !== path || loaded.comparison !== comparison) return null
    const pane = commentPane(link, path, loaded.nameA, { ...anchor, patch_set: anchor.patchSet, id: '', updated: '' })
    return pane ? editor.current?.createInlineHost(pane, anchor.line ?? anchor.range?.end_line ?? 0) ?? null : null
  }, [loaded, path, comparison, link.patchSet, link.basePatchSet, editorGeneration])
  const isReviewed = reviewed && reviewed.patchSet === link.patchSet && reviewed.paths.has(path)
  async function markReviewed(value: boolean, targetPath = path) {
    const markKey = `${link.patchSet}:${targetPath}`
    if (pendingMarks.current.has(markKey)) return
    pendingMarks.current.add(markKey)
    setMarking(true)
    setReviewedError('')
    try {
      await api.setReviewFileReviewed(link, targetPath, value)
      setReviewed((previous) => {
        if (!previous || previous.patchSet !== link.patchSet) return previous
        const next = new Set(previous.paths)
        if (value) next.add(targetPath); else next.delete(targetPath)
        return { patchSet: link.patchSet!, paths: next }
      })
    } catch (e) { if (currentPatchSet.current === link.patchSet) setReviewedError((e as Error).message) }
    finally { pendingMarks.current.delete(markKey); setMarking(pendingMarks.current.size > 0) }
  }
  useEffect(() => {
    if (!preferences.autoMarkReviewed) { autoMarkedVisit.current = ''; return }
    if (readyFile !== fileKey || reviewed?.patchSet !== link.patchSet || autoMarkedVisit.current === fileKey) return
    autoMarkedVisit.current = fileKey
    if (!isReviewed) void markReviewed(true)
  }, [preferences.autoMarkReviewed, readyFile, fileKey, reviewed, isReviewed])
  function savePreferences(next: ReviewPreferences) {
    try {
      saveReviewPreferences(next)
      setPreferences(next)
      setPreferenceError('')
      return true
    } catch { setPreferenceError('Could not save diff preferences. Check that local storage is available, then try again.'); return false }
  }
  const paths = Object.keys(files ?? {}).filter((p) => p !== '/MERGE_LIST').sort()
  function onKey(event: KeyboardEvent<HTMLDialogElement>) {
    if (help || preferencesOpen) return
    const target = event.target as HTMLElement
    const inEditorWidget = Boolean(target.closest('.find-widget, .quick-input-widget, .suggest-widget, .rename-box, .context-view'))
    const codeInput = !inEditorWidget && target.matches('.inputarea, .native-edit-context') && Boolean(target.closest('.review-editor'))
    const textEntry = inEditorWidget || (!codeInput && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')))
    const inFiles = Boolean(target.closest('[data-review-path]'))
    const shortcut = reviewShortcut(event.nativeEvent, { textEntry, fileList: inFiles })
    if (!shortcut) return
    event.preventDefault()
    event.stopPropagation()
    const buttons = Array.from(fileList.current?.querySelectorAll<HTMLButtonElement>('[data-review-path]') ?? [])
    switch (shortcut) {
      case 'help': setHelp(true); break
      case 'review': comments.current?.review(); break
      case 'toggleComments': setCommentsOpen(value => !value); break
      case 'nextThread': case 'previousThread': comments.current?.navigateThread(shortcut === 'nextThread' ? 1 : -1); break
      case 'comment': editor.current?.addComment(); break
      case 'up': closeReview(); break
      case 'fileList': (buttons.find((b) => b.getAttribute('aria-current') === 'true') ?? buttons[0])?.focus(); break
      case 'nextFile': case 'previousFile': {
        const visiblePaths = buttons.map((button) => button.dataset.reviewPath!)
        const current = visiblePaths.indexOf(path)
        const index = current === -1 ? (shortcut === 'nextFile' ? 0 : visiblePaths.length - 1) : current + (shortcut === 'nextFile' ? 1 : -1)
        if (visiblePaths[index]) setPath(visiblePaths[index]!)
        break
      }
      case 'nextFileCursor': case 'previousFileCursor': {
        const index = buttons.indexOf(target.closest('button') as HTMLButtonElement)
        const next = buttons[Math.max(0, Math.min(buttons.length - 1, index + (shortcut === 'nextFileCursor' ? 1 : -1)))]
        next?.focus()
        next?.scrollIntoView({ block: 'nearest' })
        break
      }
      case 'openFile': (target.closest('button') as HTMLButtonElement | null)?.click(); break
      default: editor.current?.navigate(shortcut)
    }
  }
  return createPortal(
    <dialog ref={dialog} className="local-review" aria-labelledby="local-review-title" onCancel={e => { e.preventDefault(); closeReview() }} onKeyDownCapture={onKey} onKeyDown={(e) => {
      if (help || preferencesOpen) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        dialog.current?.querySelector<HTMLButtonElement>('button[data-review-find]')?.click()
      }
    }}>
      <header className="local-review-header">
        <div><h2 id="local-review-title">{subject}</h2><span className="muted">#{link.id} · {link.basePatchSet ? `PS ${link.basePatchSet}` : 'Base'} → PS {link.patchSet} · Local review beta</span></div>
        <button className="btn" onClick={() => setCommentsOpen(true)}>Comments / review</button>
        <button className="btn" data-review-preferences onClick={() => setPreferencesOpen(true)}>Diff preferences</button>
        <button className="btn" onClick={() => setHelp(true)} title="Keyboard shortcuts (?)">Shortcuts</button>
        <button className="btn" onClick={() => void api.openChange(link)}>Open in Gerrit</button>
        <button className="btn" onClick={closeReview}>Close review</button>
      </header>
      <div className="review-comparison" aria-label="Patch set comparison">
        <label>Base<select aria-label="Base patch set" disabled={!patchSets} value={link.basePatchSet ?? 'base'} onChange={(e) => setLink({ ...link, basePatchSet: e.target.value === 'base' ? undefined : Number(e.target.value) })}>
          <option value="base">Base</option>{(patchSets ?? [link.basePatchSet].filter((n): n is number => n !== undefined)).filter((n) => n !== link.patchSet).map((n) => <option key={n} value={n}>Patch set {n}</option>)}
        </select></label>
        <span aria-hidden="true">→</span>
        <label>Patch set<select aria-label="Compared patch set" disabled={!patchSets} value={link.patchSet} onChange={(e) => {
          const patchSet = Number(e.target.value)
          setLink({ ...link, patchSet, basePatchSet: link.basePatchSet === patchSet ? undefined : link.basePatchSet })
        }}>{(patchSets ?? [link.patchSet!]).map((n) => <option key={n} value={n}>Patch set {n}</option>)}</select></label>
        {patchSetError && <span role="alert" className="error">Could not load patch sets: {patchSetError}</span>}

      </div>
      {reviewedError && <div className="review-flag-error" role="alert">Reviewed flag: {reviewedError} <button className="btn" onClick={() => { autoMarkedVisit.current = ''; setReviewedRetry((n) => n + 1) }}>Retry</button></div>}
      <div className="local-review-body">
        <ReviewFileList ref={fileList} paths={paths} selected={path} reviewed={reviewed?.patchSet === link.patchSet ? reviewed!.paths : null} busy={marking} onOpen={setPath} onReviewed={(file, done) => void markReviewed(done, file)} />
        <main className="review-file">
          <div className="review-current-file"><span title={path}>{path === '/COMMIT_MSG' ? 'Commit message' : path}</span>
            {loaded?.comparison === comparison && loaded.path === path && <label className="reviewed-file"><input type="checkbox" aria-label="File reviewed" checked={Boolean(isReviewed)} disabled={marking || reviewed?.patchSet !== link.patchSet} onChange={(e) => void markReviewed(e.target.checked)} />Reviewed</label>}
          </div>
        <ReviewComments ref={comments} createInlineHost={createInlineHost} hasEditor={Boolean(loaded && loaded.path === path && loaded.comparison === comparison)} onPublished={onPublished} onDiscussion={setDiscussion} link={link} path={path} originalPath={loaded?.nameA} visible={commentsOpen} onOpen={() => setCommentsOpen(true)} onHide={() => setCommentsOpen(false)} onReveal={comment => {
          if (comment.path === '/PATCHSET_LEVEL') return
          const pane = commentPane(link, path, loaded?.nameA ?? path, comment)
          if (pane) editor.current?.revealComment(pane, comment.line ?? comment.range?.end_line ?? 1)
          else { pendingComment.current = comment; setLink({ ...link, patchSet: comment.patch_set, basePatchSet: undefined }); setPath(comment.path) }
        }} />
          {error ? <div className="review-message" role="alert">{error}<p><button className="btn" onClick={() => { fileLists.current.delete(comparison); setRetry((v) => v + 1) }}>Retry</button></p></div>
            : loaded && loaded.path === path && loaded.comparison === comparison ? <Suspense fallback={<p className="review-message" role="status">Opening review editor…</p>}><ReviewEditor ref={editor} key={fileKey} file={loaded} preferences={preferences} markers={markers} onComment={position => { const anchor = commentAnchor(link, path, loaded.nameA, position.pane, position.line, position.range); if (position.existing) comments.current?.openAt(anchor); else comments.current?.compose(anchor) }} onReady={() => {
              setReadyFile(fileKey); setEditorGeneration(generation => generation + 1)
              const comment = pendingComment.current
              if (comment && comment.patch_set === link.patchSet && comment.path === path) { editor.current?.revealComment(comment.side === 'PARENT' ? 'original' : 'modified', comment.line ?? comment.range?.end_line ?? 1); pendingComment.current = null }
            }} /></Suspense>
            : <p className="review-message" role="status">{files ? path ? 'Loading complete file…' : 'No changed files.' : 'Loading changed files…'}</p>}
        </main>

      </div>
      {preferencesOpen && <DiffPreferences preferences={preferences} error={preferenceError} onSave={savePreferences} onClose={() => { setPreferencesOpen(false); setPreferenceError('') }} />}
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </dialog>, document.body,
  )
}

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  function close() {
    dialog.current?.close()
    previousFocus.current?.focus()
    onClose()
  }
  useEffect(() => {
    const el = dialog.current!
    previousFocus.current = document.activeElement as HTMLElement
    el.showModal()
    return () => { el.close() }
  }, [])
  return <dialog ref={dialog} className="review-shortcuts" aria-labelledby="review-shortcuts-title" onCancel={(event) => { event.preventDefault(); event.stopPropagation(); close() }} onKeyDown={(event) => {
    event.stopPropagation()
    if (event.key === '?') { event.preventDefault(); close() }
  }}>
    <h2 id="review-shortcuts-title">Review keyboard shortcuts</h2>
    <table><tbody>{REVIEW_SHORTCUT_HELP.map(([keys, description]) => <tr key={keys}><td><kbd>{keys}</kbd></td><td>{description}</td></tr>)}</tbody></table>
    <p className="muted small">Navigation keys follow Gerrit. Ctrl+F / Cmd+F searches the focused file pane. Ctrl+G jumps to a line. F1 opens editor commands. Shortcuts stay inactive while you type in search or other fields.</p>
    <button className="btn" onClick={close}>Close shortcuts</button>
  </dialog>
}
