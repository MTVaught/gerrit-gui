import type { ChangeInfo, DashboardData } from '../shared/types.ts'
import { accountKeys, dashboardQueries, hasTag, isReviewer, isTaggedReviewer, isVisibleOnBoard } from '../shared/model.ts'
import { READY_TO_MERGE_TAG } from '../shared/constants.ts'
import type { GerritClient } from './gerrit.ts'

const LIMIT = 500

/**
 * Everything the board needs: self, then one multi-query. Self comes first
 * because the queries search for the `reviewer:` tags that name the user,
 * by username and by email.
 */
export async function fetchDashboard(g: GerritClient, projects: string[], team: string[] = []): Promise<DashboardData> {
  const self = await g.self()
  const keys = accountKeys(self)
  const q = dashboardQueries(projects, keys, team)
  const queries = [q.direct, q.wipScan, q.merged, ...(q.team ? [q.team] : [])]
  const [direct, wipScan, merged, teamOwned = []] = await g.queryChanges(queries, LIMIT)
  // The queries already exclude other people's private changes; this is the
  // guarantee in case a server answers differently.
  const visible = (c: ChangeInfo): boolean => isVisibleOnBoard(c, self._account_id)
  const seen = new Set(direct!.map((c) => c.id))
  const open: ChangeInfo[] = direct!.filter(visible)
  for (const c of [...wipScan!, ...teamOwned]) {
    if (seen.has(c.id) || !visible(c)) continue
    // From the WIP scan only what concerns the user; the team query is kept whole.
    if (teamOwned.includes(c) || isReviewer(c, self._account_id) || isTaggedReviewer(c, keys) || hasTag(c, READY_TO_MERGE_TAG)) {
      open.push(c)
      seen.add(c.id)
    }
  }
  const truncated = [direct!, wipScan!, merged!, teamOwned].some((list) => list.at(-1)?._more_changes === true)
  return { self, open, merged: merged!.filter(visible), fetchedAt: new Date().toISOString(), truncated }
}
