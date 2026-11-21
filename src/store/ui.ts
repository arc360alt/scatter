import { create } from 'zustand'

export type ContextTarget =
  | { kind: 'canvas'; worldX: number; worldY: number }
  | { kind: 'card'; id: string }
  | { kind: 'selection' }
  | { kind: 'connector'; id: string }

export interface ContextMenuState {
  /** Screen position the menu opens at. */
  x: number
  y: number
  target: ContextTarget
  /** True when opened by a touch long-press, so the menu can use bigger touch targets. */
  touch: boolean
}

interface UiState {
  contextMenu: ContextMenuState | null
  searchOpen: boolean
  shortcutsOpen: boolean
  addMenuOpen: boolean
  /** Card id whose drawing editor is open (full-screen). */
  drawingEditorId: string | null
  assistantOpen: boolean
  /** Last known pointer position in world coordinates, so paste/shortcuts can add cards where you're pointing. */
  lastPointerWorld: { x: number; y: number } | null

  openContextMenu: (menu: ContextMenuState) => void
  closeContextMenu: () => void
  setSearchOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  setAddMenuOpen: (open: boolean) => void
  openDrawingEditor: (id: string | null) => void
  setAssistantOpen: (open: boolean) => void
  setLastPointerWorld: (p: { x: number; y: number }) => void
}

export const useUiStore = create<UiState>((set) => ({
  contextMenu: null,
  searchOpen: false,
  shortcutsOpen: false,
  addMenuOpen: false,
  drawingEditorId: null,
  assistantOpen: false,
  lastPointerWorld: null,

  openContextMenu: (contextMenu) => set({ contextMenu, addMenuOpen: false }),
  closeContextMenu: () => set({ contextMenu: null }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setAddMenuOpen: (addMenuOpen) => set({ addMenuOpen }),
  openDrawingEditor: (drawingEditorId) => set({ drawingEditorId, contextMenu: null }),
  setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
  setLastPointerWorld: (lastPointerWorld) => set({ lastPointerWorld }),
}))
