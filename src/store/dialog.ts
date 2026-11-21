import { create } from 'zustand'

export interface DialogRequest {
  title: string
  message?: string
  /** Label for the main button. */
  confirmLabel?: string
  /** Label for the dismiss button; omit `cancelLabel` and set `alert` for a one-button notice. */
  cancelLabel?: string
  /** Red, destructive styling for the main button. */
  danger?: boolean
  /** A notice with only an OK button. */
  alert?: boolean
}

interface DialogState {
  current: (DialogRequest & { resolve: (ok: boolean) => void }) | null
  queue: (DialogRequest & { resolve: (ok: boolean) => void })[]
  close: (ok: boolean) => void
}

export const useDialogStore = create<DialogState>((set, get) => ({
  current: null,
  queue: [],
  close: (ok) => {
    const { current, queue } = get()
    current?.resolve(ok)
    set({ current: queue[0] ?? null, queue: queue.slice(1) })
  },
}))

function open(req: DialogRequest): Promise<boolean> {
  return new Promise((resolve) => {
    const entry = { ...req, resolve }
    const s = useDialogStore.getState()
    // One dialog at a time; any others wait their turn.
    if (s.current) useDialogStore.setState({ queue: [...s.queue, entry] })
    else useDialogStore.setState({ current: entry })
  })
}

/** Themed replacement for window.confirm(). Resolves true if the user confirms. */
export function confirmDialog(req: DialogRequest): Promise<boolean> {
  return open(req)
}

/** Themed replacement for window.alert(). */
export async function alertDialog(req: Omit<DialogRequest, 'alert' | 'cancelLabel' | 'danger'>): Promise<void> {
  await open({ confirmLabel: 'OK', ...req, alert: true })
}

export function isDialogOpen() {
  return useDialogStore.getState().current !== null
}
