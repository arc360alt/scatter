import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowRotateLeft,
  faArrowRotateRight,
  faGear,
  faLock,
  faMagnifyingGlass,
  faPen,
  faPlus,
  faThumbtack,
} from '@fortawesome/free-solid-svg-icons'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { useUiStore } from '../store/ui'
import { SettingsModal } from './SettingsModal'
import { ADD_ENTRIES, ADD_ENTRY_BY_ID } from '../lib/cardFactory'
import { addEntryAt } from '../lib/boardActions'
import { shortcutHint } from '../lib/shortcuts'
import { TEMPLATES, insertTemplate } from '../lib/templates'

export function Toolbar() {
  const editMode = useSettingsStore((s) => s.editMode)
  const toggleEditMode = useSettingsStore((s) => s.toggleEditMode)
  const quickAdd = useSettingsStore((s) => s.quickAdd)
  const shortcuts = useSettingsStore((s) => s.shortcuts)
  const undo = useWorkspaceStore((s) => s.undo)
  const redo = useWorkspaceStore((s) => s.redo)
  const canUndo = useWorkspaceStore((s) => s.canUndo)
  const canRedo = useWorkspaceStore((s) => s.canRedo)
  const addMenuOpen = useUiStore((s) => s.addMenuOpen)
  const setAddMenuOpen = useUiStore((s) => s.setAddMenuOpen)
  const setSearchOpen = useUiStore((s) => s.setSearchOpen)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const hint = (id: string, label: string) => {
    const k = shortcutHint(id, shortcuts)
    return k ? `${label} (${k})` : label
  }

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-brand">Scatter</span>
        {editMode && (
          <>
            {quickAdd.map((id) => {
              const entry = ADD_ENTRY_BY_ID[id]
              return (
                <button
                  key={id}
                  className="toolbar-btn toolbar-quick"
                  title={hint(`add:${id}`, `Add ${entry.label.toLowerCase()}`)}
                  aria-label={`Add ${entry.label.toLowerCase()}`}
                  onClick={() => addEntryAt(id)}
                >
                  <FontAwesomeIcon icon={entry.icon} /> <span className="toolbar-btn-label">{entry.label}</span>
                </button>
              )
            })}
            <div className="add-menu-anchor">
              <button
                className={`toolbar-icon-btn${addMenuOpen ? ' active' : ''}`}
                aria-label="More card types"
                aria-expanded={addMenuOpen}
                title={hint('addMenu', 'All card types & templates')}
                onClick={() => setAddMenuOpen(!addMenuOpen)}
              >
                <FontAwesomeIcon icon={faPlus} />
              </button>
              {addMenuOpen && <AddMenu onClose={() => setAddMenuOpen(false)} />}
            </div>
            <div className="toolbar-divider" />
            <button
              className="toolbar-icon-btn"
              aria-label="Undo"
              title={hint('undo', 'Undo')}
              disabled={!canUndo}
              onClick={undo}
            >
              <FontAwesomeIcon icon={faArrowRotateLeft} />
            </button>
            <button
              className="toolbar-icon-btn"
              aria-label="Redo"
              title={hint('redo', 'Redo')}
              disabled={!canRedo}
              onClick={redo}
            >
              <FontAwesomeIcon icon={faArrowRotateRight} />
            </button>
          </>
        )}
        <button
          className="toolbar-icon-btn"
          aria-label="Search cards"
          title={hint('search', 'Search cards')}
          onClick={() => setSearchOpen(true)}
        >
          <FontAwesomeIcon icon={faMagnifyingGlass} />
        </button>
        <div className="toolbar-divider" />
        <button
          className={`toolbar-btn${editMode ? ' active' : ''}`}
          onClick={toggleEditMode}
          title={editMode ? 'Editing on, click to lock the board' : 'Locked, click to allow editing'}
        >
          <FontAwesomeIcon icon={editMode ? faPen : faLock} />{' '}
          <span className="toolbar-btn-label">{editMode ? 'Editing' : 'Locked'}</span>
        </button>
        <button className="toolbar-icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <FontAwesomeIcon icon={faGear} />
        </button>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  )
}

/** The "+" popover: every card type as a tile (pin any to the toolbar) plus templates. */
function AddMenu({ onClose }: { onClose: () => void }) {
  const quickAdd = useSettingsStore((s) => s.quickAdd)
  const toggleQuickAdd = useSettingsStore((s) => s.toggleQuickAdd)
  const shortcuts = useSettingsStore((s) => s.shortcuts)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: PointerEvent) {
      const anchor = ref.current?.parentElement
      if (anchor && !anchor.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="add-menu" ref={ref} role="menu">
      <div className="add-menu-title">Add a card</div>
      <div className="add-menu-grid">
        {ADD_ENTRIES.map((e) => {
          const pinned = quickAdd.includes(e.id)
          const key = shortcutHint(`add:${e.id}`, shortcuts)
          return (
            <div key={e.id} className="add-tile-wrap">
              <button className="add-tile" role="menuitem" title={e.blurb} onClick={() => addEntryAt(e.id)}>
                <FontAwesomeIcon icon={e.icon} className="add-tile-icon" />
                <span className="add-tile-label">{e.label}</span>
                {key && <kbd className="add-tile-key">{key}</kbd>}
              </button>
              <button
                className={`add-tile-pin${pinned ? ' pinned' : ''}`}
                title={pinned ? 'Unpin from toolbar' : 'Pin to toolbar'}
                aria-label={pinned ? `Unpin ${e.label} from toolbar` : `Pin ${e.label} to toolbar`}
                aria-pressed={pinned}
                onClick={() => toggleQuickAdd(e.id)}
              >
                <FontAwesomeIcon icon={faThumbtack} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="add-menu-title">Templates</div>
      <div className="add-menu-templates">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            className="add-template"
            onClick={() => {
              insertTemplate(t)
              onClose()
            }}
          >
            <FontAwesomeIcon icon={t.icon} />
            <span>
              <strong>{t.name}</strong>
              <small>{t.blurb}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="add-menu-foot">
        Tip: right-click the board{matchMedia('(pointer: coarse)').matches ? ' (or long-press)' : ''} to add a card right
        where you point.
      </div>
    </div>
  )
}
