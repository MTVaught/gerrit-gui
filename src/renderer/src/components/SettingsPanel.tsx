import { useEffect, useRef, useState } from 'react'
import type { ChangeInspection, ChangeView, MergerRule, SettingsInput, SettingsStatus, SlackWorkspace } from '../../../shared/types.ts'
import { STATE_LABEL, accountKeys, changeNumberOf, classify, explainView, externalPicks, groupsFor, isSlackTeamId, mergersReflect, slackWorkspacesReflect, type TeamSetup } from '../../../shared/model.ts'
import { updateAction, updateButtonLabel, updateSummary } from '../../../shared/update.ts'
import { api, isBrowserMode } from '../api.ts'
import { ago } from '../time.ts'
import { runUpdateAction, useUpdateState } from './Update.tsx'
import { TeamsEditor } from './TeamsEditor.tsx'
import { MergersEditor } from './MergersEditor.tsx'
import { visibleTabs } from './Board.tsx'
import { PlugIcon } from './Icons.tsx'

type SectionId = 'team' | 'mergers' | 'scope' | 'slack' | 'app-icon' | 'window' | 'menu-bar' | 'debug' | 'about'

const SECTIONS: { id: SectionId; label: string; desktopOnly?: boolean }[] = [
  { id: 'team', label: 'Teams' },
  { id: 'mergers', label: 'Mergers' },
  { id: 'scope', label: 'Scope' },
  { id: 'slack', label: 'Slack', desktopOnly: true },
  { id: 'app-icon', label: 'App icon', desktopOnly: true },
  { id: 'window', label: 'Window', desktopOnly: true },
  { id: 'menu-bar', label: 'Menu bar', desktopOnly: true },
  { id: 'debug', label: 'Debug' },
  { id: 'about', label: 'About', desktopOnly: true },
]

type SyncState = { kind: 'saved' } | { kind: 'saving' } | { kind: 'error'; message: string }

/**
 * The settings page: a nav of sections on the left (a picker row in the
 * compact window) and one section at a time on the right. There is no Save
 * button: every control writes as soon as it changes, and the pill in the
 * header says whether the write is done. Text fields write when they lose
 * focus or on Enter. The connection (server, account, password) is not here;
 * the last nav entry opens its own window for it.
 */
export function SettingsPanel(props: {
  settings: SettingsStatus
  compact: boolean
  /** Write these fields over the current settings. */
  save: (patch: Partial<SettingsInput>) => Promise<void>
}) {
  const sections = SECTIONS.filter((s) => !s.desktopOnly || !isBrowserMode)
  const [section, setSection] = useState<SectionId>('team')
  const [sync, setSync] = useState<SyncState>({ kind: 'saved' })
  const s = props.settings
  const connected = Boolean(s.serverUrl && s.username && s.hasPassword)
  const setup: TeamSetup = { teams: s.teams, primaryTeam: s.primaryTeam, includeOwnTeam: s.includeOwnTeam }

  async function apply(patch: Partial<SettingsInput>) {
    setSync({ kind: 'saving' })
    try {
      await props.save(patch)
      setSync({ kind: 'saved' })
    } catch (e) {
      setSync({ kind: 'error', message: (e as Error).message })
    }
  }

  const current = sections.find((x) => x.id === section) ?? sections[0]!
  const host = hostOf(s.serverUrl)
  const connection = (
    <button type="button" className="conn-link" onClick={() => void api.openConnection()} title="Server, username and HTTP password, in their own window">
      <PlugIcon /> Connection <span className="arrow">↗</span>
      <span className="muted small conn-who">{s.username ? `${s.username} · ${host}` : 'not set up'}</span>
    </button>
  )

  return (
    <div className={'settings-page' + (props.compact ? ' compact' : '')}>
      {props.compact ? (
        <div className="section-pick">
          <select value={section} onChange={(e) => setSection(e.target.value as SectionId)} aria-label="Settings section">
            {sections.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <SyncPill state={sync} />
          {connection}
        </div>
      ) : (
        <nav className="section-nav" aria-label="Settings sections">
          {sections.map((x) => (
            <button key={x.id} type="button" className={x.id === section ? 'active' : ''} aria-current={x.id === section} onClick={() => setSection(x.id)}>
              {x.label}
            </button>
          ))}
          <div className="sep" />
          {connection}
        </nav>
      )}
      <main className="settings section-body">
        {!props.compact && (
          <div className="section-head">
            <h1>{current.label}</h1>
            <SyncPill state={sync} />
          </div>
        )}
        {section === 'team' && (
          <>
            <p className="muted">
              The teams sort other people's changes by their owner. Changes owned by <b>your team</b> are on{' '}
              <b>Team Reviews</b>; changes owned by another team, or by someone on no team, are on <b>All Reviews</b>, a
              select box in the tab strip that shows them together, one team at a time, or the rest under <b>Other</b>. The five regular tabs and the counts in the
              tray do not look at the teams; they go by your part on each change. Who decides a change is not a team but
              its primary reviewers, tagged on the change with the "+" button on its row.
            </p>
            <TeamsEditor teams={s.teams} primaryTeam={s.primaryTeam} onChange={(teams, primaryTeam) => void apply({ teams, primaryTeam })} canSearch={connected} />
            {s.primaryTeam !== '' && (
              <label className="check include-own">
                <input type="checkbox" checked={s.includeOwnTeam} onChange={(e) => void apply({ includeOwnTeam: e.target.checked })} />
                Show your team on All Reviews as well: in its list of teams, and among everyone
              </label>
            )}
            <p className="muted small">
              People are stored as usernames; an email address still matches. You are always on your own team, so you do
              not need to add yourself. Start typing to pick from the accounts on the server. Set your team to None to
              hide Team Reviews; remove every team to hide All Reviews too. The "+" button on a change lists your
              team, or everyone on any team when you have not picked one. Your team is on Team Reviews; tick the box to
              have it on All Reviews too.
            </p>
          </>
        )}
        {section === 'mergers' && (
          <>
            <p className="muted">
              Who to offer when you ask for a merge. The <b>Ready to Merge</b> button lists the people set for the project of
              the change, most specific row first; anyone else on the server is a search away. The list only fills that menu.
            </p>
            <MergersSection rules={s.mergers} onSave={(mergers) => void apply({ mergers })} canSearch={connected} />
            <p className="muted small">
              A project is an exact name, a prefix ending in <code>*</code>, or <code>*</code> alone for every project.
            </p>
          </>
        )}
        {section === 'scope' && (
          <>
            <label>
              Projects to watch for WIP reviews (optional)
              <TextField value={s.projects.join(', ')} placeholder="empty for all projects, or platform/*, tools/build" onSave={(v) => void apply({ projects: v.split(',').map((p) => p.trim()).filter(Boolean) })} />
            </label>
            <p className="muted small">
              Gerrit cannot search for WIP changes by reviewer, so the app scans open WIP changes and keeps the ones you are
              on. Leave empty on a small server. Comma-separated; a trailing * matches a prefix. A change here reloads the
              board.
            </p>
          </>
        )}
        {section === 'slack' && (
          <>
            <p className="muted">
              A Slack link on a change opens in the browser unless its workspace is listed here. Slack's "Copy link" names
              the workspace by its subdomain, but the Slack app needs the workspace's <b>team ID</b>, which the link does
              not carry. One row per workspace; a link to a workspace not listed keeps opening in the browser.
            </p>
            <SlackWorkspacesSection rows={s.slackWorkspaces} onSave={(slackWorkspaces) => void apply({ slackWorkspaces })} />
            <h3>Finding the team ID</h3>
            <ol className="muted small steps">
              <li>
                Open the workspace in a web browser at <code>app.slack.com</code>, or in the Slack app click the workspace name
                at the top left and choose <b>Tools &amp; settings</b> then <b>Workspace settings</b>, which opens the browser.
              </li>
              <li>
                Look at the address bar. The client shows <code>app.slack.com/client/T0123ABCD/C…</code>; the first segment
                is the team ID. It starts with <code>T</code>, or with <code>E</code> on Enterprise Grid, where it is the
                org's ID; either works. The settings pages carry the same ID in their address.
              </li>
              <li>
                Enter it next to the subdomain, the part before <code>.slack.com</code> in the workspace's links: for{' '}
                <code>https://acme.slack.com/archives/…</code> the subdomain is <code>acme</code>.
              </li>
            </ol>
            <p className="muted small">
              The Slack app must be installed and signed in to that workspace. If it cannot open the link, the browser
              gets it as before. The change itself keeps the https link, so Gerrit and anyone without this setting still
              open the thread in a browser.
            </p>
          </>
        )}
        {section === 'app-icon' && (
          <>
            <label className="check">
              <input type="checkbox" checked={s.showAppBadge} onChange={(e) => void apply({ showAppBadge: e.target.checked })} />
              Show the total as a badge on the app icon
            </label>
            <p className="muted small">The Dock on macOS, the launcher on Linux and the taskbar on Windows.</p>
          </>
        )}
        {section === 'window' && (
          <>
            <label className="check">
              <input type="checkbox" checked={s.compactOnTop} onChange={(e) => void apply({ compactOnTop: e.target.checked })} />
              Compact window stays on top
            </label>
            <p className="muted small">
              The compact window floats above other windows and follows you to every workspace. Turn this off to let it
              behave like a normal window. The full-size window is never pinned.
            </p>
          </>
        )}
        {section === 'menu-bar' && (
          <>
            <label className="check">
              <input type="checkbox" checked={s.showTrayCounts} onChange={(e) => void apply({ showTrayCounts: e.target.checked })} />
              Show counts on the menu bar icon
            </label>
            <p className="muted small">
              Off, the menu bar keeps the plain icon. The tooltip and the menu still list what waits on you.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={s.badgeStyle === 'glyph'}
                disabled={!s.showTrayCounts}
                onChange={(e) => void apply({ badgeStyle: e.target.checked ? 'glyph' : 'color' })}
              />
              Show glyphs instead of colored counts
            </label>
            <p className="muted small">
              The menu bar shows what waits on you as one colored count per category: Needs Review, Needs Changes, Approved,
              Ready to Merge. Glyphs (◉ ✎ ◆ ⇧) replace the colors if you cannot tell them apart. The counts stand in for the
              app icon, which shows only when nothing waits on you. The tray menu names each category with its count.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={s.showZeroCounts}
                disabled={!s.showTrayCounts}
                onChange={(e) => void apply({ showZeroCounts: e.target.checked })}
              />
              Always show Needs Review, Needs Changes and Approved, even at zero
            </label>
            <p className="muted small">
              Keeps those counts in the menu bar so their position never changes. Ready to Merge appears only when you have
              something to merge, since it needs +2 rights.
            </p>
          </>
        )}
        {section === 'debug' && <DebugSection setup={setup} connected={connected} />}
        {section === 'about' && <AboutSection />}
      </main>
    </div>
  )
}

/** Saved, saving, or the error of the last write. */
function SyncPill(props: { state: SyncState }) {
  const st = props.state
  if (st.kind === 'error') {
    return (
      <span className="sync error" role="alert" title={st.message}>
        Not saved: {st.message}
      </span>
    )
  }
  return (
    <span className={'sync ' + st.kind} role="status">
      <span className="dot" /> {st.kind === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}

/** A text field that writes when it loses focus or on Enter, not on every keystroke. */
function TextField(props: { value: string; placeholder?: string; onSave: (value: string) => void }) {
  const [v, setV] = useState(props.value)
  useEffect(() => setV(props.value), [props.value])
  const commit = () => {
    if (v !== props.value) props.onSave(v)
  }
  return (
    <input
      value={v}
      placeholder={props.placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
    />
  )
}

/**
 * The mergers editor edits a list with text fields in it, so its changes are
 * written a moment after the last keystroke rather than on each one. The
 * save drops rows that are not complete yet (a project with nobody on it, or
 * no project), so when the saved list comes back it is only adopted when it
 * says something else than the rows on screen; otherwise a row just added
 * with Add project would vanish before anyone could be put on it.
 */
function MergersSection(props: { rules: MergerRule[]; onSave: (rules: MergerRule[]) => void; canSearch: boolean }) {
  const [rules, setRules] = useState(props.rules)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  useEffect(() => {
    if (dirty.current) return
    setRules((cur) => (mergersReflect(cur, props.rules) ? cur : props.rules))
  }, [props.rules])
  const change = (next: MergerRule[]) => {
    setRules(next)
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      dirty.current = false
      props.onSave(next)
    }, 400)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return <MergersEditor rules={rules} onChange={change} canSearch={props.canSearch} />
}

/** The Slack workspaces list: rows of text fields, written a moment after the last keystroke, as the mergers list. */
function SlackWorkspacesSection(props: { rows: SlackWorkspace[]; onSave: (rows: SlackWorkspace[]) => void }) {
  const [rows, setRows] = useState(props.rows)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  useEffect(() => {
    if (dirty.current) return
    setRows((cur) => (slackWorkspacesReflect(cur, props.rows) ? cur : props.rows))
  }, [props.rows])
  const change = (next: SlackWorkspace[]) => {
    setRows(next)
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      dirty.current = false
      props.onSave(next)
    }, 400)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const update = (i: number, patch: Partial<SlackWorkspace>) => change(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="mergers-editor slack-workspaces">
      {rows.length === 0 && <p className="muted small">No workspaces yet: Slack links open in the browser.</p>}
      {rows.map((r, i) => {
        const bad = r.teamId.trim() !== '' && !isSlackTeamId(r.teamId)
        return (
          <div key={i} className="merger-rule">
            <div className="merger-project">
              <input value={r.domain} placeholder="Subdomain: acme (from acme.slack.com)" aria-label="Workspace subdomain" onChange={(e) => update(i, { domain: e.target.value })} />
              <input
                value={r.teamId}
                placeholder="Team ID: T0123ABCD or E0123ABCD"
                aria-label="Team ID"
                aria-invalid={bad}
                title={bad ? 'A team ID starts with T or E, followed by letters and digits' : undefined}
                onChange={(e) => update(i, { teamId: e.target.value })}
              />
              <button type="button" className="btn subtle" title="Remove this workspace" onClick={() => change(rows.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
            {bad && <p className="error small">Not a team ID: it starts with T or E, followed by letters and digits.</p>}
          </div>
        )
      })}
      <button type="button" className="btn" onClick={() => change([...rows, { domain: '', teamId: '' }])}>
        Add workspace
      </button>
    </div>
  )
}

type Inspection = { view: ChangeView; raw: ChangeInspection }

/**
 * Look one change up by number or URL and show why the board puts it where
 * it does: the derivation step by step, the tags and keyed values Gerrit
 * holds, the sections it lands in, and the raw change for anything else.
 * The change is read straight from Gerrit, as the board would read it, and
 * classified with the same code, so what is shown is what the board sees.
 */
function DebugSection(props: { setup: TeamSetup; connected: boolean }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Inspection | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)

  async function lookUp() {
    const id = changeNumberOf(input)
    if (id === null) {
      setError('Enter a change number, or paste the URL of the change.')
      return
    }
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const raw = await api.inspectChange(id)
      setResult({ raw, view: classify(raw.change, raw.self._account_id, props.setup, accountKeys(raw.self)) })
    } catch (e) {
      setError((e as Error).message)
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!result) return
    await navigator.clipboard.writeText(JSON.stringify(result.raw, null, 2))
    setCopied(true)
  }

  return (
    <>
      <p className="muted">
        Look a change up the way the board reads it and see why it is where it is: the state, step by step, the hashtags
        and keyed values on it, and the sections it lands in. Nothing here changes the change.
      </p>
      <form
        className="row inspect-form"
        onSubmit={(e) => {
          e.preventDefault()
          void lookUp()
        }}
      >
        <input value={input} placeholder="Change number or URL" aria-label="Change number or URL" disabled={!props.connected} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="btn" disabled={!props.connected || busy || input.trim() === ''}>
          {busy ? 'Looking up…' : 'Look up'}
        </button>
      </form>
      {!props.connected && <p className="muted small">Set up the connection first.</p>}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="inspect">
          <InspectionReport r={result} setup={props.setup} />
          <div className="row">
            <button type="button" className="btn" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? 'Hide raw change' : 'Show raw change'}
            </button>
            <button type="button" className="btn" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy raw change'}
            </button>
          </div>
          {showRaw && <pre className="release-notes raw-change">{JSON.stringify(result.raw.change, null, 2)}</pre>}
        </div>
      )}
    </>
  )
}

function InspectionReport(props: { r: Inspection; setup: TeamSetup }) {
  const { view: v, raw } = props.r
  const c = v.change
  // The Merged tab's history section is returned even when empty, hence the filter. All Reviews is listed per pick.
  const listed = visibleTabs(props.setup).flatMap((t) => {
    const picks = t.id === 'external-reviews' ? externalPicks(props.setup) : [{ pick: undefined, label: '' }]
    return picks.flatMap((p) =>
      groupsFor(t.id, [v], p.pick)
        .filter((g) => g.items.length > 0)
        .map((g) => `${t.label} › ${p.label ? `${p.label} › ` : ''}${g.title}`),
    )
  })
  const keyed = Object.entries(c.custom_keyed_values ?? {})
  const votes = (rs: ChangeView['reviewers']) => rs.map((r) => `${r.account.name ?? r.account.username ?? r.account.email ?? r.account._account_id} ${r.vote > 0 ? '+' : ''}${r.vote}`).join(', ')
  return (
    <>
      <h3>
        <button type="button" className="link-btn" title="Open in Gerrit" onClick={() => void api.openChange({ id: c._number, project: c.project })}>
          #{c._number}
        </button>{' '}
        {c.subject}
      </h3>
      <p className="muted small">
        {c.project} · {c.branch} · {c.status} · owned by {c.owner.name ?? c.owner.username ?? c.owner._account_id}
        {v.isMine ? ' (you)' : ''} · signed in as {raw.self.username ?? raw.self.name}
      </p>
      <h3>Why</h3>
      <ol className="steps">
        {explainView(v).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <h3>What the board sees</h3>
      <dl className="inspect-facts">
        <dt>State</dt>
        <dd>{STATE_LABEL[v.state]}{v.wip ? ' · WIP' : ''}{v.isPrivate ? ' · private' : ''}{v.verified ? ' · verified' : ''}</dd>
        <dt>Listed under</dt>
        <dd>{listed.length > 0 ? listed.join('; ') : 'Not on any tab'}</dd>
        <dt>Hashtags</dt>
        <dd>{c.hashtags?.length ? c.hashtags.map((t) => <code key={t}>{t}</code>) : 'none'}</dd>
        <dt>Keyed values</dt>
        <dd>
          {keyed.length > 0
            ? keyed.map(([k, val]) => (
                <code key={k}>
                  {k} = {val}
                </code>
              ))
            : 'none'}
        </dd>
        <dt>Primary reviewers</dt>
        <dd>{v.reviewers.length > 0 ? votes(v.reviewers) : 'none tagged'}</dd>
        <dt>Other reviewers</dt>
        <dd>{v.otherReviewers.length > 0 ? votes(v.otherReviewers) : 'none'}</dd>
        <dt>Your vote</dt>
        <dd>{v.myVote > 0 ? '+' : ''}{v.myVote}{v.canMerge ? ' · may vote +2' : ''}</dd>
      </dl>
    </>
  )
}

/** Version, update status and the manual check; the same steps as the top bar button and the tray. */
function AboutSection() {
  const state = useUpdateState()
  const [pending, setPending] = useState(false)
  if (!state) return null
  const action = updateAction(state)
  return (
    <>
      <p>
        Gerrit Review Board {state.currentVersion}.{' '}
        <span className="muted">
          {updateSummary(state)}
          {state.checkedAt && ` · Last checked ${ago(new Date(state.checkedAt))}`}
        </span>
      </p>
      <div className="row">
        <button
          className="btn"
          disabled={action === 'none' || pending}
          onClick={async () => {
            setPending(true)
            try {
              await runUpdateAction(state, true)
            } finally {
              setPending(false)
            }
          }}
        >
          {updateButtonLabel(state)}
        </button>
        <button className="btn" onClick={() => void api.openReleaseNotes()}>
          Release notes
        </button>
      </div>
      {state.releaseNotes && <pre className="release-notes">{state.releaseNotes}</pre>}
    </>
  )
}

/** The host of the server URL, for the nav entry; the path prefix would only take room. */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url || 'no server yet'
  }
}
