import { useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUpload, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useSettingsStore, type BackgroundPresetId, type FontId, type ThemeId } from '../store/settings'
import { resizeImageToBlob } from '../lib/imageResize'
import { saveImageBlob } from '../lib/imageStore'
import { useBlobImageUrl } from '../lib/useBlobImageUrl'
import { ImageLibrarySection } from './ImageLibrarySection'

const FONT_OPTIONS: { id: FontId; label: string; blurb: string }[] = [
  { id: 'handwritten', label: 'Handwritten', blurb: 'Playful cursive titles (default)' },
  { id: 'classic', label: 'Classic', blurb: 'Clean, neutral sans-serif' },
  { id: 'legible', label: 'Legible', blurb: 'Atkinson Hyperlegible, built for readability' },
  { id: 'serif', label: 'Serif', blurb: 'Warm literary serif' },
]

const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Match system' },
]

const BG_PRESETS: { id: BackgroundPresetId; label: string }[] = [
  { id: 'cork', label: 'Cork' },
  { id: 'slate', label: 'Slate' },
  { id: 'forest', label: 'Forest' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'blush', label: 'Blush' },
]

function SettingsToggle({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string
  hint: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="settings-toggle-row">
      <div>
        <div className="settings-toggle-label">{label}</div>
        <div className="settings-toggle-hint">{hint}</div>
      </div>
      <button
        className={`settings-switch${checked ? ' on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
      />
    </div>
  )
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const fontId = useSettingsStore((s) => s.fontId)
  const theme = useSettingsStore((s) => s.theme)
  const background = useSettingsStore((s) => s.background)
  const glassUI = useSettingsStore((s) => s.glassUI)
  const aiEnabled = useSettingsStore((s) => s.aiEnabled)
  const setFontId = useSettingsStore((s) => s.setFontId)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setBackgroundPreset = useSettingsStore((s) => s.setBackgroundPreset)
  const setBackgroundImage = useSettingsStore((s) => s.setBackgroundImage)
  const clearBackgroundImage = useSettingsStore((s) => s.clearBackgroundImage)
  const toggleGlassUI = useSettingsStore((s) => s.toggleGlassUI)
  const toggleAiEnabled = useSettingsStore((s) => s.toggleAiEnabled)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrl = useBlobImageUrl(background.type === 'image' ? background.imageId : undefined)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const blob = await resizeImageToBlob(file, 1920, 0.85)
    const id = await saveImageBlob(blob)
    setBackgroundImage(id)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="modal-body">
          <section className="settings-section">
            <h3>Font</h3>
            <div className="settings-options">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  className={`settings-option-btn${fontId === f.id ? ' active' : ''}`}
                  onClick={() => setFontId(f.id)}
                >
                  {f.label}
                  <span className="option-blurb">{f.blurb}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3>Theme</h3>
            <div className="settings-options">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  className={`settings-option-btn${theme === t.id ? ' active' : ''}`}
                  onClick={() => setTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3>Background</h3>
            <div className="settings-options">
              {BG_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`bg-swatch bg-swatch-${p.id}${background.type === 'preset' && background.id === p.id ? ' active' : ''}`}
                  aria-label={p.label}
                  title={p.label}
                  onClick={() => setBackgroundPreset(p.id)}
                />
              ))}
            </div>
            <div className="settings-image-row">
              <button className="settings-upload-btn" onClick={() => fileInputRef.current?.click()}>
                <FontAwesomeIcon icon={faUpload} /> Upload your own image…
              </button>
              {background.type === 'image' && previewUrl && (
                <>
                  <div className="settings-image-preview" style={{ backgroundImage: `url(${previewUrl})` }} />
                  <button className="settings-upload-btn" onClick={clearBackgroundImage}>
                    <FontAwesomeIcon icon={faXmark} /> Remove
                  </button>
                </>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleUpload} />
            </div>
          </section>

          <ImageLibrarySection />

          <section className="settings-section">
            <h3>Interface</h3>
            <SettingsToggle
              label="Glass UI"
              hint="Translucent, blurred toolbar and panels"
              checked={glassUI}
              onToggle={toggleGlassUI}
            />
            <SettingsToggle
              label="AI assistant"
              hint="The local AI assistant that can read your cards. Turning this off unloads any downloaded model."
              checked={aiEnabled}
              onToggle={toggleAiEnabled}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
