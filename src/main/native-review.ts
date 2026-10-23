import type { ChangeInfo, ChangeLink, NativeReviewRequest } from '../shared/types.ts'

interface NativeReviewHandlers {
  getSettings(): Promise<{ localReview: boolean; separateReviewWindows?: boolean }>
  openSeparate?(link: ChangeLink): Promise<void>
  fetchChange(id: number): Promise<ChangeInfo>
  openWeb(link: ChangeLink): Promise<void>
  show(): void
  send(request: NativeReviewRequest): void
}

/** One pending native selection survives renderer startup or reload until acknowledged. */
export class NativeReviewNavigation {
  private sequence = 0
  private ready = false
  private pending: NativeReviewRequest | null = null
  private delivered = 0
  private readonly handlers: NativeReviewHandlers

  constructor(handlers: NativeReviewHandlers) { this.handlers = handlers }

  setReady(ready: boolean): void {
    if (this.ready === ready) return
    this.ready = ready
    if (!ready) this.delivered = 0
    this.deliver()
  }

  acknowledge(requestId: number): void {
    if (this.pending?.requestId === requestId) this.pending = null
  }

  async select(link: ChangeLink): Promise<void> {
    const requestId = ++this.sequence
    this.pending = null
    try {
      const prefs = await this.handlers.getSettings()
      if (prefs.localReview && prefs.separateReviewWindows && this.handlers.openSeparate) {
        await this.handlers.openSeparate(link)
        return
      }
      if (requestId !== this.sequence) return
      if (!prefs.localReview) {
        await this.handlers.openWeb(link)
        return
      }
      this.handlers.show()
      const change = await this.handlers.fetchChange(link.id)
      if (requestId !== this.sequence) return
      const patchSet = link.patchSet ?? change.revisions?.[change.current_revision ?? '']?._number
      if (!change.subject || !Number.isSafeInteger(patchSet) || patchSet! < 1) {
        throw new Error('The change has no reviewable patch set or subject')
      }
      this.pending = { requestId, link: { ...link, patchSet }, subject: change.subject }
    } catch (error) {
      if (requestId !== this.sequence) return
      this.handlers.show()
      this.pending = { requestId, error: `Could not open review #${link.id}: ${error instanceof Error ? error.message : String(error)}` }
    }
    this.deliver()
  }

  private deliver(): void {
    if (!this.ready || !this.pending || this.delivered === this.pending.requestId) return
    this.delivered = this.pending.requestId
    this.handlers.send(this.pending)
  }
}
