import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUpload, faXmark } from '@fortawesome/free-solid-svg-icons'
import { listImageIds, loadImageBlob, saveImageBlob } from '../lib/imageStore'
import { resizeImageToBlob } from '../lib/imageResize'

interface Thumb {
  id: string
  url: string
}

/** Pick an image: upload a new one, or reuse any image already in your library. */
export function ImagePicker({ onPick, onClose }: { onPick: (imageIds: string[]) => void; onClose: () => void }) {
  const [thumbs, setThumbs] = useState<Thumb[] | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    void (async () => {
      const ids = await listImageIds()
      const out: Thumb[] = []
      for (const id of ids) {
        const blob = await loadImageBlob(id)
        if (!blob) continue
        const url = URL.createObjectURL(blob)
        urls.push(url)
        out.push({ id, url })
      }
      if (!cancelled) setThumbs(out)
    })()
    return () => {
      cancelled = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    try {
      const ids: string[] = []
      for (const f of files) ids.push(await saveImageBlob(await resizeImageToBlob(f, 1600, 0.85)))
      onPick(ids)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay image-picker-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add an image</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="modal-body">
          <button className="settings-upload-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            <FontAwesomeIcon icon={faUpload} /> {busy ? 'Adding…' : 'Upload from your device…'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
          <section className="settings-section">
            <h3>Or reuse one from your library</h3>
            {thumbs === null && <div className="settings-hint">Loading…</div>}
            {thumbs?.length === 0 && <div className="settings-hint">No images saved yet.</div>}
            {thumbs && thumbs.length > 0 && (
              <div className="image-picker-grid">
                {thumbs.map((t) => (
                  <button key={t.id} className="image-picker-item" onClick={() => onPick([t.id])}>
                    <img src={t.url} alt="" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
