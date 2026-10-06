import { Range, type editor, type IDisposable } from 'monaco-editor/editor/editor.api'
import { DetailedLineRangeMapping, RangeMapping } from 'monaco-editor/editor/common/diff/rangeMapping'
import { LineRange } from 'monaco-editor/editor/common/core/ranges/lineRange'
import DiffWorker from './review-diff.worker.ts?worker'
import type { ReviewDiffResult } from './review-diff.ts'
import type { ReviewWhitespace } from './review-preferences.ts'

/** Bundle computation locally and retain the original models for display and search. */
export function reviewDiffProvider() {
  const worker = new DiffWorker()
  let whitespace: ReviewWhitespace = 'IGNORE_NONE'
  let nextId = 0
  const listeners = new Set<() => void>()
  const pending = new Map<number, { resolve: (result: ReturnType<typeof restore>) => void; reject: (error: Error) => void }>()
  function restore(result: ReviewDiffResult) {
    return { identical: result.identical, quitEarly: result.quitEarly, moves: [],
      changes: result.changes.map((change) => new DetailedLineRangeMapping(
        new LineRange(...change.original), new LineRange(...change.modified),
        change.innerChanges.map((inner) => new RangeMapping(Range.lift(inner.original), Range.lift(inner.modified))),
      )),
    }
  }
  worker.onmessage = (event: MessageEvent<ReviewDiffResult & { error?: string }>) => {
    const request = pending.get(event.data.id)
    if (!request) return
    pending.delete(event.data.id)
    if (event.data.error) request.reject(new Error(event.data.error))
    else request.resolve(restore(event.data))
  }
  worker.onerror = (event) => {
    pending.forEach((request) => request.reject(new Error(event.message)))
    pending.clear()
  }
  return {
    onDidChange(listener: () => void): IDisposable { listeners.add(listener); return { dispose: () => { listeners.delete(listener) } } },
    computeDiff(original: editor.ITextModel, modified: editor.ITextModel, options: { maxComputationTimeMs: number }) {
      const id = ++nextId
      return new Promise<ReturnType<typeof restore>>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        worker.postMessage({ id, original: original.getLinesContent(), modified: modified.getLinesContent(), whitespace, timeout: options.maxComputationTimeMs })
      })
    },
    setWhitespace(mode: ReviewWhitespace) {
      if (whitespace === mode) return
      whitespace = mode
      // Monaco may resubscribe during notification. Iterate a snapshot.
      for (const listener of [...listeners]) listener()
    },
    dispose() {
      worker.terminate()
      pending.forEach((request) => request.resolve({ identical: false, quitEarly: true, moves: [], changes: [] }))
      pending.clear()
      listeners.clear()
    },
  }
}

// Model identity isolates providers across files and comparisons. Monaco's public
// diffAlgorithm option only supports built-ins, so use its provider factory.
const modes = new WeakMap<editor.ITextModel, ReviewWhitespace>()
const providers = new WeakMap<editor.ITextModel, ReturnType<typeof reviewDiffProvider>>()
export function configureReviewDiff(model: editor.ITextModel, mode: ReviewWhitespace) {
  modes.set(model, mode)
  providers.get(model)?.setWhitespace(mode)
}
export const reviewDiffFactory = {
  createDiffProvider() {
    const provider = reviewDiffProvider()
    const compute = provider.computeDiff
    let registered = false
    return { ...provider, computeDiff(original: editor.ITextModel, modified: editor.ITextModel, options: { maxComputationTimeMs: number }) {
      if (!registered) {
        registered = true
        providers.set(original, provider)
        provider.setWhitespace(modes.get(original) ?? 'IGNORE_NONE')
        original.onWillDispose(() => { provider.dispose(); providers.delete(original) })
      }
      return compute(original, modified, options)
    } }
  },
}
