import type { ChangeView } from '../../shared/types.ts'
import type { SortId } from '../../shared/model.ts'
import { ago } from './time.ts'

/**
 * The age cell of a row follows the sort key, so the order on screen can be
 * read off the rows: the last update, when the change was opened, or when the
 * current patch set was pushed.
 */
export function ageCell(v: ChangeView, sort: SortId, compact: boolean): { text: string; title: string } {
  const c = v.change
  // The ledger's sub-line is one clipped line, so it drops the "ago".
  const when = (s: string) => (compact ? ago(s).replace(/ ago$/, '') : ago(s))
  switch (sort) {
    case 'age':
      return { text: `opened ${when(c.created)}`, title: `Opened ${c.created}` }
    case 'patchset':
      return {
        text: compact ? `pushed ${when(v.patchSetCreated)}` : `PS ${v.patchSet} pushed ${when(v.patchSetCreated)}`,
        title: `Patch set ${v.patchSet} pushed ${v.patchSetCreated}`,
      }
    default:
      return { text: ago(c.updated), title: `Updated ${c.updated}` }
  }
}
