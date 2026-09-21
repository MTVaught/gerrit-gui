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
  /** Rendered as a button that opens a menu of these; `run` is then unused. The ledger shows them as plain buttons. */
  menu?: MenuItem[]
  /** Rendered as a split button: the main part runs `run`, the caret opens a menu of these other choices. */
  split?: MenuItem[]
  run: () => void
}

export interface MenuItem {
  key: string
  label: string
  /** A few words after the label, in the menu only. */
  detail?: string
  title?: string
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
    // "Re-request" once a round was answered; a request nobody voted on before the next push is not a round.
    const again = v.state === 'iterating'
    // Nobody tagged means nobody to decide: the request is refused until someone is.
    const nobody = v.reviewers.length === 0
    const stale = v.staleReadyToMerge ? ' Also clears the ready-to-merge tag, which was for an earlier patch set.' : ''
    const request = (inPerson: boolean) => void act({ type: 'requestReview', id, patchSet: v.patchSet, history: v.requestedPatchSets, clearTags: v.staleReadyToMerge ? readyTags : undefined, inPerson })
    out.push({
      key: 'request',
      label: `${again ? 'Re-request' : 'Request'} review (PS ${v.patchSet})`,
      short: again ? 'Re-request' : 'Request',
      primary: true,
      disabled: nobody,
      title: nobody
        ? v.otherReviewers.length > 0
          ? 'Tag a primary reviewer first: the people on this change are not waited for until one of them is made primary'
          : 'Add a primary reviewer first'
        : `Ask every primary reviewer to look at this patch set on their own (pass around).${stale}`,
      // The default is a pass-around review; the caret offers the in-person kind.
      split: [
        { key: 'pass-around', label: 'Pass-around review', detail: 'each reviewer on their own', title: `Ask every primary reviewer to look at this patch set on their own.${stale}`, run: () => request(false) },
        { key: 'in-person', label: 'In-person review', detail: 'together with you', title: `Ask every primary reviewer to go through this patch set with you, then vote.${stale}`, run: () => request(true) },
      ],
      run: () => request(false),
    })
  }
  // While a request is open, its kind can be changed without starting a new round.
  const switchKind: MenuItem = {
    key: v.inPerson ? 'pass-around' : 'in-person',
    label: v.inPerson ? 'Switch to pass-around review' : 'Switch to in-person review',
    detail: v.inPerson ? 'each reviewer on their own' : 'together with you',
    title: v.inPerson ? 'Reviewers look at this patch set on their own; the request stays as it is otherwise' : 'Reviewers go through this patch set with you; the request stays as it is otherwise',
    run: () => void act({ type: 'setReviewKind', id, patchSet: v.patchSet, inPerson: !v.inPerson }),
  }
  const requestOpen = owner && v.reviewRequested && (v.state === 'needs-review' || v.state === 'in-person-review')
  // Only a first request nobody has answered can be taken back; later rounds are on record.
  if (v.canWithdrawReview && requestOpen) {
    out.push({ key: 'withdraw', label: 'Withdraw request', short: 'Withdraw', title: 'Nobody has voted yet, so the request is removed entirely', split: [switchKind], run: () => void act({ type: 'withdrawReview', id }) })
  } else if (requestOpen) {
    // No withdraw on a later round, so the kind gets a button of its own.
    out.push({ key: 'kind', label: v.inPerson ? 'In person' : 'Pass around', short: v.inPerson ? 'In person' : 'Pass around', title: 'The kind of review asked for; change it here', menu: [switchKind], run: () => undefined })
  }
  // The merger votes +2 and submits, so the change must be mergeable before
  // they are asked: active (CI runs) and verified (CI passed), on top of approved.
  if (owner && v.state === 'approved') {
    const blocked = v.wip ? 'Mark the change active first: CI does not run on a WIP change' : !v.verified ? 'Wait for Verified +1 on this patch set first' : null
    out.push({
      key: 'ready',
      label: 'Ready to Merge',
      short: 'Ready',
      primary: true,
      picker: 'merger',
      disabled: blocked !== null,
      title: blocked ?? 'Pick the person to ask for the merge',
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
  // The subtle button in the last column. The owner gets a menu with the WIP
  // and private toggles; a merger only clears WIP, so theirs is a plain button.
  const flags: MenuItem[] = []
  if (owner || (merger && v.wip)) {
    flags.push({
      key: 'wip',
      label: v.wip ? 'Mark active' : 'Mark WIP',
      detail: v.wip ? 'runs CI' : 'stops CI',
      title: v.wip ? 'Clear WIP so CI runs on this change' : 'Mark WIP so CI stops running on this change',
      run: () => void act({ type: 'setWip', id, wip: !v.wip }),
    })
  }
  if (owner) {
    flags.push({
      key: 'private',
      label: v.isPrivate ? 'Make public' : 'Make private',
      detail: v.isPrivate ? 'everyone can see it' : 'hides it from others',
      title: v.isPrivate
        ? 'Clear the private flag so anyone with access to the project can see this change'
        : 'Set the private flag so only you, the reviewers and the CCs can see this change',
      run: () => void act({ type: 'setPrivate', id, private: !v.isPrivate }),
    })
  }
  if (flags.length === 1) {
    const f = flags[0]!
    out.push({ key: f.key, label: f.key === 'wip' && v.wip ? 'Mark active (runs CI)' : f.label, short: f.label, subtle: true, title: f.title, run: f.run })
  } else if (flags.length > 1) {
    out.push({ key: 'flags', label: flags[0]!.label, short: flags[0]!.label, subtle: true, title: 'WIP and private flags', menu: flags, run: () => undefined })
  }
  return out
}

export function actionClass(a: ActionSpec, extra = ''): string {
  return ['btn', a.primary ? 'primary' : '', a.subtle ? 'subtle' : '', extra].filter(Boolean).join(' ')
}
