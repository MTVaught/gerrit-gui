import { useEffect, useRef, useState, useImperativeHandle, type Ref } from 'react'
import type { ChangeLink, CommentAnchor, DraftCommentInput, FixSuggestion, ReviewComment, ReviewDiscussion, SubmitReviewInput } from '../../../shared/types.ts'
import { api } from '../api.ts'
import { InlineReviewComment, type CreateInlineCommentHost } from './InlineReviewComment.tsx'
import { commentThreads, commentPane } from '../review-comments.ts'

export interface ReviewCommentsHandle { compose(anchor: CommentAnchor): void; canClose(): boolean; openAt(anchor: CommentAnchor): void; review(): void; navigateThread(direction: number): void }
interface Composer { anchor: CommentAnchor; id?: string; inReplyTo?: string; message: string; unresolved: boolean; suggestions?: FixSuggestion[] }
function signature(c: Composer) { return JSON.stringify([c.message, c.unresolved, c.suggestions]) }
function location(c: CommentAnchor) { return `PS ${c.patchSet} · ${c.side === 'PARENT' ? 'Base · ' : ''}${c.path === '/PATCHSET_LEVEL' ? 'Overall review' : c.path}${c.range ? `:${c.range.start_line}–${c.range.end_line}` : c.line ? `:${c.line}` : c.path === '/PATCHSET_LEVEL' ? '' : ' · File comment'}` }
export function ReviewComments({ link, path, originalPath, visible, onOpen, onHide, onReveal, onDiscussion, onPublished, createInlineHost, hasEditor, ref }: {
  link: ChangeLink; path: string; originalPath?: string; visible: boolean; onOpen(): void; onHide(): void; onReveal(comment: ReviewComment): void; onDiscussion(discussion: ReviewDiscussion): void; onPublished(): Promise<void>; createInlineHost: CreateInlineCommentHost; hasEditor: boolean; ref?: Ref<ReviewCommentsHandle>
}) {
  const [discussion, setDiscussion] = useState<ReviewDiscussion | null>(null)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [composer, setComposer] = useState<Composer | null>(null)
  const composerRef = useRef(composer)
  composerRef.current = composer
  const [collapsedThreads, setCollapsedThreads] = useState(new Set<string>())
  const [activeId, setActiveId] = useState('')
  const [allFiles, setAllFiles] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [redact, setRedact] = useState<{ comment: ReviewComment; reason: string } | null>(null)
  const [votes, setVotes] = useState<Record<string, number>>({})
  const [publish, setPublish] = useState<SubmitReviewInput['drafts']>('PUBLISH_ALL_REVISIONS')
  const [notify, setNotify] = useState<SubmitReviewInput['notify']>('ALL')
  const [sent, setSent] = useState('')
  const saved = useRef('')
  const [saveState, setSaveState] = useState('')
  const refreshVersion = useRef(0)
  const mounted = useRef(true)
  async function refresh() {
    const version = ++refreshVersion.current
    try { const data = await api.reviewDiscussion(link.id); if (mounted.current && version === refreshVersion.current) { setDiscussion(data); onDiscussion(data); setError('') } }
    catch (e) { if (mounted.current) setError((e as Error).message) }
  }
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false } }, [link.id])
  function canClose() { return !pending.current && (!composer || saved.current === signature(composer) || !composer.message.trim() && !composer.id || window.confirm('Discard unsaved edits? Saved Gerrit drafts will be kept.')) }
  function compose(anchor: CommentAnchor, comment?: ReviewComment, message = '', reply = false) {
    if (!canClose()) return
    onOpen()
    if (!discussion || discussion.readOnly) return
    setAllFiles(false)
    setError(''); setSaveState(comment && !reply ? 'Saved to Gerrit' : '')
    saved.current = comment && !reply ? JSON.stringify([comment.message ?? '', comment.unresolved ?? false, comment.fix_suggestions]) : ''
    setComposer({ anchor, id: reply ? undefined : comment?.id, inReplyTo: reply ? comment?.id : comment?.in_reply_to, message: message || (!reply ? comment?.message ?? '' : ''), unresolved: comment ? comment.unresolved ?? false : anchor.path !== '/PATCHSET_LEVEL', suggestions: !reply ? comment?.fix_suggestions : undefined })
    onOpen()
  }
  function review() { if (discussion && !discussion.readOnly && canClose()) { setComposer(null); onOpen(); setSendOpen(true) } }
  useImperativeHandle(ref, () => ({ compose, canClose, review, openAt(position) {
    const comment = [...(discussion?.comments ?? []), ...(discussion?.drafts ?? [])].find(c => c.patch_set === position.patchSet && c.path === position.path && (c.side ?? 'REVISION') === position.side && (c.line ?? c.range?.end_line ?? 0) === (position.line ?? 0))
    if (!comment) { compose(position); return }
    const thread = threads.find(thread => thread.some(c => c.id === comment.id))
    setCollapsedThreads(current => { const updated = new Set(current); updated.delete(thread?.[0]?.id ?? comment.id); return updated })
    setActiveId(comment.id); onOpen()
  }, navigateThread(direction) {
    const index = inlineThreads.findIndex(thread => thread.some(c => c.id === activeId))
    const next = inlineThreads[index < 0 ? direction > 0 ? 0 : inlineThreads.length - 1 : index + direction]?.[0]
    if (next) { setCollapsedThreads(current => { const updated = new Set(current); updated.delete(next.id); return updated }); setActiveId(next.id); onOpen(); onReveal(next) }
  } }))
  useEffect(() => {
    if (!visible || !activeId) return
    const comment = [...(discussion?.comments ?? []), ...(discussion?.drafts ?? [])].find(c => c.id === activeId)
    if (comment) onReveal(comment)
  }, [visible, activeId])
  async function write(operation: () => Promise<unknown>) {
    if (pending.current) return
    pending.current = true
    setBusy(true); setError(''); setSent('')
    try { await operation(); await refresh() } catch (e) { setError((e as Error).message) }
    finally { pending.current = false; setBusy(false) }
  }
  async function save(close = true) {
    if (!composer?.message.trim() || pending.current) return
    pending.current = true
    const editing = composer
    setBusy(true); setError(''); setSaveState('Saving…')
    try {
      const { anchor, id, inReplyTo, message, unresolved, suggestions } = editing
      const { patchSet, ...position } = anchor
      const input: DraftCommentInput = { ...position, id, in_reply_to: inReplyTo, message, unresolved, fix_suggestions: suggestions }
      const result = await api.saveReviewDraft(link.id, patchSet, input)
      saved.current = signature(editing)
      setSaveState('Saved to Gerrit')
      const finished = close && composerRef.current && signature(composerRef.current) === signature(editing)
      setComposer(current => close && current && signature(current) === signature(editing) ? null : current ? { ...current, id: result.id } : null)
      if (finished) onReveal(result)
      await refresh()
    } catch (e) { setError((e as Error).message); setSaveState('Could not save draft. Retry before leaving.') }
    finally { pending.current = false; setBusy(false) }
  }
  useEffect(() => {
    if (!composer?.message.trim() || busy || error || saved.current === signature(composer)) return
    const timer = setTimeout(() => { void save(false) }, 600)
    return () => clearTimeout(timer)
  }, [composer, busy, error])
  function anchor(c: ReviewComment): CommentAnchor { return { patchSet: c.patch_set, path: c.path, side: c.side ?? 'REVISION', parent: c.parent, line: c.line, range: c.range } }
  const draftIds = new Set(discussion?.drafts.map(c => c.id))
  const threads = commentThreads([...(discussion?.comments ?? []), ...(discussion?.drafts ?? [])])
  const shown = threads.filter(t => allFiles || t.some(c => c.path === path || c.path === originalPath || c.path === '/PATCHSET_LEVEL'))
  const publishing = (discussion?.drafts ?? []).filter(c => publish === 'PUBLISH_ALL_REVISIONS' || publish === 'PUBLISH' && c.patch_set === link.patchSet)
  const positionPane = (position: CommentAnchor) => !hasEditor ? null : commentPane(link, path, originalPath ?? path, { ...position, patch_set: position.patchSet, id: '', updated: '' })
  const composerForm = composer ? <form className="review-comment-compose" onKeyDown={e => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key.toLowerCase() === 's')) { e.preventDefault(); e.stopPropagation(); void save() }
      }} onSubmit={e => { e.preventDefault(); void save() }}>
        <strong>{composer.inReplyTo ? 'Draft reply' : 'Draft comment'}</strong><small>{location(composer.anchor)}</small>
        <textarea aria-label="Draft comment" value={composer.message} onChange={e => { setError(''); setComposer({ ...composer, message: e.target.value }) }} placeholder="Write a comment…" />
        <label><input type="checkbox" checked={composer.unresolved} disabled={busy} onChange={e => { setError(''); setComposer({ ...composer, unresolved: e.target.checked }) }} />Unresolved</label>
        {composer.anchor.range && composer.anchor.side === 'REVISION' && <button type="button" className="btn" disabled={busy || Boolean(composer.suggestions?.length)} onClick={() => { setError(''); setComposer({ ...composer, suggestions: [...(composer.suggestions ?? []), { description: 'Suggested replacement', replacements: [{ path: composer.anchor.path, range: composer.anchor.range!, replacement: '' }] }] }) }}>Suggest replacement for selected range</button>}
        {composer.suggestions?.map((suggestion, index) => <fieldset key={index}><legend>Suggested fix</legend>
          <input aria-label="Fix description" value={suggestion.description} onChange={e => { setError(''); setComposer({ ...composer, suggestions: composer.suggestions!.map((s, i) => i === index ? { ...s, description: e.target.value } : s) }) }} />
          {suggestion.replacements.map((replacement, r) => <label key={r}>{replacement.path}:{replacement.range.start_line}–{replacement.range.end_line}<textarea aria-label="Suggested replacement" value={replacement.replacement} onChange={e => { setError(''); setComposer({ ...composer, suggestions: composer.suggestions!.map((s, i) => i === index ? { ...s, replacements: s.replacements.map((part, j) => j === r ? { ...part, replacement: e.target.value } : part) } : s) }) }} /></label>)}
          <button type="button" className="btn" disabled={busy} onClick={() => setComposer({ ...composer, suggestions: composer.suggestions!.filter((_, i) => i !== index) })}>Remove suggestion</button>
        </fieldset>)}
        <div><button className="btn primary" disabled={busy || !composer.message.trim()}>Save</button><button type="button" className="btn" disabled={busy} onClick={() => { if (canClose()) setComposer(null) }}>Close editor</button></div>
        <small role="status">{saveState || 'Drafts save automatically to Gerrit.'}</small>
        <small>Saved drafts are private until you publish a review.</small>
      </form> : null
  function renderThread(thread: ReviewComment[], inline = false) {
          const root = thread[0]!, last = thread[thread.length - 1]!
          if (thread.length === 1 && !composer?.inReplyTo && composer?.id === root.id) return null
          const replyingHere = inline && Boolean(composer?.inReplyTo && thread.some(c => c.id === composer.inReplyTo || c.id === composer.id))
          return <section className="review-comment-thread" data-active={thread.some(c => c.id === activeId)} key={root.id}>
            <div className="review-thread-heading"><button className="btn" aria-label={collapsedThreads.has(root.id) ? 'Expand thread' : 'Collapse thread'} aria-expanded={!collapsedThreads.has(root.id)} onClick={() => setCollapsedThreads(current => { const updated = new Set(current); if (updated.has(root.id)) updated.delete(root.id); else updated.add(root.id); return updated })}>{collapsedThreads.has(root.id) ? '▸' : '▾'}</button><button className="review-comment-location" onClick={() => { setAllFiles(false); onReveal(root) }}>{location(anchor(root))}</button></div>
            <span className={last.unresolved ? 'comment-unresolved' : 'muted'}>{last.unresolved ? 'Unresolved' : 'Resolved'}</span>
            {!collapsedThreads.has(root.id) && <div className="review-thread-body">
            {thread.filter(c => c.id !== composer?.id).map(c => <article data-review-comment-id={c.id} key={c.id} className={draftIds.has(c.id) ? 'comment-draft' : ''}>
              <strong>{draftIds.has(c.id) ? 'Your draft' : c.author?.name ?? c.author?.username ?? 'Reviewer'}</strong><time>{c.updated.replace(' ', 'T').slice(0, 19).replace('T', ' ')}</time>
              <p>{c.message}</p>
              {c.fix_suggestions?.map((suggestion, index) => <details key={suggestion.fix_id ?? index}><summary>{suggestion.description}</summary>{suggestion.replacements.map((replacement, i) => <div key={i}><small>{replacement.path}:{replacement.range.start_line}–{replacement.range.end_line}</small><pre>{replacement.replacement}</pre></div>)}
                {!draftIds.has(c.id) && suggestion.fix_id && !discussion?.readOnly && <button className="btn" disabled={busy} onClick={() => void write(async () => { await api.applyReviewFix(link.id, c.patch_set, suggestion.fix_id!); setSent('Suggested fix applied to your Gerrit change edit. Open Gerrit to review and publish the edit.') })}>Apply to Gerrit change edit</button>}
              </details>)}
              {!discussion?.readOnly && <div className="review-comment-actions">
                {draftIds.has(c.id) ? <><button className="btn" disabled={busy} onClick={() => compose(anchor(c), c)}>Edit</button><button className="btn" disabled={busy} onClick={() => void write(async () => { await api.deleteReviewDraft(link.id, c.patch_set, c.id); if (composer?.id === c.id) setComposer(null) })}>Discard draft</button></>
                  : <><button className="btn" disabled={busy} onClick={() => compose(anchor(c), c, '', true)}>Reply</button><button className="btn" onClick={() => { void api.changeUrl({ id: link.id, project: link.project }).then(url => navigator.clipboard.writeText(`${url}/comment/${c.id}`)).then(() => setSent('Comment link copied.')).catch(e => setError(e.message)) }}>Copy link</button><button className="btn" disabled={busy} onClick={() => compose(anchor(c), c, `${(c.message ?? '').split('\n').map(line => '> ' + line).join('\n')}\n\n`, true)}>Quote</button>
                    {discussion?.canDeletePublished && <button className="btn" disabled={busy} onClick={() => setRedact({ comment: c, reason: '' })}>Delete published comment</button>}</>}
              </div>}
            </article>)}
            {!discussion?.readOnly && <div className="review-comment-actions">
              {['Done', 'Ack', last.unresolved ? 'Resolve' : 'Unresolve'].map(action => <button className="btn" disabled={busy} key={action} onClick={() => {
                if (!canClose()) return
                setAllFiles(false)
                saved.current = ''; setError(''); setSaveState('')
                setComposer({ anchor: anchor(last), id: draftIds.has(last.id) ? last.id : undefined, inReplyTo: draftIds.has(last.id) ? last.in_reply_to : last.id, message: draftIds.has(last.id) && last.message ? last.message + (action === 'Done' ? '\n\nDone.' : action === 'Ack' ? '\n\nAcknowledged.' : '') : action === 'Ack' ? 'Acknowledged.' : action === 'Done' ? 'Done.' : action === 'Resolve' ? 'Resolved.' : 'Reopening discussion.', unresolved: action === 'Unresolve', suggestions: draftIds.has(last.id) ? last.fix_suggestions : undefined }); onOpen()
              }}>{action}</button>)}
            </div>}
            {replyingHere && composerForm}
            </div>}
          </section>
        }
  const inlineThreads = shown.filter(thread => thread.some(c => positionPane(anchor(c))))
  const embeddedReply = Boolean(composer?.inReplyTo && inlineThreads.some(thread => thread.some(c => c.id === composer.inReplyTo || c.id === composer.id)))
  return <>
    <div className="review-comments" aria-label="Review comments">
      <strong>Comments</strong><span>{discussion?.drafts.length ?? 0} drafts</span>
      <button className="btn" onClick={visible ? onHide : onOpen}>{visible ? 'Hide' : 'Show comments'}</button>
      <button className="btn" disabled={busy} onClick={() => void refresh()}>Refresh</button>
      <button className="btn" disabled={!path || !discussion || discussion.readOnly || busy} onClick={() => compose({ patchSet: link.patchSet!, path, side: 'REVISION' })}>File comment</button>
      <button className="btn" disabled={!discussion || discussion.readOnly || busy} onClick={review}>Review / vote</button>
      <button className="btn" onClick={() => setAllFiles(true)}>All comments ({threads.length})</button>
      {error && <span className="error" role="alert">{error}</span>}
      {sent && <span role="status">{sent}</span>}
      {!discussion && !error && <span role="status">Loading comments…</span>}
    </div>
    {visible && inlineThreads.map(thread => {
      const position = anchor(thread.find(c => positionPane(anchor(c)))!)
      return <InlineReviewComment key={thread[0]!.id} focus={Boolean(composer?.inReplyTo && thread.some(c => c.id === composer.inReplyTo || c.id === composer.id))} anchor={position} createHost={createInlineHost}>{renderThread(thread, true)}</InlineReviewComment>
    })}
    {composer && positionPane(composer.anchor) && !embeddedReply && <InlineReviewComment focus anchor={composer.anchor} createHost={createInlineHost}>{composerForm}</InlineReviewComment>}
    {composer && !positionPane(composer.anchor) && <SendReview onClose={() => { if (canClose()) setComposer(null) }}>{composerForm}</SendReview>}
    {allFiles && <SendReview onClose={() => setAllFiles(false)}><h2>All comment threads</h2><p className="muted">Threads on this comparison appear inline. Open other locations to view their code.</p>{threads.map(thread => renderThread(thread))}<button className="btn" onClick={() => setAllFiles(false)}>Close</button></SendReview>}
    {redact && <form className="review-comment-compose" onSubmit={e => { e.preventDefault(); void write(async () => { await api.deleteReviewComment(link.id, redact.comment.patch_set, redact.comment.id, redact.reason); setRedact(null) }) }}>
        <strong>Delete published comment</strong><p>This removes its text for all reviewers. Gerrit records the deletion reason.</p>
        <input aria-label="Deletion reason" placeholder="Reason" required value={redact.reason} disabled={busy} onChange={e => setRedact({ ...redact, reason: e.target.value })} />
        <button className="btn" disabled={busy || !redact.reason.trim()}>Delete comment</button><button type="button" className="btn" disabled={busy} onClick={() => setRedact(null)}>Cancel</button>
      </form>}
    {sendOpen && discussion && <SendReview onClose={() => { if (!busy) setSendOpen(false) }}>
      <h2>Publish review · PS {link.patchSet}</h2>
      <p className="muted">Save any comment edits before publishing. Votes apply to the selected patch set.</p>
      {Object.entries(discussion.permittedLabels).map(([label, values]) => <label key={label}>{label}<select aria-label={label} value={votes[label] ?? ''} disabled={busy || link.patchSet !== discussion.latestPatchSet} onChange={e => setVotes(previous => { const next = { ...previous }; if (e.target.value === '') delete next[label]; else next[label] = Number(e.target.value); return next })}><option value="">Keep current vote ({discussion.labels[label]?.all?.find(account => account._account_id === discussion.self._account_id)?.value ?? 0})</option>{values.map(value => <option key={value} value={Number(value)}>{value} {discussion.labels[label]?.values?.[value]}</option>)}</select></label>)}
      {link.patchSet !== discussion.latestPatchSet && <p>Switch to the latest patch set to vote.</p>}
      <button className="btn" disabled={busy} onClick={() => { setSendOpen(false); compose({ patchSet: link.patchSet!, path: '/PATCHSET_LEVEL', side: 'REVISION' }) }}>Add overall review comment as a draft</button>
      <label>Drafts<select aria-label="Publish drafts" value={publish} disabled={busy} onChange={e => setPublish(e.target.value as SubmitReviewInput['drafts'])}><option value="PUBLISH_ALL_REVISIONS">Publish all my drafts on this change</option><option value="PUBLISH">Publish drafts on selected patch set</option><option value="KEEP">Keep drafts private</option></select></label>
      <p>{publishing.length} drafts will be published.</p><ul className="review-publish-list">{publishing.map(c => <li key={c.id}>{location(anchor(c))}: {c.message?.slice(0, 100)}</li>)}</ul>
      <label>Notify<select value={notify} disabled={busy} onChange={e => setNotify(e.target.value as SubmitReviewInput['notify'])}>{Object.entries({ ALL: 'Everyone', OWNER_REVIEWERS: 'Owner and reviewers', OWNER: 'Owner only', NONE: 'No email' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy} onClick={() => void write(async () => {
        await api.submitReview(link, { labels: link.patchSet === discussion.latestPatchSet ? votes : {}, drafts: publish, draft_ids_to_publish: publishing.map(c => c.id), notify })
        setVotes({}); setSendOpen(false); setSent('Review published to Gerrit.'); await onPublished()
      })}>{busy ? 'Sending…' : 'Send review'}</button><button className="btn" disabled={busy} onClick={() => setSendOpen(false)}>Cancel</button>
    </SendReview>}
  </>
}
function SendReview({ children, onClose }: { children: React.ReactNode; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const focus = document.activeElement as HTMLElement; dialog.current?.showModal(); dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus(); return () => { dialog.current?.close(); focus?.focus() } }, [])
  return <dialog ref={dialog} className="review-send-dialog" onKeyDown={e => e.stopPropagation()} onCancel={e => { e.preventDefault(); e.stopPropagation(); onClose() }}>{children}</dialog>
}
