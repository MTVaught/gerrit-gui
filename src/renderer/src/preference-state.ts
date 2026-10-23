import { patchReviewPreferences, type ReviewPreferences } from '../../shared/review-preferences.ts'

export interface PreferenceSnapshot { version: number; value: ReviewPreferences }

/** Confirmed snapshots can arrive before write replies. Pending fields stay local. */
export class PreferenceState {
  private version = -1
  private sequence = 0
  private confirmed: ReviewPreferences
  private pending = new Map<keyof ReviewPreferences, { sequence: number; value: unknown }>()
  constructor(initial: ReviewPreferences) { this.confirmed = initial }
  get value(): ReviewPreferences {
    return { ...this.confirmed, ...Object.fromEntries([...this.pending].map(([name, edit]) => [name, edit.value])) }
  }
  accept(snapshot: PreferenceSnapshot): void {
    if (snapshot.version < this.version) return
    this.version = snapshot.version
    this.confirmed = snapshot.value
  }
  async change<K extends keyof ReviewPreferences>(name: K, value: ReviewPreferences[K],
    write: (patch: Partial<ReviewPreferences>) => Promise<PreferenceSnapshot>, changed: () => void): Promise<void> {
    patchReviewPreferences(this.confirmed, { [name]: value })
    const sequence = ++this.sequence
    this.pending.set(name, { sequence, value })
    changed()
    try { this.accept(await write({ [name]: value })) }
    finally {
      if (this.pending.get(name)?.sequence === sequence) this.pending.delete(name)
      changed()
    }
  }
}

export function newerSettings<T extends { version?: number }>(previous: T | null, next: T): T {
  return previous && (previous.version ?? 0) > (next.version ?? 0) ? previous : next
}
