import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronRight, faXmark } from '@fortawesome/free-solid-svg-icons'
import { deleteImageBlob, listImageIds, loadImageBlob } from '../lib/imageStore'
import { extractScatterImageIds } from '../lib/noteContent'
import { useSettingsStore } from '../store/settings'
import { useWorkspaceRegistry } from '../store/workspaceRegistry'
import { blankWorkspace, flushSave, loadWorkspace } from '../store/workspace'

interface ImageEntry {
  id: string
  url: string
  size: number
  inUse: boolean
}

async function findReferencedImageIds(): Promise<Set<string>> {
  flushSave() // make sure very-recent edits in the active workspace aren't missed
  const ids = new Set<string>()
  const background = useSettingsStore.getState().background
  if (background.type === 'image') ids.add(background.imageId)

  const workspaces = useWorkspaceRegistry.getState().workspaces
  for (const w of workspaces) {
    const data = await loadWorkspace(w.id, blankWorkspace)
    for (const card of data.cards) {
      if (card.type === 'note') {
        extractScatterImageIds(card.content).forEach((id) => ids.add(id))
      }
    }
  }
  return ids
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ImageLibrarySection() {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [images, setImages] = useState<ImageEntry[] | null>(null)

  // Revoke each batch of thumbnail object URLs once replaced or the section unmounts.
  useEffect(() => {
    return () => {
      images?.forEach((img) => URL.revokeObjectURL(img.url))
    }
  }, [images])

  async function refresh() {
    setLoading(true)
    try {
      const [ids, usedIds] = await Promise.all([listImageIds(), findReferencedImageIds()])
      const entries: ImageEntry[] = []
      for (const id of ids) {
        const blob = await loadImageBlob(id)
        if (!blob) continue
        entries.push({ id, url: URL.createObjectURL(blob), size: blob.size, inUse: usedIds.has(id) })
      }
      setImages(entries)
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    if (next) void refresh()
  }

  async function handleDelete(id: string) {
    await deleteImageBlob(id)
    setImages((prev) => prev?.filter((img) => img.id !== id) ?? null)
  }

  async function handleDeleteAllUnused() {
    const unused = images?.filter((img) => !img.inUse) ?? []
    if (unused.length === 0) return
    if (!window.confirm(`Delete ${unused.length} unused image${unused.length === 1 ? '' : 's'}? This can't be undone.`)) {
      return
    }
    await Promise.all(unused.map((img) => deleteImageBlob(img.id)))
    setImages((prev) => prev?.filter((img) => img.inUse) ?? null)
  }

  const totalBytes = images?.reduce((sum, img) => sum + img.size, 0) ?? 0
  const unusedCount = images?.filter((img) => !img.inUse).length ?? 0

  return (
    <section className="settings-section">
      <button className="settings-collapsible-header" onClick={toggle}>
        <span>
          <FontAwesomeIcon icon={expanded ? faChevronDown : faChevronRight} size="xs" /> Stored images
        </span>
        {expanded && images && <span className="settings-collapsible-hint">{formatBytes(totalBytes)}</span>}
      </button>
      {expanded && (
        <div className="settings-image-library">
          {loading && <p className="settings-hint">Loading…</p>}
          {!loading && images?.length === 0 && <p className="settings-hint">No images stored yet.</p>}
          {!loading && images && images.length > 0 && (
            <>
              <div className="image-library-grid">
                {images.map((img) => (
                  <div key={img.id} className="image-library-item">
                    <img src={img.url} alt="" />
                    <div className="image-library-meta">
                      <span>{formatBytes(img.size)}</span>
                      {!img.inUse && <span className="image-library-unused">unused</span>}
                    </div>
                    <button
                      className="image-library-delete"
                      aria-label="Delete image"
                      title="Delete image"
                      onClick={() => void handleDelete(img.id)}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                ))}
              </div>
              {unusedCount > 0 && (
                <button className="settings-upload-btn" onClick={() => void handleDeleteAllUnused()}>
                  Delete {unusedCount} unused image{unusedCount === 1 ? '' : 's'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
