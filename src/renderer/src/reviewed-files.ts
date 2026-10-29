/** One change and target patch set. Reads cannot undo a newer local write. */
export class ReviewedFilesState {
  paths: Set<string> | null = null
  readonly pending = new Set<string>()
  resetting = false
  private revision = 0
  private request = 0
  private readError = ''
  private writeErrors = new Map<string, string>()

  get error(): string { return [this.readError, ...this.writeErrors.values()].filter(Boolean).join('; ') }
  get statusReady(): boolean { return this.paths !== null && !this.readError }
  clearErrors(): void { this.readError = ''; this.writeErrors.clear() }
  clearWriteErrors(): void { this.writeErrors.clear() }

  async refresh(read: () => Promise<string[]>, changed: () => void): Promise<void> {
    if (this.pending.size || this.resetting) return
    await this.read(read, changed)
  }

  private async read(read: () => Promise<string[]>, changed: () => void, currentContext = () => true): Promise<void> {
    const request = ++this.request
    const revision = this.revision
    // A full list can contain only part of a queued batch. Read after it settles.
    const current = () => currentContext() && request === this.request && revision === this.revision
    try {
      const paths = await read()
      if (!current()) return
      this.paths = new Set(paths)
      this.readError = ''
    } catch (error) {
      if (!current()) return
      this.readError = (error as Error).message
    }
    changed()
  }

  async change(path: string, value: boolean, write: () => Promise<void>, changed: () => void): Promise<boolean> {
    if (!this.paths || this.resetting || this.pending.has(path)) return false
    const previous = this.paths.has(path)
    this.pending.add(path)
    this.revision++
    this.writeErrors.delete(path)
    this.set(path, value)
    changed()
    try {
      await write()
      return true
    } catch (error) {
      this.set(path, previous)
      this.writeErrors.set(path, `${path}: ${(error as Error).message}`)
      return false
    } finally {
      this.pending.delete(path)
      this.revision++
      changed()
    }
  }

  /** Bulk clears wait for confirmation and keep one guard through reconciliation. */
  async resetAll(write: (path: string) => Promise<void>, read: () => Promise<string[]>, current: () => boolean, changed: () => void): Promise<boolean> {
    if (!this.statusReady || !this.paths?.size || this.pending.size || this.resetting || !current()) return false
    const paths = [...this.paths]
    this.resetting = true
    this.revision++
    this.clearErrors()
    changed()
    let success = true
    try {
      for (const path of paths) {
        if (!current()) return false
        try {
          await write(path)
          if (!current()) return false
          this.set(path, false)
          this.revision++
          changed()
        } catch (error) {
          if (!current()) return false
          this.writeErrors.set(path, `Could not mark all files unreviewed. ${path}: ${(error as Error).message}`)
          success = false
          break
        }
      }
      if (current()) await this.read(read, changed, current)
      return success && current() && this.statusReady
    } finally {
      this.resetting = false
      changed()
    }
  }

  private set(path: string, value: boolean): void {
    const next = new Set(this.paths)
    if (value) next.add(path); else next.delete(path)
    this.paths = next
  }
}
