import { useState } from 'react'
import { Icon as FontAwesomeIcon } from '../components/Icon'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import type { TodoCard as TodoCardType } from '../types'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { DueDate } from './DueDate'

export function TodoCard({ card }: { card: TodoCardType }) {
  const toggleTodoItem = useWorkspaceStore((s) => s.toggleTodoItem)
  const updateTodoItemText = useWorkspaceStore((s) => s.updateTodoItemText)
  const removeTodoItem = useWorkspaceStore((s) => s.removeTodoItem)
  const setTodoItemDue = useWorkspaceStore((s) => s.setTodoItemDue)
  const addTodoItem = useWorkspaceStore((s) => s.addTodoItem)
  const editMode = useSettingsStore((s) => s.editMode)
  const [draft, setDraft] = useState('')

  function submitDraft() {
    const text = draft.trim()
    if (!text) return
    addTodoItem(card.id, text)
    setDraft('')
  }

  return (
    <>
      <ul className="todo-list">
        {card.items.map((item) => (
          <li key={item.id} className={`todo-item${item.done ? ' done' : ''}`}>
            <input type="checkbox" checked={item.done} onChange={() => toggleTodoItem(card.id, item.id)} />
            <input
              className="todo-item-text"
              value={item.text}
              readOnly={!editMode}
              onChange={(e) => updateTodoItemText(card.id, item.id, e.target.value)}
            />
            <DueDate
              due={item.due}
              done={item.done}
              editable={editMode}
              onChange={(due) => setTodoItemDue(card.id, item.id, due)}
            />
            {editMode && (
              <button
                className="todo-item-remove"
                aria-label="Remove item"
                onClick={() => removeTodoItem(card.id, item.id)}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editMode && (
        <div className="todo-add-row">
          <input
            className="todo-add-input"
            placeholder="Add an item…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitDraft()
            }}
            onBlur={submitDraft}
          />
        </div>
      )}
    </>
  )
}
