import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGear, faLock, faNoteSticky, faPen, faSquareCheck, faTableColumns } from '@fortawesome/free-solid-svg-icons'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { SettingsModal } from './SettingsModal'

export function Toolbar() {
  const addCard = useWorkspaceStore((s) => s.addCard)
  const editMode = useSettingsStore((s) => s.editMode)
  const toggleEditMode = useSettingsStore((s) => s.toggleEditMode)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-brand">Scatter</span>
        {editMode && (
          <>
            <button className="toolbar-btn" onClick={() => addCard('note')}>
              <FontAwesomeIcon icon={faNoteSticky} /> Note
            </button>
            <button className="toolbar-btn" onClick={() => addCard('todo')}>
              <FontAwesomeIcon icon={faSquareCheck} /> Todo list
            </button>
            <button className="toolbar-btn" onClick={() => addCard('kanban')}>
              <FontAwesomeIcon icon={faTableColumns} /> Board
            </button>
            <div className="toolbar-divider" />
          </>
        )}
        <button
          className={`toolbar-btn${editMode ? ' active' : ''}`}
          onClick={toggleEditMode}
          title={editMode ? 'Editing on, click to lock the board' : 'Locked, click to allow editing'}
        >
          <FontAwesomeIcon icon={editMode ? faPen : faLock} /> {editMode ? 'Editing' : 'Locked'}
        </button>
        <button className="toolbar-icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <FontAwesomeIcon icon={faGear} />
        </button>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  )
}
