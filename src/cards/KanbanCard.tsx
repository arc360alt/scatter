import { useLayoutEffect, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGripVertical, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import type { KanbanCard as KanbanCardType, KanbanColumn as KanbanColumnType } from '../types'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { setNoSelect } from '../lib/noSelect'
import { DueDate } from './DueDate'

// Matches .kanban-item-text's font-size/line-height in index.css.
const COLLAPSED_MAX_HEIGHT = 13 * 1.35 * 3

export function KanbanCard({ card }: { card: KanbanCardType }) {
  const moveKanbanItem = useWorkspaceStore((s) => s.moveKanbanItem)
  const addKanbanItem = useWorkspaceStore((s) => s.addKanbanItem)
  const removeKanbanItem = useWorkspaceStore((s) => s.removeKanbanItem)
  const updateKanbanItemText = useWorkspaceStore((s) => s.updateKanbanItemText)
  const addKanbanColumn = useWorkspaceStore((s) => s.addKanbanColumn)
  const renameKanbanColumn = useWorkspaceStore((s) => s.renameKanbanColumn)
  const setKanbanItemDue = useWorkspaceStore((s) => s.setKanbanItemDue)
  const editMode = useSettingsStore((s) => s.editMode)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(e: DragEndEvent) {
    setNoSelect(false)
    const itemId = e.active.id as string
    const columnId = e.over?.id as string | undefined
    if (!columnId) return
    const column = card.columns.find((c) => c.id === columnId)
    if (!column) return
    moveKanbanItem(card.id, itemId, columnId, column.itemIds.length)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={() => setNoSelect(true)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setNoSelect(false)}
    >
      <div className="kanban-board">
        {card.columns.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            items={col.itemIds.map((id) => card.items[id]).filter(Boolean)}
            editMode={editMode}
            onRename={(title) => renameKanbanColumn(card.id, col.id, title)}
            onAddItem={(text) => addKanbanItem(card.id, col.id, text)}
            onRemoveItem={(itemId) => removeKanbanItem(card.id, itemId)}
            onUpdateItem={(itemId, text) => updateKanbanItemText(card.id, itemId, text)}
            onSetDue={(itemId, due) => setKanbanItemDue(card.id, itemId, due)}
          />
        ))}
        {editMode && (
          <button className="kanban-add-column" onClick={() => addKanbanColumn(card.id, 'New column')}>
            <FontAwesomeIcon icon={faPlus} /> Column
          </button>
        )}
      </div>
    </DndContext>
  )
}

interface KanbanColumnProps {
  column: KanbanColumnType
  items: { id: string; text: string; due?: string }[]
  editMode: boolean
  onRename: (title: string) => void
  onAddItem: (text: string) => void
  onRemoveItem: (itemId: string) => void
  onUpdateItem: (itemId: string, text: string) => void
  onSetDue: (itemId: string, due: string | undefined) => void
}

function KanbanColumn({
  column,
  items,
  editMode,
  onRename,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onSetDue,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  function submit() {
    const text = draft.trim()
    if (text) onAddItem(text)
    setDraft('')
    setAdding(false)
  }

  return (
    <div
      className="kanban-column"
      ref={setNodeRef}
      style={{ boxShadow: isOver ? 'inset 0 0 0 2px var(--olive)' : undefined }}
    >
      <input
        className="kanban-column-title"
        value={column.title}
        readOnly={!editMode}
        onChange={(e) => onRename(e.target.value)}
      />
      <div className="kanban-items">
        {items.map((item) => (
          <KanbanItemCard
            key={item.id}
            id={item.id}
            text={item.text}
            due={item.due}
            editMode={editMode}
            onRemove={() => onRemoveItem(item.id)}
            onChange={(t) => onUpdateItem(item.id, t)}
            onSetDue={(due) => onSetDue(item.id, due)}
          />
        ))}
      </div>
      {editMode &&
        (adding ? (
          <input
            autoFocus
            className="todo-add-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        ) : (
          <button className="kanban-add-item" onClick={() => setAdding(true)}>
            <FontAwesomeIcon icon={faPlus} /> Add card
          </button>
        ))}
    </div>
  )
}

function KanbanItemCard({
  id,
  text,
  due,
  editMode,
  onRemove,
  onChange,
  onSetDue,
}: {
  id: string
  text: string
  due?: string
  editMode: boolean
  onRemove: () => void
  onChange: (text: string) => void
  onSetDue: (due: string | undefined) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  // Textareas don't size themselves to content, so we measure the natural
  // height (scrollHeight, with height reset to let it shrink too) and either
  // cap it at 3 lines or let it grow fully when expanded. Runs on every text
  // change, which is what keeps this in sync when editing shortens the text.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const natural = el.scrollHeight
    setOverflowing(natural > COLLAPSED_MAX_HEIGHT + 1)
    el.style.height = `${expanded ? natural : Math.min(natural, COLLAPSED_MAX_HEIGHT)}px`
  }, [text, expanded])

  const style = {
    ...(transform && {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      opacity: isDragging ? 0.4 : 1,
      zIndex: isDragging ? 50 : undefined,
    }),
    // Outside edit mode there's no text to click into and no remove button, so
    // the whole card becomes the drag surface instead of just the handle icon.
    ...(!editMode && { cursor: 'grab', touchAction: 'none' }),
  }

  return (
    <div className="kanban-item" ref={setNodeRef} style={style} {...(!editMode ? { ...listeners, ...attributes } : {})}>
      <span
        {...(editMode ? { ...listeners, ...attributes } : {})}
        style={{ cursor: 'grab', touchAction: 'none' }}
      >
        <FontAwesomeIcon icon={faGripVertical} />
      </span>
      <div className="kanban-item-body">
        <textarea
          ref={textareaRef}
          className="kanban-item-text"
          rows={1}
          value={text}
          readOnly={!editMode}
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={editMode ? (e) => e.stopPropagation() : undefined}
        />
        {overflowing && (
          <button
            className="kanban-item-toggle"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : 'More'}
          </button>
        )}
        <DueDate due={due} editable={editMode} onChange={onSetDue} />
      </div>
      {editMode && (
        <button className="kanban-item-remove" onClick={onRemove}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      )}
    </div>
  )
}
