import { create } from 'zustand'
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'
import { makeId } from '../lib/id'
import type { Workspace } from '../types'
import {
  LEGACY_STORAGE_KEY,
  blankWorkspace,
  defaultWorkspace,
  flushSave,
  loadWorkspace,
  storageKey,
  useWorkspaceStore,
} from './workspace'

export interface WorkspaceMeta {
  id: string
  name: string
}

interface Registry {
  activeId: string
  workspaces: WorkspaceMeta[]
}

const REGISTRY_KEY = 'scatter-workspace-registry-v1'
const REGISTRY_FALLBACK_KEY = 'scatter-workspace-registry-fallback-v1'

interface StoredRegistry {
  registry: Registry
  savedAt: number
}

// Registry edits (rename/create/delete) are rare, explicit user actions rather
// than per-keystroke saves, so - unlike the debounced workspace-content save in
// workspace.ts - we can just write both stores synchronously on every change.
// The localStorage mirror is what actually protects against "reload right after
// renaming" since it lands before unload even when the IndexedDB write hasn't.
function persistRegistry(registry: Registry) {
  const record: StoredRegistry = { registry, savedAt: Date.now() }
  void idbSet(REGISTRY_KEY, record)
  try {
    localStorage.setItem(REGISTRY_FALLBACK_KEY, JSON.stringify(record))
  } catch {
    // quota exceeded or storage disabled - IndexedDB write above still stands a chance
  }
}

// Pre-multi-workspace saves lived under one fixed key; adopt that data into a
// "My Workspace" entry instead of silently discarding it on first upgrade.
async function loadOrMigrateRegistry(): Promise<Registry> {
  const idbRecord = await idbGet<StoredRegistry>(REGISTRY_KEY)
  let fallbackRecord: StoredRegistry | null = null
  try {
    const raw = localStorage.getItem(REGISTRY_FALLBACK_KEY)
    if (raw) fallbackRecord = JSON.parse(raw) as StoredRegistry
  } catch {
    fallbackRecord = null
  }
  const candidates = [idbRecord, fallbackRecord].filter(
    (r): r is StoredRegistry => Boolean(r?.registry?.workspaces?.length)
  )
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.savedAt - a.savedAt)
    return candidates[0].registry
  }

  const legacy = await idbGet(LEGACY_STORAGE_KEY)
  if (legacy) {
    const id = 'default'
    await idbSet(storageKey(id), legacy)
    const registry: Registry = { activeId: id, workspaces: [{ id, name: 'My Workspace' }] }
    persistRegistry(registry)
    return registry
  }

  const id = makeId()
  const registry: Registry = { activeId: id, workspaces: [{ id, name: 'My Workspace' }] }
  persistRegistry(registry)
  return registry
}

interface RegistryState extends Registry {
  hydrated: boolean
  init: () => Promise<void>
  createWorkspace: (name: string) => Promise<void>
  importWorkspace: (name: string, workspace: Workspace) => Promise<void>
  adoptCloudWorkspace: (id: string, name: string) => void
  renameWorkspace: (id: string, name: string) => void
  deleteWorkspace: (id: string) => Promise<void>
  switchWorkspace: (id: string) => Promise<void>
}

export const useWorkspaceRegistry = create<RegistryState>((set, get) => ({
  activeId: '',
  workspaces: [],
  hydrated: false,

  init: async () => {
    const registry = await loadOrMigrateRegistry()
    set({ ...registry, hydrated: true })
    const active = registry.workspaces.find((w) => w.id === registry.activeId) ?? registry.workspaces[0]
    const data = await loadWorkspace(active.id, defaultWorkspace)
    useWorkspaceStore.getState().hydrate(data, active.id)
  },

  createWorkspace: async (name) => {
    flushSave()
    const id = makeId()
    const next: Registry = {
      activeId: id,
      workspaces: [...get().workspaces, { id, name: name.trim() || 'New workspace' }],
    }
    set(next)
    persistRegistry(next)
    useWorkspaceStore.getState().hydrate(blankWorkspace(), id)
  },

  importWorkspace: async (name, workspace) => {
    flushSave()
    const id = makeId()
    const next: Registry = {
      activeId: id,
      workspaces: [...get().workspaces, { id, name: name.trim() || 'Imported workspace' }],
    }
    set(next)
    persistRegistry(next)
    useWorkspaceStore.getState().hydrate(workspace, id)
    flushSave()
  },

  // Registers a workspace pulled down from cloud sync that this device has never
  // seen before. Its card/viewport data is written directly to local storage by
  // the caller (cloud.ts) - this just makes it show up in the switcher. Doesn't
  // change the active workspace, so a background pull never yanks focus away
  // from whatever the user is currently looking at.
  adoptCloudWorkspace: (id, name) => {
    if (get().workspaces.some((w) => w.id === id)) return
    const next: Registry = { activeId: get().activeId, workspaces: [...get().workspaces, { id, name }] }
    set(next)
    persistRegistry(next)
  },

  renameWorkspace: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const next: Registry = {
      activeId: get().activeId,
      workspaces: get().workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w)),
    }
    set(next)
    persistRegistry(next)
  },

  deleteWorkspace: async (id) => {
    const { workspaces, activeId } = get()
    if (workspaces.length <= 1) return
    const remaining = workspaces.filter((w) => w.id !== id)
    const nextActiveId = activeId === id ? remaining[0].id : activeId
    const next: Registry = { activeId: nextActiveId, workspaces: remaining }
    set(next)
    persistRegistry(next)
    void idbDel(storageKey(id))
    try {
      localStorage.removeItem(`scatter-workspace-fallback-v1:${id}`)
    } catch {
      // ignore
    }
    if (activeId === id) {
      const data = await loadWorkspace(nextActiveId, defaultWorkspace)
      useWorkspaceStore.getState().hydrate(data, nextActiveId)
    }
  },

  switchWorkspace: async (id) => {
    if (id === get().activeId) return
    flushSave()
    const next: Registry = { activeId: id, workspaces: get().workspaces }
    set(next)
    persistRegistry(next)
    const data = await loadWorkspace(id, defaultWorkspace)
    useWorkspaceStore.getState().hydrate(data, id)
  },
}))
