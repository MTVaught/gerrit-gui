/** Only the latest refresh may update the board, errors, or loading state. */
export class DashboardRefresh {
  private version = 0
  private paused = false

  begin(): (() => boolean) | null {
    if (this.paused) return null
    const version = ++this.version
    return () => !this.paused && version === this.version
  }

  invalidate(): void {
    this.version++
  }

  pause(): boolean {
    if (this.paused) return false
    this.paused = true
    this.invalidate()
    return true
  }

  resume(): void {
    this.paused = false
  }
}
