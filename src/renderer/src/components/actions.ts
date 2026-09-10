// The owner's and merger's buttons for a change. Shared by the full-size
// card row and the compact ledger, which shows the primary one in its own
// column and the rest in the detail row. The reviewer's button is separate
// (ReviewButton), because it is a split button that opens Gerrit.
import type { ChangeAction, ChangeView } from '../../../shared/types.ts'
import { READY_TO_MERGE_TAG } from '../../../shared/constants.ts'

export interface ActionSpec {
  key: string
  label: string
  /** Fits the ledger's action column: one short word. */
  short: string
  primary?: boolean
  subtle?: boolean
  disabled?: boolean
  title?: string
  run: () => void
}

export function changeActions(v: ChangeView, act: (a: ChangeAction) => Promise<void>): ActionSpec[] {
  const c = v.change
  const id = c._number
  const open = c.status === 'NEW'
  const owner = open && v.isMine
  const merger = v.canMerge && (v.state === 'ready-to-merge' || v.staleReadyToMerge)
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
      run: () => void act({ type: 'requestReview', id, patchSet: v.patchSet, clearReadyTag: v.staleReadyToMerge }),
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
      title: 'Tag the change for the merger',
      run: () => void act({ type: 'hashtag', id, add: [READY_TO_MERGE_TAG] }),
    })
  }
  if (v.canMerge && v.state === 'ready-to-merge') {
    out.push({
      key: 'merge',
      label: '+2 and submit',
      short: 'Merge',
      primary: true,
      disabled: v.wip,
      title: v.wip ? 'Still WIP, so CI has not run. Mark it active first.' : 'Vote +2 on this patch set and submit it',
      run: () => void act({ type: 'merge', id }),
    })
  }
  // The owner does not get a separate "clear" for a stale tag when the request
  // button is there: re-requesting review clears it, so one button does both.
  const requesting = out.some((a) => a.key === 'request')
  if (open && (v.state === 'ready-to-merge' || v.staleReadyToMerge) && ((v.isMine && !requesting) || merger)) {
    out.push({ key: 'clear', label: 'Clear ready-to-merge', short: 'Clear tag', run: () => void act({ type: 'hashtag', id, remove: [READY_TO_MERGE_TAG] }) })
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
