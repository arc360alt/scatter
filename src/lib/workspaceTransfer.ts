import type { Card, Workspace } from '../types'
import { extractScatterImageIds } from './noteContent'
import { loadImageBlob, saveImageBlob } from './imageStore'
import { loadWorkspace, blankWorkspace } from '../store/workspace'

const EXPORT_VERSION = 1

interface ExportFile {
  version: number
  name: string
  workspace: Workspace
  images: Record<string, string>
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return slug || 'workspace'
}

function noteImageIdsInWorkspace(workspace: Workspace): string[] {
  const ids = new Set<string>()
  for (const card of workspace.cards) {
    if (card.type === 'note') {
      for (const id of extractScatterImageIds(card.content)) ids.add(id)
    }
  }
  return [...ids]
}

/** Downloads a workspace (and every image its notes reference) as a single portable JSON file. */
export async function exportWorkspace(id: string, name: string): Promise<void> {
  const workspace = await loadWorkspace(id, blankWorkspace)
  const imageIds = noteImageIdsInWorkspace(workspace)

  const images: Record<string, string> = {}
  for (const imageId of imageIds) {
    const blob = await loadImageBlob(imageId)
    if (blob) images[imageId] = await blobToDataUrl(blob)
  }

  const file: ExportFile = { version: EXPORT_VERSION, name, workspace, images }
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `scatter-${slugify(name)}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function isExportFile(value: unknown): value is ExportFile {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.name === 'string' &&
    typeof v.workspace === 'object' &&
    v.workspace !== null &&
    Array.isArray((v.workspace as { cards?: unknown }).cards) &&
    typeof v.images === 'object'
  )
}

/** Parses a previously-exported file, re-saving its images locally and rewriting
 * the note references to the newly assigned ids (ids are never reused as-is). */
export async function importWorkspaceFile(file: File): Promise<{ name: string; workspace: Workspace }> {
  const raw = JSON.parse(await file.text())
  if (!isExportFile(raw)) {
    throw new Error("That doesn't look like a Scatter workspace export.")
  }

  const idMap = new Map<string, string>()
  for (const [oldId, dataUrl] of Object.entries(raw.images)) {
    const blob = await dataUrlToBlob(dataUrl)
    const newId = await saveImageBlob(blob)
    idMap.set(oldId, newId)
  }

  const cards: Card[] = raw.workspace.cards.map((card) => {
    if (card.type !== 'note') return card
    const content = card.content.replace(/scatter-image:([a-zA-Z0-9-]+)/g, (match, oldId: string) => {
      const newId = idMap.get(oldId)
      return newId ? `scatter-image:${newId}` : match
    })
    return { ...card, content }
  })

  return { name: raw.name, workspace: { ...raw.workspace, cards } }
}
