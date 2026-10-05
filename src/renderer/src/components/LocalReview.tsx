import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChangeLink, FileInfo } from '../../../shared/types.ts'
import { api } from '../api.ts'
import { diffContents } from '../review.ts'
import type { LoadedReviewFile } from './ReviewEditor.tsx'

const ReviewEditor = lazy(() => import('./ReviewEditor.tsx'))

export function LocalReview({ link, subject, onClose }: { link: ChangeLink; subject: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [files, setFiles] = useState<Record<string, FileInfo> | null>(null)
  const [path, setPath] = useState('')
  const [loaded, setLoaded] = useState<LoadedReviewFile | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  // Session-only cache: changing files never fetches a file already opened here.
  const cache = useRef(new Map<string, LoadedReviewFile>())
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  useEffect(() => {
    let active = true
    setError('')
    void api.reviewFiles(link).then((result) => {
      if (!active) return
      setFiles(result)
      setPath(Object.keys(result).filter((p) => p !== '/MERGE_LIST').sort()[0] ?? '')
    }).catch((e: Error) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [link, retry])
  useEffect(() => {
    let active = true
    setLoaded(null)
    if (!path) return
    setError('')
    const cached = cache.current.get(path)
    if (cached) { setLoaded(cached); return }
    if (files?.[path]?.binary) { setError('Binary files cannot be displayed here. Open in Gerrit to review this file.'); return }
    const start = performance.now()
    void api.reviewDiff(link, path).then((diff) => {
      if (!active) return
      const received = performance.now()
      const contents = diffContents(diff)
      const file: LoadedReviewFile = { ...contents, path, loadMs: received - start, prepareMs: performance.now() - received,
        nameA: diff.meta_a?.name ?? 'File added', nameB: diff.meta_b?.name ?? 'File deleted' }
      cache.current.set(path, file)
      setLoaded(file)
    }).catch((e: Error) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [link, path, files, retry])
  return createPortal(
    <dialog ref={dialog} className="local-review" aria-labelledby="local-review-title" onCancel={onClose} onKeyDown={(e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        dialog.current?.querySelector<HTMLButtonElement>('button[data-review-find]')?.click()
      }
    }}>
      <header className="local-review-header">
        <div><h2 id="local-review-title">{subject}</h2><span className="muted">#{link.id} · {link.basePatchSet ? `PS ${link.basePatchSet}` : 'Base'} → PS {link.patchSet} · Read-only beta</span></div>
        <button className="btn" onClick={() => void api.openChange(link)}>Open in Gerrit</button>
        <button className="btn" onClick={onClose}>Close review</button>
      </header>
      <div className="local-review-body">
        <nav className="review-files" aria-label="Changed files">
          {files && Object.keys(files).filter((p) => p !== '/MERGE_LIST').sort().map((p) => (
            <button key={p} className={p === path ? 'selected' : ''} title={p} aria-current={p === path} onClick={() => setPath(p)}>{p === '/COMMIT_MSG' ? 'Commit message' : p}</button>
          ))}
        </nav>
        <main className="review-file">
          {error ? <div className="review-message" role="alert">{error}<p><button className="btn" onClick={() => setRetry((v) => v + 1)}>Retry</button></p></div>
            : loaded ? <Suspense fallback={<p className="review-message" role="status">Opening review editor…</p>}><ReviewEditor key={path} file={loaded} /></Suspense>
            : <p className="review-message" role="status">{files ? path ? 'Loading complete file…' : 'No changed files.' : 'Loading changed files…'}</p>}
        </main>
      </div>
    </dialog>, document.body,
  )
}
