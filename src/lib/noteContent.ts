import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.use({ gfm: true, breaks: true })

const EXTRA_ATTR = [
  'style',
  'type',
  'checked',
  'target',
  'rel',
  'colspan',
  'rowspan',
  'data-cb-index',
]

// DOMPurify's default allowed-scheme regex, plus our own scatter-image: scheme
// (used to reference images kept in IndexedDB instead of inlining them as
// base64 data URIs - see src/lib/imageStore.ts).
const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|scatter-image):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i

function render(raw: string): string {
  const html = marked.parse(raw, { async: false }) as string
  return DOMPurify.sanitize(html, {
    ADD_ATTR: EXTRA_ATTR,
    ADD_TAGS: ['input'],
    ALLOWED_URI_REGEXP,
  })
}

/** Interactive checkboxes only make sense inside our app, so we always drop `disabled`, markdown task-list syntax renders it disabled by default, raw `<input>` may or may not have it. */
function makeCheckboxesInteractive(doc: Document): NodeListOf<HTMLInputElement> {
  const boxes = doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  boxes.forEach((box) => box.removeAttribute('disabled'))
  return boxes
}

export function countCheckboxes(raw: string): number {
  const doc = new DOMParser().parseFromString(render(raw), 'text/html')
  return doc.querySelectorAll('input[type="checkbox"]').length
}

/** Renders note markdown+HTML to sanitized, checkbox-stateful HTML ready for dangerouslySetInnerHTML. */
export function renderNoteHtml(raw: string, checkboxStates: boolean[]): string {
  const doc = new DOMParser().parseFromString(render(raw), 'text/html')
  const boxes = makeCheckboxesInteractive(doc)
  boxes.forEach((box, i) => {
    box.toggleAttribute('checked', Boolean(checkboxStates[i]))
    box.setAttribute('data-cb-index', String(i))
  })
  return doc.body.innerHTML
}

/** Resizes a checkbox-state array to match new content, preserving existing indices best-effort. */
export function reconcileCheckboxStates(raw: string, prev: boolean[]): boolean[] {
  const count = countCheckboxes(raw)
  const next = prev.slice(0, count)
  while (next.length < count) next.push(false)
  return next
}

const SCATTER_IMAGE_REF = /scatter-image:([a-zA-Z0-9-]+)/g

/** Finds every image-store id referenced by a note's raw markdown/HTML source. */
export function extractScatterImageIds(raw: string): string[] {
  return [...raw.matchAll(SCATTER_IMAGE_REF)].map((m) => m[1])
}
