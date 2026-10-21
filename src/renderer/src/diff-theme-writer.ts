import type { DiffThemePreference } from '../../shared/types.ts'

/** Order writes and report only the newest selection to the control. */
export class DiffThemeWriter {
  private pending: Promise<unknown> = Promise.resolve()
  private revision = 0
  private save: (theme: DiffThemePreference) => Promise<void>
  private settled: (error?: Error) => void

  constructor(
    save: (theme: DiffThemePreference) => Promise<void>,
    settled: (error?: Error) => void,
  ) { this.save = save; this.settled = settled }

  change(theme: DiffThemePreference): Promise<void> {
    const revision = ++this.revision
    const write = this.pending.then(() => this.save(theme))
    this.pending = write.catch(() => undefined)
    return write.then(
      () => { if (revision === this.revision) this.settled() },
      error => { if (revision === this.revision) this.settled(error instanceof Error ? error : new Error(String(error))) },
    )
  }
}
