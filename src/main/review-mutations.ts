/** Same-change writes share a queue. Events describe only confirmed mutations. */
export class ReviewMutations {
  private tails = new Map<number, Promise<unknown>>()
  private generation = 0
  private active = new Map<number, number>()
  private readonly notify: (id: number, connection: number, generation: number) => void
  constructor(notify: (id: number, connection: number, generation: number) => void) { this.notify = notify }
  busy(id: number): boolean { return (this.active.get(id) ?? 0) > 0 }
  async run<T>(ids: number[], connection: number, current: () => number, write: () => Promise<T>): Promise<T> {
    const unique = [...new Set(ids)]
    const previous = unique.map(id => this.tails.get(id))
    for (const id of unique) this.active.set(id, (this.active.get(id) ?? 0) + 1)
    const operation = (async () => {
      await Promise.all(previous)
      if (current() !== connection) throw new Error('Connection changed. Close and reopen this review.')
      const result = await write()
      if (current() === connection) for (const id of unique) this.notify(id, connection, ++this.generation)
      return result
    })()
    const tail = operation.catch(() => undefined)
    for (const id of unique) this.tails.set(id, tail)
    try { return await operation } finally {
      for (const id of unique) {
        this.active.set(id, this.active.get(id)! - 1)
        if (!this.active.get(id)) this.active.delete(id)
        if (this.tails.get(id) === tail) this.tails.delete(id)
      }
    }
  }
}

export const REVIEW_WRITES = new Set(['gerrit:saveReviewDraft', 'gerrit:deleteReviewDraft', 'gerrit:deleteReviewComment', 'gerrit:submitReview', 'gerrit:setReviewFileReviewed', 'gerrit:applyReviewFix', 'gerrit:applyProvidedReviewFix', 'gerrit:act'])
