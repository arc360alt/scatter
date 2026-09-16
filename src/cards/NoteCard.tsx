import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import type { NoteCard as NoteCardType } from '../types'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { renderNoteHtml } from '../lib/noteContent'
import { loadImageBlob } from '../lib/imageStore'
import { NoteToolbar } from './NoteToolbar'
import type { TextEdit } from '../lib/markdownEdit'

const SCATTER_IMAGE_PREFIX = 'scatter-image:'

export function NoteCard({ card }: { card: NoteCardType }) {
  const setNoteContent = useWorkspaceStore((s) => s.setNoteContent)
  const toggleCheckbox = useWorkspaceStore((s) => s.toggleCheckbox)
  const selected = useWorkspaceStore((s) => s.selectedId === card.id)
  const editMode = useSettingsStore((s) => s.editMode)
  const [editing, setEditing] = useState(editMode && card.content.trim() === '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)

  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  // Editing ends when the card is deselected (clicked away) rather than on the
  // textarea's native blur - blur also fires when the image-insert file dialog
  // steals focus, which would otherwise kick us out of edit mode mid-pick.
  // Reset during render (React's documented pattern for this) rather than in an
  // effect, so it doesn't cost an extra cascading render.
  const [prevSelected, setPrevSelected] = useState(selected)
  if (prevSelected !== selected) {
    setPrevSelected(selected)
    if (!selected && editing) setEditing(false)
  }

  useLayoutEffect(() => {
    if (pendingSelection.current && textareaRef.current) {
      const { start, end } = pendingSelection.current
      pendingSelection.current = null
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(start, end)
    }
  }, [card.content])

  // Rendered <img> tags carry a scatter-image:<id> placeholder src (see
  // noteContent.ts) rather than the real image data, so it doesn't bloat the
  // note's markdown source. Resolve each to a blob straight from IndexedDB and
  // swap in an object URL, revoking it once it's no longer shown.
  useEffect(() => {
    const container = contentRef.current
    if (!container || editing) return
    let cancelled = false
    const createdUrls: string[] = []

    void (async () => {
      const imgs = container.querySelectorAll<HTMLImageElement>(`img[src^="${SCATTER_IMAGE_PREFIX}"]`)
      for (const img of imgs) {
        const id = img.getAttribute('src')?.slice(SCATTER_IMAGE_PREFIX.length)
        if (!id) continue
        const blob = await loadImageBlob(id)
        if (cancelled || !blob) continue
        const url = URL.createObjectURL(blob)
        createdUrls.push(url)
        img.src = url
      }
    })()

    return () => {
      cancelled = true
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [card.content, card.checkboxStates, editing])

  function handleBodyClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
      const idx = Number(target.getAttribute('data-cb-index'))
      toggleCheckbox(card.id, idx)
      return
    }
    if (target.tagName === 'A') return
    if (editMode) setEditing(true)
  }

  function handleToolbarEdit(edit: TextEdit) {
    pendingSelection.current = { start: edit.selectionStart, end: edit.selectionEnd }
    setNoteContent(card.id, edit.text)
  }

  if (editing) {
    return (
      <div className="note-edit-wrap">
        <NoteToolbar
          content={card.content}
          getSelection={() => ({
            start: textareaRef.current?.selectionStart ?? card.content.length,
            end: textareaRef.current?.selectionEnd ?? card.content.length,
          })}
          onEdit={handleToolbarEdit}
        />
        <textarea
          ref={textareaRef}
          className="note-edit-textarea"
          value={card.content}
          placeholder="Write in markdown, or paste HTML..."
          onChange={(e) => setNoteContent(card.id, e.target.value)}
        />
      </div>
    )
  }

  if (!card.content.trim()) {
    return (
      <div className="note-empty-hint" onClick={handleBodyClick}>
        Click to write a note…
      </div>
    )
  }

  const html = renderNoteHtml(card.content, card.checkboxStates)
  return <div ref={contentRef} className="note-content" onClick={handleBodyClick} dangerouslySetInnerHTML={{ __html: html }} />
}
