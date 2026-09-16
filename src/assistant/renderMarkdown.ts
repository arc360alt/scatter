import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.use({ gfm: true, breaks: true })

/** Renders the assistant's markdown replies to sanitized HTML. Streaming partial
 * markdown (an unclosed code fence, etc.) can look briefly odd mid-stream - it
 * settles once the message finishes. */
export function renderAssistantMarkdown(raw: string): string {
  const html = marked.parse(raw, { async: false }) as string
  return DOMPurify.sanitize(html)
}
