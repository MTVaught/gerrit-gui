import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChangeLink, FileInfo } from '../../../shared/types.ts'
import { api } from '../api.ts'
import { diffRows, findReviewRow, REVIEW_ROW_HEIGHT, visibleRows, type DiffRow } from '../review.ts'

type LoadedFile = { rows: DiffRow[]; loadMs: number; prepareMs: number; width: number; nameA: string; nameB: string }

export function LocalReview({ link, subject, onClose }: { link: ChangeLink; subject: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [files, setFiles] = useState<Record<string, FileInfo> | null>(null)
  const [path, setPath] = useState('')
  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  // Session-only cache: changing files never fetches a file already opened here.
  const cache = useRef(new Map<string, LoadedFile>())
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
      const rows = diffRows(diff)
      let width = 80
      for (const row of rows) width = Math.max(width, (row.a?.length ?? 0) + (row.a?.match(/\t/g)?.length ?? 0) * 3, (row.b?.length ?? 0) + (row.b?.match(/\t/g)?.length ?? 0) * 3)
      const file = { rows, loadMs: received - start, prepareMs: performance.now() - received, width,
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
        dialog.current?.querySelector<HTMLInputElement>('input[aria-label="Search whole file"]')?.focus()
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
            : loaded ? <FullDiff key={path} file={loaded} />
            : <p className="review-message" role="status">{files ? path ? 'Loading complete file…' : 'No changed files.' : 'Loading changed files…'}</p>}
        </main>
      </div>
    </dialog>, document.body,
  )
}

function FullDiff({ file }: { file: LoadedFile }) {
  const viewport = useRef<HTMLDivElement>(null)
  const rightViewport = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [top, setTop] = useState(0)
  const [height, setHeight] = useState(600)
  const [query, setQuery] = useState('')
  const [match, setMatch] = useState(-1)
  const [searchMessage, setSearchMessage] = useState('')
  const [line, setLine] = useState('')
  const [paintMs, setPaintMs] = useState<number | null>(null)
  const mounted = useRef(performance.now())
  useEffect(() => {
    const el = viewport.current!
    const observer = new ResizeObserver(() => setHeight(el.clientHeight))
    observer.observe(el)
    const frame = requestAnimationFrame(() => setPaintMs(performance.now() - mounted.current))
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [])
  const changes = useMemo(() => {
    const starts: number[] = []
    for (let i = 0; i < file.rows.length; i++) {
      if (file.rows[i]!.changed && !file.rows[i - 1]?.changed) starts.push(i)
    }
    return starts
  }, [file])
  const [from, to] = visibleRows(top, height, file.rows.length)
  function jump(index: number) {
    if (index < 0) return
    viewport.current!.scrollTop = index * REVIEW_ROW_HEIGHT
    rightViewport.current!.scrollTop = viewport.current!.scrollTop
    setTop(viewport.current!.scrollTop)
  }
  function find(direction: 1 | -1) {
    const index = findReviewRow(file.rows, query, match < 0 ? direction === 1 ? -1 : 0 : match, direction)
    setMatch(index)
    setSearchMessage(index < 0 ? 'No matches' : `Match at line ${file.rows[index]!.lineB ?? file.rows[index]!.lineA}`)
    jump(index)
  }
  return <>
    <div className="review-tools" onKeyDown={(e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); search.current?.focus() }
    }}>
      <form onSubmit={(e) => { e.preventDefault(); find(1) }}>
        <input ref={search} aria-label="Search whole file" placeholder="Search whole file" value={query} onChange={(e) => { setQuery(e.target.value); setMatch(-1); setSearchMessage('') }} />
        <button className="btn" type="button" disabled={!query} onClick={() => find(-1)}>Previous match</button>
        <button className="btn" disabled={!query}>Next match</button>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); const index = file.rows.findIndex((r) => (r.lineB ?? (file.nameB === 'File deleted' ? r.lineA : undefined)) === Number(line)); jump(index); setSearchMessage(index < 0 ? 'Line not found' : '') }}>
        <input aria-label="Go to line" placeholder="Line" type="number" min="1" value={line} onChange={(e) => setLine(e.target.value)} />
        <button className="btn">Go</button>
      </form>
      <button className="btn" disabled={!changes.length} onClick={() => jump([...changes].reverse().find((i) => i < Math.floor(top / REVIEW_ROW_HEIGHT)) ?? changes.at(-1)!)}>Previous change</button>
      <button className="btn" disabled={!changes.length} onClick={() => jump(changes.find((i) => i > Math.floor(top / REVIEW_ROW_HEIGHT)) ?? changes[0]!)}>Next change</button>
      <span className="muted small" role="status">{searchMessage}</span>
    </div>
    <div className="review-side-head"><span title={file.nameA}>{file.nameA}</span><span title={file.nameB}>{file.nameB}</span></div>
    <div className="review-panes" onKeyDown={(e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); search.current?.focus() }
    }}>
      {(['a', 'b'] as const).map((side) => <div key={side} ref={side === 'a' ? viewport : rightViewport} className="review-scroll" tabIndex={0} aria-label={side === 'a' ? 'Base full file' : 'Patch set full file'} onScroll={(e) => {
        const other = side === 'a' ? rightViewport.current : viewport.current
        if (other && other.scrollTop !== e.currentTarget.scrollTop) other.scrollTop = e.currentTarget.scrollTop
        setTop(e.currentTarget.scrollTop)
      }}>
        <div className="review-lines" style={{ height: file.rows.length * REVIEW_ROW_HEIGHT, minWidth: `max(100%, ${file.width * 8 + 80}px)` }}>
          {file.rows.slice(from, to).map((row, offset) => <div key={from + offset} className={'review-line' + (from + offset === match ? ' match' : '')} style={{ top: (from + offset) * REVIEW_ROW_HEIGHT }}>
            <div className={'review-side' + (row.changed && row[side] !== undefined ? side === 'a' ? ' removed' : ' added' : '')}>
              <span className="review-number">{side === 'a' ? row.lineA : row.lineB}</span><span>{row[side]}</span>
            </div>
          </div>)}
        </div>
      </div>)}
    </div>
    <footer className="review-stats">{file.rows.length.toLocaleString()} rows · Complete file loaded · Load {Math.round(file.loadMs)} ms · Prepare {Math.round(file.prepareMs)} ms{paintMs !== null && ` · First frame ${Math.round(paintMs)} ms`}</footer>
  </>
}
