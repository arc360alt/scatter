import { useWorkspaceStore } from '../store/workspace'
import type { Viewport } from '../types'

// Pointer and wheel events can fire far faster than the screen refreshes
// (gaming mice report at 500-1000Hz). Committing each one to the store means a
// React render per event, which is what makes low-end machines stutter. These
// helpers collapse everything that happens within one frame into a single update.

type Batched<T extends unknown[]> = ((...args: T) => void) & { flush: () => void; cancel: () => void }

/** Calls `fn` at most once per animation frame, with the most recent arguments. */
export function rafBatch<T extends unknown[]>(fn: (...args: T) => void): Batched<T> {
  let frame = 0
  let pending: T | null = null
  const run = () => {
    frame = 0
    const args = pending
    pending = null
    if (args) fn(...args)
  }
  const call = ((...args: T) => {
    pending = args
    if (!frame) frame = requestAnimationFrame(run)
  }) as Batched<T>
  call.flush = () => {
    if (frame) cancelAnimationFrame(frame)
    run()
  }
  call.cancel = () => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    pending = null
  }
  return call
}

let pendingViewport: Viewport | null = null
let viewportFrame = 0

/** The viewport including changes queued for the next frame (so wheel deltas accumulate correctly). */
export function liveViewport(): Viewport {
  return pendingViewport ?? useWorkspaceStore.getState().viewport
}

/** Queues a camera change; all changes in one frame are applied together. */
export function queueViewport(patch: Partial<Viewport>) {
  pendingViewport = { ...liveViewport(), ...patch }
  if (viewportFrame) return
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = 0
    const next = pendingViewport
    pendingViewport = null
    if (next) useWorkspaceStore.getState().setViewport(next)
  })
}
