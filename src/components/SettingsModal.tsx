import { useRef } from 'react'
import { Icon as FontAwesomeIcon } from './Icon'
import {
  faCircleInfo,
  faCloudArrowUp,
  faGear,
  faKeyboard,
  faTableCellsLarge,
  faThumbtack,
  faUpload,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { useSettingsStore, type BackgroundPresetId, type FontId, type ThemeId } from '../store/settings'
import { resizeImageToBlob } from '../lib/imageResize'
import { saveImageBlob } from '../lib/imageStore'
import { useBlobImageUrl } from '../lib/useBlobImageUrl'
import { ImageLibrarySection } from './ImageLibrarySection'
import { AccountSection } from './AccountSection'
import { SettingsToggle } from './SettingsToggle'
import { useUiStore, type SettingsTab } from '../store/ui'
import { ADD_ENTRIES } from '../lib/cardFactory'

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

const TABS: { id: SettingsTab; label: string; icon: typeof faGear }[] = [
  { id: 'general', label: 'General', icon: faGear },
  { id: 'board', label: 'Board', icon: faTableCellsLarge },
  { id: 'account', label: 'Account & data', icon: faCloudArrowUp },
  { id: 'about', label: 'About', icon: faCircleInfo },
]

export function SettingsModal() {
  const tab = useUiStore((s) => s.settingsTab)
  return tab ? <SettingsModalInner tab={tab} /> : null
}

function SettingsModalInner({ tab }: { tab: SettingsTab }) {
  const openSettings = useUiStore((s) => s.openSettings)
  const onClose = () => openSettings(null)
  const uiMode = useSettingsStore((s) => s.uiMode)
  const setUiMode = useSettingsStore((s) => s.setUiMode)
  const neokit = uiMode === 'neokit'
  // NeoKit splits settings into tabs; Classic keeps everything on one scrolling page.
  const show = (t: SettingsTab) => !neokit || tab === t
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
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const toggleSnapToGrid = useSettingsStore((s) => s.toggleSnapToGrid)
  const showMinimap = useSettingsStore((s) => s.showMinimap)
  const toggleMinimap = useSettingsStore((s) => s.toggleMinimap)
  const quickAdd = useSettingsStore((s) => s.quickAdd)
  const toggleQuickAdd = useSettingsStore((s) => s.toggleQuickAdd)
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)

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
      <div className="modal-panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        {neokit && (
          <div className="settings-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`settings-tab${tab === t.id ? ' active' : ''}`}
                onClick={() => openSettings(t.id)}
              >
                <FontAwesomeIcon icon={t.icon} /> {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="modal-body">
          {show('general') && (
            <section className="settings-section">
              <h3>Interface</h3>
              <div className="settings-options">
                <button
                  className={`settings-option-btn${neokit ? ' active' : ''}`}
                  onClick={() => setUiMode('neokit')}
                >
                  NeoKit
                  <span className="option-blurb">Clean, matches the other NeoKit apps</span>
                </button>
                <button
                  className={`settings-option-btn${!neokit ? ' active' : ''}`}
                  onClick={() => setUiMode('classic')}
                >
                  Classic
                  <span className="option-blurb">The original corkboard look</span>
                </button>
              </div>
            </section>
          )}

          {!neokit && (
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
          )}

          {show('general') && (
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
          )}

          {show('general') && (
          <section className="settings-section">
            <h3>Background</h3>
            {neokit ? (
              <p className="settings-hint">The NeoKit board uses a plain dot grid. You can still use your own image.</p>
            ) : (
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
            )}
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
          )}

          {show('board') && (
          <section className="settings-section">
            <h3>Toolbar</h3>
            <p className="settings-hint">
              Pin the card types you use most as toolbar buttons. Everything else is in the + menu and the right-click
              (long-press on touch) menu.
            </p>
            <div className="settings-options">
              {ADD_ENTRIES.map((e) => (
                <button
                  key={e.id}
                  className={`settings-option-btn pin-option${quickAdd.includes(e.id) ? ' active' : ''}`}
                  aria-pressed={quickAdd.includes(e.id)}
                  onClick={() => toggleQuickAdd(e.id)}
                >
                  {quickAdd.includes(e.id) && <FontAwesomeIcon icon={faThumbtack} />} {e.label}
                </button>
              ))}
            </div>
          </section>
          )}

          {show('board') && (
          <section className="settings-section">
            <h3>Board</h3>
            <SettingsToggle
              label="Snap to grid"
              hint="Cards line up on a 20px grid as you move and resize them"
              checked={snapToGrid}
              onToggle={toggleSnapToGrid}
            />
            <SettingsToggle
              label="Minimap"
              hint="A small overview of the whole board in the corner"
              checked={showMinimap}
              onToggle={toggleMinimap}
            />
            <div className="settings-image-row">
              <button
                className="settings-upload-btn"
                onClick={() => {
                  onClose()
                  setShortcutsOpen(true)
                }}
              >
                <FontAwesomeIcon icon={faKeyboard} /> Customise keyboard shortcuts…
              </button>
            </div>
          </section>
          )}

          {show('account') && <ImageLibrarySection />}

          {show('general') && (
          <section className="settings-section">
            <h3>{neokit ? 'Features' : 'Interface'}</h3>
            {!neokit && (
            <SettingsToggle
              label="Glass UI"
              hint="Translucent, blurred toolbar and panels"
              checked={glassUI}
              onToggle={toggleGlassUI}
            />
            )}
            <SettingsToggle
              label="AI assistant"
              hint="The local AI assistant that can read your cards. Turning this off unloads any downloaded model."
              checked={aiEnabled}
              onToggle={toggleAiEnabled}
            />
          </section>
          )}

          {show('account') && <AccountSection />}

          {show('about') && (
          <section className="settings-section about-section">
            <h3>About</h3>
            <div className="about-brand">Scatter</div>
            <p className="about-text">
              A freeform corkboard for notes, todo lists, boards, drawings, timers and more, all on one canvas you can
              pan and zoom around.
            </p>
            <ul className="about-list">
              <li>
                <strong>Local-first.</strong> Everything is saved in this browser. No account needed; cloud sync is
                optional.
              </li>
              <li>
                <strong>Private AI.</strong> The assistant runs entirely on your device. Nothing you write is sent to
                an AI service.
              </li>
              <li>
                <strong>Tips:</strong> right-click the board (long-press on touch) for every card type and action, and
                press <kbd>?</kbd> for keyboard shortcuts.
              </li>
            </ul>
            <div className="settings-image-row">
              <button
                className="settings-upload-btn"
                onClick={() => {
                  onClose()
                  setShortcutsOpen(true)
                }}
              >
                <FontAwesomeIcon icon={faKeyboard} /> Keyboard shortcuts
              </button>
            </div>
            <div className="about-credit">
              <img className="about-logo" src="/logo.svg" alt="Neo Technologies logo" />
              <p>
                Scatter is a product by <strong>Neo Technologies</strong> and is under the <strong>NeoKit</strong> line
                of products, provided for free under the MIT license for all.
              </p>
            </div>
            <p className="about-made">Made with React, WebLLM and Supabase.</p>
          </section>
          )}
        </div>
      </div>
    </div>
  )
}
