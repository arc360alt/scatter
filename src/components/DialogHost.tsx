import { useEffect, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleInfo, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { useDialogStore } from '../store/dialog'

/** Renders whichever confirm/alert dialog is currently open (see store/dialog.ts). */
export function DialogHost() {
  const current = useDialogStore((s) => s.current)
  const close = useDialogStore((s) => s.close)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!current) return
    // Focus the safe choice for destructive actions, so a stray Enter doesn't delete things.
    const target = current.danger && !current.alert ? cancelRef.current : confirmRef.current
    target?.focus()

    function onKey(e: KeyboardEvent) {
      // Captured at the window so nothing underneath (the drawing editor, board
      // shortcuts, other dialogs) reacts to the same key press.
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close(false)
      } else if (e.key === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) {
        e.preventDefault()
        e.stopPropagation()
        close(true)
      } else if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== ' ') {
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [current, close])

  if (!current) return null

  const { title, message, danger, alert } = current
  return (
    <div
      className="modal-overlay dialog-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close(false)
      }}
    >
      <div
        className={`dialog-panel${danger ? ' danger' : ''}`}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={message ? 'dialog-message' : undefined}
      >
        <div className="dialog-icon" aria-hidden>
          <FontAwesomeIcon icon={danger ? faTriangleExclamation : faCircleInfo} />
        </div>
        <div className="dialog-content">
          <h2 id="dialog-title" className="dialog-title">
            {title}
          </h2>
          {message && (
            <p id="dialog-message" className="dialog-message">
              {message}
            </p>
          )}
        </div>
        <div className="dialog-buttons">
          {!alert && (
            <button ref={cancelRef} className="dialog-btn" onClick={() => close(false)}>
              {current.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button
            ref={confirmRef}
            className={`dialog-btn primary${danger ? ' danger' : ''}`}
            onClick={() => close(true)}
          >
            {current.confirmLabel ?? (danger ? 'Delete' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  )
}
