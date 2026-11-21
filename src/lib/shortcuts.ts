import { useWorkspaceStore } from '../store/workspace'
import { useUiStore } from '../store/ui'
import { useSettingsStore } from '../store/settings'
import { useToastStore } from '../store/toast'
import {
  addEntryAt,
  deleteSelection,
  duplicateSelection,
  fitAll,
  nudgeSelection,
  requireEditMode,
  zoomBy,
} from './boardActions'
import { exportBoardPng } from './exportBoard'
import type { AddEntryId } from './cardFactory'

export type ShortcutGroup = 'General' | 'View' | 'Selection' | 'Add cards'

export interface ShortcutAction {
  id: string
  label: string
  group: ShortcutGroup
  defaults: string[]
  run: () => void
  /** Also fires while typing in a text field (most shortcuts don't, so typing "n" types an n). */
  allowInInputs?: boolean
}

function addAtPointer(entry: AddEntryId) {
  const p = useUiStore.getState().lastPointerWorld
  addEntryAt(entry, p ?? undefined)
}

function ws() {
  return useWorkspaceStore.getState()
}

const ADD_SHORTCUTS: [AddEntryId, string, string][] = [
  ['note', 'Add note', 'N'],
  ['sticky', 'Add sticky', 'S'],
  ['todo', 'Add todo list', 'T'],
  ['kanban', 'Add board', 'B'],
  ['drawing', 'Add drawing', 'D'],
  ['image', 'Add image', 'I'],
  ['link', 'Add link', 'L'],
  ['code', 'Add code snippet', 'C'],
  ['pomodoro', 'Add pomodoro', 'P'],
  ['timer', 'Add timer', 'R'],
  ['calendar', 'Add calendar', 'K'],
  ['group', 'Add group', 'G'],
]

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'undo', label: 'Undo', group: 'General', defaults: ['Mod+Z'], run: () => ws().undo() },
  { id: 'redo', label: 'Redo', group: 'General', defaults: ['Mod+Shift+Z', 'Mod+Y'], run: () => ws().redo() },
  {
    id: 'search',
    label: 'Search cards',
    group: 'General',
    defaults: ['Mod+F'],
    allowInInputs: true,
    run: () => useUiStore.getState().setSearchOpen(true),
  },
  {
    id: 'shortcuts',
    label: 'Show keyboard shortcuts',
    group: 'General',
    defaults: ['?'],
    run: () => useUiStore.getState().setShortcutsOpen(true),
  },
  {
    id: 'addMenu',
    label: 'All card types & templates',
    group: 'General',
    defaults: ['A'],
    run: () => requireEditMode() && useUiStore.getState().setAddMenuOpen(true),
  },
  {
    id: 'toggleEdit',
    label: 'Lock / unlock the board',
    group: 'General',
    defaults: ['Shift+E'],
    run: () => useSettingsStore.getState().toggleEditMode(),
  },
  {
    id: 'assistant',
    label: 'Open / close the assistant',
    group: 'General',
    defaults: ['Mod+J'],
    allowInInputs: true,
    run: () => {
      const ui = useUiStore.getState()
      if (!useSettingsStore.getState().aiEnabled) {
        useToastStore.getState().show('The AI assistant is turned off in Settings.')
        return
      }
      ui.setAssistantOpen(!ui.assistantOpen)
    },
  },
  { id: 'exportPng', label: 'Export board as PNG', group: 'General', defaults: ['Mod+Shift+E'], run: () => void exportBoardPng() },

  { id: 'zoomIn', label: 'Zoom in', group: 'View', defaults: ['=', '+'], run: () => zoomBy(1.2) },
  { id: 'zoomOut', label: 'Zoom out', group: 'View', defaults: ['-'], run: () => zoomBy(1 / 1.2) },
  { id: 'fitAll', label: 'Fit all cards in view', group: 'View', defaults: ['0', 'Shift+1'], run: fitAll },
  {
    id: 'minimap',
    label: 'Show / hide minimap',
    group: 'View',
    defaults: ['Shift+M'],
    run: () => useSettingsStore.getState().toggleMinimap(),
  },
  {
    id: 'snap',
    label: 'Snap to grid on / off',
    group: 'View',
    defaults: ['Shift+G'],
    run: () => {
      useSettingsStore.getState().toggleSnapToGrid()
      useToastStore.getState().show(`Snap to grid ${useSettingsStore.getState().snapToGrid ? 'on' : 'off'}`)
    },
  },

  { id: 'delete', label: 'Delete selected', group: 'Selection', defaults: ['Delete', 'Backspace'], run: deleteSelection },
  { id: 'duplicate', label: 'Duplicate selected', group: 'Selection', defaults: ['Mod+D'], run: duplicateSelection },
  { id: 'selectAll', label: 'Select all cards', group: 'Selection', defaults: ['Mod+A'], run: () => ws().selectAll() },
  {
    id: 'deselect',
    label: 'Deselect / cancel',
    group: 'Selection',
    defaults: ['Escape'],
    run: () => {
      ws().select(null)
      ws().startConnecting(null)
    },
  },
  {
    id: 'lock',
    label: 'Lock / unlock selected cards',
    group: 'Selection',
    defaults: ['Shift+L'],
    run: () => {
      const s = ws()
      const sel = s.cards.filter((c) => s.selectedIds.includes(c.id))
      if (!sel.length) return
      s.setLocked(
        sel.map((c) => c.id),
        !sel.every((c) => c.locked)
      )
    },
  },
  {
    id: 'group',
    label: 'Group selected cards',
    group: 'Selection',
    defaults: ['Mod+G'],
    run: () => {
      if (!requireEditMode()) return
      const s = ws()
      if (s.selectedIds.length) s.groupCards(s.selectedIds)
    },
  },
  {
    id: 'connect',
    label: 'Draw an arrow from the selected card',
    group: 'Selection',
    defaults: ['Shift+A'],
    run: () => {
      if (!requireEditMode()) return
      const s = ws()
      if (s.selectedId) s.startConnecting(s.selectedId)
    },
  },
  {
    id: 'front',
    label: 'Bring to front',
    group: 'Selection',
    defaults: [']'],
    run: () => ws().selectedIds.forEach((id) => ws().bringToFront(id)),
  },
  {
    id: 'back',
    label: 'Send to back',
    group: 'Selection',
    defaults: ['['],
    run: () => ws().selectedIds.forEach((id) => ws().sendToBack(id)),
  },
  { id: 'nudgeLeft', label: 'Nudge left', group: 'Selection', defaults: ['ArrowLeft'], run: () => nudgeSelection(-10, 0) },
  { id: 'nudgeRight', label: 'Nudge right', group: 'Selection', defaults: ['ArrowRight'], run: () => nudgeSelection(10, 0) },
  { id: 'nudgeUp', label: 'Nudge up', group: 'Selection', defaults: ['ArrowUp'], run: () => nudgeSelection(0, -10) },
  { id: 'nudgeDown', label: 'Nudge down', group: 'Selection', defaults: ['ArrowDown'], run: () => nudgeSelection(0, 10) },

  ...ADD_SHORTCUTS.map(
    ([entry, label, key]): ShortcutAction => ({
      id: `add:${entry}`,
      label,
      group: 'Add cards',
      defaults: [key],
      run: () => addAtPointer(entry),
    })
  ),
]

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'])

/** Normalizes a key event to a binding string like "Mod+Shift+Z", "?" or "Delete". */
export function eventToBinding(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  let main: string
  let shiftIsImplied = false
  if (/^[a-z]$/i.test(e.key)) main = e.key.toUpperCase()
  else if (/^Key[A-Z]$/.test(e.code)) main = e.code.slice(3)
  else if (/^Digit\d$/.test(e.code)) main = e.code.slice(5)
  else if (e.key === ' ') main = 'Space'
  else if (e.key.length === 1) {
    // Symbols: the character itself already reflects Shift ("?" not "Shift+/").
    main = e.key
    shiftIsImplied = true
  } else main = e.key
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Mod')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey && !shiftIsImplied) parts.push('Shift')
  parts.push(main)
  return parts.join('+')
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Backspace: IS_MAC ? '⌫' : 'Backspace',
  Delete: IS_MAC ? '⌦' : 'Del',
}

export function formatBinding(binding: string): string {
  return binding
    .split('+')
    .map((part, i, arr) => {
      if (part === '' && i === arr.length - 1) return '+'
      if (part === 'Mod') return IS_MAC ? '⌘' : 'Ctrl'
      if (part === 'Alt') return IS_MAC ? '⌥' : 'Alt'
      if (part === 'Shift') return IS_MAC ? '⇧' : 'Shift'
      return KEY_LABELS[part] ?? part
    })
    .filter(Boolean)
    .join(IS_MAC ? '' : '+')
}

export function bindingsFor(actionId: string, overrides = useSettingsStore.getState().shortcuts): string[] {
  return overrides[actionId] ?? SHORTCUT_ACTIONS.find((a) => a.id === actionId)?.defaults ?? []
}

/** Human label of an action's first binding, for menu hints. */
export function shortcutHint(actionId: string, overrides?: Record<string, string[]>): string {
  const b = bindingsFor(actionId, overrides)[0]
  return b ? formatBinding(b) : ''
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'range', 'color'].includes(type)
  }
  return (el as HTMLElement).isContentEditable
}

export function installGlobalShortcuts(): () => void {
  function onKeyDown(e: KeyboardEvent) {
    if (e.defaultPrevented || e.isComposing) return
    const ui = useUiStore.getState()
    // Full-screen editors and dialogs handle their own keys.
    if (ui.drawingEditorId || ui.shortcutsOpen || document.querySelector('.modal-overlay')) return
    if (ui.contextMenu && e.key === 'Escape') {
      ui.closeContextMenu()
      return
    }
    const binding = eventToBinding(e)
    if (!binding) return
    const typing = isTypingTarget(document.activeElement)
    const overrides = useSettingsStore.getState().shortcuts
    const action = SHORTCUT_ACTIONS.find((a) => bindingsFor(a.id, overrides).includes(binding))
    if (!action) return
    if (typing && !action.allowInInputs) return
    e.preventDefault()
    action.run()
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}
