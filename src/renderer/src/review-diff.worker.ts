import { computeReviewDiff, type ReviewDiffRequest } from './review-diff.ts'
self.onmessage = (event: MessageEvent<ReviewDiffRequest>) => {
  try { self.postMessage(computeReviewDiff(event.data)) }
  catch (error) { self.postMessage({ id: event.data.id, error: String(error) }) }
}
