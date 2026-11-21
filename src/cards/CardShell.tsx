import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEllipsis, faLock, faXmark } from '@fortawesome/free-solid-svg-icons'
import type { Card, CardColor } from '../types'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { useUiStore } from '../store/ui'
import { setNoSelect } from '../lib/noSelect'
import { gestureCancelled } from '../lib/gesture'
import { cardsInGroup, snap } from '../lib/geometry'
import { CARD_COLORS } from '../lib/cardFactory'
import { rafBatch } from '../lib/frame'
import { confirmDialog } from '../store/dialog'
import { LONG_PRESS_MS } from '../lib/gesture'

const MIN_SIZE: Partial<Record<Card['type'], [number, number]>> = {
  sticky: [130, 110],
  timer: [200, 190],
  link: [200, 110],
  image: [140, 110],
  group: [200, 140],
}
const DEFAULT_MIN: [number, number] = [200, 140]
// Groups always render beneath every regular card (and beneath the arrow layer).
const GROUP_Z_OFFSET = -1_000_000

interface CardShellProps {
  card: Card
  viewportScale: number
  children: ReactNode
}

export function CardShell({ card, viewportScale, children }: CardShellProps) {
  const updateCardBase = useWorkspaceStore((s) => s.updateCardBase)
  const bringToFront = useWorkspaceStore((s) => s.bringToFront)
  const select = useWorkspaceStore((s) => s.select)
  const toggleSelect = useWorkspaceStore((s) => s.toggleSelect)
  const moveCards = useWorkspaceStore((s) => s.moveCards)
  const deleteCard = useWorkspaceStore((s) => s.deleteCard)
  const selected = useWorkspaceStore((s) => s.selectedIds.includes(card.id))
  const multiSelected = useWorkspaceStore((s) => s.selectedIds.length > 1 && s.selectedIds.includes(card.id))
  const flashing = useWorkspaceStore((s) => s.flashId === card.id)
  const connecting = useWorkspaceStore((s) => s.connectingFrom !== null && s.connectingFrom !== card.id)
  const editMode = useSettingsStore((s) => s.editMode)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const openContextMenu = useUiStore((s) => s.openContextMenu)

  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragState = useRef<{
    pointerId: number
    startX: number
    startY: number
    ox: number
    oy: number
    moved: boolean
    origins: Record<string, { x: number; y: number }>
  } | null>(null)
  const resizeState = useRef<{ pointerId: number; startX: number; startY: number; ow: number; oh: number } | null>(
    null
  )

  // One store update per frame while dragging/resizing, however fast the pointer reports.
  const batchedMove = useMemo(() => rafBatch(moveCards), [moveCards])
  const batchedResize = useMemo(
    () => rafBatch((width: number, height: number) => updateCardBase(card.id, { width, height })),
    [updateCardBase, card.id]
  )
  const deletePress = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null)

  const isGroup = card.type === 'group'
  const isSticky = card.type === 'sticky'
  const canMove = !card.locked

  /** Handles connect-mode clicks; returns true when the click was consumed. */
  function handleConnectClick(): boolean {
    const ws = useWorkspaceStore.getState()
    if (ws.connectingFrom && ws.connectingFrom !== card.id) {
      ws.addConnector(ws.connectingFrom, card.id)
      return true
    }
    return false
  }

  function handleCardPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (handleConnectClick()) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if ((e.target as HTMLElement).closest('.card-header')) return // header manages its own selection
    if (e.shiftKey) {
      toggleSelect(card.id)
      return
    }
    if (!selected || multiSelected) select(card.id)
    if (!isGroup) bringToFront(card.id)
  }

  // The title input fills most of the header, so a plain click there must still
  // place a text cursor. We only commit to a drag once the pointer has actually
  // moved a few pixels - short of that, the browser's normal click/focus wins.
  function handleHeaderPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('.card-icon-btn, .card-color-swatch')) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (useWorkspaceStore.getState().connectingFrom) return
    if (e.shiftKey) toggleSelect(card.id)
    else if (!selected) select(card.id)
    if (!isGroup) bringToFront(card.id)
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      ox: card.x,
      oy: card.y,
      moved: false,
      origins: {},
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  /** Everything that moves together: the selection (if this card is part of a
   * multi-select), plus the contents of any group being moved. Locked cards stay put. */
  function collectMovingCards(): Record<string, { x: number; y: number }> {
    const ws = useWorkspaceStore.getState()
    const ids = ws.selectedIds.length > 1 && ws.selectedIds.includes(card.id) ? ws.selectedIds : [card.id]
    const origins: Record<string, { x: number; y: number }> = {}
    for (const id of ids) {
      const c = ws.cards.find((x) => x.id === id)
      if (!c || c.locked) continue
      origins[c.id] = { x: c.x, y: c.y }
      if (c.type === 'group') {
        for (const inner of cardsInGroup(c, ws.cards)) {
          if (!inner.locked) origins[inner.id] = { x: inner.x, y: inner.y }
        }
      }
    }
    return origins
  }

  function handleHeaderPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragState.current
    if (!d || d.pointerId !== e.pointerId) return
    if (gestureCancelled() || !canMove) {
      if (d.moved) endDrag()
      return
    }
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return
      d.moved = true
      d.origins = collectMovingCards()
      setDragging(true)
      setNoSelect(true)
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }
    let dx = (e.clientX - d.startX) / viewportScale
    let dy = (e.clientY - d.startY) / viewportScale
    if (snapToGrid) {
      dx = snap(d.ox + dx) - d.ox
      dy = snap(d.oy + dy) - d.oy
    }
    const positions: Record<string, { x: number; y: number }> = {}
    for (const [id, o] of Object.entries(d.origins)) positions[id] = { x: o.x + dx, y: o.y + dy }
    batchedMove(positions)
  }

  function endDrag() {
    batchedMove.flush()
    const d = dragState.current
    // A click (no drag) on a card that's part of a multi-selection narrows the selection to it.
    if (d && !d.moved && multiSelected) select(card.id)
    setDragging(false)
    setNoSelect(false)
    dragState.current = null
  }

  function handleResizePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    select(card.id)
    setNoSelect(true)
    resizeState.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, ow: card.width, oh: card.height }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handleResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const r = resizeState.current
    if (!r || r.pointerId !== e.pointerId) return
    if (gestureCancelled()) return endResize()
    const [minW, minH] = MIN_SIZE[card.type] ?? DEFAULT_MIN
    let width = Math.max(minW, r.ow + (e.clientX - r.startX) / viewportScale)
    let height = Math.max(minH, r.oh + (e.clientY - r.startY) / viewportScale)
    if (snapToGrid) {
      width = Math.max(minW, snap(card.x + width) - card.x)
      height = Math.max(minH, snap(card.y + height) - card.y)
    }
    batchedResize(width, height)
  }

  function endResize() {
    batchedResize.flush()
    setNoSelect(false)
    resizeState.current = null
  }

  function handleDelete(withContents = false) {
    if (isGroup && withContents) {
      const ws = useWorkspaceStore.getState()
      const inside = cardsInGroup(card, ws.cards)
      const kept = inside.filter((c) => c.locked).length
      void confirmDialog({
        title: `Delete "${card.title || 'Group'}" and everything in it?`,
        message:
          `This deletes the group and the ${inside.length} card${inside.length === 1 ? '' : 's'} inside it.` +
          (kept ? ` ${kept} locked card${kept === 1 ? ' is' : 's are'} kept.` : '') +
          ' You can undo this.',
        confirmLabel: 'Delete all',
        danger: true,
      }).then((ok) => ok && ws.deleteCards([card.id, ...inside.map((c) => c.id)]))
      return
    }
    void confirmDialog({
      title: `Delete "${card.title || 'this card'}"?`,
      message: isGroup
        ? 'Only the frame is deleted - the cards inside stay. To delete them too, Shift+click the X (or hold it on touch).'
        : 'You can bring it back with undo.',
      danger: true,
    }).then((ok) => ok && deleteCard(card.id))
  }

  // Touch: holding the group's X deletes the group with its contents (Shift+click on desktop).
  function handleDeletePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!isGroup || e.pointerType !== 'touch') return
    const press = {
      fired: false,
      timer: setTimeout(() => {
        press.fired = true
        navigator.vibrate?.(12)
        handleDelete(true)
      }, LONG_PRESS_MS),
    }
    deletePress.current = press
  }

  function cancelDeletePress() {
    if (deletePress.current) clearTimeout(deletePress.current.timer)
  }

  function openMenuFromButton(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    select(card.id)
    openContextMenu({
      x: r.left,
      y: r.bottom + 4,
      target: { kind: 'card', id: card.id },
      touch: matchMedia('(pointer: coarse)').matches,
    })
  }

  const classes = [
    'card',
    `card-type-${card.type}`,
    dragging && 'dragging',
    selected && 'selected',
    flashing && 'flash',
    card.locked && 'locked',
    connecting && 'connect-target',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      data-card-id={card.id}
      data-color={card.color}
      style={{
        // Positioned with a transform rather than left/top: moving a card is then a
        // compositor-only change instead of a layout + repaint every frame.
        left: 0,
        top: 0,
        width: card.width,
        height: card.height,
        zIndex: isGroup ? GROUP_Z_OFFSET + card.zIndex : card.zIndex,
        transform: `translate3d(${card.x}px, ${card.y}px, 0) rotate(${dragging ? 0 : card.rotation}deg)`,
      }}
      onPointerDown={handleCardPointerDown}
    >
      <div
        className="card-header"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {editMode && !isSticky && (
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
                {CARD_COLORS.map((c) => (
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
        {isSticky ? (
          <div className="card-sticky-grip" />
        ) : (
          <input
            className="card-title"
            value={card.title}
            placeholder="Untitled"
            readOnly={!editMode}
            onChange={(e) => updateCardBase(card.id, { title: e.target.value })}
          />
        )}
        {card.locked && (
          <span className="card-lock-badge" title="Position locked - unlock from the ⋯ menu">
            <FontAwesomeIcon icon={faLock} />
          </span>
        )}
        <button className="card-icon-btn" aria-label="Card menu" title="More options" onClick={openMenuFromButton}>
          <FontAwesomeIcon icon={faEllipsis} />
        </button>
        {editMode && !card.locked && !isSticky && (
          <button
            className="card-icon-btn card-delete-btn"
            aria-label={isGroup ? 'Delete group' : 'Delete card'}
            title={isGroup ? 'Delete group (Shift+click or long-press: also delete the cards inside)' : 'Delete card'}
            onPointerDown={handleDeletePointerDown}
            onPointerUp={cancelDeletePress}
            onPointerLeave={cancelDeletePress}
            onPointerCancel={cancelDeletePress}
            onContextMenu={(e) => isGroup && e.preventDefault()}
            onClick={(e) => {
              // The long-press already handled it - don't also run the normal delete.
              if (deletePress.current?.fired) {
                deletePress.current = null
                return
              }
              handleDelete(e.shiftKey)
            }}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        )}
      </div>
      <div className="card-body">{children}</div>
      {editMode && canMove && (
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
