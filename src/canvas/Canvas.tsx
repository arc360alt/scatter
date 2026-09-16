import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCrosshairs, faMinus, faPlus } from '@fortawesome/free-solid-svg-icons'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { CardRenderer } from '../cards/CardRenderer'
import { setNoSelect } from '../lib/noSelect'
import { useBlobImageUrl } from '../lib/useBlobImageUrl'

const MIN_SCALE = 0.3
const MAX_SCALE = 2.2
const DOT_TILE_SIZES = [38, 46, 30, 52, 41]

export function Canvas() {
  const cards = useWorkspaceStore((s) => s.cards)
  const viewport = useWorkspaceStore((s) => s.viewport)
  const setViewport = useWorkspaceStore((s) => s.setViewport)
  const select = useWorkspaceStore((s) => s.select)
  const background = useSettingsStore((s) => s.background)
  const backgroundImageUrl = useBlobImageUrl(background.type === 'image' ? background.imageId : undefined)

  const viewportRef = useRef<HTMLDivElement>(null)
  const [panning, setPanning] = useState(false)
  const panState = useRef<{ pointerId: number; startX: number; startY: number; ox: number; oy: number } | null>(
    null
  )
  const [editingZoom, setEditingZoom] = useState(false)
  const [zoomDraft, setZoomDraft] = useState('')

  const applyZoom = useCallback(
    (nextScale: number, anchorClientX: number, anchorClientY: number) => {
      const el = viewportRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vp = useWorkspaceStore.getState().viewport
      const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE)
      const ax = anchorClientX - rect.left
      const ay = anchorClientY - rect.top
      const worldX = (ax - vp.x) / vp.scale
      const worldY = (ay - vp.y) / vp.scale
      setViewport({ scale: clamped, x: ax - worldX * clamped, y: ay - worldY * clamped })
    },
    [setViewport]
  )

  function zoomFromCenter(nextScale: number) {
    const el = viewportRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    applyZoom(nextScale, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

  // Frames every card in view - for when panning/zooming has wandered off
  // somewhere and the cards are nowhere on screen.
  function recenterView() {
    const el = viewportRef.current
    if (!el) return
    const { cards: currentCards } = useWorkspaceStore.getState()
    const rect = el.getBoundingClientRect()
    if (currentCards.length === 0) {
      setViewport({ x: rect.width / 2, y: rect.height / 2, scale: 1 })
      return
    }
    const minX = Math.min(...currentCards.map((c) => c.x))
    const minY = Math.min(...currentCards.map((c) => c.y))
    const maxX = Math.max(...currentCards.map((c) => c.x + c.width))
    const maxY = Math.max(...currentCards.map((c) => c.y + c.height))
    const padding = 80
    const fitScale = Math.min((rect.width - padding * 2) / (maxX - minX), (rect.height - padding * 2) / (maxY - minY))
    const nextScale = clamp(Math.min(fitScale, 1), MIN_SCALE, MAX_SCALE)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    setViewport({ scale: nextScale, x: rect.width / 2 - centerX * nextScale, y: rect.height / 2 - centerY * nextScale })
  }

  // React attaches onWheel as a passive listener, so preventDefault() there is a
  // silent no-op and the browser's native ctrl/pinch page-zoom still fires
  // alongside ours. A manually-attached non-passive listener actually stops it.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    function handleWheel(e: WheelEvent) {
      const vp = useWorkspaceStore.getState().viewport
      // Alt+scroll is the dedicated zoom gesture (ctrl/meta are kept too since
      // trackpads report pinch-zoom as a synthetic ctrlKey wheel event).
      if (e.altKey || e.ctrlKey || e.metaKey) {
        e.preventDefault()
        applyZoom(vp.scale * (1 - e.deltaY * 0.01), e.clientX, e.clientY)
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
      setViewport({ x: vp.x - e.deltaX, y: vp.y - e.deltaY })
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [setViewport, applyZoom])

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (e.button !== 0) return
    select(null)
    setPanning(true)
    setNoSelect(true)
    panState.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, ox: viewport.x, oy: viewport.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const p = panState.current
    if (!p || p.pointerId !== e.pointerId) return
    setViewport({ x: p.ox + (e.clientX - p.startX), y: p.oy + (e.clientY - p.startY) })
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
    if (Number.isFinite(parsed)) {
      zoomFromCenter(parsed / 100)
    }
    setEditingZoom(false)
  }

  // Falls back to the dot texture while a custom background image is still
  // resolving from IndexedDB, rather than flashing blank.
  const backgroundStyle =
    background.type === 'image' && backgroundImageUrl
      ? {
          backgroundImage: `url(${backgroundImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : {
          backgroundImage: undefined,
          backgroundPosition: `${DOT_TILE_SIZES.map((size) => `${viewport.x % size}px ${viewport.y % size}px`).join(', ')}, 0px 0px`,
        }

  return (
    <div
      ref={viewportRef}
      className={`canvas-viewport${panning ? ' panning' : ''}`}
      style={backgroundStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      <div
        className="canvas-surface"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
      >
        {cards.map((card) => (
          <CardRenderer key={card.id} card={card} viewportScale={viewport.scale} />
        ))}
      </div>
      <div className="zoom-control">
        <button className="zoom-btn" aria-label="Zoom out" onClick={() => zoomFromCenter(viewport.scale - 0.1)}>
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
        <button className="zoom-btn" aria-label="Zoom in" onClick={() => zoomFromCenter(viewport.scale + 0.1)}>
          <FontAwesomeIcon icon={faPlus} />
        </button>
        <div className="zoom-divider" />
        <button className="zoom-btn" aria-label="Recenter on your cards" title="Recenter on your cards" onClick={recenterView}>
          <FontAwesomeIcon icon={faCrosshairs} />
        </button>
      </div>
    </div>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
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
