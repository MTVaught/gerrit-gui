import type { ChangeInfo, DashboardData, FileInfo, ReviewDelta } from '../shared/types.ts'
import { accountKeys, dashboardQueries, hasTag, isReviewer, isTaggedReviewer, isVisibleOnBoard, lastReviewedPatchSet } from '../shared/model.ts'
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
  await attachReviewDeltas(g, open, self._account_id, keys)
  return { self, open, merged: merged!.filter(visible), fetchedAt: new Date().toISOString(), truncated }
}

/** Deltas already fetched. A pair of patch sets never changes, so an entry is good for the life of the process. */
const deltaCache = new Map<string, ReviewDelta>()
const DELTA_CACHE_MAX = 2000
const DELTA_CONCURRENCY = 6

/**
 * For every change the user reviews and has more to look at, fetch the
 * lines changed since the patch set they last reviewed, one request per
 * change. A failed lookup leaves the change without a delta; the board
 * still shows the whole change's counts.
 */
export async function attachReviewDeltas(g: GerritClient, changes: ChangeInfo[], selfId: number, keys: string[]): Promise<void> {
  const todo = changes.filter((c) => {
    if (c.owner._account_id === selfId || !(isReviewer(c, selfId) || isTaggedReviewer(c, keys))) return false
    const last = lastReviewedPatchSet(c, selfId)
    return last !== null && last < currentPatchSet(c)
  })
  let i = 0
  const worker = async () => {
    while (i < todo.length) {
      const c = todo[i++]!
      const ps = currentPatchSet(c)
      const base = lastReviewedPatchSet(c, selfId)!
      const key = `${c._number}/${base}..${ps}`
      let d = deltaCache.get(key)
      if (!d) {
        try {
          d = sumFiles(base, ps, await g.files(c._number, ps, base))
        } catch {
          continue
        }
        if (deltaCache.size >= DELTA_CACHE_MAX) deltaCache.clear()
        deltaCache.set(key, d)
      }
      c.review_delta = d
    }
  }
  await Promise.all(Array.from({ length: Math.min(DELTA_CONCURRENCY, todo.length) }, worker))
}

function currentPatchSet(c: ChangeInfo): number {
  return (c.current_revision ? c.revisions?.[c.current_revision]?._number : undefined) ?? 0
}

/** Line counts over the files, the commit message and merge list left out as Gerrit does for a change's own counts. */
export function sumFiles(basePatchSet: number, patchSet: number, files: Record<string, FileInfo>): ReviewDelta {
  let insertions = 0
  let deletions = 0
  for (const [path, f] of Object.entries(files)) {
    if (path.startsWith('/')) continue
    insertions += f.lines_inserted ?? 0
    deletions += f.lines_deleted ?? 0
  }
  return { basePatchSet, patchSet, insertions, deletions }
}
