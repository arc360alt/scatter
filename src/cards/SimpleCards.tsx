import { useState } from 'react'
import { Icon as FontAwesomeIcon } from '../components/Icon'
import { faArrowUpRightFromSquare, faImage, faLink, faRotate } from '@fortawesome/free-solid-svg-icons'
import type { GroupCard as GroupCardType, ImageCard as ImageCardType, LinkCard as LinkCardType, StickyCard as StickyCardType } from '../types'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { useBlobImageUrl } from '../lib/useBlobImageUrl'
import { ImagePicker } from '../components/ImagePicker'

export function StickyCard({ card }: { card: StickyCardType }) {
  const updateCard = useWorkspaceStore((s) => s.updateCard)
  const editMode = useSettingsStore((s) => s.editMode)
  return (
    <textarea
      className="sticky-text"
      value={card.text}
      placeholder={editMode ? 'Jot something down…' : ''}
      readOnly={!editMode}
      onChange={(e) => updateCard<StickyCardType>(card.id, { text: e.target.value })}
    />
  )
}

export function ImageCard({ card }: { card: ImageCardType }) {
  const updateCard = useWorkspaceStore((s) => s.updateCard)
  const editMode = useSettingsStore((s) => s.editMode)
  const url = useBlobImageUrl(card.imageId ?? undefined)
  const [picking, setPicking] = useState(false)

  const picker = picking && (
    <ImagePicker
      onClose={() => setPicking(false)}
      onPick={(ids) => {
        setPicking(false)
        if (ids[0]) updateCard<ImageCardType>(card.id, { imageId: ids[0] })
      }}
    />
  )

  if (!card.imageId) {
    return (
      <>
        <button className="image-card-empty" disabled={!editMode} onClick={() => setPicking(true)}>
          <FontAwesomeIcon icon={faImage} />
          <span>{editMode ? 'Choose an image (or drop / paste one on the board)' : 'No image'}</span>
        </button>
        {picker}
      </>
    )
  }

  return (
    <div className="image-card">
      <div className="image-card-frame">
        {url && <img src={url} alt={card.caption || card.title} style={{ objectFit: card.fit }} draggable={false} />}
        {editMode && (
          <div className="image-card-actions">
            <button
              className="image-card-action"
              title={card.fit === 'cover' ? 'Show the whole image' : 'Fill the card'}
              onClick={() => updateCard<ImageCardType>(card.id, { fit: card.fit === 'cover' ? 'contain' : 'cover' })}
            >
              {card.fit === 'cover' ? 'Fit' : 'Fill'}
            </button>
            <button className="image-card-action" title="Replace image" onClick={() => setPicking(true)}>
              <FontAwesomeIcon icon={faRotate} />
            </button>
          </div>
        )}
      </div>
      {(editMode || card.caption) && (
        <input
          className="image-card-caption"
          value={card.caption}
          placeholder="Add a caption…"
          readOnly={!editMode}
          onChange={(e) => updateCard<ImageCardType>(card.id, { caption: e.target.value })}
        />
      )}
      {picker}
    </div>
  )
}

function normalizeUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : null
  } catch {
    return null
  }
}

export function LinkCard({ card }: { card: LinkCardType }) {
  const updateCard = useWorkspaceStore((s) => s.updateCard)
  const editMode = useSettingsStore((s) => s.editMode)
  const [draft, setDraft] = useState(card.url)
  const [editing, setEditing] = useState(!card.url)
  const [iconFailed, setIconFailed] = useState(false)
  const host = hostOf(card.url)

  function commit() {
    const url = normalizeUrl(draft)
    const h = hostOf(url)
    if (!url || !h) return
    updateCard<LinkCardType>(card.id, {
      url,
      title: card.title === 'Link' || !card.title ? h.replace(/^www\./, '') : card.title,
    })
    setEditing(false)
    setIconFailed(false)
  }

  if (editing && editMode) {
    return (
      <form
        className="link-card-form"
        onSubmit={(e) => {
          e.preventDefault()
          commit()
        }}
      >
        <input
          className="todo-add-input"
          autoFocus
          type="url"
          inputMode="url"
          placeholder="Paste a link, e.g. example.com"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="link-card-save" type="submit" disabled={!hostOf(normalizeUrl(draft))}>
          Save
        </button>
      </form>
    )
  }

  return (
    <div className="link-card">
      <div className="link-card-main">
        <span className="link-card-icon">
          {host && !iconFailed ? (
            // Loaded straight from the linked site itself - no third-party favicon service.
            <img src={`https://${host}/favicon.ico`} alt="" onError={() => setIconFailed(true)} />
          ) : (
            <FontAwesomeIcon icon={faLink} />
          )}
        </span>
        <div className="link-card-text">
          <a className="link-card-url" href={card.url} target="_blank" rel="noopener noreferrer">
            {host ?? card.url}
          </a>
          <span className="link-card-path">{card.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
        </div>
        <a className="link-card-open" href={card.url} target="_blank" rel="noopener noreferrer" title="Open link" aria-label="Open link">
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
        </a>
      </div>
      <textarea
        className="link-card-desc"
        value={card.description}
        placeholder={editMode ? 'Why is this worth keeping?' : ''}
        readOnly={!editMode}
        onChange={(e) => updateCard<LinkCardType>(card.id, { description: e.target.value })}
      />
      {editMode && (
        <button
          className="link-card-change"
          onClick={() => {
            setDraft(card.url)
            setEditing(true)
          }}
        >
          Change link
        </button>
      )}
    </div>
  )
}

export function GroupCard({ card }: { card: GroupCardType }) {
  void card
  return <div className="group-body" />
}
