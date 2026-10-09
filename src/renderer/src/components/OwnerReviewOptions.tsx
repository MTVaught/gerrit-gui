import type { ChangeLink, ChangeView } from '../../../shared/types.ts'
import { api } from '../api.ts'
import { useSettings } from '../settings-context.ts'
import { useLocalReview } from '../review-context.tsx'
import type { ActionSpec, MenuItem } from './actions.ts'

/** Put the owner's diff navigation inside their existing workflow control. */
export function useOwnerReviewOptions(view: ChangeView, actions: ActionSpec[]): ActionSpec[] {
  const { settings } = useSettings()
  const openLocalReview = useLocalReview()
  if (!view.isMine || view.change.status !== 'NEW') return actions
  const { _number: id, project } = view.change
  const link: ChangeLink = { id, project, patchSet: view.patchSet }
  const go = (target: ChangeLink) => {
    if (settings?.localReview && target.patchSet !== undefined) openLocalReview(target, view.change.subject)
    else void api.openChange(target)
  }
  const options: MenuItem[] = [{ key: 'review-base', label: 'Review latest patch set', detail: `Base → PS ${view.patchSet}`, run: () => go(link) }]
  if (view.patchSet > 1) options.push({ key: 'review-previous', label: 'Since previous patch set', detail: `PS ${view.patchSet - 1} → ${view.patchSet}`, run: () => go({ ...link, basePatchSet: view.patchSet - 1 }) })
  options.push(
    { key: 'review-change', label: 'Open change page', detail: `#${id}`, run: () => go({ id, project }) },
    { key: 'review-copy', label: 'Copy diff link', run: () => { void api.changeUrl(link).then(url => navigator.clipboard.writeText(url)) } },
  )
  const target = actions.find(action => ['request', 'withdraw', 'ready', 'change-merger'].includes(action.key))
    ?? actions.find(action => action.menu || action.split || action.picker)
  return actions.map(action => action === target ? { ...action, reviewOptions: options } : action)
}

export function OwnerReviewOptions({ items, close }: { items?: MenuItem[]; close(): void }) {
  if (!items?.length) return null
  return <><hr />{items.map(item => <button key={item.key} role="menuitem" className="menu-item" onClick={() => { close(); item.run() }}>
    <span>{item.label}</span>{item.detail && <span className="muted">{item.detail}</span>}
  </button>)}</>
}
