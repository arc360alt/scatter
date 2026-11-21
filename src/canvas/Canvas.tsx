import { memo, useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Icon as FontAwesomeIcon } from '../components/Icon'
import { faCrosshairs, faMap, faMinus, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { useUiStore, type ContextTarget } from '../store/ui'
import { CardRenderer } from '../cards/CardRenderer'
import { setNoSelect } from '../lib/noSelect'
import { useBlobImageUrl } from '../lib/useBlobImageUrl'
import { fitAll, screenToWorld, zoomAt } from '../lib/boardActions'
import {
  cancelGestures,
  gestureCancelled,
  isEditableTarget,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
  resetGestureCancel,
} from '../lib/gesture'
import { rectsIntersect } from '../lib/geometry'
import { addImageFilesAt } from '../lib/paste'
import { liveViewport, queueViewport, rafBatch } from '../lib/frame'
import { Connectors } from './Connectors'
import { Minimap } from './Minimap'

// The dot texture repeats every DOT_PERIOD px (each layer's tile size divides it),
// so the layer can be slid with a cheap GPU transform modulo the period instead of
// repainting a full-screen gradient on every pan frame.
const DOT_PERIOD = 240

const setPointerWorld = rafBatch((x: number, y: number) =>
  useUiStore.getState().setLastPointerWorld(screenToWorld(x, y))
)

const MemoConnectors = memo(Connectors)
const MemoMinimap = memo(Minimap)

/** Resolves what a right-click / long-press landed on. */
function contextTargetAt(el: EventTarget | null, clientX: number, clientY: number): ContextTarget {
  const node = el instanceof Element ? el : null
  const connectorId = node?.closest('[data-connector-id]')?.getAttribute('data-connector-id')
  if (connectorId) return { kind: 'connector', id: connectorId }
  const cardId = node?.closest('[data-card-id]')?.getAttribute('data-card-id')
  if (cardId) {
    const ws = useWorkspaceStore.getState()
    if (ws.selectedIds.length > 1 && ws.selectedIds.includes(cardId)) return { kind: 'selection' }
    return { kind: 'card', id: cardId }
  }
  const w = screenToWorld(clientX, clientY)
  return { kind: 'canvas', worldX: w.x, worldY: w.y }
}

export function Canvas() {
  const cards = useWorkspaceStore((s) => s.cards)
  const viewport = useWorkspaceStore((s) => s.viewport)
  const select = useWorkspaceStore((s) => s.select)
  const connectingFrom = useWorkspaceStore((s) => s.connectingFrom)
  const startConnecting = useWorkspaceStore((s) => s.startConnecting)
  const background = useSettingsStore((s) => s.background)
  const showMinimap = useSettingsStore((s) => s.showMinimap)
  const toggleMinimap = useSettingsStore((s) => s.toggleMinimap)
  const editMode = useSettingsStore((s) => s.editMode)
  const openContextMenu = useUiStore((s) => s.openContextMenu)
  const backgroundImageUrl = useBlobImageUrl(background.type === 'image' ? background.imageId : undefined)

  const viewportRef = useRef<HTMLDivElement>(null)
  const [panning, setPanning] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const panState = useRef<{ pointerId: number; startX: number; startY: number; ox: number; oy: number } | null>(null)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number; additive: boolean } | null>(
    null
  )
  const marqueePointer = useRef<number | null>(null)
  // Active touch points on the bare canvas, for two-finger pinch zoom.
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; scale: number; worldX: number; worldY: number } | null>(null)
  const [editingZoom, setEditingZoom] = useState(false)
  const [zoomDraft, setZoomDraft] = useState('')
  const lastPointerType = useRef<string>('mouse')

  // React attaches onWheel as a passive listener, so preventDefault() there is a
  // silent no-op and the browser's native ctrl/pinch page-zoom still fires
  // alongside ours. A manually-attached non-passive listener actually stops it.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    function handleWheel(e: WheelEvent) {
      const vp = liveViewport()
      // Alt+scroll is the dedicated zoom gesture (ctrl/meta are kept too since
      // trackpads report pinch-zoom as a synthetic ctrlKey wheel event).
      if (e.altKey || e.ctrlKey || e.metaKey) {
        e.preventDefault()
        zoomAt(vp.scale * (1 - e.deltaY * 0.01), e.clientX, e.clientY)
        return
      }
      // A plain scroll over something with its own scrollbar (a long note, an
      // overflowing kanban board, the assistant's message list...) should
      // scroll that instead of panning the whole canvas underneath it. Once
      // that inner element hits its scroll limit, further scrolling falls
      // through to panning, same as nested-scroll behavior elsewhere.
      const scrollable = findScrollableAncestor(e.target as HTMLElement | null, el!)
      if (scrollable) {
        const atTop = scrollable.scrollTop <= 0
        const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1
        if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
          return
        }
      }
      e.preventDefault()
      queueViewport({ x: vp.x - e.deltaX, y: vp.y - e.deltaY })
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // ---------- touch long-press -> context menu (touch only, never mouse) ----------
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let start: { x: number; y: number; id: number } | null = null
    let fired = false
    const activeTouches = new Set<number>()

    function clear() {
      if (timer) clearTimeout(timer)
      timer = null
      start = null
    }

    function onDown(e: PointerEvent) {
      resetGestureCancel()
      fired = false
      lastPointerType.current = e.pointerType
      if (e.pointerType !== 'touch') return
      activeTouches.add(e.pointerId)
      // A second finger means pinch, not long-press.
      if (activeTouches.size > 1 || isEditableTarget(e.target)) {
        clear()
        return
      }
      if ((e.target as Element).closest?.('.drawing-edit-btn, .zoom-control, .minimap, .card-delete-btn')) return
      start = { x: e.clientX, y: e.clientY, id: e.pointerId }
      const target = e.target
      timer = setTimeout(() => {
        if (!start) return
        fired = true
        cancelGestures()
        navigator.vibrate?.(12)
        const { x, y } = start
        // Long-pressing an unselected card selects it, matching what a click would do.
        const t = contextTargetAt(target, x, y)
        if (t.kind === 'card') useWorkspaceStore.getState().select(t.id)
        openContextMenu({ x, y, target: t, touch: true })
        clear()
      }, LONG_PRESS_MS)
    }

    function onMove(e: PointerEvent) {
      if (!start || e.pointerId !== start.id) return
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > LONG_PRESS_SLOP) clear()
    }

    function onUp(e: PointerEvent) {
      activeTouches.delete(e.pointerId)
      if (start?.id === e.pointerId) clear()
    }

    // After a long-press opens the menu, lifting the finger must not also "click"
    // whatever was underneath (a checkbox, a button...).
    function onClick(e: MouseEvent) {
      if (!fired) return
      fired = false
      e.preventDefault()
      e.stopPropagation()
    }

    el.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    el.addEventListener('click', onClick, true)
    return () => {
      clear()
      el.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      el.removeEventListener('click', onClick, true)
    }
  }, [openContextMenu])

  function handleContextMenu(e: ReactMouseEvent<HTMLDivElement>) {
    // Text fields keep the native menu (spellcheck, paste...).
    if (isEditableTarget(e.target)) return
    e.preventDefault()
    // Touch devices get the menu from our own long-press timer instead (Android
    // also fires contextmenu on long-press - ignoring it avoids a double menu).
    if (lastPointerType.current === 'touch') return
    const target = contextTargetAt(e.target, e.clientX, e.clientY)
    if (target.kind === 'card' && !useWorkspaceStore.getState().selectedIds.includes(target.id)) {
      useWorkspaceStore.getState().select(target.id)
    }
    openContextMenu({ x: e.clientX, y: e.clientY, target, touch: false })
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (e.pointerType === 'mouse' && e.button !== 0) return

    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.current.size === 2) {
        // Second finger down: switch from panning to pinch-zoom.
        const [a, b] = [...touches.current.values()]
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const w = screenToWorld(mid.x, mid.y)
        pinch.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          scale: useWorkspaceStore.getState().viewport.scale,
          worldX: w.x,
          worldY: w.y,
        }
        panState.current = null
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        return
      }
    }

    if (connectingFrom) startConnecting(null)

    if (e.shiftKey && e.pointerType === 'mouse') {
      marqueePointer.current = e.pointerId
      setMarquee({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, additive: true })
      setNoSelect(true)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    select(null)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setPanning(true)
    setNoSelect(true)
    panState.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, ox: viewport.x, oy: viewport.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    setPointerWorld(e.clientX, e.clientY)

    if (touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const p = pinch.current
      if (p && touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const scale = Math.min(2.5, Math.max(0.15, p.scale * (dist / p.dist)))
        // Keep the world point that started under the fingers' midpoint under it.
        queueViewport({ scale, x: mid.x - p.worldX * scale, y: mid.y - p.worldY * scale })
        return
      }
    }

    if (marquee && marqueePointer.current === e.pointerId) {
      setMarquee({ ...marquee, x1: e.clientX, y1: e.clientY })
      return
    }

    const p = panState.current
    if (!p || p.pointerId !== e.pointerId) return
    if (gestureCancelled()) {
      endPan()
      return
    }
    queueViewport({ x: p.ox + (e.clientX - p.startX), y: p.oy + (e.clientY - p.startY) })
  }

  function endPointer(e: ReactPointerEvent<HTMLDivElement>) {
    touches.current.delete(e.pointerId)
    if (touches.current.size < 2) pinch.current = null

    if (marquee && marqueePointer.current === e.pointerId) {
      const a = screenToWorld(Math.min(marquee.x0, marquee.x1), Math.min(marquee.y0, marquee.y1))
      const b = screenToWorld(Math.max(marquee.x0, marquee.x1), Math.max(marquee.y0, marquee.y1))
      const box = { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }
      const ws = useWorkspaceStore.getState()
      const hit = ws.cards.filter((c) => rectsIntersect(box, c)).map((c) => c.id)
      ws.setSelection([...new Set([...(marquee.additive ? ws.selectedIds : []), ...hit])])
      setMarquee(null)
      marqueePointer.current = null
      setNoSelect(false)
      return
    }
    endPan()
  }

  function endPan() {
    setPanning(false)
    setNoSelect(false)
    panState.current = null
  }

  function startEditingZoom() {
    setZoomDraft(String(Math.round(viewport.scale * 100)))
    setEditingZoom(true)
  }

  function commitZoomDraft() {
    const parsed = Number.parseInt(zoomDraft, 10)
    if (Number.isFinite(parsed)) zoomAt(parsed / 100)
    setEditingZoom(false)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (!editMode || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDropActive(true)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    setDropActive(false)
    if (!editMode) return
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    void addImageFilesAt(files, screenToWorld(e.clientX, e.clientY))
  }

  // Falls back to the dot texture while a custom background image is still
  // resolving from IndexedDB, rather than flashing blank.
  const imageBg = background.type === 'image' && backgroundImageUrl
  const backgroundStyle = imageBg
    ? { backgroundImage: `url(${backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined
  const mod = (v: number) => ((v % DOT_PERIOD) + DOT_PERIOD) % DOT_PERIOD

  return (
    <div
      ref={viewportRef}
      className={`canvas-viewport${panning ? ' panning' : ''}${connectingFrom ? ' connecting' : ''}${dropActive ? ' drop-active' : ''}`}
      style={backgroundStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDragLeave={() => setDropActive(false)}
      onDrop={handleDrop}
    >
      {!imageBg && (
        <div
          className="canvas-dots"
          style={{ transform: `translate3d(${mod(viewport.x)}px, ${mod(viewport.y)}px, 0)` }}
        />
      )}
      <div
        className="canvas-surface"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
      >
        <MemoConnectors />
        {cards.map((card) => (
          <CardRenderer key={card.id} card={card} viewportScale={viewport.scale} />
        ))}
      </div>

      {marquee && (
        <div
          className="marquee"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}

      {connectingFrom && (
        <div className="connect-banner" onPointerDown={(e) => e.stopPropagation()}>
          Tap or click another card to draw an arrow to it
          <button className="connect-banner-cancel" onClick={() => startConnecting(null)} aria-label="Cancel">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      )}

      {showMinimap && <MemoMinimap />}

      <div className="zoom-control" onPointerDown={(e) => e.stopPropagation()}>
        <button className="zoom-btn" aria-label="Zoom out" onClick={() => zoomAt(viewport.scale / 1.2)}>
          <FontAwesomeIcon icon={faMinus} />
        </button>
        {editingZoom ? (
          <input
            className="zoom-value-input"
            autoFocus
            value={zoomDraft}
            onChange={(e) => setZoomDraft(e.target.value)}
            onBlur={commitZoomDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitZoomDraft()
              if (e.key === 'Escape') setEditingZoom(false)
            }}
          />
        ) : (
          <button className="zoom-value" onClick={startEditingZoom} title="Click to set an exact zoom level">
            {Math.round(viewport.scale * 100)}%
          </button>
        )}
        <button className="zoom-btn" aria-label="Zoom in" onClick={() => zoomAt(viewport.scale * 1.2)}>
          <FontAwesomeIcon icon={faPlus} />
        </button>
        <div className="zoom-divider" />
        <button className="zoom-btn" aria-label="Fit all cards in view" title="Fit all cards in view" onClick={fitAll}>
          <FontAwesomeIcon icon={faCrosshairs} />
        </button>
        <button
          className={`zoom-btn${showMinimap ? ' active' : ''}`}
          aria-label="Toggle minimap"
          title={showMinimap ? 'Hide minimap' : 'Show minimap'}
          onClick={toggleMinimap}
        >
          <FontAwesomeIcon icon={faMap} />
        </button>
      </div>
    </div>
  )
}

function findScrollableAncestor(el: HTMLElement | null, stopAt: HTMLElement): HTMLElement | null {
  let node = el
  while (node && node !== stopAt) {
    const style = getComputedStyle(node)
    const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight
    if (canScrollY) return node
    node = node.parentElement
  }
  return null
}
