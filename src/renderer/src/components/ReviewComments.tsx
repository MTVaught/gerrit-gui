import { useEffect, useRef, useState, useImperativeHandle, type Ref } from 'react'
import { createPortal } from 'react-dom'
import type { ChangeLink, CommentAnchor, DraftCommentInput, FixSuggestion, ReviewComment, ReviewDiscussion, ReviewCommentPosition, SubmitReviewInput, ReviewDiff, AccountInfo, SuggestedReviewerInfo } from '../../../shared/types.ts'
import { ReviewMarkdown } from './ReviewMarkdown.tsx'
import { commentSuggestions, commentDate, relativeCommentDate } from '../review-details.ts'
import { api } from '../api.ts'
import { LinkIcon, DeleteIcon } from './Icons.tsx'
import { InlineReviewComment, type CreateInlineCommentHost } from './InlineReviewComment.tsx'
import { commentThreads, displayCommentAnchor } from '../review-comments.ts'

export interface ReviewCommentsHandle { compose(anchor: CommentAnchor): void; canClose(): boolean; openAt(anchor: CommentAnchor): void; review(): void; navigateThread(direction: number): void }
interface Composer { anchor: CommentAnchor; id?: string; inReplyTo?: string; message: string; unresolved: boolean; suggestions?: FixSuggestion[] }
function signature(c: Composer) { return JSON.stringify([c.message, c.unresolved, c.suggestions]) }
function location(c: CommentAnchor) { return `PS ${c.patchSet} · ${c.side === 'PARENT' ? 'Base · ' : ''}${c.path === '/PATCHSET_LEVEL' ? 'Overall review' : c.path}${c.range ? `:${c.range.start_line}–${c.range.end_line}` : c.line ? `:${c.line}` : c.path === '/PATCHSET_LEVEL' ? '' : ' · File comment'}` }
export function ReviewComments({ link, path, originalPath, visible, onOpen, onHide, onReveal, onHighlight, onRefresh, onDiscussion, onPublished, createInlineHost, hasEditor, controls, positions, ref }: {
  link: ChangeLink; path: string; originalPath?: string; visible: boolean; onOpen(): void; onHide(): void; onReveal(comment: ReviewComment, original?: boolean): void; onHighlight(comment: ReviewComment | null): void; onRefresh(): void; onDiscussion(discussion: ReviewDiscussion): void; onPublished(): Promise<void>; createInlineHost: CreateInlineCommentHost; hasEditor: boolean; controls: HTMLElement | null; positions: ReviewCommentPosition[]; ref?: Ref<ReviewCommentsHandle>
}) {
  const [discussion, setDiscussion] = useState<ReviewDiscussion | null>(null)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [composer, setComposer] = useState<Composer | null>(null)
  const composerRef = useRef(composer)
  composerRef.current = composer
  const [expandedComments, setExpandedComments] = useState(new Map<string, boolean>())
  const editingStart = useRef<Composer | null>(null)
  const [activeId, setActiveId] = useState('')
  const [allFiles, setAllFiles] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [redact, setRedact] = useState<{ comment: ReviewComment; reason: string } | null>(null)
  const [commentFilter, setCommentFilter] = useState('all')
  const [authorFilter, setAuthorFilter] = useState('all')
  const [preview, setPreview] = useState<{ comment: ReviewComment; suggestion: FixSuggestion; diffs?: Record<string, ReviewDiff> } | null>(null)
  const [markdownPreview, setMarkdownPreview] = useState(false)
  const [newReviewer, setNewReviewer] = useState('')
  const [reviewerSuggestions, setReviewerSuggestions] = useState<SuggestedReviewerInfo[]>([])
  const [lookupError, setLookupError] = useState('')
  useEffect(() => {
    let active = true
    setReviewerSuggestions([]); setLookupError('')
    if (newReviewer.trim().length < 2) return
    const timer = setTimeout(() => { void api.suggestReviewers(link.id, newReviewer.trim()).then(items => { if (active) setReviewerSuggestions(items) }).catch(e => { if (active) setLookupError(e.message) }) }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [newReviewer, link.id])
  const [reviewerState, setReviewerState] = useState<'REVIEWER' | 'CC'>('REVIEWER')
  const [addedReviewers, setAddedReviewers] = useState<NonNullable<SubmitReviewInput['reviewers']>>([])
  const [attention, setAttention] = useState<Record<string, boolean>>({})
  const [updates, setUpdates] = useState('')
  const fingerprint = useRef('')
  const [votes, setVotes] = useState<Record<string, number>>({})
  const [publish, setPublish] = useState<SubmitReviewInput['drafts']>('PUBLISH_ALL_REVISIONS')
  const [notify, setNotify] = useState<SubmitReviewInput['notify']>('ALL')
  const [sent, setSent] = useState('')
  const saved = useRef('')
  const [saveState, setSaveState] = useState('')
  const refreshVersion = useRef(0)
  const mounted = useRef(true)
  async function refresh(notifyUpdate = false) {
    const version = ++refreshVersion.current
    try { const data = await api.reviewDiscussion(link.id); if (mounted.current && version === refreshVersion.current) { const next = JSON.stringify([data.latestPatchSet, data.updated, data.comments.map(c => [c.id, c.updated])]); if (notifyUpdate && fingerprint.current && next !== fingerprint.current) { setUpdates('This change has new comments or a patch set.'); onRefresh() }; fingerprint.current = next; setDiscussion(data); onDiscussion(data); setError('') } }
    catch (e) { if (mounted.current) setError((e as Error).message) }
  }
  useEffect(() => { mounted.current = true; void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh(true) }, 30000); return () => { mounted.current = false; clearInterval(timer) } }, [link.id])
  function canClose() { return !pending.current && (!composer || saved.current === signature(composer) || !composer.message.trim() && !composer.id || window.confirm('Discard unsaved edits? Saved Gerrit drafts will be kept.')) }
  function compose(anchor: CommentAnchor, comment?: ReviewComment, message = '', reply = false) {
    if (!canClose()) return false
    onOpen()
    if (!discussion || discussion.readOnly) return false
    setAllFiles(false)
    setError(''); setSent(''); setSaveState(comment && !reply ? 'Saved to Gerrit' : '')
    saved.current = comment && !reply ? JSON.stringify([comment.message ?? '', comment.unresolved ?? false, comment.fix_suggestions]) : ''
    const next: Composer = { anchor: reply ? replyAnchor(comment!) : anchor, id: reply ? undefined : comment?.id, inReplyTo: reply ? comment?.id : comment?.in_reply_to, message: message || (!reply ? comment?.message ?? '' : ''), unresolved: comment ? comment.unresolved ?? false : anchor.path !== '/PATCHSET_LEVEL', suggestions: !reply ? comment?.fix_suggestions : undefined }
    editingStart.current = comment && !reply ? structuredClone(next) : null
    setComposer(next)
    onOpen()
    return true
  }
  function review() { if (discussion && !discussion.readOnly && canClose()) { const overall = discussion.drafts.find(c => c.path === '/PATCHSET_LEVEL' && c.patch_set === link.patchSet); compose({ patchSet: link.patchSet!, path: '/PATCHSET_LEVEL', side: 'REVISION' }, overall); setAttention({}); onOpen(); setSendOpen(true) } }
  useImperativeHandle(ref, () => ({ compose, canClose, review, openAt(position) {
    const comment = [...(discussion?.comments ?? []), ...(discussion?.drafts ?? [])].find(c => { const mapped = display(c); return mapped && mapped.patchSet === position.patchSet && mapped.path === position.path && mapped.side === position.side && (mapped.line ?? mapped.range?.end_line ?? 0) === (position.line ?? 0) })
    if (!comment) { compose(position); return }
    const thread = threads.find(thread => thread.some(c => c.id === comment.id))
    setExpandedComments(current => { const updated = new Map(current); thread?.forEach(c => updated.set(c.id, true)); return updated })
    setActiveId(comment.id); onOpen()
  }, navigateThread(direction) {
    const index = inlineThreads.findIndex(thread => thread.some(c => c.id === activeId))
    const next = inlineThreads[index < 0 ? direction > 0 ? 0 : inlineThreads.length - 1 : index + direction]?.[0]
    if (next) { setExpandedComments(current => { const updated = new Map(current); updated.set(next.id, true); return updated }); setActiveId(next.id); onOpen(); onReveal(next) }
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
    if (composer?.anchor.path === '/PATCHSET_LEVEL' && composer.id && !composer.message.trim() && !busy && !error) {
      const current = composer
      const timer = setTimeout(() => { void write(async () => { await api.deleteReviewDraft(link.id, current.anchor.patchSet, current.id!); saved.current = signature(current); setComposer(value => value && value.id === current.id ? { ...value, id: undefined } : value) }) }, 600)
      return () => clearTimeout(timer)
    }
    if (!composer?.message.trim() || busy || error || saved.current === signature(composer)) return
    const timer = setTimeout(() => { void save(false) }, 600)
    return () => clearTimeout(timer)
  }, [composer, busy, error])
  function anchor(c: ReviewComment): CommentAnchor { return { patchSet: c.patch_set, path: c.path, side: c.side ?? 'REVISION', parent: c.parent, line: c.line, range: c.range } }
  const draftIds = new Set(discussion?.drafts.map(c => c.id))
  const threads = commentThreads([...(discussion?.comments ?? []), ...(discussion?.drafts ?? [])])
  const display = (c: ReviewComment) => hasEditor ? displayCommentAnchor(link, path, originalPath ?? path, c, positions) : null
  function replyAnchor(comment: ReviewComment): CommentAnchor {
    return display(comment) ?? positions.find(position => position.id === comment.id && position.anchor.patchSet === link.patchSet)?.anchor ?? positions.find(position => position.id === comment.id && position.anchor.patchSet === link.basePatchSet)?.anchor ?? anchor(comment)
  }
  const shown = threads.filter(t => allFiles || t.some(c => c.path === path || c.path === originalPath || display(c) || c.path === '/PATCHSET_LEVEL'))
  const publishing = (discussion?.drafts ?? []).filter(c => publish === 'PUBLISH_ALL_REVISIONS' || publish === 'PUBLISH' && c.patch_set === link.patchSet)
  const composerPosition = composer ? display({ ...composer.anchor, patch_set: composer.anchor.patchSet, id: composer.id ?? '', updated: '' }) : null
  async function cancelEdit() {
    if (!composer || pending.current) return
    const current = composer
    const initial = editingStart.current
    await write(async () => {
      if (initial?.id) {
        const { patchSet, ...position } = initial.anchor
        await api.saveReviewDraft(link.id, patchSet, { ...position, id: initial.id, in_reply_to: initial.inReplyTo, message: initial.message, unresolved: initial.unresolved, fix_suggestions: initial.suggestions })
      } else if (current.id) await api.deleteReviewDraft(link.id, current.anchor.patchSet, current.id)
      setComposer(null)
    })
  }
  const composerForm = composer ? <form className="review-comment-compose" data-unresolved={composer.unresolved} onKeyDown={e => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key.toLowerCase() === 's')) { e.preventDefault(); e.stopPropagation(); void save() }
      }} onSubmit={e => { e.preventDefault(); void save() }}>
        <strong title="Only visible to you. Publish using Reply at the top of the review.">{composer.inReplyTo ? 'Draft reply' : 'Draft'}</strong>
        <textarea rows={3} aria-label="Draft comment" value={composer.message} onChange={e => { setError(''); setComposer({ ...composer, message: e.target.value }) }} placeholder="Write a comment…" />
        <button type="button" className="btn" onClick={() => setMarkdownPreview(value => !value)}>{markdownPreview ? 'Edit comment' : 'Preview formatting'}</button>{markdownPreview && <ReviewMarkdown message={composer.message} />}
        <label><input type="checkbox" checked={!composer.unresolved} disabled={busy} onChange={e => { setError(''); setComposer({ ...composer, unresolved: !e.target.checked }) }} />Resolved</label>
        {composer.anchor.range && composer.anchor.side === 'REVISION' && <button type="button" className="btn" disabled={busy || Boolean(composer.suggestions?.length)} onClick={() => { setError(''); setComposer({ ...composer, suggestions: [...(composer.suggestions ?? []), { description: 'Suggested replacement', replacements: [{ path: composer.anchor.path, range: composer.anchor.range!, replacement: '' }] }] }) }}>Suggest replacement for selected range</button>}
        {composer.suggestions?.map((suggestion, index) => <fieldset key={index}><legend>Suggested fix</legend>
          <input aria-label="Fix description" value={suggestion.description} onChange={e => { setError(''); setComposer({ ...composer, suggestions: composer.suggestions!.map((s, i) => i === index ? { ...s, description: e.target.value } : s) }) }} />
          {suggestion.replacements.map((replacement, r) => <label key={r}>{replacement.path}:{replacement.range.start_line}–{replacement.range.end_line}<textarea aria-label="Suggested replacement" value={replacement.replacement} onChange={e => { setError(''); setComposer({ ...composer, suggestions: composer.suggestions!.map((s, i) => i === index ? { ...s, replacements: s.replacements.map((part, j) => j === r ? { ...part, replacement: e.target.value } : part) } : s) }) }} /></label>)}
          <button type="button" className="btn" disabled={busy} onClick={() => setComposer({ ...composer, suggestions: composer.suggestions!.filter((_, i) => i !== index) })}>Remove suggestion</button>
        </fieldset>)}
        <div><button className="btn primary" disabled={busy || !composer.message.trim()}>Save</button><button type="button" className="btn" disabled={busy} onClick={() => void cancelEdit()}>Cancel</button></div>
        <small role="status">{saveState || 'Drafts save automatically to Gerrit.'}</small>
      </form> : null
  async function previewSuggestion(comment: ReviewComment, suggestion: FixSuggestion) {
    setPreview({ comment, suggestion }); setError('')
    try { const diffs = await api.previewReviewFix(link.id, comment.patch_set, suggestion); setPreview(current => current?.suggestion === suggestion ? { comment, suggestion, diffs } : current) } catch (e) { setError((e as Error).message) }
  }
  function openDraft(comment: ReviewComment) { if (!canClose()) return; setSendOpen(false); if (compose(anchor(comment), comment)) onReveal(comment) }
  function copyCommentLink(comment: ReviewComment) {
    void api.changeUrl({ id: link.id, project: link.project })
      .then(url => navigator.clipboard.writeText(`${url}/comment/${comment.id}`))
      .then(() => setSent('Comment link copied.'))
      .catch(e => setError(e.message))
  }
  function renderThread(thread: ReviewComment[], inline = false) {
    const root = thread[0]!, last = thread[thread.length - 1]!
    if (thread.length === 1 && !composer?.inReplyTo && composer?.id === root.id) return null
    const replyingHere = inline && Boolean(composer?.inReplyTo && thread.some(c => c.id === composer.inReplyTo || c.id === composer.id))
    const editingHere = inline && Boolean(composer?.id && thread.some(c => c.id === composer.id))
    function reply(message = '') {
      if (compose(anchor(last), last, message, true) && !inline) onReveal(last)
    }
    function quickReply(message: string) {
      const { patchSet, ...position } = replyAnchor(last)
      void write(() => api.saveReviewDraft(link.id, patchSet, { ...position, in_reply_to: last.id, message, unresolved: false }))
    }
    return <section onMouseEnter={() => onHighlight(thread.find(comment => comment.range) ?? last)} onMouseLeave={() => onHighlight(null)} onFocusCapture={() => onHighlight(thread.find(comment => comment.range) ?? last)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) onHighlight(null) }} className="review-comment-thread" data-unresolved={replyingHere || editingHere ? composer!.unresolved : Boolean(last.unresolved)} data-review-thread-id={root.id} data-active={thread.some(c => c.id === activeId)} key={root.id}>
      {!inline && <button className="review-comment-location" onClick={() => { setAllFiles(false); onReveal(root) }}>{location(anchor(root))}</button>}
      {thread.filter(c => c.id !== composer?.id).map(c => {
        const draft = draftIds.has(c.id)
        const expanded = expandedComments.get(c.id) ?? (draft || Boolean(last.unresolved))
        const mapped = display(c)
        return <article data-review-comment-id={c.id} key={c.id} className={draft ? 'comment-draft' : ''}>
          <div className="review-comment-heading" onClick={event => { if (!(event.target as HTMLElement).closest('button')) setExpandedComments(current => new Map(current).set(c.id, !expanded)) }}>
            {draft ? <strong title="Only visible to you until published.">Draft</strong> : <ReviewAccount account={c.author} />}
            {mapped && mapped.patchSet !== c.patch_set && <button className="review-comment-location review-comment-origin" onClick={() => { setAllFiles(false); onReveal(c, true) }}>From PS {c.patch_set}</button>}
            {!expanded && <span className="review-comment-preview">{c.message}</span>}
            {!draft && expanded && discussion?.canDeletePublished && <button className="review-comment-icon" aria-label="Delete published comment" title="Delete comment" disabled={busy} onClick={() => setRedact({ comment: c, reason: '' })}><DeleteIcon /></button>}
            {expanded && <time title={commentDate(c.updated).toLocaleString()} dateTime={Number.isFinite(commentDate(c.updated).getTime()) ? commentDate(c.updated).toISOString() : undefined}>{relativeCommentDate(c.updated)}</time>}
            <button className="review-comment-toggle" aria-label={expanded ? 'Collapse comment' : 'Expand comment'} aria-expanded={expanded} onClick={() => setExpandedComments(current => new Map(current).set(c.id, !expanded))}>{expanded ? '▴' : '▾'}</button>
          </div>
          {expanded && <div className="review-comment-body">
            <ReviewMarkdown message={c.message ?? ''} />
            {commentSuggestions(c).map((suggestion, index) => <details key={suggestion.fix_id ?? index}><summary>{suggestion.description}</summary>{suggestion.replacements.map((replacement, i) => <div key={i}><small>{replacement.path}:{replacement.range.start_line}–{replacement.range.end_line}</small><pre>{replacement.replacement}</pre></div>)}
              {!draft && <button className="btn" disabled={busy} onClick={() => void previewSuggestion(c, suggestion)}>Preview suggested fix</button>}
            </details>)}
            {!discussion?.readOnly && draft && <div className="review-comment-actions">
              <label><input type="checkbox" checked={!c.unresolved} disabled={busy} onChange={e => { const { patchSet, ...position } = anchor(c); void write(() => api.saveReviewDraft(link.id, patchSet, { ...position, id: c.id, in_reply_to: c.in_reply_to, message: c.message ?? '', unresolved: !e.target.checked, fix_suggestions: c.fix_suggestions })) }} />Resolved</label>
              <button className="btn" disabled={busy} onClick={() => compose(anchor(c), c)}>Edit</button>
              <button className="btn" disabled={busy} onClick={() => void write(() => api.deleteReviewDraft(link.id, c.patch_set, c.id))}>Discard draft</button>
              {c.in_reply_to && <button className="review-comment-icon" aria-label="Copy link to this comment" title="Copy link to this comment" onClick={() => copyCommentLink(root)}><LinkIcon /></button>}
            </div>}
          </div>}
        </article>
      })}
      {!draftIds.has(last.id) && !replyingHere && !editingHere && <div className="review-comment-actions review-thread-footer">
        <span className={last.unresolved ? 'comment-unresolved' : 'muted'}>{last.unresolved ? 'Unresolved' : 'Resolved'}</span>
        {!discussion?.readOnly && <><button className="btn" disabled={busy} onClick={() => reply()}>Reply</button><button className="btn" disabled={busy} onClick={() => reply(`${(last.message ?? '').split('\n').map(line => '> ' + line).join('\n')}\n\n`)}>Quote</button>
          {last.unresolved && <><button className="btn" disabled={busy} onClick={() => quickReply('Acknowledged')}>Ack</button><button className="btn" disabled={busy} onClick={() => quickReply('Done')}>Done</button></>}
        </>}
        <button className="review-comment-icon" aria-label="Copy link to this comment" title="Copy link to this comment" onClick={() => copyCommentLink(root)}><LinkIcon /></button>
      </div>}
      {(replyingHere || editingHere) && composerForm}
    </section>
  }
  const inlineThreads = shown.filter(thread => thread.some(c => display(c)) && !(thread.length === 1 && !composer?.inReplyTo && composer?.id === thread[0]!.id))
  const embeddedReply = Boolean(composer?.inReplyTo && inlineThreads.some(thread => thread.some(c => c.id === composer.inReplyTo || c.id === composer.id)))
  return <>
    {controls && createPortal(<div className="review-comments" aria-label="Review comments">
      <button className="btn primary" disabled={!discussion || discussion.readOnly || busy} onClick={review} title="Reply and vote (a)">Reply{discussion?.drafts.length ? ` (${discussion.drafts.length})` : ''}</button>
      <details className="review-menu" onClick={event => { if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false }}>
        <summary className="btn">Comments</summary>
        <div className="review-menu-items">
          <button className="btn" onClick={() => setAllFiles(true)}>All comments ({threads.length})</button>
          <button className="btn" onClick={visible ? onHide : onOpen}>{visible ? 'Hide comments' : 'Show comments'}</button>
          <button className="btn" disabled={!path || !discussion || discussion.readOnly || busy} onClick={() => compose({ patchSet: link.patchSet!, path, side: 'REVISION' })}>File comment</button>
          <button className="btn" disabled={busy} onClick={() => { onRefresh(); void refresh() }}>Refresh comments</button>
        </div>
      </details>
    </div>, controls)}
    {(updates || error || sent || !discussion) && <div className="review-comment-notice">
      {updates && discussion?.latestPatchSet === link.patchSet && <span role="status">{updates} <button className="btn" onClick={() => setUpdates('')}>Dismiss</button></span>}
      {error && <span className="error" role="alert">{error}</span>}
      {sent && <span role="status">{sent}</span>}
      {!discussion && !error && <span role="status">Loading comments…</span>}
    </div>}
    {visible && inlineThreads.map(thread => {
      const position = display(thread.find(c => display(c))!)!
      return <InlineReviewComment key={thread[0]!.id} focus={Boolean(composer?.inReplyTo && thread.some(c => c.id === composer.inReplyTo || c.id === composer.id))} anchor={position} createHost={createInlineHost}>{renderThread(thread, true)}</InlineReviewComment>
    })}
    {composer && composerPosition && !embeddedReply && <InlineReviewComment focus anchor={composerPosition!} createHost={createInlineHost}>{composerForm}</InlineReviewComment>}
    {composer && !composerPosition && !sendOpen && <SendReview onClose={() => { if (canClose()) setComposer(null) }}><h2>{location(composer.anchor)}</h2>{composerForm}</SendReview>}
    {allFiles && <SendReview onClose={() => setAllFiles(false)}><h2>All comment threads</h2><p className="muted">Threads on this comparison appear inline. Open other locations to view their code.</p><div className="review-comment-filters"><label>Show<select aria-label="Filter comments" value={commentFilter} onChange={e => setCommentFilter(e.target.value)}><option value="all">All comments</option><option value="unresolved">Unresolved</option><option value="resolved">Resolved</option><option value="drafts">My drafts</option></select></label><label>Author<select aria-label="Filter comment author" value={authorFilter} onChange={e => setAuthorFilter(e.target.value)}><option value="all">Everyone</option>{[...new Map([...(discussion?.comments ?? []), ...(discussion?.drafts ?? [])].map(c => [c.author?._account_id ?? discussion?.self._account_id, c.author ?? discussion?.self])).values()].map(account => account && <option key={account._account_id} value={account._account_id}>{account.name ?? account.username}</option>)}</select></label></div>{threads.filter(thread => (commentFilter === 'all' || commentFilter === 'unresolved' && thread.at(-1)?.unresolved || commentFilter === 'resolved' && !thread.at(-1)?.unresolved || commentFilter === 'drafts' && thread.some(c => draftIds.has(c.id))) && (authorFilter === 'all' || thread.some(c => String(c.author?._account_id ?? discussion?.self._account_id) === authorFilter))).map(thread => <div key={thread[0]!.id}>{thread[0]!.context_lines?.length ? <pre className="review-comment-context">{thread[0]!.context_lines.map(line => `${line.line_number}: ${line.context_line}`).join('\n')}</pre> : null}{renderThread(thread)}</div>)}<button className="btn" onClick={() => setAllFiles(false)}>Close</button></SendReview>}
    {redact && <SendReview onClose={() => { if (!busy) setRedact(null) }}><form className="review-comment-compose" onSubmit={e => { e.preventDefault(); void write(async () => { await api.deleteReviewComment(link.id, redact.comment.patch_set, redact.comment.id, redact.reason); setRedact(null) }) }}>
        <strong>Delete published comment</strong><p>This removes its text for all reviewers. Gerrit records the deletion reason.</p>
        <input aria-label="Deletion reason" placeholder="Reason" required value={redact.reason} disabled={busy} onChange={e => setRedact({ ...redact, reason: e.target.value })} />
        <button className="btn" disabled={busy || !redact.reason.trim()}>Delete comment</button><button type="button" className="btn" disabled={busy} onClick={() => setRedact(null)}>Cancel</button>
      </form></SendReview>}
    {preview && <SendReview onClose={() => { if (!busy) setPreview(null) }}><h2>Preview suggested fix</h2>
      {!preview.diffs && !error && <p role="status">Loading preview…</p>}
      {preview.diffs && Object.entries(preview.diffs).map(([file, diff]) => <section key={file}><h3>{file}</h3><pre className="review-fix-preview">{diff.content.map((part, index) => <span key={index}>{part.skip ? <span>{`… ${part.skip} unchanged lines\n`}</span> : null}{part.ab?.map((line, i) => <span key={`ab${i}`}>{`  ${line}\n`}</span>)}{part.a?.map((line, i) => <span className="review-fix-removed" key={`a${i}`}>{`− ${line}\n`}</span>)}{part.b?.map((line, i) => <span className="review-fix-added" key={`b${i}`}>{`+ ${line}\n`}</span>)}</span>)}</pre></section>)}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy || !preview.diffs || discussion?.readOnly} onClick={() => void write(async () => { if (preview.suggestion.fix_id) await api.applyReviewFix(link.id, preview.comment.patch_set, preview.suggestion.fix_id); else await api.applyProvidedReviewFix(link.id, preview.comment.patch_set, preview.suggestion); setPreview(null); setSent('Suggested fix applied to your Gerrit change edit. Open Gerrit to review and publish the edit.') })}>Apply to Gerrit change edit</button><button className="btn" disabled={busy} onClick={() => setPreview(null)}>Cancel</button>
    </SendReview>}
    {sendOpen && discussion && <SendReview onClose={() => { if (canClose()) { setSendOpen(false); setComposer(null) } }}>
      <h2>Publish review · PS {link.patchSet}</h2>
      <p className="muted">Votes apply to the selected patch set. Comments save as Gerrit drafts.</p>
      {composer?.anchor.path === '/PATCHSET_LEVEL' && <label>Summary<textarea rows={3} aria-label="Review summary" value={composer.message} onChange={e => { setError(''); setComposer({ ...composer, message: e.target.value }) }} placeholder="Write a review summary…" /><small role="status">{saveState || 'Drafts save automatically to Gerrit.'}</small></label>}
      {Object.entries(discussion.permittedLabels).map(([label, values]) => <fieldset className="review-votes" key={label}><legend>{label}</legend><div role="radiogroup" aria-label={label}>
        <button className="btn" role="radio" aria-checked={votes[label] === undefined} disabled={busy || link.patchSet !== discussion.latestPatchSet} onClick={() => setVotes(current => { const next = { ...current }; delete next[label]; return next })}>Keep ({discussion.labels[label]?.all?.find(account => account._account_id === discussion.self._account_id)?.value ?? 0})</button>
        {values.map(value => <button key={value} className="btn" role="radio" aria-label={`${label} ${value}`} aria-checked={votes[label] === Number(value)} title={discussion.labels[label]?.values?.[value]} disabled={busy || link.patchSet !== discussion.latestPatchSet} onClick={() => setVotes(current => ({ ...current, [label]: Number(value) }))}>{value}</button>)}
      </div></fieldset>)}
      {link.patchSet !== discussion.latestPatchSet && <p>Switch to the latest patch set to vote.</p>}
      <label>Drafts<select aria-label="Publish drafts" value={publish} disabled={busy} onChange={e => setPublish(e.target.value as SubmitReviewInput['drafts'])}><option value="PUBLISH_ALL_REVISIONS">Publish all my drafts on this change</option><option value="PUBLISH">Publish drafts on selected patch set</option><option value="KEEP">Keep drafts private</option></select></label>
      <p>{publishing.length} drafts will be published.</p><ul className="review-publish-list">{publishing.filter(c => c.path !== '/PATCHSET_LEVEL').map(c => <li key={c.id}><button className="review-comment-location" disabled={busy} onClick={() => openDraft(c)}>{location(anchor(c))}: {c.message?.slice(0, 100)}</button></li>)}</ul>
      <details className="review-participants"><summary>Reviewers, CC and attention set</summary>
        <label>Account or email<input aria-label="Add reviewer account" value={newReviewer} onChange={e => setNewReviewer(e.target.value)} /></label>
        {lookupError && <p className="error" role="alert">{lookupError}</p>}
        {reviewerSuggestions.length > 0 && <ul className="review-outline">{reviewerSuggestions.map((item, index) => <li key={item.account?._account_id ?? item.group?.id ?? index}><button className="btn" onClick={() => { const value = item.account?._account_id?.toString() ?? item.group?.id; if (value) { setAddedReviewers(current => [...current.filter(entry => entry.reviewer !== value), { reviewer: value, state: reviewerState }]); setNewReviewer('') } }}>{item.account?.name ?? item.account?.email ?? item.group?.name}</button></li>)}</ul>}
        <label>Role<select aria-label="Reviewer role" value={reviewerState} onChange={e => setReviewerState(e.target.value as 'REVIEWER' | 'CC')}><option value="REVIEWER">Reviewer</option><option value="CC">CC</option></select></label>
        <button className="btn" disabled={busy || !newReviewer.trim()} onClick={() => { setAddedReviewers(current => [...current.filter(item => item.reviewer !== newReviewer.trim()), { reviewer: newReviewer.trim(), state: reviewerState }]); setNewReviewer('') }}>Add</button>
        {addedReviewers.map(item => <div key={item.reviewer}>{item.reviewer} · {item.state}<button className="btn" onClick={() => setAddedReviewers(current => current.filter(value => value !== item))}>Remove</button></div>)}
        {(['REVIEWER', 'CC'] as const).map(role => (discussion.reviewers?.[role] ?? []).map(account => <div className="review-existing-participant" key={account._account_id}>{account.name ?? account.username} · {role === 'CC' ? 'CC' : 'Reviewer'}<button className="btn" disabled={busy} onClick={() => setAddedReviewers(current => [...current.filter(item => item.reviewer !== String(account._account_id)), { reviewer: String(account._account_id), state: role === 'CC' ? 'REVIEWER' : 'CC' }])}>Move to {role === 'CC' ? 'Reviewer' : 'CC'}</button><button className="btn" disabled={busy} onClick={() => void write(() => api.act({ type: 'removeReviewer', id: link.id, accountId: account._account_id }))}>Remove</button></div>))}
        <fieldset><legend>Attention set</legend>{[...new Map([discussion.owner, ...(discussion.reviewers?.REVIEWER ?? []), ...(discussion.reviewers?.CC ?? []), ...Object.values(discussion.attention ?? {}).map(value => value.account), discussion.self].filter((account): account is AccountInfo => Boolean(account)).map(account => [account._account_id, account])).values()].map(account => <label key={account._account_id}><input type="checkbox" checked={attention[String(account._account_id)] ?? Boolean(discussion.attention?.[String(account._account_id)])} disabled={busy} onChange={e => setAttention(current => ({ ...current, [String(account._account_id)]: e.target.checked }))} />{account.name ?? account.username}</label>)}</fieldset>
      </details>
      <label>Notify<select value={notify} disabled={busy} onChange={e => setNotify(e.target.value as SubmitReviewInput['notify'])}>{Object.entries({ ALL: 'Everyone', OWNER_REVIEWERS: 'Owner and reviewers', OWNER: 'Owner only', NONE: 'No email' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy || Boolean(composer && (composer.message.trim() || composer.id) && saved.current !== signature(composer))} onClick={() => void write(async () => {
        await api.submitReview(link, { labels: link.patchSet === discussion.latestPatchSet ? votes : {}, drafts: publish, draft_ids_to_publish: publishing.map(c => c.id), notify, reviewers: addedReviewers, add_to_attention_set: Object.entries(attention).filter(([, checked]) => checked).map(([user]) => ({ user, reason: 'Review reply' })), remove_from_attention_set: Object.entries(attention).filter(([, checked]) => !checked).map(([user]) => ({ user, reason: 'Review reply' })) })
        setVotes({}); setAddedReviewers([]); setComposer(null); setSendOpen(false); setSent('Review published to Gerrit.'); await onPublished()
      })}>{busy ? 'Sending…' : 'Send review'}</button><button className="btn" disabled={busy} onClick={() => { if (canClose()) { setSendOpen(false); setComposer(null) } }}>Cancel</button>
    </SendReview>}
  </>
}
function SendReview({ children, onClose }: { children: React.ReactNode; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const focus = document.activeElement as HTMLElement; dialog.current?.showModal(); dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus(); return () => { dialog.current?.close(); focus?.focus() } }, [])
  return <dialog ref={dialog} className="review-send-dialog" onKeyDown={e => e.stopPropagation()} onCancel={e => { e.preventDefault(); e.stopPropagation(); onClose() }}>{children}</dialog>
}

function ReviewAccount({ account }: { account?: AccountInfo }) {
  const name = account?.name ?? account?.username ?? 'Reviewer'
  return <span className="review-account" tabIndex={0}>
    {account?.avatars?.[0]?.url ? <img className="review-avatar" src={account.avatars[0].url} alt="" referrerPolicy="no-referrer" /> : <span className="review-avatar" aria-hidden="true">{name.slice(0, 1)}</span>}
    <strong>{name}</strong><span className="review-account-card" role="tooltip"><strong>{name}</strong>{account?.username && <span>@{account.username}</span>}{account?.email && <span>{account.email}</span>}</span>
  </span>
}
