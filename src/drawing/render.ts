import { useEffect, useState } from 'react'
import type { DrawElement, ShapeElement, StrokeElement, TextElement } from '../types'
import { loadImageBlob } from '../lib/imageStore'

// ---------- image cache ----------
// Drawing images live in the shared image store (IndexedDB). They're decoded
// once and shared by every canvas that shows them (card previews + editor).

const imageCache = new Map<string, HTMLImageElement | 'loading' | 'missing'>()
const listeners = new Set<() => void>()

function requestImage(id: string) {
  if (imageCache.has(id)) return
  imageCache.set(id, 'loading')
  void loadImageBlob(id).then((blob) => {
    if (!blob) {
      imageCache.set(id, 'missing')
      return
    }
    const img = new Image()
    img.onload = () => {
      imageCache.set(id, img)
      listeners.forEach((l) => l())
    }
    img.onerror = () => imageCache.set(id, 'missing')
    // The object URL is intentionally kept for the session: the decoded image is cached and reused.
    img.src = URL.createObjectURL(blob)
  })
}

export function getImage(id: string): HTMLImageElement | null {
  const v = imageCache.get(id)
  if (v === undefined) requestImage(id)
  return v instanceof HTMLImageElement ? v : null
}

/** Re-renders the caller when any drawing image (or the web fonts) finish loading. */
export function useDrawingAssetsVersion(elements: DrawElement[]): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    listeners.add(bump)
    void document.fonts?.ready.then(bump)
    return () => {
      listeners.delete(bump)
    }
  }, [])
  for (const el of elements) if (el.kind === 'image') getImage(el.imageId)
  return version
}

// ---------- drawing ----------

let fontFamilyCache: string | null = null
export function drawingFont(size: number) {
  if (!fontFamilyCache) {
    fontFamilyCache =
      getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'system-ui, sans-serif'
  }
  return `500 ${size}px ${fontFamilyCache}`
}

export const TEXT_LINE_HEIGHT = 1.25

function strokePath(ctx: CanvasRenderingContext2D, pts: number[]) {
  ctx.beginPath()
  ctx.moveTo(pts[0], pts[1])
  if (pts.length === 2) {
    ctx.lineTo(pts[0] + 0.01, pts[1])
    return
  }
  // Quadratic curves through the midpoints of successive samples - smooths out the jaggies.
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2
    const my = (pts[i + 1] + pts[i + 3]) / 2
    ctx.quadraticCurveTo(pts[i], pts[i + 1], mx, my)
  }
  ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1])
}

function drawStroke(ctx: CanvasRenderingContext2D, el: StrokeElement) {
  if (el.points.length < 2) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = el.size
  if (el.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = '#000'
  } else {
    ctx.strokeStyle = el.color
    if (el.tool === 'highlighter') {
      ctx.globalAlpha = 0.35
      ctx.lineCap = 'square'
    }
  }
  strokePath(ctx, el.points)
  ctx.stroke()
  ctx.restore()
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.max(12, size * 4)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - len * Math.cos(angle - 0.45), y2 - len * Math.sin(angle - 0.45))
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - len * Math.cos(angle + 0.45), y2 - len * Math.sin(angle + 0.45))
  ctx.stroke()
}

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement) {
  ctx.save()
  ctx.strokeStyle = el.color
  ctx.fillStyle = el.color
  ctx.lineWidth = el.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const x = Math.min(el.x1, el.x2)
  const y = Math.min(el.y1, el.y2)
  const w = Math.abs(el.x2 - el.x1)
  const h = Math.abs(el.y2 - el.y1)
  ctx.beginPath()
  if (el.kind === 'rect') {
    ctx.roundRect(x, y, w, h, Math.min(8, w / 4, h / 4))
  } else if (el.kind === 'ellipse') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  } else {
    ctx.moveTo(el.x1, el.y1)
    ctx.lineTo(el.x2, el.y2)
  }
  if (el.fill && (el.kind === 'rect' || el.kind === 'ellipse')) {
    ctx.globalAlpha = 0.28
    ctx.fill()
    ctx.globalAlpha = 1
  }
  ctx.stroke()
  if (el.kind === 'arrow') drawArrowHead(ctx, el.x1, el.y1, el.x2, el.y2, el.size)
  ctx.restore()
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
  ctx.save()
  ctx.fillStyle = el.color
  ctx.font = drawingFont(el.size)
  ctx.textBaseline = 'top'
  el.text.split('\n').forEach((line, i) => ctx.fillText(line, el.x, el.y + i * el.size * TEXT_LINE_HEIGHT))
  ctx.restore()
}

export function drawElement(ctx: CanvasRenderingContext2D, el: DrawElement) {
  switch (el.kind) {
    case 'stroke':
      return drawStroke(ctx, el)
    case 'text':
      return drawText(ctx, el)
    case 'image': {
      const img = getImage(el.imageId)
      if (img) ctx.drawImage(img, el.x, el.y, el.w, el.h)
      else {
        ctx.save()
        ctx.fillStyle = 'rgba(0,0,0,0.06)'
        ctx.fillRect(el.x, el.y, el.w, el.h)
        ctx.restore()
      }
      return
    }
    default:
      return drawShape(ctx, el)
  }
}

/** Draws all elements onto a canvas whose transform already maps doc units. */
export function drawElements(ctx: CanvasRenderingContext2D, elements: DrawElement[], skipId?: string | null) {
  for (const el of elements) {
    if (el.id === skipId) continue
    drawElement(ctx, el)
  }
}

// ---------- geometry for the editor ----------

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

let measureCtx: CanvasRenderingContext2D | null = null
function measureText(el: TextElement): { w: number; h: number } {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  const lines = el.text.split('\n')
  let w = 0
  if (measureCtx) {
    measureCtx.font = drawingFont(el.size)
    for (const l of lines) w = Math.max(w, measureCtx.measureText(l).width)
  } else w = el.text.length * el.size * 0.55
  return { w: Math.max(w, el.size * 0.5), h: lines.length * el.size * TEXT_LINE_HEIGHT }
}

export function elementBounds(el: DrawElement): Box {
  switch (el.kind) {
    case 'stroke': {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (let i = 0; i < el.points.length; i += 2) {
        minX = Math.min(minX, el.points[i])
        maxX = Math.max(maxX, el.points[i])
        minY = Math.min(minY, el.points[i + 1])
        maxY = Math.max(maxY, el.points[i + 1])
      }
      const pad = el.size / 2
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
    }
    case 'text': {
      const m = measureText(el)
      return { x: el.x, y: el.y, w: m.w, h: m.h }
    }
    case 'image':
      return { x: el.x, y: el.y, w: el.w, h: el.h }
    default:
      return {
        x: Math.min(el.x1, el.x2),
        y: Math.min(el.y1, el.y2),
        w: Math.abs(el.x2 - el.x1),
        h: Math.abs(el.y2 - el.y1),
      }
  }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

export function hitTest(el: DrawElement, x: number, y: number, tolerance: number): boolean {
  if (el.kind === 'stroke') {
    if (el.tool === 'eraser') return false
    const r = el.size / 2 + tolerance
    const p = el.points
    if (p.length === 2) return Math.hypot(x - p[0], y - p[1]) <= r
    for (let i = 0; i < p.length - 2; i += 2) {
      if (distToSegment(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= r) return true
    }
    return false
  }
  if (el.kind === 'line' || el.kind === 'arrow') {
    return distToSegment(x, y, el.x1, el.y1, el.x2, el.y2) <= el.size / 2 + tolerance
  }
  const b = elementBounds(el)
  return x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance
}

/** Maps an element from one bounding box to another (moving and/or resizing it). */
export function transformElement(el: DrawElement, from: Box, to: Box): DrawElement {
  const sx = from.w ? to.w / from.w : 1
  const sy = from.h ? to.h / from.h : 1
  const mx = (x: number) => to.x + (x - from.x) * sx
  const my = (y: number) => to.y + (y - from.y) * sy
  switch (el.kind) {
    case 'stroke':
      return { ...el, points: el.points.map((v, i) => (i % 2 === 0 ? mx(v) : my(v))) }
    case 'text':
      return { ...el, x: mx(el.x), y: my(el.y), size: Math.max(6, el.size * sy) }
    case 'image':
      return { ...el, x: mx(el.x), y: my(el.y), w: el.w * sx, h: el.h * sy }
    default:
      return { ...el, x1: mx(el.x1), y1: my(el.y1), x2: mx(el.x2), y2: my(el.y2) }
  }
}
