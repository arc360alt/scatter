import { setNoSelect } from './noSelect'

// When a touch long-press opens the context menu, whatever drag/pan that same
// finger started (card drag, canvas pan) must stop following it. Drag handlers
// check this flag; it resets on the next pointerdown.
let cancelled = false

export function gestureCancelled() {
  return cancelled
}

export function cancelGestures() {
  cancelled = true
  setNoSelect(false)
}

export function resetGestureCancel() {
  cancelled = false
}

/** Elements where long-press / right-click should keep the browser's native menu
 * (text selection, spellcheck, paste). */
export function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA') return !(el as HTMLTextAreaElement).readOnly
  if (el.tagName === 'INPUT') {
    const input = el as HTMLInputElement
    return !input.readOnly && !['checkbox', 'radio', 'button', 'range', 'color'].includes(input.type)
  }
  return false
}

export const LONG_PRESS_MS = 500
export const LONG_PRESS_SLOP = 10
