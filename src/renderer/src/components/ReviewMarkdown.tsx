import { useState } from 'react'
import Markdown from 'react-markdown'
import { api } from '../api.ts'
export function ReviewMarkdown({ message }: { message: string }) {
  const [error, setError] = useState('')
  return <div className="review-markdown"><Markdown components={{
    a: ({ href, children }) => href && /^https?:\/\//i.test(href) ? <a href={href} onClick={event => { event.preventDefault(); setError(''); void api.openUrl(href).catch(e => setError(e.message)) }}>{children}</a> : <span>{children}</span>,
    img: ({ src, alt }) => <span>{`![${alt ?? ''}](${src ?? ''})`}</span>,
  }}>{message}</Markdown>{error && <small className="error" role="alert">{error}</small>}</div>
}
