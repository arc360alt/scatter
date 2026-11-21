import { useWorkspaceStore } from '../store/workspace'
import { useUiStore } from '../store/ui'
import { useSettingsStore } from '../store/settings'
import { useToastStore } from '../store/toast'
import { resizeImageToBlob } from './imageResize'
import { saveImageBlob } from './imageStore'
import { addEntryAt, worldCenter } from './boardActions'
import { isEditableTarget } from './gesture'
import { makeId } from './id'
import type { Card, Connector } from '../types'

const CARD_CLIPBOARD_PREFIX = 'scatter-cards:v1:'

/** Saves image files to the image store and drops an image card for each at a world point. */
export async function addImageFilesAt(files: File[], world: { x: number; y: number }) {
  let offset = 0
  for (const file of files) {
    try {
      const blob = await resizeImageToBlob(file, 1600, 0.85)
      const imageId = await saveImageBlob(blob)
      const bitmap = await createImageBitmap(blob)
      const width = 300
      const height = Math.round(Math.min(520, Math.max(140, (width * bitmap.height) / bitmap.width + 44)))
      bitmap.close()
      addEntryAt(
        'image',
        { x: world.x + offset, y: world.y + offset },
        { imageId, width, height, title: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'Image' }
      )
      offset += 30
    } catch {
      useToastStore.getState().show(`Couldn't read ${file.name}`)
    }
  }
}

function pastePoint() {
  return useUiStore.getState().lastPointerWorld ?? worldCenter()
}

function looksLikeUrl(text: string) {
  return /^https?:\/\/[^\s]+$/i.test(text)
}

function pasteCards(json: string) {
  const parsed = JSON.parse(json) as { cards: Card[]; connectors: Connector[] }
  const p = pastePoint()
  const minX = Math.min(...parsed.cards.map((c) => c.x))
  const minY = Math.min(...parsed.cards.map((c) => c.y))
  const idMap = new Map<string, string>()
  const now = Date.now()
  const cards = parsed.cards.map((c) => {
    const id = makeId()
    idMap.set(c.id, id)
    return { ...c, id, x: p.x + (c.x - minX), y: p.y + (c.y - minY), locked: false, createdAt: now, updatedAt: now }
  })
  const connectors = parsed.connectors
    .filter((k) => idMap.has(k.from) && idMap.has(k.to))
    .map((k) => ({ ...k, id: makeId(), from: idMap.get(k.from)!, to: idMap.get(k.to)! }))
  useWorkspaceStore.getState().insertCards(cards, connectors)
}

export function installPasteHandlers(): () => void {
  function blocked() {
    const ui = useUiStore.getState()
    return Boolean(ui.drawingEditorId || document.querySelector('.modal-overlay'))
  }

  function onCopy(e: ClipboardEvent) {
    if (blocked() || isEditableTarget(document.activeElement)) return
    if (window.getSelection()?.toString()) return // let normal text copying work
    const ws = useWorkspaceStore.getState()
    const cards = ws.cards.filter((c) => ws.selectedIds.includes(c.id))
    if (!cards.length || !e.clipboardData) return
    const ids = new Set(cards.map((c) => c.id))
    const connectors = ws.connectors.filter((k) => ids.has(k.from) && ids.has(k.to))
    e.clipboardData.setData('text/plain', CARD_CLIPBOARD_PREFIX + JSON.stringify({ cards, connectors }))
    e.preventDefault()
    useToastStore.getState().show(`Copied ${cards.length} card${cards.length === 1 ? '' : 's'}`)
  }

  function onPaste(e: ClipboardEvent) {
    if (blocked() || isEditableTarget(document.activeElement)) return
    if (!useSettingsStore.getState().editMode) return
    const data = e.clipboardData
    if (!data) return
    const files = [...data.files].filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      e.preventDefault()
      void addImageFilesAt(files, pastePoint())
      return
    }
    const text = data.getData('text/plain')
    if (!text.trim()) return
    e.preventDefault()
    const trimmed = text.trim()
    if (trimmed.startsWith(CARD_CLIPBOARD_PREFIX)) {
      try {
        pasteCards(trimmed.slice(CARD_CLIPBOARD_PREFIX.length))
      } catch {
        useToastStore.getState().show("Couldn't paste those cards")
      }
      return
    }
    if (looksLikeUrl(trimmed)) {
      let title = 'Link'
      try {
        title = new URL(trimmed).hostname.replace(/^www\./, '')
      } catch {
        /* keep default */
      }
      addEntryAt('link', pastePoint(), { url: trimmed, title })
      return
    }
    const firstLine = trimmed.split('\n')[0].replace(/^#+\s*/, '').slice(0, 50)
    addEntryAt('note', pastePoint(), { content: text, title: firstLine || 'Pasted note' })
  }

  document.addEventListener('copy', onCopy)
  document.addEventListener('paste', onPaste)
  return () => {
    document.removeEventListener('copy', onCopy)
    document.removeEventListener('paste', onPaste)
  }
}
