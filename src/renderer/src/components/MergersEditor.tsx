import type { MergerRule } from '../../../shared/types.ts'
import { useNames } from '../names.ts'
import { TeamEditor } from './TeamEditor.tsx'

/**
 * The mergers list in Settings: one row per project pattern, each with the
 * people to offer. The people editor is the team editor, so entries are
 * usernames or email addresses picked from the server or typed as is.
 */
export function MergersEditor(props: { rules: MergerRule[]; onChange: (rules: MergerRule[]) => void; canSearch: boolean }) {
  const nameFor = useNames(props.rules.flatMap((r) => r.people))
  const update = (i: number, patch: Partial<MergerRule>) => props.onChange(props.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => props.onChange(props.rules.filter((_, j) => j !== i))
  return (
    <div className="mergers-editor">
      {props.rules.length === 0 && <p className="muted small">No mergers yet: the Ready to Merge button opens on the search.</p>}
      {props.rules.map((r, i) => (
        <div key={i} className="merger-rule">
          <div className="merger-project">
            <input
              value={r.project}
              placeholder="Project: platform/*, tools/build, or *"
              aria-label="Project"
              onChange={(e) => update(i, { project: e.target.value })}
            />
            <button type="button" className="btn subtle" title="Remove this row" onClick={() => remove(i)}>
              Remove
            </button>
          </div>
          <TeamEditor
            members={r.people}
            onChange={(people) => update(i, { people })}
            canSearch={props.canSearch}
            emptyText="Nobody yet: add the people to ask for a merge in this project."
            noun="merger"
            nameFor={nameFor}
          />
        </div>
      ))}
      <button type="button" className="btn" onClick={() => props.onChange([...props.rules, { project: props.rules.length === 0 ? '*' : '', people: [] }])}>
        Add project
      </button>
    </div>
  )
}
