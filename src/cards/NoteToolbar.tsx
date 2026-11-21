import { useRef } from 'react'
import { Icon as FontAwesomeIcon } from '../components/Icon'
import {
  faBold,
  faCode,
  faHeading,
  faImage,
  faItalic,
  faLink,
  faListUl,
  faSquareCheck,
} from '@fortawesome/free-solid-svg-icons'
import { insertAtCursor, insertLink, toggleLinePrefix, wrapSelection, type TextEdit } from '../lib/markdownEdit'
import { resizeImageToBlob } from '../lib/imageResize'
import { saveImageBlob } from '../lib/imageStore'

interface NoteToolbarProps {
  content: string
  getSelection: () => { start: number; end: number }
  onEdit: (edit: TextEdit) => void
}

export function NoteToolbar({ content, getSelection, onEdit }: NoteToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function apply(fn: (text: string, start: number, end: number) => TextEdit) {
    const { start, end } = getSelection()
    onEdit(fn(content, start, end))
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const blob = await resizeImageToBlob(file, 1400, 0.82)
    const id = await saveImageBlob(blob)
    const { start } = getSelection()
    onEdit(insertAtCursor(content, start, `![image](scatter-image:${id})\n`))
  }

  // Keeps focus/selection in the textarea instead of moving it to the button.
  function preventBlur(e: React.MouseEvent) {
    e.preventDefault()
  }

  return (
    <div className="note-toolbar" onMouseDown={preventBlur}>
      <button className="note-toolbar-btn" title="Bold" onClick={() => apply((t, s, e) => wrapSelection(t, s, e, '**'))}>
        <FontAwesomeIcon icon={faBold} />
      </button>
      <button
        className="note-toolbar-btn"
        title="Italic"
        onClick={() => apply((t, s, e) => wrapSelection(t, s, e, '_'))}
      >
        <FontAwesomeIcon icon={faItalic} />
      </button>
      <button
        className="note-toolbar-btn"
        title="Heading"
        onClick={() => apply((t, s, e) => toggleLinePrefix(t, s, e, '## '))}
      >
        <FontAwesomeIcon icon={faHeading} />
      </button>
      <button
        className="note-toolbar-btn"
        title="Bullet list"
        onClick={() => apply((t, s, e) => toggleLinePrefix(t, s, e, '- '))}
      >
        <FontAwesomeIcon icon={faListUl} />
      </button>
      <button
        className="note-toolbar-btn"
        title="Checklist item"
        onClick={() => apply((t, s, e) => toggleLinePrefix(t, s, e, '- [ ] '))}
      >
        <FontAwesomeIcon icon={faSquareCheck} />
      </button>
      <button className="note-toolbar-btn" title="Link" onClick={() => apply((t, s, e) => insertLink(t, s, e))}>
        <FontAwesomeIcon icon={faLink} />
      </button>
      <button
        className="note-toolbar-btn"
        title="Code"
        onClick={() => apply((t, s, e) => wrapSelection(t, s, e, '`'))}
      >
        <FontAwesomeIcon icon={faCode} />
      </button>
      <button className="note-toolbar-btn" title="Insert image" onClick={() => fileInputRef.current?.click()}>
        <FontAwesomeIcon icon={faImage} />
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />
    </div>
  )
}
