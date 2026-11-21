import { useWorkspaceStore } from '../store/workspace'
import { useToastStore } from '../store/toast'
import { useWorkspaceRegistry } from '../store/workspaceRegistry'
import { boundsOf } from './geometry'
import { cardToMarkdown } from './cardText'

function slug(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'scatter'
  )
}

function workspaceName() {
  const reg = useWorkspaceRegistry.getState()
  return reg.workspaces.find((w) => w.id === reg.activeId)?.name ?? 'board'
}

function stamp() {
  return new Date().toISOString().slice(0, 10)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadText(text: string, filename: string, type = 'text/markdown') {
  downloadBlob(new Blob([text], { type }), filename)
}

/** UI chrome that shouldn't end up in exported images. */
function exportFilter(node: HTMLElement): boolean {
  if (!(node instanceof HTMLElement)) return true
  return !node.classList?.contains('card-resize-handle') && !node.classList?.contains('drawing-edit-btn')
}

function bgColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--bg-2').trim() || '#a97847'
}

async function renderToCanvas(
  node: HTMLElement,
  width: number,
  height: number,
  style: Partial<CSSStyleDeclaration>,
  backgroundColor?: string
): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import('html-to-image')
  // Keep the bitmap within browser canvas limits for big boards.
  const pixelRatio = Math.max(0.25, Math.min(2, 8000 / Math.max(width, height), Math.sqrt(40_000_000 / (width * height))))
  const opts = { width, height, style, pixelRatio, backgroundColor, filter: exportFilter, cacheBust: false }
  try {
    return await toCanvas(node, opts)
  } catch {
    // Web-font embedding is the usual failure point (cross-origin stylesheets) - retry without it.
    return toCanvas(node, { ...opts, skipFonts: true })
  }
}

async function renderBoard(): Promise<HTMLCanvasElement | null> {
  const ws = useWorkspaceStore.getState()
  const b = boundsOf(ws.cards)
  const surface = document.querySelector<HTMLElement>('.canvas-surface')
  if (!b || !surface) {
    useToastStore.getState().show('Nothing to export yet - add some cards first.')
    return null
  }
  ws.select(null) // drop selection outlines from the picture
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  const pad = 60
  const width = Math.ceil(b.width + pad * 2)
  const height = Math.ceil(b.height + pad * 2)
  return renderToCanvas(
    surface,
    width,
    height,
    { transform: `translate(${pad - b.x}px, ${pad - b.y}px)`, width: `${width}px`, height: `${height}px` },
    bgColor()
  )
}

async function withBusyToast<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  const toast = useToastStore.getState()
  toast.show(`${label}…`, 60_000)
  try {
    const result = await fn()
    toast.show(`${label} - done`)
    return result
  } catch (err) {
    toast.show(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    return undefined
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/png')
  )
}

export function exportBoardPng() {
  return withBusyToast('Exporting PNG', async () => {
    const canvas = await renderBoard()
    if (!canvas) return
    downloadBlob(await canvasToBlob(canvas), `${slug(workspaceName())}-${stamp()}.png`)
  })
}

export function exportBoardPdf() {
  return withBusyToast('Exporting PDF', async () => {
    const canvas = await renderBoard()
    if (!canvas) return
    const { jsPDF } = await import('jspdf')
    // Page sized to the board itself (in CSS px), so nothing is cropped or squashed.
    const w = canvas.width
    const h = canvas.height
    const pdf = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'px', format: [w, h], hotfixes: ['px_scaling'] })
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
    pdf.save(`${slug(workspaceName())}-${stamp()}.pdf`)
  })
}

export function exportBoardMarkdown() {
  const { cards } = useWorkspaceStore.getState()
  const sorted = cards
    .filter((c) => c.type !== 'group')
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
  const md = `# ${workspaceName()}\n\n` + sorted.map((c) => cardToMarkdown(c).replace(/^# /, '## ')).join('\n---\n\n')
  downloadText(md, `${slug(workspaceName())}-${stamp()}.md`)
}

export function exportCardPng(id: string) {
  return withBusyToast('Exporting card', async () => {
    const ws = useWorkspaceStore.getState()
    const card = ws.cards.find((c) => c.id === id)
    const el = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`)
    if (!card || !el) return
    ws.select(null)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    const pad = 16
    const canvas = await renderToCanvas(
      el,
      card.width + pad * 2,
      card.height + pad * 2,
      { left: `${pad}px`, top: `${pad}px`, transform: 'none', margin: '0' },
      undefined
    )
    downloadBlob(await canvasToBlob(canvas), `${slug(card.title || card.type)}.png`)
  })
}

export function exportCardMarkdown(id: string) {
  const card = useWorkspaceStore.getState().cards.find((c) => c.id === id)
  if (!card) return
  downloadText(cardToMarkdown(card), `${slug(card.title || card.type)}.md`)
}

export async function copyCardMarkdown(id: string) {
  const card = useWorkspaceStore.getState().cards.find((c) => c.id === id)
  if (!card) return
  try {
    await navigator.clipboard.writeText(cardToMarkdown(card))
    useToastStore.getState().show('Copied as Markdown')
  } catch {
    useToastStore.getState().show("Couldn't access the clipboard")
  }
}
