import { useEffect, useState } from 'react'
import type { Team } from '../../../shared/types.ts'
import { normalizeTeams } from '../../../shared/model.ts'
import { TeamEditor } from './TeamEditor.tsx'

/**
 * The teams in Settings: a picker for the user's own team, one card per team
 * with its name and its people, and a field to add a team by name. Every
 * change is written at once. The first team added becomes the user's own
 * team, which is what most people want and takes one click to undo; the
 * picker offers "None" as well, which hides the Team Reviews tab. A rename
 * follows through to the picker, and removing the user's own team clears it.
 */
export function TeamsEditor(props: {
  teams: Team[]
  primaryTeam: string
  onChange: (teams: Team[], primaryTeam: string) => void
  canSearch: boolean
}) {
  const [newName, setNewName] = useState('')
  const taken = (name: string, except?: number) => props.teams.some((t, i) => i !== except && t.name === name)

  function add() {
    const name = newName.trim()
    if (!name || taken(name)) return
    const teams = normalizeTeams([...props.teams, { name, members: [], watched: props.teams.length === 0 }])
    props.onChange(teams, props.teams.length === 0 ? name : props.primaryTeam)
    setNewName('')
  }

  function rename(i: number, name: string) {
    const was = props.teams[i]!.name
    if (name === was) return
    const teams = normalizeTeams(props.teams.map((t, j) => (j === i ? { ...t, name } : t)))
    props.onChange(teams, props.primaryTeam === was ? name : props.primaryTeam)
  }

  function setMembers(i: number, members: string[]) {
    props.onChange(
      props.teams.map((t, j) => (j === i ? { ...t, members } : t)),
      props.primaryTeam,
    )
  }

  function setWatched(i: number, watched: boolean) {
    props.onChange(
      props.teams.map((t, j) => (j === i ? { ...t, watched } : t)),
      props.primaryTeam,
    )
  }

  function remove(i: number) {
    const gone = props.teams[i]!.name
    props.onChange(
      props.teams.filter((_, j) => j !== i),
      props.primaryTeam === gone ? '' : props.primaryTeam,
    )
  }

  const dup = newName.trim() !== '' && taken(newName.trim())
  return (
    <div className="teams-editor">
      {props.teams.length > 0 && (
        <label className="primary-pick">
          Your team
          <select value={props.primaryTeam} aria-label="Your team" onChange={(e) => props.onChange(props.teams, e.target.value)}>
            <option value="">None</option>
            {props.teams.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {props.teams.length === 0 && <p className="muted small">No team yet: the team tab and External Reviews are hidden.</p>}
      {props.teams.map((t, i) => (
        <div key={t.name} className={'team-card' + (t.name === props.primaryTeam ? ' primary' : '')}>
          <div className="team-head">
            <NameField value={t.name} taken={(n) => taken(n, i)} onCommit={(n) => rename(i, n)} />
            {t.name === props.primaryTeam && <span className="chip your-team">Your team</span>}
            <label className="check watch" title={t.name === props.primaryTeam ? 'Your own team is always on the board' : 'Fetch every open change of this team, for the team tab'}>
              <input type="checkbox" checked={t.watched || t.name === props.primaryTeam} disabled={t.name === props.primaryTeam} onChange={(e) => setWatched(i, e.target.checked)} />
              Watch
            </label>
            <button type="button" className="btn subtle" title={`Remove the team ${t.name}`} onClick={() => remove(i)}>
              Remove
            </button>
          </div>
          <TeamEditor members={t.members} onChange={(m) => setMembers(i, m)} canSearch={props.canSearch} emptyText="Nobody yet: add the people on this team." />
        </div>
      ))}
      <div className="team-new">
        <input
          value={newName}
          placeholder="New team: a name, such as Platform"
          aria-label="New team name"
          aria-invalid={dup}
          title={dup ? 'A team with this name exists' : undefined}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="btn" disabled={!newName.trim() || dup} onClick={add}>
          Add team
        </button>
      </div>
      {dup && <p className="error small">A team with this name exists.</p>}
    </div>
  )
}

/** A team's name: edited in place, written on Enter or when the field loses focus; an empty or a duplicate name is put back. */
function NameField(props: { value: string; taken: (name: string) => boolean; onCommit: (name: string) => void }) {
  const [text, setText] = useState(props.value)
  useEffect(() => setText(props.value), [props.value])
  const name = text.trim()
  const bad = name === '' || (name !== props.value && props.taken(name))
  function commit() {
    if (bad) setText(props.value)
    else props.onCommit(name)
  }
  return (
    <input
      className="team-name"
      value={text}
      aria-label="Team name"
      aria-invalid={bad}
      title={name === '' ? 'A team needs a name' : bad ? 'A team with this name exists' : 'The team\'s name, as the team tab lists it'}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') setText(props.value)
      }}
    />
  )
}
