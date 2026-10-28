/** One change and target patch set. Reads cannot undo a newer local write. */
export class ReviewedFilesState {
  paths: Set<string> | null = null
  readonly pending = new Set<string>()
  private revision = 0
  private request = 0
  private readError = ''
  private writeErrors = new Map<string, string>()

  get error(): string { return [this.readError, ...this.writeErrors.values()].filter(Boolean).join('; ') }
  clearErrors(): void { this.readError = ''; this.writeErrors.clear() }

  async refresh(read: () => Promise<string[]>, changed: () => void): Promise<void> {
    const request = ++this.request
    const revision = this.revision
    // A full list can contain only part of a queued batch. Read after it settles.
    if (this.pending.size) return
    const current = () => request === this.request && revision === this.revision
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
    if (!this.paths || this.pending.has(path)) return false
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

  private set(path: string, value: boolean): void {
    const next = new Set(this.paths)
    if (value) next.add(path); else next.delete(path)
    this.paths = next
  }
}
