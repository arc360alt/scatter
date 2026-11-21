import { useWorkspaceStore } from '../store/workspace'
import { useUiStore } from '../store/ui'
import { useToastStore } from '../store/toast'
import { useSettingsStore } from '../store/settings'
import type { AddEntryId } from './cardFactory'
import { buildCard } from './cardFactory'
import type { Card } from '../types'
import { boundsOf } from './geometry'
import { liveViewport, queueViewport } from './frame'

export const MIN_SCALE = 0.15
export const MAX_SCALE = 2.5

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

/** The canvas fills the whole window, so the window is the viewport rect. */
function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight }
}

export function screenToWorld(clientX: number, clientY: number) {
  const vp = useWorkspaceStore.getState().viewport
  return { x: (clientX - vp.x) / vp.scale, y: (clientY - vp.y) / vp.scale }
}

export function worldCenter() {
  const { width, height } = viewportSize()
  return screenToWorld(width / 2, height / 2)
}

export function zoomAt(nextScale: number, anchorX?: number, anchorY?: number) {
  const { width, height } = viewportSize()
  const ax = anchorX ?? width / 2
  const ay = anchorY ?? height / 2
  const vp = liveViewport()
  const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE)
  const worldX = (ax - vp.x) / vp.scale
  const worldY = (ay - vp.y) / vp.scale
  queueViewport({ scale: clamped, x: ax - worldX * clamped, y: ay - worldY * clamped })
}

export function zoomBy(factor: number) {
  zoomAt(liveViewport().scale * factor)
}

let animFrame = 0

/** Smoothly moves the camera to a target viewport. */
function animateViewport(target: { x: number; y: number; scale: number }, duration = 320) {
  cancelAnimationFrame(animFrame)
  const start = { ...useWorkspaceStore.getState().viewport }
  const t0 = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / duration)
    const e = 1 - Math.pow(1 - t, 3)
    useWorkspaceStore.getState().setViewport({
      x: start.x + (target.x - start.x) * e,
      y: start.y + (target.y - start.y) * e,
      scale: start.scale + (target.scale - start.scale) * e,
    })
    if (t < 1) animFrame = requestAnimationFrame(step)
  }
  animFrame = requestAnimationFrame(step)
}

/** Frames every card in view - for when panning/zooming has wandered off somewhere. */
export function fitAll() {
  const { cards } = useWorkspaceStore.getState()
  const { width, height } = viewportSize()
  const b = boundsOf(cards)
  if (!b) {
    animateViewport({ x: width / 2, y: height / 2, scale: 1 })
    return
  }
  const padding = 90
  const fitScale = Math.min((width - padding * 2) / b.width, (height - padding * 2) / b.height)
  const scale = clamp(Math.min(fitScale, 1), MIN_SCALE, MAX_SCALE)
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  animateViewport({ scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale })
}

/** Centers a card on screen (zooming in/out only if it wouldn't fit), selects and flashes it. */
export function jumpToCard(id: string) {
  const ws = useWorkspaceStore.getState()
  const card = ws.cards.find((c) => c.id === id)
  if (!card) return
  const { width, height } = viewportSize()
  const fit = Math.min((width - 120) / card.width, (height - 200) / card.height)
  const scale = clamp(Math.min(Math.max(ws.viewport.scale, 0.8), fit), MIN_SCALE, MAX_SCALE)
  const cx = card.x + card.width / 2
  const cy = card.y + card.height / 2
  animateViewport({ scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale })
  ws.select(id)
  ws.bringToFront(id)
  ws.flash(id)
}

function requireEditMode(): boolean {
  if (useSettingsStore.getState().editMode) return true
  useToastStore.getState().show('The board is locked. Click "Locked" in the toolbar to edit.')
  return false
}

/** Adds a card from the add menu, centered on a world point (defaults to the middle of the screen). */
export function addEntryAt(entry: AddEntryId, world?: { x: number; y: number }, patch?: Partial<Card>): string | null {
  if (!requireEditMode()) return null
  const probe = buildCard(entry, { x: 0, y: 0, zIndex: 0 }, patch)
  const center = world ?? worldCenter()
  const jitter = world ? 0 : (Math.random() - 0.5) * 60
  const id = useWorkspaceStore
    .getState()
    .addCard(entry, { x: center.x - probe.width / 2 + jitter, y: center.y - probe.height / 2 + jitter }, patch)
  useUiStore.getState().setAddMenuOpen(false)
  if (entry === 'drawing') useUiStore.getState().openDrawingEditor(id)
  return id
}

export function deleteSelection() {
  if (!requireEditMode()) return
  const ws = useWorkspaceStore.getState()
  if (ws.selectedConnectorId) {
    ws.deleteConnector(ws.selectedConnectorId)
    return
  }
  const selected = ws.cards.filter((c) => ws.selectedIds.includes(c.id))
  if (selected.length === 0) return
  const deletable = selected.filter((c) => !c.locked)
  if (deletable.length === 0) {
    useToastStore.getState().show('Locked cards can\'t be deleted - unlock them first.')
    return
  }
  ws.deleteCards(deletable.map((c) => c.id))
  const skipped = selected.length - deletable.length
  useToastStore
    .getState()
    .show(
      `Deleted ${deletable.length === 1 ? `"${deletable[0].title || 'card'}"` : `${deletable.length} cards`}` +
        (skipped ? ` (${skipped} locked card${skipped === 1 ? '' : 's'} kept)` : '') +
        ' - press undo to bring it back.'
    )
}

export function duplicateSelection() {
  if (!requireEditMode()) return
  const ws = useWorkspaceStore.getState()
  if (ws.selectedIds.length) ws.duplicateCards(ws.selectedIds)
}

export function nudgeSelection(dx: number, dy: number) {
  if (!useSettingsStore.getState().editMode) return
  const ws = useWorkspaceStore.getState()
  const positions: Record<string, { x: number; y: number }> = {}
  for (const c of ws.cards) {
    if (ws.selectedIds.includes(c.id) && !c.locked) positions[c.id] = { x: c.x + dx, y: c.y + dy }
  }
  ws.moveCards(positions)
}

export { requireEditMode }
