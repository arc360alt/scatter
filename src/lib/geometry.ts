import type { Card } from '../types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.width))
  const maxY = Math.max(...rects.map((r) => r.y + r.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function containsCenter(outer: Rect, inner: Rect): boolean {
  const cx = inner.x + inner.width / 2
  const cy = inner.y + inner.height / 2
  return cx >= outer.x && cx <= outer.x + outer.width && cy >= outer.y && cy <= outer.y + outer.height
}

/** Cards sitting inside a group frame (judged by their center point), recursively
 * including the contents of nested groups. Membership is purely positional, so
 * dropping a card onto a frame is all it takes to "add" it. */
export function cardsInGroup(group: Card, cards: Card[], seen = new Set<string>()): Card[] {
  seen.add(group.id)
  const out: Card[] = []
  for (const c of cards) {
    if (seen.has(c.id)) continue
    if (c.type === 'group' && c.width * c.height >= group.width * group.height) continue
    if (!containsCenter(group, c)) continue
    seen.add(c.id)
    out.push(c)
    if (c.type === 'group') out.push(...cardsInGroup(c, cards, seen))
  }
  return out
}

/** Where a straight line from a rect's center toward (tx, ty) leaves the rect's edge. */
export function edgePoint(r: Rect, tx: number, ty: number): { x: number; y: number } {
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = dx !== 0 ? r.width / 2 / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? r.height / 2 / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

export const GRID_SIZE = 20

export function snap(v: number, grid = GRID_SIZE) {
  return Math.round(v / grid) * grid
}
