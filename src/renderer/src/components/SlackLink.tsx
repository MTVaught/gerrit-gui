import { useEffect, useRef, useState } from 'react'
import type { ChangeAction, ChangeView } from '../../../shared/types.ts'
import { slackTag, slackTags, slackUrl } from '../../../shared/model.ts'
import { api } from '../api.ts'
import { ChatIcon } from './Icons.tsx'

/**
 * The Slack conversation about a change, kept in Gerrit as the hashtag
 * `slack:<url>`. As a tab, it hangs from the top edge of the card (or of the
 * compact line), out of every column: "Slack ↗" opens the link, with
 * a remove button on hover; a dashed "+ Slack" tab opens a small panel with
 * one field for the link. As a pill, in the compact detail row, it is the
 * same in a line of badges, with "+ Slack thread" as the empty state.
 * Anyone on an open change may set or clear it, as anyone may tag a
 * reviewer; the tag is plain Gerrit data, so the Gerrit web UI shows the
 * same link.
 */
export function SlackLink(props: { view: ChangeView; onAct: (a: ChangeAction) => Promise<void>; variant: 'tab' | 'pill' }) {
  const { view: v } = props
  const c = v.change
  const id = c._number
  const open = c.status === 'NEW'
  const canEdit = open && (v.isMine || v.iAmReviewer)
  const [editing, setEditing] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [text, setText] = useState('')
  const wrap = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!editing) return
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return
      if (e.type === 'mousedown' && wrap.current?.contains(e.target as Node)) return
      setEditing(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('resize', close)
    }
  }, [editing])

  function toggle() {
    if (!editing && wrap.current) {
      const r = wrap.current.getBoundingClientRect()
      // Under the link, kept inside the window on the right.
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, document.documentElement.clientWidth - 348)) })
      setText('')
    }
    setEditing((e) => !e)
  }

  const tab = props.variant === 'tab'
  // Inside a compact line, whose cell opens the details on click.
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const url = slackUrl(text)
  async function confirm() {
    if (!url) return
    setEditing(false)
    // One conversation per change: whatever slack: tags are there make way for this one.
    await props.onAct({ type: 'hashtag', id, add: [slackTag(url)], remove: slackTags(c).filter((t) => t !== slackTag(url)) })
  }

  if (v.slackUrl) {
    return (
      <span className={tab ? 'tabmark' : 'badge slack'} title={`Slack conversation about this change: ${v.slackUrl}`} onClick={stop}>
        <button className="link" onClick={() => void api.openUrl(v.slackUrl!)}>
          <ChatIcon />
          Slack<span className="long"> ↗</span>
        </button>
        {canEdit && (
          <button className="chip-x" title="Unlink the Slack conversation: removes the slack: hashtag" onClick={() => void props.onAct({ type: 'hashtag', id, remove: slackTags(c) })}>
            ×
          </button>
        )}
      </span>
    )
  }
  if (!canEdit) return null
  return (
    <span className={tab ? 'tabmark add picker-wrap' : 'picker-wrap slack-add'} ref={wrap} onClick={stop}>
      <button className={tab ? 'link' : 'link muted small'} onClick={toggle} title="Link the Slack conversation about this change" aria-haspopup="dialog" aria-expanded={editing}>
        {tab ? (
          <>
            <ChatIcon />+<span className="long"> Slack</span>
          </>
        ) : (
          '+ Slack thread'
        )}
      </button>
      {editing && pos && (
        <div className="menu picker slack" role="dialog" aria-label="Link a Slack thread" style={{ top: pos.top, left: pos.left }}>
          <h4>Link a Slack thread</h4>
          <p className="muted small">Paste the link from “Copy link” on the message. It is stored on the change as the hashtag slack:&lt;link&gt;, so Gerrit shows it too.</p>
          <div className="picker-search">
            <input
              autoFocus
              value={text}
              placeholder="https://your-team.slack.com/archives/…"
              aria-label="Slack link"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void confirm()
                }
              }}
            />
          </div>
          {text.trim() && !url && <p className="error small">Not a Slack link: it must start with https:// and be on slack.com.</p>}
          <div className="picker-foot">
            <button type="button" className="link muted" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={!url} onClick={() => void confirm()}>
              Link
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
