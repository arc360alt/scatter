import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { deleteImageBlob } from '../lib/imageStore'
import { ADD_ENTRIES, DEFAULT_QUICK_ADD, type AddEntryId } from '../lib/cardFactory'

export type FontId = 'handwritten' | 'classic' | 'legible' | 'serif'
export type ThemeId = 'light' | 'dark' | 'system'
/** 'neokit' matches the rest of the NeoKit apps; 'classic' is the original corkboard look. */
export type UiMode = 'neokit' | 'classic'
export type BackgroundPresetId = 'cork' | 'slate' | 'forest' | 'midnight' | 'blush'
export type Background = { type: 'preset'; id: BackgroundPresetId } | { type: 'image'; imageId: string }

export interface Settings {
  uiMode: UiMode
  fontId: FontId
  theme: ThemeId
  background: Background
  editMode: boolean
  glassUI: boolean
  aiEnabled: boolean
  cloudAutoSaveEnabled: boolean
  cloudAutoSaveIntervalMinutes: number
  /** Card types pinned as buttons in the top toolbar (the rest live in the + menu / right-click menu). */
  quickAdd: AddEntryId[]
  /** User overrides for keyboard shortcuts, keyed by action id. Missing = default binding. */
  shortcuts: Record<string, string[]>
  snapToGrid: boolean
  showMinimap: boolean
}

const STORAGE_KEY = 'scatter-settings-v1'
const SAVE_DEBOUNCE_MS = 200

export const CLOUD_AUTO_SAVE_MIN_MINUTES = 2
export const CLOUD_AUTO_SAVE_MAX_MINUTES = 60

const DEFAULT_SETTINGS: Settings = {
  uiMode: 'neokit',
  fontId: 'handwritten',
  theme: 'system',
  background: { type: 'preset', id: 'cork' },
  editMode: true,
  glassUI: false,
  aiEnabled: true,
  cloudAutoSaveEnabled: true,
  cloudAutoSaveIntervalMinutes: 5,
  quickAdd: DEFAULT_QUICK_ADD,
  shortcuts: {},
  snapToGrid: false,
  showMinimap: typeof window === 'undefined' || window.innerWidth > 640,
}

const VALID_ENTRY_IDS = new Set(ADD_ENTRIES.map((e) => e.id))

export async function loadSettings(): Promise<Settings> {
  const stored = await idbGet<Settings>(STORAGE_KEY)
  if (!stored) return DEFAULT_SETTINGS
  const merged = { ...DEFAULT_SETTINGS, ...stored }
  merged.quickAdd = (merged.quickAdd ?? DEFAULT_QUICK_ADD).filter((id) => VALID_ENTRY_IDS.has(id))
  return merged
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
  setUiMode: (mode: UiMode) => void
  setBackgroundPreset: (id: BackgroundPresetId) => void
  setBackgroundImage: (imageId: string) => void
  clearBackgroundImage: () => void
  setEditMode: (value: boolean) => void
  toggleEditMode: () => void
  toggleGlassUI: () => void
  toggleAiEnabled: () => void
  toggleCloudAutoSave: () => void
  setCloudAutoSaveIntervalMinutes: (minutes: number) => void
  toggleQuickAdd: (id: AddEntryId) => void
  setShortcut: (actionId: string, bindings: string[] | null) => void
  resetShortcuts: () => void
  toggleSnapToGrid: () => void
  toggleMinimap: () => void
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
  setUiMode: (uiMode) => set({ uiMode }),
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
  toggleQuickAdd: (id) =>
    set((s) => {
      if (s.quickAdd.includes(id)) return { quickAdd: s.quickAdd.filter((x) => x !== id) }
      // Keep pinned buttons in the same order as the full menu, so the toolbar doesn't reshuffle.
      const next = new Set([...s.quickAdd, id])
      return { quickAdd: ADD_ENTRIES.map((e) => e.id).filter((x) => next.has(x)) }
    }),
  setShortcut: (actionId, bindings) =>
    set((s) => {
      const shortcuts = { ...s.shortcuts }
      if (bindings === null) delete shortcuts[actionId]
      else shortcuts[actionId] = bindings
      return { shortcuts }
    }),
  resetShortcuts: () => set({ shortcuts: {} }),
  toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
}))

useSettingsStore.subscribe((state) => {
  if (!state.hydrated) return
  scheduleSave({
    uiMode: state.uiMode,
    fontId: state.fontId,
    theme: state.theme,
    background: state.background,
    editMode: state.editMode,
    glassUI: state.glassUI,
    aiEnabled: state.aiEnabled,
    cloudAutoSaveEnabled: state.cloudAutoSaveEnabled,
    cloudAutoSaveIntervalMinutes: state.cloudAutoSaveIntervalMinutes,
    quickAdd: state.quickAdd,
    shortcuts: state.shortcuts,
    snapToGrid: state.snapToGrid,
    showMinimap: state.showMinimap,
  })
})
