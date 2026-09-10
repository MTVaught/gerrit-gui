/** The text with the first case-insensitive occurrence of the search term marked. */
export function Highlight(props: { text: string; term: string }) {
  const t = props.term.trim()
  if (!t) return <>{props.text}</>
  const i = props.text.toLowerCase().indexOf(t.toLowerCase())
  if (i < 0) return <>{props.text}</>
  return (
    <>
      {props.text.slice(0, i)}
      <mark>{props.text.slice(i, i + t.length)}</mark>
      {props.text.slice(i + t.length)}
    </>
  )
}
