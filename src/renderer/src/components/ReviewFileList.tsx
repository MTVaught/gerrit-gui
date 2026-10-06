import { useRef, useState, type Ref } from 'react'

export function ReviewFileList({ paths, selected, reviewed, busy, onOpen, onReviewed, ref }: {
  paths: string[]; selected: string; reviewed: Set<string> | null; busy: boolean
  onOpen: (path: string) => void; onReviewed: (path: string, reviewed: boolean) => void; ref: Ref<HTMLElement>
}) {
  const [unreviewedOnly, setUnreviewedOnly] = useState(false)
  const [width, setWidth] = useState(190)
  const drag = useRef<{ x: number; width: number } | null>(null)
  const visible = paths.filter((path) => !unreviewedOnly || !reviewed?.has(path))
  const groups = new Map<string, string[]>()
  for (const path of visible) {
    const directory = path.startsWith('/') ? '' : path.slice(0, Math.max(0, path.lastIndexOf('/')))
    if (!groups.has(directory)) groups.set(directory, [])
    groups.get(directory)!.push(path)
  }
  const count = paths.filter((path) => reviewed?.has(path)).length
  function resize(next: number) { setWidth(Math.max(140, Math.min(360, next))) }
  return <>
    <nav ref={ref} className="review-files" aria-label="Changed files" style={{ width }}>
      <div className="review-files-heading"><strong>Files</strong><span aria-live="polite">{reviewed ? `${count}/${paths.length} reviewed` : 'Loading status…'}</span></div>
      <label className="review-files-filter"><input type="checkbox" checked={unreviewedOnly} disabled={!reviewed} onChange={(e) => setUnreviewedOnly(e.target.checked)} />Unreviewed only</label>
      <div className="review-files-list">
        {[...groups].map(([directory, files]) => <section key={directory} aria-label={directory || 'Root files'}>
          {directory && <div className="review-directory" title={directory}>{directory}</div>}
          {files.map((path) => {
            const done = Boolean(reviewed?.has(path))
            return <div key={path} className={'review-file-row' + (path === selected ? ' selected' : '') + (done ? ' is-reviewed' : '')}>
              <button className="review-status" aria-label={`${done ? 'Mark unreviewed' : 'Mark reviewed'}: ${path}`} aria-pressed={done} disabled={!reviewed || busy} title={done ? 'Reviewed. Click to mark unreviewed.' : 'Unreviewed. Click to mark reviewed.'} onClick={() => onReviewed(path, !done)}>
                {done ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" /></svg>}
              </button>
              <button className="review-file-name" data-review-path={path} aria-label={`Open ${path}`} title={path} aria-current={path === selected} onClick={() => onOpen(path)}>{path === '/COMMIT_MSG' ? 'Commit message' : path.split('/').at(-1)}</button>
            </div>
          })}
        </section>)}
        {paths.length > 0 && visible.length === 0 && <p className="review-files-empty">All files reviewed.</p>}
      </div>
    </nav>
    <div className="review-file-resize" role="separator" aria-label="Resize file list" aria-orientation="vertical" aria-valuemin={140} aria-valuemax={360} aria-valuenow={width} tabIndex={0}
      onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); drag.current = { x: e.clientX, width }; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => { if (drag.current) resize(drag.current.width + e.clientX - drag.current.x) }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); resize(width + (e.key === 'ArrowRight' ? 10 : -10)) } }} />
  </>
}
