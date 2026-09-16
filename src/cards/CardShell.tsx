import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import type { Card, CardColor } from '../types'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { setNoSelect } from '../lib/noSelect'

const COLORS: CardColor[] = ['terracotta', 'olive', 'mustard', 'teal', 'plum', 'slate']
const MIN_WIDTH = 200
const MIN_HEIGHT = 140

interface CardShellProps {
  card: Card
  viewportScale: number
  children: ReactNode
}

export function CardShell({ card, viewportScale, children }: CardShellProps) {
  const updateCardBase = useWorkspaceStore((s) => s.updateCardBase)
  const bringToFront = useWorkspaceStore((s) => s.bringToFront)
  const deleteCard = useWorkspaceStore((s) => s.deleteCard)
  const select = useWorkspaceStore((s) => s.select)
  const editMode = useSettingsStore((s) => s.editMode)

  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragState = useRef<{
    pointerId: number
    startX: number
    startY: number
    ox: number
    oy: number
    moved: boolean
  } | null>(null)
  const resizeState = useRef<{ pointerId: number; startX: number; startY: number; ow: number; oh: number } | null>(
    null
  )

  function focusCard() {
    select(card.id)
    bringToFront(card.id)
  }

  // The title input fills most of the header, so a plain click there must still
  // place a text cursor. We only commit to a drag once the pointer has actually
  // moved a few pixels - short of that, the browser's normal click/focus wins.
  function handleHeaderPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('.card-icon-btn, .card-color-swatch')) return
    focusCard()
    dragState.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, ox: card.x, oy: card.y, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handleHeaderPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragState.current
    if (!d || d.pointerId !== e.pointerId) return
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return
      d.moved = true
      setDragging(true)
      setNoSelect(true)
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }
    const dx = (e.clientX - d.startX) / viewportScale
    const dy = (e.clientY - d.startY) / viewportScale
    updateCardBase(card.id, { x: d.ox + dx, y: d.oy + dy })
  }

  function endDrag() {
    setDragging(false)
    setNoSelect(false)
    dragState.current = null
  }

  function handleResizePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    focusCard()
    setNoSelect(true)
    resizeState.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, ow: card.width, oh: card.height }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handleResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const r = resizeState.current
    if (!r || r.pointerId !== e.pointerId) return
    const dw = (e.clientX - r.startX) / viewportScale
    const dh = (e.clientY - r.startY) / viewportScale
    updateCardBase(card.id, {
      width: Math.max(MIN_WIDTH, r.ow + dw),
      height: Math.max(MIN_HEIGHT, r.oh + dh),
    })
  }

  function endResize() {
    setNoSelect(false)
    resizeState.current = null
  }

  function handleDelete() {
    if (window.confirm(`Delete "${card.title || 'this card'}"?`)) {
      deleteCard(card.id)
    }
  }

  return (
    <div
      className={`card${dragging ? ' dragging' : ''}`}
      data-color={card.color}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height,
        zIndex: card.zIndex,
        transform: dragging ? 'rotate(0deg)' : `rotate(${card.rotation}deg)`,
      }}
      onPointerDown={focusCard}
    >
      <div
        className="card-header"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {editMode && (
          <div className="card-color-swatch">
            <button
              className="card-icon-btn"
              aria-label="Change color"
              onClick={(e) => {
                e.stopPropagation()
                setColorMenuOpen((v) => !v)
              }}
            >
              <span className="card-color-dot" style={{ background: swatchColor(card.color) }} />
            </button>
            {colorMenuOpen && (
              <div className="card-color-menu" onPointerDown={(e) => e.stopPropagation()}>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className="card-color-option"
                    style={{ background: swatchColor(c) }}
                    aria-label={c}
                    onClick={() => {
                      updateCardBase(card.id, { color: c })
                      setColorMenuOpen(false)
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        <input
          className="card-title"
          value={card.title}
          placeholder="Untitled"
          readOnly={!editMode}
          onChange={(e) => updateCardBase(card.id, { title: e.target.value })}
        />
        {editMode && (
          <button className="card-icon-btn" aria-label="Delete card" onClick={handleDelete}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        )}
      </div>
      <div className="card-body">{children}</div>
      {editMode && (
        <div
          className="card-resize-handle"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />
      )}
    </div>
  )
}

function swatchColor(color: CardColor): string {
  return `var(--${color})`
}
