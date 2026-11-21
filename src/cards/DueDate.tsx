import { useRef } from 'react'
import { Icon as FontAwesomeIcon } from '../components/Icon'
import { faCalendarDay, faXmark } from '@fortawesome/free-solid-svg-icons'
import { dueStatus, formatDue } from '../lib/dates'

/** Small due-date chip (or an "add date" button) for todo and board items. */
export function DueDate({
  due,
  done,
  editable,
  onChange,
}: {
  due: string | undefined
  done?: boolean
  editable: boolean
  onChange: (due: string | undefined) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function openPicker() {
    const input = inputRef.current
    if (!input) return
    try {
      input.showPicker()
    } catch {
      input.focus()
      input.click()
    }
  }

  if (!due && !editable) return null

  return (
    <span className={`due-date${due ? ` has-date due-${done ? 'done' : dueStatus(due)}` : ''}`}>
      <button
        type="button"
        className="due-date-btn"
        disabled={!editable}
        title={due ? `Due ${due}` : 'Add a due date'}
        aria-label={due ? `Due ${formatDue(due)}, change` : 'Add a due date'}
        onClick={openPicker}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <FontAwesomeIcon icon={faCalendarDay} />
        {due && <span>{formatDue(due)}</span>}
      </button>
      {due && editable && (
        <button
          type="button"
          className="due-date-clear"
          aria-label="Remove due date"
          onClick={() => onChange(undefined)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      )}
      <input
        ref={inputRef}
        type="date"
        className="due-date-input"
        tabIndex={-1}
        aria-hidden
        value={due ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </span>
  )
}
