import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import { boundsOf } from '../lib/geometry'

const MAP_W = 200
const MAP_H = 130

/** Overview of the whole board in the corner; click or drag on it to move the camera. */
export function Minimap() {
  const cards = useWorkspaceStore((s) => s.cards)
  const viewport = useWorkspaceStore((s) => s.viewport)
  const setViewport = useWorkspaceStore((s) => s.setViewport)
  const dragging = useRef<number | null>(null)

  const view = {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: window.innerWidth / viewport.scale,
    height: window.innerHeight / viewport.scale,
  }
  const world = boundsOf([...cards, view])!
  const pad = 40
  const wx = world.x - pad
  const wy = world.y - pad
  const ww = world.width + pad * 2
  const wh = world.height + pad * 2
  const k = Math.min(MAP_W / ww, MAP_H / wh)
  const offX = (MAP_W - ww * k) / 2
  const offY = (MAP_H - wh * k) / 2
  const toMap = (x: number, y: number) => ({ x: offX + (x - wx) * k, y: offY + (y - wy) * k })

  function centerOn(e: ReactPointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const worldX = wx + (mx - offX) / k
    const worldY = wy + (my - offY) / k
    setViewport({
      x: window.innerWidth / 2 - worldX * viewport.scale,
      y: window.innerHeight / 2 - worldY * viewport.scale,
    })
  }

  const v = toMap(view.x, view.y)
  const sorted = cards.slice().sort((a, b) => (a.type === 'group' ? -1 : 0) - (b.type === 'group' ? -1 : 0))

  return (
    <div className="minimap" onPointerDown={(e) => e.stopPropagation()}>
      <svg
        width={MAP_W}
        height={MAP_H}
        onPointerDown={(e) => {
          dragging.current = e.pointerId
          e.currentTarget.setPointerCapture(e.pointerId)
          centerOn(e)
        }}
        onPointerMove={(e) => dragging.current === e.pointerId && centerOn(e)}
        onPointerUp={() => (dragging.current = null)}
        onPointerCancel={() => (dragging.current = null)}
      >
        {sorted.map((c) => {
          const p = toMap(c.x, c.y)
          return (
            <rect
              key={c.id}
              x={p.x}
              y={p.y}
              width={Math.max(2, c.width * k)}
              height={Math.max(2, c.height * k)}
              rx={1.5}
              className={c.type === 'group' ? 'minimap-group' : 'minimap-card'}
              style={c.type === 'group' ? { stroke: `var(--${c.color})` } : { fill: `var(--${c.color})` }}
            />
          )
        })}
        <rect className="minimap-view" x={v.x} y={v.y} width={view.width * k} height={view.height * k} rx={3} />
      </svg>
    </div>
  )
}
