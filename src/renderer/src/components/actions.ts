// The owner's and merger's buttons for a change. Shared by the full-size
// card row and the compact ledger, which shows the primary one in its own
// column and the rest in the detail row. The merge itself is not here: the
// merger votes +2 and submits in the Gerrit web UI. The reviewer's button is
// separate (ReviewButton), because it is a split button that opens Gerrit.
import type { ChangeAction, ChangeView } from '../../../shared/types.ts'
import { READY_TO_MERGE_TAG } from '../../../shared/constants.ts'
import { mergerTags } from '../../../shared/model.ts'

export interface ActionSpec {
  key: string
  label: string
  /** Fits the ledger's action column: one short word. */
  short: string
  primary?: boolean
  subtle?: boolean
  disabled?: boolean
  title?: string
  /** Rendered as the merger picker (a button with a menu) instead of a plain button; `run` is then unused. */
  picker?: 'merger'
  run: () => void
}

export function changeActions(v: ChangeView, act: (a: ChangeAction) => Promise<void>): ActionSpec[] {
  const c = v.change
  const id = c._number
  const open = c.status === 'NEW'
  const owner = open && v.isMine
  // The person the author asked, or anyone with +2 when nobody was named (a tag from an older version).
  const merger = (v.state === 'ready-to-merge' || v.staleReadyToMerge) && (v.mergeRequestedFromMe || (v.requestedMerger === null && v.canMerge))
  const readyTags = [READY_TO_MERGE_TAG, ...mergerTags(c)]
  const out: ActionSpec[] = []

  if (owner && !v.reviewRequested && v.state !== 'approved' && v.state !== 'ready-to-merge') {
    const again = v.requestedPatchSet !== null && v.requestedPatchSet < v.patchSet
    const nobody = v.reviewers.length === 0 && v.externalReviewers.length === 0
    out.push({
      key: 'request',
      label: `${again ? 'Re-request' : 'Request'} review (PS ${v.patchSet})`,
      short: again ? 'Re-request' : 'Request',
      primary: true,
      disabled: nobody,
      title: nobody
        ? 'Add a reviewer first'
        : v.reviewers.length === 0
          ? 'Only external reviewers are on this change; it cannot be approved until a team member is added'
          : v.staleReadyToMerge
            ? 'Ask every reviewer to look at this patch set. Also clears the ready-to-merge tag, which was for an earlier patch set.'
            : 'Ask every reviewer to look at this patch set',
      run: () => void act({ type: 'requestReview', id, patchSet: v.patchSet, clearTags: v.staleReadyToMerge ? readyTags : undefined }),
    })
  }
  if (owner && v.reviewRequested && v.state === 'needs-review') {
    out.push({ key: 'withdraw', label: 'Withdraw request', short: 'Withdraw', run: () => void act({ type: 'withdrawReview', id }) })
  }
  if (owner && v.state === 'approved') {
    out.push({
      key: 'ready',
      label: 'Ready to Merge',
      short: 'Ready',
      primary: true,
      picker: 'merger',
      title: 'Pick the person to ask for the merge',
      run: () => undefined,
    })
  }
  if (owner && v.state === 'ready-to-merge') {
    out.push({
      key: 'change-merger',
      label: 'Change merger',
      short: 'Merger',
      picker: 'merger',
      title: 'Ask someone else to merge instead',
      run: () => undefined,
    })
  }
  // The owner does not get a separate "clear" when another button already
  // covers it: re-requesting review clears a stale tag, and the merger picker
  // offers the clear in its menu. So the row keeps one button.
  const covered = out.some((a) => a.key === 'request' || a.key === 'change-merger')
  if (open && (v.state === 'ready-to-merge' || v.staleReadyToMerge) && ((v.isMine && !covered) || merger)) {
    out.push({ key: 'clear', label: 'Clear ready-to-merge', short: 'Clear tag', run: () => void act({ type: 'hashtag', id, remove: readyTags }) })
  }
  if (owner || (merger && v.wip)) {
    out.push({
      key: 'wip',
      label: v.wip ? 'Mark active (runs CI)' : 'Mark WIP',
      short: v.wip ? 'Mark active' : 'Mark WIP',
      subtle: true,
      title: v.wip ? 'Clear WIP so CI runs on this change' : 'Mark WIP so CI stops running on this change',
      run: () => void act({ type: 'setWip', id, wip: !v.wip }),
    })
  }
  return out
}

export function actionClass(a: ActionSpec, extra = ''): string {
  return ['btn', a.primary ? 'primary' : '', a.subtle ? 'subtle' : '', extra].filter(Boolean).join(' ')
}
