import type { ChangeInfo, DashboardData } from '../../shared/types.ts'
import { withChange } from '../../shared/model.ts'

interface Entry {
  change: ChangeInfo | null
  generation: number
  pending: boolean
  protected: boolean
  detail: boolean
  needsDetail: boolean
  mergeabilityVersion: number
}

export interface DashboardTicket {
  epoch: number
  request: number
  generations: Map<number, number>
}

// Detail can include additional Gerrit/plugin fields that search never returns.
// Compare review fields, excluding deltas, pagination, and branch-dependent
// mergeability. Mergeability refreshes independently at an unchanged timestamp.
const BOARD_FIELDS = [
  'id', 'change_id', '_number', 'project', 'branch', 'subject', 'status', 'owner',
  'work_in_progress', 'is_private', 'hashtags', 'topic', 'created', 'updated',
  'submitted', 'submittable', 'insertions', 'deletions', 'unresolved_comment_count',
  'labels', 'permitted_labels', 'attention_set', 'reviewers', 'current_revision',
  'revisions', 'submit_requirements', 'messages', 'custom_keyed_values',
] as const satisfies readonly (keyof ChangeInfo)[]

function fingerprint(change: ChangeInfo): string {
  const server = { ...Object.fromEntries(BOARD_FIELDS.map(key => [key, change[key]])),
    work_in_progress: Boolean(change.work_in_progress), is_private: Boolean(change.is_private),
    hashtags: [...(change.hashtags ?? [])].sort(), custom_keyed_values: change.custom_keyed_values ?? {} }
  return JSON.stringify(server, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)
}

function inaccessible(error: unknown): boolean {
  const status = (error as { status?: number })?.status
  // IPC and browser HTTP preserve Gerrit's error message, but not its class.
  return status === 403 || status === 404 || /(?:^|Error: )GET \/changes\/\d+\/detail: (403|404)\b/.test(String((error as Error)?.message))
}

/** Confirmed detail reads survive lagging searches. All updates publish one board. */
export class DashboardCache {
  private epoch = 0
  private request = 0
  private entries = new Map<number, Entry>()
  private reads = new Map<number, { generation: number; promise: Promise<void> }>()
  private writes = new Map<number, Promise<void>>()
  private base: DashboardData | null = null
  private members: string[] = []
  private projects: string[] = []
  private value: DashboardData | null = null
  private activeReads = 0
  private readQueue: (() => void)[] = []
  private readonly fetchChange: (id: number) => Promise<ChangeInfo>
  private readonly publish: (data: DashboardData | null) => void

  constructor(
    fetchChange: (id: number) => Promise<ChangeInfo>,
    publish: (data: DashboardData | null) => void,
  ) { this.fetchChange = fetchChange; this.publish = publish }

  get context(): number { return this.epoch }

  get snapshot(): DashboardData | null { return this.value }

  reset(): void {
    this.epoch++
    this.request++
    this.entries.clear()
    this.reads.clear()
    this.writes.clear()
    this.base = null
    this.value = null
    this.publish(null)
  }

  setScope(members: string[], projects: string[]): void {
    if (JSON.stringify([members, projects]) === JSON.stringify([this.members, this.projects])) return
    this.members = members
    this.projects = projects
    this.request++
    this.emit()
  }

  beginRefresh(): DashboardTicket {
    return { epoch: this.epoch, request: ++this.request,
      generations: new Map([...this.entries].map(([id, entry]) => [id, entry.generation])) }
  }

  async acceptDashboard(data: DashboardData, ticket: DashboardTicket): Promise<void> {
    if (ticket.epoch !== this.epoch || ticket.request !== this.request) return
    if (this.base && this.base.self._account_id !== data.self._account_id) {
      this.reset()
      return this.acceptDashboard(data, this.beginRefresh())
    }
    const incoming = new Map([...data.open, ...data.merged].map(c => [c._number, c]))
    const validate = new Set<number>()
    for (const [id, change] of incoming) {
      const entry = this.entries.get(id)
      if (!entry) {
        this.entries.set(id, { change, generation: 0, pending: false, protected: false, detail: false, needsDetail: false, mergeabilityVersion: 0 })
        continue
      }
      const superseded = (ticket.generations.get(id) ?? 0) !== entry.generation
      const same = entry.change !== null && fingerprint(entry.change) === fingerprint(change)
      const older = entry.change !== null && change.updated < entry.change.updated
      const equalConflict = entry.detail && entry.change?.updated === change.updated && !same
      // Protected review fields can lag in search while branch mergeability is
      // fresh. Replace even an absent result, but only for the same revision and
      // before any newer write. Keep it out of equal-timestamp review conflicts.
      if (!superseded && !entry.pending && entry.change && entry.change.status === 'NEW' &&
          change.status === 'NEW' && entry.change.current_revision &&
          entry.change.current_revision === change.current_revision &&
          entry.change.branch === change.branch && entry.change.project === change.project) {
        entry.change = { ...entry.change, mergeable: change.mergeable }
        entry.mergeabilityVersion++
      }
      if (entry.needsDetail || entry.pending || superseded || older || equalConflict || (entry.detail && entry.change === null) || (entry.protected && !same)) {
        entry.protected = true
        if (!entry.pending) validate.add(id)
      } else {
        entry.change = change
        entry.mergeabilityVersion++
        entry.protected = false
      }
    }
    for (const [id, entry] of this.entries) {
      if (!incoming.has(id) && (entry.protected || entry.pending)) {
        if (!entry.pending) validate.add(id)
      }
    }
    // A truncated search cannot establish that an old member disappeared.
    this.base = data.truncated && this.value
      ? { ...data, open: [...data.open, ...this.value.open.filter(c => !incoming.has(c._number))],
          merged: [...data.merged, ...this.value.merged.filter(c => !incoming.has(c._number))] }
      : data
    this.emit()
    const ids = [...validate]
    let index = 0
    const failures: unknown[] = []
    await Promise.all(Array.from({ length: Math.min(6, ids.length) }, async () => {
      while (index < ids.length && ticket.epoch === this.epoch) {
        try { await this.revalidate(ids[index++]!) } catch (error) { failures.push(error) }
      }
    }))
    if (ticket.epoch === this.epoch && ticket.request === this.request && failures.length) throw failures[0]
  }

  /** Serialize intersecting writes, including multi-change sequence edits. */
  async mutate(ids: number[], write: () => Promise<void>): Promise<void> {
    const unique = [...new Set(ids)]
    const epoch = this.epoch
    const previous = unique.flatMap(id => this.writes.has(id) ? [this.writes.get(id)!] : [])
    const operation = (async () => {
      await Promise.all(previous)
      if (epoch !== this.epoch) return
      for (const id of unique) {
        const entry = this.entry(id)
        entry.generation++
        entry.pending = true
        entry.needsDetail = true
        entry.protected = true
      }
      let failure: unknown
      let failed = false
      try { await write() } catch (error) { failure = error; failed = true }
      if (epoch !== this.epoch) return
      for (const id of unique) this.entry(id).pending = false
      // A failed multi-step write may still have changed Gerrit.
      const results = await Promise.allSettled(unique.map(id => this.revalidate(id)))
      if (failed) throw failure
      const readFailure = results.find(result => result.status === 'rejected')
      if (readFailure?.status === 'rejected') throw readFailure.reason
    })()
    const tail = operation.catch(() => undefined)
    for (const id of unique) this.writes.set(id, tail)
    try { await operation } finally {
      for (const id of unique) if (this.writes.get(id) === tail) this.writes.delete(id)
    }
  }

  revalidate(id: number): Promise<void> {
    const entry = this.entry(id)
    if (entry.pending) return Promise.resolve()
    const epoch = this.epoch
    const generation = entry.generation
    const mergeabilityVersion = entry.mergeabilityVersion
    const current = () => epoch === this.epoch && entry.generation === generation && !entry.pending
    const existing = this.reads.get(id)
    if (existing?.generation === generation) return existing.promise
    const promise = (async () => {
      try {
        const change = await this.loadChange(id, current)
        if (!change || !current()) return
        if (entry.change && change.updated < entry.change.updated) return
        // A detail read started before an accepted branch-status refresh must
        // not restore its older mergeability for the same revision.
        const keepMergeability = entry.mergeabilityVersion !== mergeabilityVersion &&
          entry.change?.current_revision && entry.change.current_revision === change.current_revision &&
          entry.change.branch === change.branch && entry.change.project === change.project
        entry.change = keepMergeability ? { ...change, mergeable: entry.change!.mergeable } : change
        entry.mergeabilityVersion++
      } catch (error) {
        if (!current()) return
        if (!inaccessible(error)) throw error
        entry.change = null
      }
      entry.needsDetail = false
      entry.detail = true
      entry.protected = true
      this.emit()
    })()
    this.reads.set(id, { generation, promise })
    void promise.finally(() => { if (this.reads.get(id)?.promise === promise) this.reads.delete(id) }).catch(() => undefined)
    return promise
  }

  private async loadChange(id: number, current: () => boolean): Promise<ChangeInfo | undefined> {
    if (this.activeReads >= 6) await new Promise<void>(resolve => this.readQueue.push(resolve))
    else this.activeReads++
    try {
      if (current()) return await this.fetchChange(id)
    } finally {
      const next = this.readQueue.shift()
      if (next) next()
      else this.activeReads--
    }
  }

  private entry(id: number): Entry {
    let entry = this.entries.get(id)
    if (!entry) {
      entry = { change: null, generation: 0, pending: false, protected: true, detail: false, needsDetail: true, mergeabilityVersion: 0 }
      this.entries.set(id, entry)
    }
    return entry
  }

  private emit(): void {
    if (!this.base) return
    let data = this.base
    const present = new Set([...data.open, ...data.merged].map(c => c._number))
    for (const [id, entry] of this.entries) {
      if (!present.has(id) && !entry.protected && !entry.pending) continue
      data = entry.change
        ? withChange(data, entry.change, this.members, this.projects)
        : { ...data, open: data.open.filter(c => c._number !== id), merged: data.merged.filter(c => c._number !== id) }
    }
    this.value = data
    this.publish(data)
  }
}
