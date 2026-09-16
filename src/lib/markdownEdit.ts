export interface TextEdit {
  text: string
  selectionStart: number
  selectionEnd: number
}

/** Wraps the selection in `before`/`after` markers, or unwraps it if it's already wrapped. */
export function wrapSelection(text: string, start: number, end: number, before: string, after: string = before): TextEdit {
  const selected = text.slice(start, end)
  const alreadyWrapped =
    text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after
  if (alreadyWrapped && selected) {
    const next = text.slice(0, start - before.length) + selected + text.slice(end + after.length)
    return { text: next, selectionStart: start - before.length, selectionEnd: end - before.length }
  }
  const next = text.slice(0, start) + before + selected + after + text.slice(end)
  return { text: next, selectionStart: start + before.length, selectionEnd: end + before.length }
}

/** Inserts `insertion` at `pos`, placing the cursor `cursorOffset` chars into it (end, by default). */
export function insertAtCursor(text: string, pos: number, insertion: string, cursorOffset = insertion.length): TextEdit {
  const next = text.slice(0, pos) + insertion + text.slice(pos)
  const cursor = pos + cursorOffset
  return { text: next, selectionStart: cursor, selectionEnd: cursor }
}

/** Adds `prefix` to the start of the line containing `start`, or removes it if already present. */
export function toggleLinePrefix(text: string, start: number, end: number, prefix: string): TextEdit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const restOfLine = text.slice(lineStart)
  if (restOfLine.startsWith(prefix)) {
    const next = text.slice(0, lineStart) + text.slice(lineStart + prefix.length)
    return {
      text: next,
      selectionStart: Math.max(lineStart, start - prefix.length),
      selectionEnd: Math.max(lineStart, end - prefix.length),
    }
  }
  const next = text.slice(0, lineStart) + prefix + text.slice(lineStart)
  return { text: next, selectionStart: start + prefix.length, selectionEnd: end + prefix.length }
}

/** Wraps the selection (or a placeholder) as a markdown link, leaving the URL part selected. */
export function insertLink(text: string, start: number, end: number): TextEdit {
  const selected = text.slice(start, end) || 'link text'
  const insertion = `[${selected}](url)`
  const next = text.slice(0, start) + insertion + text.slice(end)
  const urlStart = start + selected.length + 3
  return { text: next, selectionStart: urlStart, selectionEnd: urlStart + 3 }
}
