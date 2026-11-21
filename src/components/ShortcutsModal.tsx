import { useEffect, useState } from 'react'
import { Icon as FontAwesomeIcon } from './Icon'
import { faPlus, faRotateLeft, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useUiStore } from '../store/ui'
import { useSettingsStore } from '../store/settings'
import { useToastStore } from '../store/toast'
import { SHORTCUT_ACTIONS, bindingsFor, eventToBinding, formatBinding, type ShortcutGroup } from '../lib/shortcuts'

const GROUPS: ShortcutGroup[] = ['General', 'View', 'Selection', 'Add cards']

/** Lists every shortcut and lets you rebind it: click +, press the new keys. */
export function ShortcutsModal() {
  const open = useUiStore((s) => s.shortcutsOpen)
  return open ? <ShortcutsModalInner /> : null
}

function ShortcutsModalInner() {
  const setOpen = useUiStore((s) => s.setShortcutsOpen)
  const overrides = useSettingsStore((s) => s.shortcuts)
  const setShortcut = useSettingsStore((s) => s.setShortcut)
  const resetShortcuts = useSettingsStore((s) => s.resetShortcuts)
  const [recording, setRecording] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!recording) {
        if (e.key === 'Escape') setOpen(false)
        return
      }
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      const binding = eventToBinding(e)
      if (!binding) return // modifier on its own - keep waiting for the real key
      const current = useSettingsStore.getState().shortcuts
      // A key can only do one thing: take it away from whatever had it.
      const clash = SHORTCUT_ACTIONS.find((a) => a.id !== recording && bindingsFor(a.id, current).includes(binding))
      if (clash) {
        setShortcut(
          clash.id,
          bindingsFor(clash.id, current).filter((b) => b !== binding)
        )
        useToastStore.getState().show(`${formatBinding(binding)} was "${clash.label}" - moved it here`)
      }
      const mine = bindingsFor(recording, useSettingsStore.getState().shortcuts)
      if (!mine.includes(binding)) setShortcut(recording, [...mine, binding])
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, setOpen, setShortcut])

  const q = filter.trim().toLowerCase()

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="modal-panel shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Keyboard shortcuts</h2>
          <button className="modal-close" aria-label="Close" onClick={() => setOpen(false)}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="modal-body">
          <div className="shortcuts-top">
            <input
              className="account-input"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              className="settings-upload-btn"
              disabled={Object.keys(overrides).length === 0}
              onClick={() => resetShortcuts()}
            >
              <FontAwesomeIcon icon={faRotateLeft} /> Reset all
            </button>
          </div>
          <p className="settings-hint">
            Click <FontAwesomeIcon icon={faPlus} /> then press the keys you want. Single-key shortcuts don't fire
            while you're typing in a card.
          </p>
          {GROUPS.map((group) => {
            const actions = SHORTCUT_ACTIONS.filter((a) => a.group === group && (!q || a.label.toLowerCase().includes(q)))
            if (!actions.length) return null
            return (
              <section key={group} className="settings-section">
                <h3>{group}</h3>
                <div className="shortcut-list">
                  {actions.map((a) => {
                    const bindings = bindingsFor(a.id, overrides)
                    const customised = a.id in overrides
                    return (
                      <div key={a.id} className="shortcut-row">
                        <span className="shortcut-label">{a.label}</span>
                        <span className="shortcut-keys">
                          {bindings.map((b) => (
                            <span key={b} className="shortcut-chip">
                              <kbd>{formatBinding(b)}</kbd>
                              <button
                                aria-label={`Remove ${formatBinding(b)}`}
                                onClick={() => setShortcut(a.id, bindings.filter((x) => x !== b))}
                              >
                                <FontAwesomeIcon icon={faXmark} />
                              </button>
                            </span>
                          ))}
                          {recording === a.id ? (
                            <span className="shortcut-recording">Press keys… (Esc to cancel)</span>
                          ) : (
                            <button className="shortcut-add" aria-label={`Add shortcut for ${a.label}`} onClick={() => setRecording(a.id)}>
                              <FontAwesomeIcon icon={faPlus} />
                            </button>
                          )}
                          {customised && (
                            <button className="shortcut-reset" title="Back to default" onClick={() => setShortcut(a.id, null)}>
                              <FontAwesomeIcon icon={faRotateLeft} />
                            </button>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
          <section className="settings-section">
            <h3>Always available</h3>
            <div className="shortcut-list static">
              <div className="shortcut-row"><span className="shortcut-label">Select several cards</span><span className="shortcut-keys"><kbd>Shift</kbd> + click / drag on the board</span></div>
              <div className="shortcut-row"><span className="shortcut-label">Zoom</span><span className="shortcut-keys"><kbd>Ctrl</kbd> / <kbd>Alt</kbd> + scroll, or pinch</span></div>
              <div className="shortcut-row"><span className="shortcut-label">Copy / paste cards</span><span className="shortcut-keys"><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd></span></div>
              <div className="shortcut-row"><span className="shortcut-label">Card menu</span><span className="shortcut-keys">Right-click, or long-press on touch</span></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
