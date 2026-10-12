import { createContext, useContext, useState } from 'react'
import type { ChangeLink } from '../../shared/types.ts'
import { LocalReview } from './components/LocalReview.tsx'
const ReviewContext = createContext<(link: ChangeLink, subject: string) => void>(() => undefined)
export function useLocalReview() { return useContext(ReviewContext) }
// Keep the window mounted when a vote moves its card to a different board group.
export function LocalReviewProvider({ children, onMutate }: { children: React.ReactNode; onMutate(id: number, write: () => Promise<void>): Promise<void> }) {
  const [review, setReview] = useState<{ link: ChangeLink; subject: string } | null>(null)
  return <ReviewContext.Provider value={(link, subject) => setReview({ link, subject })}>
    {children}
    {review && <LocalReview key={review.link.id} link={review.link} subject={review.subject} onClose={() => setReview(null)} onMutate={write => onMutate(review.link.id, write)} />}
  </ReviewContext.Provider>
}
