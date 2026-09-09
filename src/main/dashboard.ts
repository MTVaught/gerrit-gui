import type { ChangeInfo, DashboardData } from '../shared/types.ts'
import { dashboardQueries, hasTag, isReviewer } from '../shared/model.ts'
import { READY_TO_MERGE_TAG } from '../shared/constants.ts'
import type { GerritClient } from './gerrit.ts'

const LIMIT = 500

/** Everything the board needs, in two round trips (self + one multi-query). */
export async function fetchDashboard(g: GerritClient, projects: string[]): Promise<DashboardData> {
  const q = dashboardQueries(projects)
  const [self, [direct, wipScan, merged]] = await Promise.all([
    g.self(),
    g.queryChanges([q.direct, q.wipScan, q.merged], LIMIT),
  ])
  const seen = new Set(direct.map((c) => c.id))
  const open: ChangeInfo[] = [...direct]
  for (const c of wipScan) {
    if (seen.has(c.id)) continue
    if (isReviewer(c, self._account_id) || hasTag(c, READY_TO_MERGE_TAG)) {
      open.push(c)
      seen.add(c.id)
    }
  }
  const truncated = [direct, wipScan, merged].some((list) => list.at(-1)?._more_changes === true)
  return { self, open, merged, fetchedAt: new Date().toISOString(), truncated }
}
