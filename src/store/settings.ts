import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { deleteImageBlob } from '../lib/imageStore'

export type FontId = 'handwritten' | 'classic' | 'legible' | 'serif'
export type ThemeId = 'light' | 'dark' | 'system'
export type BackgroundPresetId = 'cork' | 'slate' | 'forest' | 'midnight' | 'blush'
export type Background = { type: 'preset'; id: BackgroundPresetId } | { type: 'image'; imageId: string }

export interface Settings {
  fontId: FontId
  theme: ThemeId
  background: Background
  editMode: boolean
  glassUI: boolean
  aiEnabled: boolean
  cloudAutoSaveEnabled: boolean
  cloudAutoSaveIntervalMinutes: number
}

const STORAGE_KEY = 'scatter-settings-v1'
const SAVE_DEBOUNCE_MS = 200

export const CLOUD_AUTO_SAVE_MIN_MINUTES = 2
export const CLOUD_AUTO_SAVE_MAX_MINUTES = 60

const DEFAULT_SETTINGS: Settings = {
  fontId: 'handwritten',
  theme: 'system',
  background: { type: 'preset', id: 'cork' },
  editMode: true,
  glassUI: false,
  aiEnabled: true,
  cloudAutoSaveEnabled: true,
  cloudAutoSaveIntervalMinutes: 5,
}

export async function loadSettings(): Promise<Settings> {
  const stored = await idbGet<Settings>(STORAGE_KEY)
  return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(settings: Settings) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void idbSet(STORAGE_KEY, settings), SAVE_DEBOUNCE_MS)
}

interface SettingsState extends Settings {
  hydrated: boolean
  hydrate: (settings: Settings) => void
  setFontId: (id: FontId) => void
  setTheme: (theme: ThemeId) => void
  setBackgroundPreset: (id: BackgroundPresetId) => void
  setBackgroundImage: (imageId: string) => void
  clearBackgroundImage: () => void
  setEditMode: (value: boolean) => void
  toggleEditMode: () => void
  toggleGlassUI: () => void
  toggleAiEnabled: () => void
  toggleCloudAutoSave: () => void
  setCloudAutoSaveIntervalMinutes: (minutes: number) => void
}

// Deletes the previous background image's blob (if any) so switching presets
// or uploading a new one doesn't leave orphaned images in IndexedDB.
function releasePreviousImage(background: Background) {
  if (background.type === 'image') void deleteImageBlob(background.imageId)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,

  hydrate: (settings) => set({ ...settings, hydrated: true }),
  setFontId: (fontId) => set({ fontId }),
  setTheme: (theme) => set({ theme }),
  setBackgroundPreset: (id) => {
    releasePreviousImage(get().background)
    set({ background: { type: 'preset', id } })
  },
  setBackgroundImage: (imageId) => {
    releasePreviousImage(get().background)
    set({ background: { type: 'image', imageId } })
  },
  clearBackgroundImage: () => {
    releasePreviousImage(get().background)
    set({ background: { type: 'preset', id: 'cork' } })
  },
  setEditMode: (editMode) => set({ editMode }),
  toggleEditMode: () => set((s) => ({ editMode: !s.editMode })),
  toggleGlassUI: () => set((s) => ({ glassUI: !s.glassUI })),
  toggleAiEnabled: () => set((s) => ({ aiEnabled: !s.aiEnabled })),
  toggleCloudAutoSave: () => set((s) => ({ cloudAutoSaveEnabled: !s.cloudAutoSaveEnabled })),
  setCloudAutoSaveIntervalMinutes: (minutes) =>
    set({
      cloudAutoSaveIntervalMinutes: Math.min(
        CLOUD_AUTO_SAVE_MAX_MINUTES,
        Math.max(CLOUD_AUTO_SAVE_MIN_MINUTES, Math.round(minutes))
      ),
    }),
}))

useSettingsStore.subscribe((state) => {
  if (!state.hydrated) return
  scheduleSave({
    fontId: state.fontId,
    theme: state.theme,
    background: state.background,
    editMode: state.editMode,
    glassUI: state.glassUI,
    aiEnabled: state.aiEnabled,
    cloudAutoSaveEnabled: state.cloudAutoSaveEnabled,
    cloudAutoSaveIntervalMinutes: state.cloudAutoSaveIntervalMinutes,
  })
})
