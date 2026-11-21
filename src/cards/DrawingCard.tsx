import { useLayoutEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPaintbrush, faPen } from '@fortawesome/free-solid-svg-icons'
import type { DrawingCard as DrawingCardType } from '../types'
import { useUiStore } from '../store/ui'
import { useSettingsStore } from '../store/settings'
import { drawElements, useDrawingAssetsVersion } from '../drawing/render'

/** On-board preview: renders the drawing's vector elements to fit the card, plus an Edit button. */
export function DrawingCard({ card }: { card: DrawingCardType }) {
  const openEditor = useUiStore((s) => s.openDrawingEditor)
  const editMode = useSettingsStore((s) => s.editMode)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const assetsVersion = useDrawingAssetsVersion(card.elements)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const k = box.w && box.h ? Math.min(box.w / card.docWidth, box.h / card.docHeight) : 0
  const paperW = card.docWidth * k
  const paperH = card.docHeight * k

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !k) return
    // Render at up to 2x for crispness when zoomed in on the board, without going huge.
    const px = Math.min(2, window.devicePixelRatio || 1) * 1.5
    canvas.width = Math.max(1, Math.round(paperW * px))
    canvas.height = Math.max(1, Math.round(paperH * px))
    ctx.setTransform(k * px, 0, 0, k * px, 0, 0)
    drawElements(ctx, card.elements)
  }, [card.elements, k, paperW, paperH, assetsVersion])

  const empty = card.elements.length === 0

  return (
    <div
      ref={wrapRef}
      className="drawing-preview"
      onDoubleClick={() => editMode && openEditor(card.id)}
    >
      {k > 0 && (
        <div
          className={`drawing-paper draw-bg-${card.background}`}
          style={{ width: paperW, height: paperH, ['--draw-grid' as string]: `${40 * k}px` }}
        >
          <canvas ref={canvasRef} style={{ width: paperW, height: paperH }} />
        </div>
      )}
      {empty && (
        <button className="drawing-empty" onClick={() => openEditor(card.id)} disabled={!editMode}>
          <FontAwesomeIcon icon={faPaintbrush} />
          <span>{editMode ? 'Tap to start drawing' : 'Empty drawing'}</span>
        </button>
      )}
      {editMode && !empty && (
        <button className="drawing-edit-btn" onClick={() => openEditor(card.id)} title="Open the drawing editor">
          <FontAwesomeIcon icon={faPen} /> Edit
        </button>
      )}
    </div>
  )
}
