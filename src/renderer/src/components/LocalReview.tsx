import { lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { createPortal } from 'react-dom'
import type { DiffThemePreference, ChangeLink, FileInfo, ReviewComment, ReviewDiscussion, ReviewCommentPosition } from '../../../shared/types.ts'
import { resolveDiffTheme } from '../../../shared/theme.ts'
import { useSettings } from '../settings-context.ts'
import { useResolvedTheme } from '../theme.ts'
import { DiffThemeWriter } from '../diff-theme-writer.ts'
import { PreferenceState } from '../preference-state.ts'
import { ReviewedFilesState } from '../reviewed-files.ts'
import { api } from '../api.ts'
import { diffContents } from '../review.ts'
import { reviewShortcut, REVIEW_SHORTCUT_HELP } from '../review-shortcuts.ts'
import type { ReviewEditorHandle, LoadedReviewFile, ReviewEditorSession } from './ReviewEditor.tsx'
import type { CreateInlineCommentHost } from './InlineReviewComment.tsx'
import { ReviewComments, type ReviewCommentsHandle } from './ReviewComments.tsx'
import { commentAnchor, commentPane, displayCommentAnchor } from '../review-comments.ts'
import { ReviewFileList } from './ReviewFileList.tsx'
import { DiffPreferences } from './DiffPreferences.tsx'
import { loadReviewPreferences, updateReviewPreference, type ChangeReviewPreference, type ReviewPreferenceErrors } from '../review-preferences.ts'

const ReviewEditor = lazy(() => import('./ReviewEditor.tsx'))

export interface LocalReviewHandle { canClose(): boolean }

export function LocalReview({ link: initialLink, subject, onClose, onMutate, ref, navigationError, separate = false, blocked = false }: { blocked?: boolean; separate?: boolean; link: ChangeLink; subject: string; onClose: () => void; onMutate: (write: () => Promise<void>) => Promise<void>; ref?: Ref<LocalReviewHandle>; navigationError?: string | null }) {
  const settingsHandle = useSettings()
  const diffTheme = settingsHandle.settings?.diffTheme ?? 'application'
  const applicationTheme = useResolvedTheme(settingsHandle.settings?.theme)
  const reviewTheme = resolveDiffTheme(diffTheme, applicationTheme)
  const [discussion, setDiscussion] = useState<ReviewDiscussion | null>(null)
  const pendingComment = useRef<ReviewComment | null>(null)
  const comments = useRef<ReviewCommentsHandle>(null)
  const [commentsOpen, setCommentsOpen] = useState(true)
  const [commentControls, setCommentControls] = useState<HTMLDivElement | null>(null)
  function closeReview() { if (separate || pendingMarks.current.size === 0 && comments.current?.canClose() !== false) onClose() }
  useImperativeHandle(ref, () => ({ canClose: () => pendingMarks.current.size === 0 && comments.current?.canClose() !== false }))
  const [link, setLink] = useState(initialLink)
  const [patchSets, setPatchSets] = useState<number[] | null>(null)
  const [updateNotice, setUpdateNotice] = useState('')
  useEffect(() => {
    let active = true
    const poll = async () => {
      if (document.hidden) return
      try { const sets = await api.reviewPatchSets(initialLink.id); if (active) { setPatchSets(current => { if (current && sets.some(set => !current.includes(set))) setUpdateNotice(`New patch set ${Math.max(...sets)} available.`); return sets }) } } catch { /* Keep the current comparison available during network outages. */ }
    }
    const timer = setInterval(() => void poll(), 30000)
    return () => { active = false; clearInterval(timer) }
  }, [initialLink.id])
  const [patchSetError, setPatchSetError] = useState('')
  const [preferences, setPreferences] = useState(loadReviewPreferences)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [preferenceErrors, setPreferenceErrors] = useState<ReviewPreferenceErrors>({})
  const confirmedPreferences = useRef(preferences)
  const sharedPreferences = useRef<PreferenceState | null>(null)
  if (!sharedPreferences.current) sharedPreferences.current = new PreferenceState(preferences)
  const preferenceRequests = useRef(new Map<string, number>())
  useEffect(() => {
    if (!api.getReviewPreferences) return
    let active = true
    const accept = (snapshot: { version: number; value: typeof preferences }) => {
      if (!active) return
      sharedPreferences.current!.accept(snapshot)
      setPreferences(sharedPreferences.current!.value)
    }
    const off = api.onReviewPreferencesChanged?.(accept)
    void api.getReviewPreferences(loadReviewPreferences()).then(accept).catch(error => {
      if (active) setPreferenceErrors(current => ({ ...current, context: `Could not load preferences: ${error.message}` }))
    })
    return () => { active = false; off?.() }
  }, [])
  const [requestedTheme, setRequestedTheme] = useState<DiffThemePreference | null>(null)
  const currentSettingsHandle = useRef(settingsHandle)
  currentSettingsHandle.current = settingsHandle
  const themeWriter = useRef<DiffThemeWriter | null>(null)
  if (!themeWriter.current) themeWriter.current = new DiffThemeWriter(
    value => currentSettingsHandle.current.save({ diffTheme: value }),
    error => {
      setRequestedTheme(null)
      setPreferenceErrors(current => ({ ...current, diffTheme: error ? `Could not save diff theme: ${error.message}` : undefined }))
    },
  )
  const reviewedStates = useRef(new Map<string, ReviewedFilesState>())
  const reviewedKey = `${link.id}:${link.patchSet}`
  if (!reviewedStates.current.has(reviewedKey)) reviewedStates.current.set(reviewedKey, new ReviewedFilesState())
  const reviewedState = reviewedStates.current.get(reviewedKey)!
  const reviewed = reviewedState.paths
  const reviewedError = reviewedState.error
  const [, setFlagVersion] = useState(0)
  const flagsChanged = useCallback(() => setFlagVersion(version => version + 1), [])
  const [reviewedRetry, setReviewedRetry] = useState(0)
  const [editorGeneration, setEditorGeneration] = useState(0)
  const [readyFile, setReadyFile] = useState('')
  const autoMarkedVisit = useRef('')
  const pendingMarks = useRef(new Set<string>())
  const comparison = `${link.basePatchSet ?? 0}:${link.patchSet}`
  const positionCache = useRef(new Map<string, ReviewCommentPosition[]>())
  const [mapped, setMapped] = useState<{ comparison: string; positions: ReviewCommentPosition[] } | null>(null)
  const [mappingError, setMappingError] = useState('')
  const [mappingRetry, setMappingRetry] = useState(0)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let active = true
    const off = api.onReviewChanged?.(event => {
      if (event.id !== initialLink.id || blocked) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        positionCache.current.clear()
        setMappingRetry(value => value + 1)
        setReviewedRetry(value => value + 1)
        void api.reviewPatchSets(initialLink.id).then(sets => { if (active) setPatchSets(sets) }).catch(error => { if (active) setPatchSetError(error.message) })
      }, 25)
    })
    return () => { active = false; clearTimeout(timer); off?.() }
  }, [initialLink.id, blocked])
  const positions = mapped?.comparison === comparison ? mapped.positions : []
  useEffect(() => {
    let active = true
    setMapped(current => current?.comparison === comparison ? current : null); setMappingError('')
    const cached = positionCache.current.get(comparison)
    void (cached ? Promise.resolve(cached) : api.reviewCommentPositions(link)).then(positions => {
      if (!active) return
      positionCache.current.set(comparison, positions); setMapped({ comparison, positions })
    }).catch((error: Error) => { if (active) setMappingError(error.message) })
    return () => { active = false }
  }, [link.id, comparison, mappingRetry])
  const fileLists = useRef(new Map<string, Record<string, FileInfo>>())
  const dialog = useRef<HTMLDialogElement>(null)
  const editor = useRef<ReviewEditorHandle>(null)
  const editorSession = useRef<ReviewEditorSession>({ editor: null })
  const editorSessionLifetime = useRef(0)
  useEffect(() => {
    const session = editorSession.current
    const lifetime = ++editorSessionLifetime.current
    // Child cleanup saves its file view state before the shared editor is disposed.
    return () => { queueMicrotask(() => { if (editorSessionLifetime.current === lifetime) { session.editor?.dispose(); session.editor = null } }) }
  }, [])
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
    if (separate) dialog.current?.show(); else dialog.current?.showModal()
    const closeMenus = (event: PointerEvent) => {
      dialog.current?.querySelectorAll<HTMLDetailsElement>('.review-menu[open]').forEach(menu => { if (!menu.contains(event.target as Node)) menu.open = false })
    }
    document.addEventListener('pointerdown', closeMenus)
    return () => { document.removeEventListener('pointerdown', closeMenus); elements.forEach((el, index) => { el.style.overflow = overflow[index]! }) }
  }, [])
  useEffect(() => {
    let active = true
    void api.reviewPatchSets(link.id).then((sets) => { if (active) setPatchSets(sets) })
      .catch((e: Error) => { if (active) setPatchSetError(e.message) })
    return () => { active = false }
  }, [link.id])
  useEffect(() => {
    let active = true
    void reviewedState.refresh(() => api.reviewReviewedFiles(link), () => { if (active) flagsChanged() })
    return () => { active = false }
  }, [reviewedState, reviewedRetry, flagsChanged])
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
      setPath((previous) => previous in result ? previous : Object.keys(result).sort()[0] ?? '')
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
  const discussionComments = [...(discussion?.comments ?? []), ...(discussion?.drafts ?? [])]
  const markers = discussionComments.flatMap(comment => {
    if (!comment.line && !comment.range) return []
    const display = displayCommentAnchor(link, path, loaded?.nameA ?? path, comment, positions, discussionComments)
    const pane = display ? commentPane(link, path, loaded?.nameA ?? path, { ...display, patch_set: display.patchSet, id: comment.id, updated: '' }) : null
    return pane ? [{ pane, line: display!.line ?? display!.range?.end_line ?? 1, range: display!.range, draft: Boolean(discussion?.drafts.some(draft => draft.id === comment.id)), unresolved: Boolean(comment.unresolved) }] : []
  })
  const fileKey = `${comparison}:${path}`
  const createInlineHost = useCallback<CreateInlineCommentHost>(anchor => {
    if (!loaded || loaded.path !== path || loaded.comparison !== comparison) return null
    const pane = commentPane(link, path, loaded.nameA, { ...anchor, patch_set: anchor.patchSet, id: '', updated: '' })
    return pane ? editor.current?.createInlineHost(pane, anchor.line ?? anchor.range?.end_line ?? 0) ?? null : null
  }, [loaded, path, comparison, link.patchSet, link.basePatchSet, editorGeneration])
  const isReviewed = Boolean(reviewed?.has(path))
  async function markReviewed(value: boolean, targetPath = path) {
    const markKey = `${reviewedKey}:${targetPath}`
    if (blocked || !reviewedState.paths || pendingMarks.current.has(markKey)) return false
    pendingMarks.current.add(markKey)
    try {
      return await reviewedState.change(targetPath, value, () => api.setReviewFileReviewed(link, targetPath, value), flagsChanged)
    } finally {
      pendingMarks.current.delete(markKey)
      setReviewedRetry(value => value + 1)
    }
  }
  useEffect(() => {
    if (!preferences.autoMarkReviewed) { autoMarkedVisit.current = ''; return }
    if (readyFile !== fileKey || !reviewed || autoMarkedVisit.current === fileKey) return
    autoMarkedVisit.current = fileKey
    if (!isReviewed) void markReviewed(true)
  }, [preferences.autoMarkReviewed, readyFile, fileKey, reviewed, isReviewed])
  const changePreference: ChangeReviewPreference = (name, value) => {
    if (api.patchReviewPreferences) {
      const request = (preferenceRequests.current.get(name) ?? 0) + 1
      preferenceRequests.current.set(name, request)
      setPreferenceErrors(current => ({ ...current, [name]: undefined }))
      void sharedPreferences.current!.change(name, value, api.patchReviewPreferences, () => {
        setPreferences(sharedPreferences.current!.value)
      }).catch(error => {
        if (preferenceRequests.current.get(name) === request) setPreferenceErrors(current => ({ ...current, [name]: `Could not save this preference: ${error.message}` }))
      })
      return true
    }
    try {
      const next = updateReviewPreference(confirmedPreferences.current, name, value)
      confirmedPreferences.current = next
      setPreferences(next)
      setPreferenceErrors(current => ({ ...current, [name]: undefined }))
      return true
    } catch (error) {
      setPreferenceErrors(current => ({ ...current, [name]: `Could not save this preference: ${(error as Error).message}` }))
      return false
    }
  }
  const paths = Object.keys(files ?? {}).sort()
  function onKey(event: KeyboardEvent<HTMLDialogElement>) {
    if (help || preferencesOpen) return
    const target = event.target as HTMLElement
    if (target.closest('.review-comment-overview')) return
    const menu = target.closest<HTMLDetailsElement>('.review-menu[open]')
    if (menu && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); menu.open = false; menu.querySelector<HTMLElement>('summary')?.focus(); return }
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
      case 'blame': editor.current?.blame(); break
      case 'preferences': setPreferencesOpen(true); break
      case 'toggleReviewed': if (reviewed) void markReviewed(!isReviewed); break
      case 'nextUnreviewed': {
        if (!reviewed) break
        const index = paths.indexOf(path)
        const next = [...paths.slice(index + 1), ...paths.slice(0, index)].find(candidate => !reviewed.has(candidate))
        void markReviewed(true).then(success => { if (success && next) setPath(next) })
        break
      }
      case 'help': setHelp(true); break
      case 'review': comments.current?.review(); break
      case 'toggleComments': setCommentsOpen(value => !value); break
      case 'nextThread': case 'previousThread': comments.current?.navigateThread(shortcut === 'nextThread' ? 1 : -1); break
      case 'comment': editor.current?.addComment(); break
      case 'up': if (!separate) closeReview(); break
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
    <dialog ref={dialog} className="local-review" data-review-theme={reviewTheme} aria-labelledby="local-review-title" onCancel={e => { e.preventDefault(); if (!separate) closeReview() }} onKeyDownCapture={onKey} onKeyDown={(e) => {
      if (help || preferencesOpen) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        editor.current?.find()
      }
    }}>
      <header className="local-review-header">
        {navigationError && <p className="error" role="alert">{navigationError}</p>}
        <div className="local-review-heading"><span className="muted">#{link.id}</span><h2 id="local-review-title">{subject}</h2></div>
        <div ref={setCommentControls} />
        <button className="btn" data-review-preferences onClick={() => setPreferencesOpen(true)}>Diff preferences</button>
        <details className="review-menu" onClick={event => { if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false }}>
          <summary className="btn" aria-label="More review actions">More</summary>
          <div className="review-menu-items">
            <button className="btn" data-review-find onClick={() => editor.current?.find()}>Find in file</button>
            <button className="btn" onClick={() => editor.current?.outline()}>Outline</button>
            <button className="btn" onClick={() => editor.current?.blame()}>Blame</button>
            <button className="btn" onClick={() => editor.current?.goToLine()}>Go to line</button>
            <button className="btn" onClick={() => editor.current?.addComment()}>Add comment</button>
            <button className="btn" onClick={() => editor.current?.navigate('previousChunk')}>Previous change</button>
            <button className="btn" onClick={() => editor.current?.navigate('nextChunk')}>Next change</button>
            <button className="btn" onClick={() => setHelp(true)} title="Keyboard shortcuts (?)">Shortcuts</button>
            <button className="btn" onClick={() => void api.openChange(link)}>Open in Gerrit</button>
          </div>
        </details>
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
        {loaded?.comparison === comparison && loaded.path === path && <label className="reviewed-file"><input type="checkbox" aria-label="File reviewed" checked={isReviewed} disabled={blocked || !reviewed || reviewedState.pending.has(path)} aria-busy={reviewedState.pending.has(path)} onChange={(e) => void markReviewed(e.target.checked)} />Reviewed</label>}
      </div>
      {reviewedError && <div className="review-flag-error" role="alert">Reviewed flag: {reviewedError} <button className="btn" onClick={() => { reviewedState.clearErrors(); autoMarkedVisit.current = ''; setReviewedRetry((n) => n + 1) }}>Retry</button></div>}
      {mappingError && <div className="review-flag-error" role="alert">Could not place older comments: {mappingError} <button className="btn" onClick={() => { positionCache.current.delete(comparison); setMappingRetry(value => value + 1) }}>Retry</button></div>}
      {updateNotice && <div className="review-comment-notice" role="status">{updateNotice} <button className="btn" onClick={() => { setLink(current => ({ ...current, patchSet: Math.max(...(patchSets ?? [current.patchSet!])), basePatchSet: undefined })); setUpdateNotice('') }}>Open latest patch set</button><button className="btn" onClick={() => setUpdateNotice('')}>Dismiss</button></div>}
      <div className="local-review-body">
        <ReviewFileList positions={positions} files={files ?? {}} discussion={discussion} ref={fileList} paths={paths} selected={path} reviewed={reviewed} pending={reviewedState.pending} blocked={blocked} onOpen={setPath} onReviewed={(file, done) => void markReviewed(done, file)} />
        <main className="review-file">
        <ReviewComments blocked={blocked} ref={comments} positions={positions} controls={commentControls} createInlineHost={createInlineHost} hasEditor={Boolean(loaded && loaded.path === path && loaded.comparison === comparison)} onMutate={onMutate} onDiscussion={setDiscussion} onRefresh={() => { void api.reviewPatchSets(link.id).then(sets => { setPatchSets(sets); if (Math.max(...sets) > link.patchSet!) setUpdateNotice(`New patch set ${Math.max(...sets)} available.`) }).catch(e => setPatchSetError(e.message)); positionCache.current.clear(); setMappingRetry(value => value + 1) }} onHighlight={comment => { if (!comment) { editor.current?.highlightComment(null); return }; const mapped = displayCommentAnchor(link, path, loaded?.nameA ?? path, comment, positions, discussionComments); if (mapped) { const pane = commentPane(link, path, loaded?.nameA ?? path, { ...mapped, patch_set: mapped.patchSet, id: comment.id, updated: '' }); if (pane) editor.current?.highlightComment({ pane, line: mapped.line ?? mapped.range?.end_line ?? 1, range: mapped.range }) } }} link={link} path={path} originalPath={loaded?.nameA} visible={commentsOpen} onOpen={() => setCommentsOpen(true)} onHide={() => setCommentsOpen(false)} onReveal={(comment, original, preserveScroll) => {
          if (comment.path === '/PATCHSET_LEVEL') return
          const display = original ? null : displayCommentAnchor(link, path, loaded?.nameA ?? path, comment, positions, discussionComments)
          const pane = display ? commentPane(link, path, loaded?.nameA ?? path, { ...display, patch_set: display.patchSet, id: comment.id, updated: '' }) : null
          if (pane) editor.current?.revealComment(pane, display!.line ?? display!.range?.end_line ?? 1, preserveScroll)
          else {
            const mapped = original ? null : Object.keys(files ?? {}).map(candidate => displayCommentAnchor(link, candidate, files?.[candidate]?.old_path ?? candidate, comment, positions, discussionComments)).find(Boolean)
            const targetPath = mapped && Object.keys(files ?? {}).find(candidate => candidate === mapped.path || files?.[candidate]?.old_path === mapped.path)
            if (mapped && targetPath) {
              pendingComment.current = { ...comment, patch_set: link.patchSet!, path: targetPath, line: mapped.line, range: mapped.range, side: mapped.patchSet === link.basePatchSet || mapped.side === 'PARENT' ? 'PARENT' : 'REVISION' }
              setPath(targetPath)
            } else { pendingComment.current = comment; setLink({ ...link, patchSet: comment.patch_set, basePatchSet: undefined }); setPath(comment.path) }
          }
        }} />
          {error ? <div className="review-message" role="alert">{error}<p><button className="btn" onClick={() => { fileLists.current.delete(comparison); setRetry((v) => v + 1) }}>Retry</button></p></div>
            : loaded && loaded.path === path && loaded.comparison === comparison ? <Suspense fallback={<p className="review-message" role="status">Opening review editor…</p>}><ReviewEditor theme={reviewTheme} ref={editor} session={editorSession.current} key={fileKey} file={loaded} link={link} preferences={preferences} commentsVisible={commentsOpen} markers={markers} onComment={position => { const anchor = commentAnchor(link, path, loaded.nameA, position.pane, position.line, position.range); if (position.existing) comments.current?.openAt(anchor); else comments.current?.compose(anchor) }} onReady={() => {
              setReadyFile(fileKey); setEditorGeneration(generation => generation + 1)
              const comment = pendingComment.current
              if (comment && comment.patch_set === link.patchSet && comment.path === path) { editor.current?.revealComment(comment.side === 'PARENT' ? 'original' : 'modified', comment.line ?? comment.range?.end_line ?? 1); pendingComment.current = null }
            }} /></Suspense>
            : <p className="review-message" role="status">{files ? path ? 'Loading complete file…' : 'No changed files.' : 'Loading changed files…'}</p>}
        </main>

      </div>
      {preferencesOpen && <DiffPreferences diffTheme={requestedTheme ?? diffTheme} preferences={preferences} errors={preferenceErrors} onChange={changePreference} onThemeChange={value => {
        setRequestedTheme(value)
        setPreferenceErrors(current => ({ ...current, diffTheme: undefined }))
        void themeWriter.current!.change(value)
      }} onClose={() => setPreferencesOpen(false)} />}
      {help && <ShortcutHelp separate={separate} onClose={() => setHelp(false)} />}
    </dialog>, document.body,
  )
}

function ShortcutHelp({ onClose, separate }: { onClose: () => void; separate?: boolean }) {
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
    <table><tbody>{REVIEW_SHORTCUT_HELP.map(([keys, description]) => <tr key={keys}><td><kbd>{keys}</kbd></td><td>{separate && keys === 'u' ? 'Inactive in a separate review window. Use the window close control.' : description}</td></tr>)}</tbody></table>
    <p className="muted small">Navigation keys follow Gerrit. Ctrl+F / Cmd+F searches the focused file pane. Ctrl+G jumps to a line. F1 opens editor commands. Shortcuts stay inactive while you type in search or other fields.</p>
    <button className="btn" onClick={close}>Close shortcuts</button>
  </dialog>
}
