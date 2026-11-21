import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import { useUiStore } from '../store/ui'
import { edgePoint } from '../lib/geometry'
import type { Connector } from '../types'

function strokeColor(color: Connector['color']) {
  return color === 'ink' ? 'var(--ink)' : `var(--${color})`
}

function arrowHead(tipX: number, tipY: number, fromX: number, fromY: number, size = 13) {
  const dx = tipX - fromX
  const dy = tipY - fromY
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const bx = tipX - ux * size
  const by = tipY - uy * size
  const nx = -uy * size * 0.55
  const ny = ux * size * 0.55
  return `${tipX},${tipY} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`
}

/** SVG layer of arrows between cards. Sits above group frames and below regular cards. */
export function Connectors() {
  const cards = useWorkspaceStore((s) => s.cards)
  const connectors = useWorkspaceStore((s) => s.connectors)
  const selectedConnectorId = useWorkspaceStore((s) => s.selectedConnectorId)
  const selectConnector = useWorkspaceStore((s) => s.selectConnector)
  const connectingFrom = useWorkspaceStore((s) => s.connectingFrom)
  const pointer = useUiStore((s) => (connectingFrom ? s.lastPointerWorld : null))
  const openContextMenu = useUiStore((s) => s.openContextMenu)

  const byId = new Map(cards.map((c) => [c.id, c]))
  const source = connectingFrom ? byId.get(connectingFrom) : undefined

  function handleClick(e: ReactPointerEvent, id: string) {
    e.stopPropagation()
    selectConnector(id)
  }

  function handleContextMenu(e: ReactMouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    selectConnector(id)
    openContextMenu({ x: e.clientX, y: e.clientY, target: { kind: 'connector', id }, touch: false })
  }

  return (
    <svg className="connector-layer" width="1" height="1">
      {connectors.map((k) => {
        const a = byId.get(k.from)
        const b = byId.get(k.to)
        if (!a || !b) return null
        const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
        const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
        const p1 = edgePoint(a, bc.x, bc.y)
        const p2 = edgePoint(b, ac.x, ac.y)
        const color = strokeColor(k.color)
        const selected = selectedConnectorId === k.id
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
        return (
          <g key={k.id} data-connector-id={k.id} className={`connector${selected ? ' selected' : ''}`}>
            <line
              className="connector-hit"
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              onPointerDown={(e) => handleClick(e, k.id)}
              onContextMenu={(e) => handleContextMenu(e, k.id)}
            />
            <line
              className="connector-line"
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={color}
              strokeWidth={selected ? 4 : 3}
            />
            {k.ends !== 'none' && <polygon points={arrowHead(p2.x, p2.y, p1.x, p1.y)} fill={color} />}
            {k.ends === 'both' && <polygon points={arrowHead(p1.x, p1.y, p2.x, p2.y)} fill={color} />}
            {k.label && (
              <text className="connector-label" x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle">
                {k.label}
              </text>
            )}
          </g>
        )
      })}
      {source && pointer && (
        <line
          className="connector-preview"
          x1={source.x + source.width / 2}
          y1={source.y + source.height / 2}
          x2={pointer.x}
          y2={pointer.y}
        />
      )}
    </svg>
  )
}
