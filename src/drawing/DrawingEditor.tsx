import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Icon as FontAwesomeIcon } from '../components/Icon'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faArrowPointer,
  faArrowRotateLeft,
  faArrowRotateRight,
  faArrowRightLong,
  faEraser,
  faExpand,
  faFont,
  faHighlighter,
  faImage,
  faMinus,
  faPen,
  faPlus,
  faSlash,
  faTrashCan,
  faXmark,
  faCheck,
  faFillDrip,
} from '@fortawesome/free-solid-svg-icons'
import { faCircle, faSquare } from '@fortawesome/free-regular-svg-icons'
import type { DrawBackground, DrawElement, DrawingCard, ShapeElement, StrokeElement, TextElement } from '../types'
import { useWorkspaceStore } from '../store/workspace'
import { useUiStore } from '../store/ui'
import { makeId } from '../lib/id'
import { loadImageBlob, saveImageBlob } from '../lib/imageStore'
import { resizeImageToBlob } from '../lib/imageResize'
import { ImagePicker } from '../components/ImagePicker'
import { confirmDialog, isDialogOpen } from '../store/dialog'
import {
  drawElement,
  drawElements,
  drawingFont,
  elementBounds,
  hitTest,
  transformElement,
  useDrawingAssetsVersion,
  TEXT_LINE_HEIGHT,
  type Box,
} from './render'

type Tool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text'
type SizeGroup = 'pen' | 'highlighter' | 'eraser' | 'shape' | 'text'

const TOOLS: { id: Tool; label: string; icon: IconDefinition; key: string }[] = [
  { id: 'select', label: 'Select & move', icon: faArrowPointer, key: 'V' },
  { id: 'pen', label: 'Pen', icon: faPen, key: 'P' },
  { id: 'highlighter', label: 'Highlighter', icon: faHighlighter, key: 'H' },
  { id: 'eraser', label: 'Eraser', icon: faEraser, key: 'E' },
  { id: 'line', label: 'Line', icon: faSlash, key: 'L' },
  { id: 'arrow', label: 'Arrow', icon: faArrowRightLong, key: 'A' },
  { id: 'rect', label: 'Rectangle', icon: faSquare, key: 'R' },
  { id: 'ellipse', label: 'Ellipse', icon: faCircle, key: 'O' },
  { id: 'text', label: 'Text', icon: faFont, key: 'T' },
]

const COLORS = ['#2b2118', '#ffffff', '#c96a4a', '#d9a441', '#6f7a4a', '#3f8a82', '#3b6fd1', '#8a5a7a', '#e05d8c', '#8b8b8b']

const BACKGROUNDS: { id: DrawBackground; label: string }[] = [
  { id: 'blank', label: 'Blank' },
  { id: 'grid', label: 'Grid' },
  { id: 'dots', label: 'Dots' },
  { id: 'lined', label: 'Lined' },
]

const DEFAULT_SIZES: Record<SizeGroup, number> = { pen: 4, highlighter: 22, eraser: 30, shape: 4, text: 36 }
const SIZE_RANGE: Record<SizeGroup, [number, number]> = {
  pen: [1, 40],
  highlighter: [8, 80],
  eraser: [6, 160],
  shape: [1, 30],
  text: [12, 160],
}

function sizeGroupFor(tool: Tool): SizeGroup | null {
  if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser' || tool === 'text') return tool
  if (tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse') return 'shape'
  return null
}

const round = (v: number) => Math.round(v * 10) / 10

type Gesture =
  | { type: 'stroke'; pointerId: number; el: StrokeElement }
  | { type: 'shape'; pointerId: number; el: ShapeElement }
  | { type: 'erase-object'; pointerId: number; base: DrawElement[] }
  | { type: 'move'; pointerId: number; base: DrawElement[]; origin: DrawElement; startX: number; startY: number }
  | { type: 'resize'; pointerId: number; base: DrawElement[]; origin: DrawElement; box: Box; keepAspect: boolean }
  | { type: 'pan'; pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number }

interface TextEdit {
  id: string | null
  x: number
  y: number
  text: string
  color: string
  size: number
}

export function DrawingEditor({ cardId }: { cardId: string }) {
  const card = useWorkspaceStore((s) => s.cards.find((c) => c.id === cardId)) as DrawingCard | undefined
  const updateCard = useWorkspaceStore((s) => s.updateCard)
  const close = useUiStore((s) => s.openDrawingEditor)

  const [initial] = useState(() => card)
  const [elements, setElementsState] = useState<DrawElement[]>(() => card?.elements ?? [])
  const [background, setBackground] = useState<DrawBackground>(() => card?.background ?? 'blank')
  const [title, setTitle] = useState(() => card?.title ?? '')
  const [tool, setTool] = useState<Tool>('pen')
  const [eraserMode, setEraserMode] = useState<'brush' | 'object'>('brush')
  const [color, setColor] = useState(COLORS[0])
  const [sizes, setSizes] = useState(DEFAULT_SIZES)
  const [fill, setFill] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [historyFlags, setHistoryFlags] = useState({ undo: false, redo: false })

  const docW = card?.docWidth ?? 1600
  const docH = card?.docHeight ?? 1100

  const elementsRef = useRef(elements)
  const undoStack = useRef<DrawElement[][]>([])
  const redoStack = useRef<DrawElement[][]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number; midX: number; midY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const penSeen = useRef(false)
  const frame = useRef(0)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  const assetsVersion = useDrawingAssetsVersion(elements)

  const setElements = useCallback((next: DrawElement[]) => {
    elementsRef.current = next
    setElementsState(next)
  }, [])

  const syncFlags = () => setHistoryFlags({ undo: undoStack.current.length > 0, redo: redoStack.current.length > 0 })

  /** Records `base` as an undo step (call before/after replacing elements). */
  const pushHistory = useCallback((base: DrawElement[]) => {
    undoStack.current.push(base)
    if (undoStack.current.length > 200) undoStack.current.shift()
    redoStack.current = []
    syncFlags()
  }, [])

  const commit = useCallback(
    (next: DrawElement[]) => {
      pushHistory(elementsRef.current)
      setElements(next)
    },
    [pushHistory, setElements]
  )

  function undo() {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(elementsRef.current)
    setElements(prev)
    setSelectedId(null)
    syncFlags()
  }

  function redo() {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(elementsRef.current)
    setElements(next)
    setSelectedId(null)
    syncFlags()
  }

  // ---------- rendering ----------

  const pixelScale = Math.min(zoom * (window.devicePixelRatio || 1), 6000 / docW)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0)
    drawElements(ctx, elementsRef.current, textEdit?.id)
    const g = gesture.current
    if (g && (g.type === 'stroke' || g.type === 'shape')) drawElement(ctx, g.el)
  }, [pixelScale, textEdit?.id])

  const scheduleRedraw = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(redraw)
  }, [redraw])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Only resize when needed - assigning width reallocates the bitmap even if unchanged.
    const w = Math.round(docW * pixelScale)
    const h = Math.round(docH * pixelScale)
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    redraw()
  }, [docW, docH, pixelScale, redraw, elements, assetsVersion])

  // ---------- zoom ----------

  const fitZoom = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return 1
    return Math.max(0.1, Math.min(2, (stage.clientWidth - 40) / docW, (stage.clientHeight - 40) / docH))
  }, [docW, docH])

  useLayoutEffect(() => {
    setZoom(fitZoom())
  }, [fitZoom])

  function zoomAround(next: number, clientX?: number, clientY?: number) {
    const stage = stageRef.current
    const doc = docRef.current
    if (!stage || !doc) return setZoom(next)
    const clamped = Math.max(0.1, Math.min(4, next))
    const sr = stage.getBoundingClientRect()
    const cx = clientX ?? sr.left + sr.width / 2
    const cy = clientY ?? sr.top + sr.height / 2
    const dr = doc.getBoundingClientRect()
    const docX = (cx - dr.left) / zoom
    const docY = (cy - dr.top) / zoom
    setZoom(clamped)
    // Keep the point under the cursor fixed once the new size has laid out.
    requestAnimationFrame(() => {
      const dr2 = doc.getBoundingClientRect()
      stage.scrollLeft += dr2.left + docX * clamped - cx
      stage.scrollTop += dr2.top + docY * clamped - cy
    })
  }

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey || e.altKey)) return
      e.preventDefault()
      zoomAround(zoomRef.current * (1 - e.deltaY * 0.01), e.clientX, e.clientY)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // ---------- pointer input ----------

  function toDoc(clientX: number, clientY: number) {
    const r = docRef.current!.getBoundingClientRect()
    return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom }
  }

  function topHit(x: number, y: number): DrawElement | null {
    const els = elementsRef.current
    for (let i = els.length - 1; i >= 0; i--) {
      if (hitTest(els[i], x, y, 6 / zoom)) return els[i]
    }
    return null
  }

  function cancelGesture() {
    const g = gesture.current
    if (g && (g.type === 'move' || g.type === 'resize' || g.type === 'erase-object')) setElements(g.base)
    gesture.current = null
    scheduleRedraw()
  }

  function startPan(e: ReactPointerEvent) {
    const stage = stageRef.current!
    gesture.current = {
      type: 'pan',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (e.pointerType === 'pen') penSeen.current = true

    if (textEdit) {
      commitText()
      return
    }

    // Two fingers: abandon whatever the first finger started and pinch/pan instead.
    if (pointers.current.size === 2) {
      cancelGesture()
      const [a, b] = [...pointers.current.values()]
      const stage = stageRef.current!
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
      }
      return
    }
    if (pointers.current.size > 2) return

    // Middle-click, or a finger once a stylus has been used (palm rejection), pans.
    if (e.button === 1 || (e.pointerType === 'touch' && penSeen.current)) {
      startPan(e)
      return
    }

    const p = toDoc(e.clientX, e.clientY)
    const size = sizes[sizeGroupFor(tool) ?? 'pen']

    if (tool === 'pen' || tool === 'highlighter' || (tool === 'eraser' && eraserMode === 'brush')) {
      gesture.current = {
        type: 'stroke',
        pointerId: e.pointerId,
        el: { id: makeId(), kind: 'stroke', tool, points: [round(p.x), round(p.y)], color, size },
      }
      scheduleRedraw()
      return
    }
    if (tool === 'eraser') {
      gesture.current = { type: 'erase-object', pointerId: e.pointerId, base: elementsRef.current }
      eraseAt(p.x, p.y)
      return
    }
    if (tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse') {
      gesture.current = {
        type: 'shape',
        pointerId: e.pointerId,
        el: { id: makeId(), kind: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, size, fill },
      }
      return
    }
    if (tool === 'text') {
      e.preventDefault()
      const hit = topHit(p.x, p.y)
      if (hit?.kind === 'text') startTextEdit(hit)
      else setTextEdit({ id: null, x: p.x, y: p.y - sizes.text * 0.6, text: '', color, size: sizes.text })
      return
    }
    // select tool
    const hit = topHit(p.x, p.y)
    if (hit) {
      setSelectedId(hit.id)
      gesture.current = {
        type: 'move',
        pointerId: e.pointerId,
        base: elementsRef.current,
        origin: hit,
        startX: p.x,
        startY: p.y,
      }
    } else {
      setSelectedId(null)
      startPan(e)
    }
  }

  function eraseAt(x: number, y: number) {
    const tol = sizes.eraser / 2
    const remaining = elementsRef.current.filter((el) => !hitTest(el, x, y, tol))
    if (remaining.length !== elementsRef.current.length) setElements(remaining)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    const pz = pinch.current
    if (pz && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const stage = stageRef.current!
      const nextZoom = Math.max(0.1, Math.min(4, pz.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pz.dist)))
      if (Math.abs(nextZoom - zoom) > 0.01) setZoom(nextZoom)
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      stage.scrollLeft = pz.scrollLeft - (midX - pz.midX)
      stage.scrollTop = pz.scrollTop - (midY - pz.midY)
      return
    }

    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return

    if (g.type === 'pan') {
      const stage = stageRef.current!
      stage.scrollLeft = g.scrollLeft - (e.clientX - g.startX)
      stage.scrollTop = g.scrollTop - (e.clientY - g.startY)
      return
    }

    const p = toDoc(e.clientX, e.clientY)
    if (g.type === 'stroke') {
      const pts = g.el.points
      // Coalesced events give the full-resolution path on fast strokes.
      const samples = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
      for (const s of samples.length ? samples : [e.nativeEvent]) {
        const q = toDoc(s.clientX, s.clientY)
        const lx = pts[pts.length - 2]
        const ly = pts[pts.length - 1]
        if (Math.hypot(q.x - lx, q.y - ly) < 1.2 / zoom) continue
        pts.push(round(q.x), round(q.y))
      }
      scheduleRedraw()
    } else if (g.type === 'shape') {
      let { x, y } = p
      if (e.shiftKey) {
        const dx = x - g.el.x1
        const dy = y - g.el.y1
        if (g.el.kind === 'rect' || g.el.kind === 'ellipse') {
          const d = Math.max(Math.abs(dx), Math.abs(dy))
          x = g.el.x1 + Math.sign(dx || 1) * d
          y = g.el.y1 + Math.sign(dy || 1) * d
        } else {
          const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
          const len = Math.hypot(dx, dy)
          x = g.el.x1 + Math.cos(angle) * len
          y = g.el.y1 + Math.sin(angle) * len
        }
      }
      g.el = { ...g.el, x2: round(x), y2: round(y) }
      scheduleRedraw()
    } else if (g.type === 'erase-object') {
      eraseAt(p.x, p.y)
    } else if (g.type === 'move') {
      const b = elementBounds(g.origin)
      const moved = transformElement(g.origin, b, { ...b, x: b.x + p.x - g.startX, y: b.y + p.y - g.startY })
      setElements(elementsRef.current.map((el) => (el.id === g.origin.id ? moved : el)))
    } else if (g.type === 'resize') {
      const b = g.box
      let w = Math.max(8, p.x - b.x)
      let h = Math.max(8, p.y - b.y)
      if (g.keepAspect !== e.shiftKey && b.w > 0 && b.h > 0) {
        const k = Math.max(w / b.w, h / b.h)
        w = b.w * k
        h = b.h * k
      }
      const resized = transformElement(g.origin, b, { x: b.x, y: b.y, w, h })
      setElements(elementsRef.current.map((el) => (el.id === g.origin.id ? resized : el)))
    }
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    gesture.current = null
    if (g.type === 'stroke') {
      commit([...elementsRef.current, g.el])
    } else if (g.type === 'shape') {
      const tiny = Math.hypot(g.el.x2 - g.el.x1, g.el.y2 - g.el.y1) < 3
      if (!tiny) commit([...elementsRef.current, g.el])
      else scheduleRedraw()
    } else if (g.type === 'erase-object' || g.type === 'move' || g.type === 'resize') {
      if (elementsRef.current !== g.base) pushHistory(g.base)
    }
  }

  function handleResizeDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    const el = elementsRef.current.find((x) => x.id === selectedId)
    if (!el) return
    canvasRef.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = {
      type: 'resize',
      pointerId: e.pointerId,
      base: elementsRef.current,
      origin: el,
      box: elementBounds(el),
      keepAspect: el.kind === 'image' || el.kind === 'text',
    }
  }

  // ---------- text ----------

  function startTextEdit(el: TextElement) {
    setSelectedId(null)
    setTextEdit({ id: el.id, x: el.x, y: el.y, text: el.text, color: el.color, size: el.size })
  }

  function commitText() {
    const t = textEdit
    if (!t) return
    setTextEdit(null)
    const text = t.text.replace(/\s+$/, '')
    const existing = t.id ? elementsRef.current.find((el) => el.id === t.id) : null
    if (!text) {
      if (existing) commit(elementsRef.current.filter((el) => el.id !== t.id))
      return
    }
    if (existing) {
      commit(elementsRef.current.map((el) => (el.id === t.id ? { ...(el as TextElement), text, color: t.color } : el)))
    } else {
      commit([...elementsRef.current, { id: makeId(), kind: 'text', x: t.x, y: t.y, text, color: t.color, size: t.size }])
    }
  }

  useEffect(() => {
    if (textEdit) requestAnimationFrame(() => textAreaRef.current?.focus())
  }, [textEdit?.id, textEdit === null]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- images ----------

  const addImages = useCallback(
    async (imageIds: string[]) => {
      const stage = stageRef.current
      const doc = docRef.current
      if (!stage || !doc) return
      const sr = stage.getBoundingClientRect()
      const dr = doc.getBoundingClientRect()
      const cx = (sr.left + sr.width / 2 - dr.left) / zoomRef.current
      const cy = (sr.top + sr.height / 2 - dr.top) / zoomRef.current
      const added: DrawElement[] = []
      let offset = 0
      for (const imageId of imageIds) {
        const blob = await loadImageBlob(imageId)
        if (!blob) continue
        const bmp = await createImageBitmap(blob)
        const k = Math.min(1, (docW * 0.45) / bmp.width, (docH * 0.55) / bmp.height)
        const w = bmp.width * k
        const h = bmp.height * k
        bmp.close()
        added.push({ id: makeId(), kind: 'image', imageId, x: cx - w / 2 + offset, y: cy - h / 2 + offset, w, h })
        offset += 30
      }
      if (!added.length) return
      commit([...elementsRef.current, ...added])
      setTool('select')
      setSelectedId(added[added.length - 1].id)
    },
    [commit, docW, docH]
  )

  const addImageFiles = useCallback(
    async (files: File[]) => {
      const ids: string[] = []
      for (const f of files) ids.push(await saveImageBlob(await resizeImageToBlob(f, 1600, 0.85)))
      await addImages(ids)
    },
    [addImages]
  )

  // ---------- save / close ----------

  const dirty =
    elements !== (initial?.elements ?? []) || background !== initial?.background || title !== initial?.title

  function save() {
    if (textEdit) commitText()
    // commitText updates elementsRef synchronously via setElements
    updateCard<DrawingCard>(cardId, { elements: elementsRef.current, background, title })
    close(null)
  }

  async function cancel() {
    if (
      dirty &&
      !(await confirmDialog({
        title: 'Discard your changes?',
        message: "Everything you've changed in this drawing since opening it will be lost.",
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      }))
    )
      return
    close(null)
  }

  async function clearAll() {
    if (!elementsRef.current.length) return
    const ok = await confirmDialog({
      title: 'Clear the whole drawing?',
      message: 'Everything on the page is removed. You can still undo this.',
      confirmLabel: 'Clear',
      danger: true,
    })
    if (!ok) return
    commit([])
    setSelectedId(null)
  }

  function deleteSelected() {
    if (!selectedId) return
    commit(elementsRef.current.filter((el) => el.id !== selectedId))
    setSelectedId(null)
  }

  function bringSelectedForward(toFront: boolean) {
    const el = elementsRef.current.find((x) => x.id === selectedId)
    if (!el) return
    const rest = elementsRef.current.filter((x) => x.id !== selectedId)
    commit(toFront ? [...rest, el] : [el, ...rest])
  }

  // Keyboard + paste while the editor is open (the board's own handlers stand down).
  const handlersRef = useRef({ undo, redo, save, cancel, deleteSelected, commitText })
  handlersRef.current = { undo, redo, save, cancel, deleteSelected, commitText }
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const textEditRef = useRef(textEdit)
  textEditRef.current = textEdit

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isDialogOpen()) return
      const h = handlersRef.current
      const typing = (e.target as HTMLElement).closest?.('textarea, input:not([type=range]):not([type=color])')
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        h.save()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (textEditRef.current) h.commitText()
        else if (selectedRef.current) setSelectedId(null)
        else void h.cancel()
        return
      }
      if (typing) return
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) h.redo()
        else h.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        h.redo()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current) {
        e.preventDefault()
        h.deleteSelected()
        return
      }
      if (mod || e.altKey) return
      const t = TOOLS.find((x) => x.key === e.key.toUpperCase())
      if (t) {
        e.preventDefault()
        setTool(t.id)
        setSelectedId(null)
      } else if (e.key.toUpperCase() === 'I') {
        e.preventDefault()
        setPickerOpen(true)
      }
    }
    function onPaste(e: ClipboardEvent) {
      if ((e.target as HTMLElement).closest?.('textarea, input')) return
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (!files.length) return
      e.preventDefault()
      void addImageFiles(files)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [addImageFiles])

  if (!card) return null

  const selectedEl = elements.find((el) => el.id === selectedId)
  const selBox = selectedEl ? elementBounds(selectedEl) : null
  const group = sizeGroupFor(tool)
  const showColor = tool !== 'eraser' && tool !== 'select'

  return (
    <div className="drawing-editor" role="dialog" aria-label="Drawing editor">
      <div className="drawing-topbar">
        <input
          className="drawing-title"
          value={title}
          placeholder="Untitled drawing"
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="drawing-topbar-group">
          <button className="drawing-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!historyFlags.undo} onClick={undo}>
            <FontAwesomeIcon icon={faArrowRotateLeft} />
          </button>
          <button className="drawing-btn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!historyFlags.redo} onClick={redo}>
            <FontAwesomeIcon icon={faArrowRotateRight} />
          </button>
        </div>
        <div className="drawing-topbar-group">
          <button className="drawing-btn" aria-label="Zoom out" onClick={() => zoomAround(zoom / 1.25)}>
            <FontAwesomeIcon icon={faMinus} />
          </button>
          <button className="drawing-btn drawing-zoom-label" title="Fit to screen" onClick={() => setZoom(fitZoom())}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="drawing-btn" aria-label="Zoom in" onClick={() => zoomAround(zoom * 1.25)}>
            <FontAwesomeIcon icon={faPlus} />
          </button>
          <button className="drawing-btn" title="Fit to screen" aria-label="Fit to screen" onClick={() => setZoom(fitZoom())}>
            <FontAwesomeIcon icon={faExpand} />
          </button>
        </div>
        <select
          className="drawing-select"
          value={background}
          aria-label="Paper"
          onChange={(e) => setBackground(e.target.value as DrawBackground)}
        >
          {BACKGROUNDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label} paper
            </option>
          ))}
        </select>
        <button className="drawing-btn" title="Clear drawing" aria-label="Clear drawing" onClick={clearAll}>
          <FontAwesomeIcon icon={faTrashCan} />
        </button>
        <div className="drawing-topbar-spacer" />
        <button className="drawing-btn drawing-cancel" onClick={cancel}>
          <FontAwesomeIcon icon={faXmark} /> Cancel
        </button>
        <button className="drawing-btn drawing-save" onClick={save}>
          <FontAwesomeIcon icon={faCheck} /> Save
        </button>
      </div>

      <div className="drawing-main">
        <div className="drawing-tools" role="toolbar" aria-label="Drawing tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`drawing-tool${tool === t.id ? ' active' : ''}`}
              title={`${t.label} (${t.key})`}
              aria-label={t.label}
              aria-pressed={tool === t.id}
              onClick={() => {
                setTool(t.id)
                if (t.id !== 'select') setSelectedId(null)
              }}
            >
              <FontAwesomeIcon icon={t.icon} />
            </button>
          ))}
          <button className="drawing-tool" title="Add image (I)" aria-label="Add image" onClick={() => setPickerOpen(true)}>
            <FontAwesomeIcon icon={faImage} />
          </button>
        </div>

        <div
          ref={stageRef}
          className="drawing-stage"
          onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
          onDrop={(e) => {
            const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
            if (!files.length) return
            e.preventDefault()
            void addImageFiles(files)
          }}
        >
          <div
            ref={docRef}
            className={`drawing-doc draw-bg-${background}`}
            style={{ width: docW * zoom, height: docH * zoom, ['--draw-grid' as string]: `${40 * zoom}px` }}
          >
            <canvas
              ref={canvasRef}
              className={`drawing-canvas tool-${tool}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDoubleClick={(e) => {
                if (tool !== 'select') return
                const p = toDoc(e.clientX, e.clientY)
                const hit = topHit(p.x, p.y)
                if (hit?.kind === 'text') startTextEdit(hit)
              }}
            />
            {selBox && tool === 'select' && (
              <div
                className="drawing-selection"
                style={{
                  left: selBox.x * zoom - 4,
                  top: selBox.y * zoom - 4,
                  width: selBox.w * zoom + 8,
                  height: selBox.h * zoom + 8,
                }}
              >
                <div className="drawing-selection-handle" onPointerDown={handleResizeDown} />
              </div>
            )}
            {textEdit && (
              <textarea
                ref={textAreaRef}
                className="drawing-text-input"
                value={textEdit.text}
                placeholder="Type…"
                style={{
                  left: textEdit.x * zoom,
                  top: textEdit.y * zoom,
                  font: drawingFont(textEdit.size * zoom),
                  lineHeight: TEXT_LINE_HEIGHT,
                  color: textEdit.color,
                }}
                rows={Math.max(1, textEdit.text.split('\n').length)}
                onChange={(e) => setTextEdit({ ...textEdit, text: e.target.value })}
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    commitText()
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="drawing-options">
        {showColor && (
          <div className="drawing-colors">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`drawing-color${color === c ? ' active' : ''}`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
                onClick={() => {
                  setColor(c)
                  if (textEdit) setTextEdit({ ...textEdit, color: c })
                }}
              />
            ))}
            <label className="drawing-color drawing-color-custom" title="Custom color">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Custom color" />
            </label>
          </div>
        )}
        {group && (
          <label className="drawing-size">
            <span>Size</span>
            <input
              type="range"
              min={SIZE_RANGE[group][0]}
              max={SIZE_RANGE[group][1]}
              value={sizes[group]}
              onChange={(e) => setSizes({ ...sizes, [group]: Number(e.target.value) })}
            />
            <span className="drawing-size-value">{sizes[group]}</span>
          </label>
        )}
        {(tool === 'rect' || tool === 'ellipse') && (
          <button className={`drawing-btn${fill ? ' active' : ''}`} onClick={() => setFill(!fill)} aria-pressed={fill}>
            <FontAwesomeIcon icon={faFillDrip} /> Fill
          </button>
        )}
        {tool === 'eraser' && (
          <div className="drawing-segmented">
            <button className={eraserMode === 'brush' ? 'active' : ''} onClick={() => setEraserMode('brush')}>
              Brush
            </button>
            <button className={eraserMode === 'object' ? 'active' : ''} onClick={() => setEraserMode('object')}>
              Whole shapes
            </button>
          </div>
        )}
        {tool === 'select' && selectedEl && (
          <div className="drawing-topbar-group">
            <button className="drawing-btn" onClick={() => bringSelectedForward(true)}>
              Bring to front
            </button>
            <button className="drawing-btn" onClick={() => bringSelectedForward(false)}>
              Send to back
            </button>
            <button className="drawing-btn" onClick={deleteSelected}>
              <FontAwesomeIcon icon={faTrashCan} /> Delete
            </button>
          </div>
        )}
        {tool === 'select' && !selectedEl && (
          <span className="drawing-hint">Click something to select it · drag to move · corner handle to resize</span>
        )}
        {tool === 'text' && !textEdit && <span className="drawing-hint">Click anywhere to type</span>}
      </div>

      {pickerOpen && (
        <ImagePicker
          onClose={() => setPickerOpen(false)}
          onPick={(ids) => {
            setPickerOpen(false)
            void addImages(ids)
          }}
        />
      )}
    </div>
  )
}
