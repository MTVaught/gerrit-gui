import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ChangeLink } from '../../shared/types.ts'
import { LocalReview, type LocalReviewHandle } from './components/LocalReview.tsx'
import { api } from './api.ts'
const ReviewContext = createContext<(link: ChangeLink, subject: string) => void>(() => undefined)
export function useLocalReview() { return useContext(ReviewContext) }
// Keep the window mounted when a vote moves its card to a different board group.
export function LocalReviewProvider({ children, onMutate, onNativeNavigate, onError }: {
  children: React.ReactNode
  onMutate(id: number, write: () => Promise<void>): Promise<void>
  onNativeNavigate(): void
  onError(message: string | null): void
}) {
  const [review, setReview] = useState<{ link: ChangeLink; subject: string; session: number } | null>(null)
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const viewer = useRef<LocalReviewHandle>(null)
  const session = useRef(0)
  const handled = useRef(0)
  const callbacks = useRef({ onNativeNavigate, onError })
  callbacks.current = { onNativeNavigate, onError }
  function open(link: ChangeLink, subject: string) {
    if (viewer.current?.canClose() === false) return
    setReview({ link, subject, session: ++session.current })
  }
  useEffect(() => {
    const off = api.onNativeReviewRequested(request => {
      if (request.requestId <= handled.current) {
        api.acknowledgeNativeReview(request.requestId)
        return
      }
      handled.current = request.requestId
      try {
        callbacks.current.onNativeNavigate()
        if (request.error !== undefined) {
          setNavigationError(request.error)
          callbacks.current.onError(request.error)
        }
        else {
          open(request.link, request.subject)
          setNavigationError(null)
          callbacks.current.onError(null)
        }
      } catch (error) {
        const message = `Could not open review: ${error instanceof Error ? error.message : String(error)}`
        setNavigationError(message)
        callbacks.current.onError(message)
      } finally {
        api.acknowledgeNativeReview(request.requestId)
      }
    })
    api.setNativeReviewReady(true)
    return () => { api.setNativeReviewReady(false); off() }
  }, [])
  return <ReviewContext.Provider value={open}>
    {children}
    {review && <LocalReview ref={viewer} key={review.session} link={review.link} subject={review.subject} navigationError={navigationError} onClose={() => setReview(null)} onMutate={write => onMutate(review.link.id, write)} />}
  </ReviewContext.Provider>
}
