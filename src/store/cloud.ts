import { create } from 'zustand'
import { set as idbSet } from 'idb-keyval'
import type { Session } from '@supabase/supabase-js'
import { cloudSyncConfigured, supabase } from '../lib/supabaseClient'
import { getDeviceId, getDeviceLabel } from '../lib/deviceId'
import { workspaceImageIds } from '../lib/cardText'
import { loadImageBlob, saveImageBlobWithId } from '../lib/imageStore'
import { blankWorkspace, loadWorkspace, storageKey, useWorkspaceStore } from './workspace'
import { useWorkspaceRegistry } from './workspaceRegistry'
import { useSettingsStore } from './settings'
import { useToastStore } from './toast'
import type { Workspace } from '../types'

export const QUOTA_CAP_BYTES = 12 * 1024 * 1024

interface CloudWorkspaceRow {
  id: string
  user_id: string
  client_workspace_id: string
  name: string
  data: Workspace
  device_id: string | null
  updated_at: string
}

export interface DeviceRow {
  id: string
  user_id: string
  device_id: string
  label: string
  revoked_at: string | null
  last_seen_at: string
  created_at: string
}

export interface WorkspaceConflict {
  workspaceId: string
  workspaceName: string
  local: Workspace
  cloud: Workspace
  localCardCount: number
  cloudCardCount: number
  cloudUpdatedAt: string
}

interface CloudState {
  configured: boolean
  session: Session | null
  authLoading: boolean
  authError: string | null
  usageBytes: number
  quotaExceeded: boolean
  devices: DeviceRow[]
  conflict: WorkspaceConflict | null
  syncing: boolean
  saving: boolean
  loadingWorkspace: boolean
  /** Manual save/load buttons are capped to once a minute each, so mashing them
   * can't spam the server. */
  saveOnCooldown: boolean
  loadOnCooldown: boolean
  /** Whether the active workspace has changes since its last successful cloud push -
   * drives the "unsaved changes" close-tab warning and the save button's pending dot. */
  hasUnsavedChanges: boolean

  init: () => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
  resolveConflict: (choice: 'local' | 'cloud') => Promise<void>
  kickDevice: (deviceRowId: string) => Promise<void>
  refreshUsage: () => Promise<void>
  refreshDevices: () => Promise<void>
  /** Manual "save" button - force-pushes the active workspace right now. */
  saveNow: () => Promise<void>
  /** Manual "load" button - checks the cloud for the active workspace, pulling it
   * down if there's nothing local-side to conflict with, or raising the same
   * conflict prompt as auto-sync if the two have diverged. */
  loadNow: () => Promise<void>
}

const uploadedImageIds = new Set<string>()

function cardCount(workspace: Workspace): number {
  return workspace.cards.length
}

async function pushImagesForWorkspace(workspace: Workspace, userId: string) {
  if (!supabase) return
  const ids = workspaceImageIds(workspace.cards)
  for (const id of ids) {
    if (uploadedImageIds.has(id)) continue
    const blob = await loadImageBlob(id)
    if (!blob) continue
    const { error } = await supabase.storage
      .from('images')
      .upload(`${userId}/${id}`, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' })
    if (!error) uploadedImageIds.add(id)
  }
}

async function pullImagesForWorkspace(workspace: Workspace, userId: string) {
  if (!supabase) return
  const ids = workspaceImageIds(workspace.cards)
  for (const id of ids) {
    const existing = await loadImageBlob(id)
    if (existing) {
      uploadedImageIds.add(id)
      continue
    }
    const { data, error } = await supabase.storage.from('images').download(`${userId}/${id}`)
    if (error || !data) continue
    await saveImageBlobWithId(id, data)
    uploadedImageIds.add(id)
  }
}

async function pushWorkspaceNow(clientWorkspaceId: string) {
  const state = useCloudStore.getState()
  if (!supabase || !state.session || state.quotaExceeded) return
  const meta = useWorkspaceRegistry.getState().workspaces.find((w) => w.id === clientWorkspaceId)
  if (!meta) return

  const wsState = useWorkspaceStore.getState()
  const isActive = wsState.currentWorkspaceId === clientWorkspaceId
  const data: Workspace = isActive
    ? wsState.snapshot()
    : await loadWorkspace(clientWorkspaceId, blankWorkspace)

  const { error } = await supabase.from('workspaces').upsert(
    {
      user_id: state.session.user.id,
      client_workspace_id: clientWorkspaceId,
      name: meta.name,
      data,
      device_id: getDeviceId(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,client_workspace_id' }
  )

  if (error) {
    if (error.message.includes('Storage limit')) useCloudStore.setState({ quotaExceeded: true })
    return
  }

  if (isActive) useCloudStore.setState({ hasUnsavedChanges: false })
  await pushImagesForWorkspace(data, state.session.user.id)
  void useCloudStore.getState().refreshUsage()
}

async function deleteCloudWorkspace(clientWorkspaceId: string) {
  const session = useCloudStore.getState().session
  if (!supabase || !session) return
  await supabase.from('workspaces').delete().eq('user_id', session.user.id).eq('client_workspace_id', clientWorkspaceId)
  void useCloudStore.getState().refreshUsage()
}

async function pullNewWorkspace(row: CloudWorkspaceRow) {
  await idbSet(storageKey(row.client_workspace_id), { workspace: row.data, savedAt: Date.now() })
  useWorkspaceRegistry.getState().adoptCloudWorkspace(row.client_workspace_id, row.name)
  await pullImagesForWorkspace(row.data, row.user_id)
}

function raiseConflict(workspaceId: string, workspaceName: string, local: Workspace, cloudRow: CloudWorkspaceRow) {
  useCloudStore.setState({
    conflict: {
      workspaceId,
      workspaceName,
      local,
      cloud: cloudRow.data,
      localCardCount: cardCount(local),
      cloudCardCount: cardCount(cloudRow.data),
      cloudUpdatedAt: cloudRow.updated_at,
    },
  })
}

async function syncAllWorkspaces() {
  if (!supabase) return
  const session = useCloudStore.getState().session
  if (!session) return
  useCloudStore.setState({ syncing: true })

  try {
    const { data: cloudRows } = await supabase.from('workspaces').select('*').eq('user_id', session.user.id)
    const rows = (cloudRows ?? []) as CloudWorkspaceRow[]
    const localMetas = useWorkspaceRegistry.getState().workspaces
    const cloudById = new Map(rows.map((r) => [r.client_workspace_id, r]))
    const localIds = new Set(localMetas.map((m) => m.id))

    for (const row of rows) {
      if (!localIds.has(row.client_workspace_id)) {
        await pullNewWorkspace(row)
      }
    }

    for (const meta of localMetas) {
      const cloudRow = cloudById.get(meta.id)
      if (!cloudRow) {
        await pushWorkspaceNow(meta.id)
        continue
      }
      if (useCloudStore.getState().conflict) continue // one at a time; picked up again on next sync

      const localData = await loadWorkspace(meta.id, blankWorkspace)
      const same = JSON.stringify(localData) === JSON.stringify(cloudRow.data)
      if (same) continue

      raiseConflict(meta.id, meta.name, localData, cloudRow)
    }

    void useCloudStore.getState().refreshUsage()
  } finally {
    useCloudStore.setState({ syncing: false })
  }
}

/** Manual "load" - checks just the active workspace against the cloud, on demand. */
async function checkCloudForActiveWorkspace() {
  if (!supabase) return
  const session = useCloudStore.getState().session
  if (!session) return
  const workspaceId = useWorkspaceStore.getState().currentWorkspaceId
  const meta = useWorkspaceRegistry.getState().workspaces.find((w) => w.id === workspaceId)
  if (!meta) return

  const { data: cloudRow } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('client_workspace_id', workspaceId)
    .maybeSingle<CloudWorkspaceRow>()

  if (!cloudRow) {
    // Nothing on the cloud for this workspace yet - push it up rather than "load" nothing.
    await pushWorkspaceNow(workspaceId)
    return
  }

  const wsState = useWorkspaceStore.getState()
  const localData: Workspace = wsState.snapshot()
  const same = JSON.stringify(localData) === JSON.stringify(cloudRow.data)
  if (same) return

  raiseConflict(workspaceId, meta.name, localData, cloudRow)
}

const MANUAL_SYNC_COOLDOWN_MS = 60_000
let saveCooldownTimer: ReturnType<typeof setTimeout> | null = null
let loadCooldownTimer: ReturnType<typeof setTimeout> | null = null
let saveCooldownEndsAt = 0
let loadCooldownEndsAt = 0

// Started the instant a manual save/load fires (not after it resolves), so a
// rapid double-click on a fast request is caught by the same guard the first
// click set, capping each button to at most one request a minute.
function startSaveCooldown() {
  saveCooldownEndsAt = Date.now() + MANUAL_SYNC_COOLDOWN_MS
  useCloudStore.setState({ saveOnCooldown: true })
  if (saveCooldownTimer) clearTimeout(saveCooldownTimer)
  saveCooldownTimer = setTimeout(() => useCloudStore.setState({ saveOnCooldown: false }), MANUAL_SYNC_COOLDOWN_MS)
}

function startLoadCooldown() {
  loadCooldownEndsAt = Date.now() + MANUAL_SYNC_COOLDOWN_MS
  useCloudStore.setState({ loadOnCooldown: true })
  if (loadCooldownTimer) clearTimeout(loadCooldownTimer)
  loadCooldownTimer = setTimeout(() => useCloudStore.setState({ loadOnCooldown: false }), MANUAL_SYNC_COOLDOWN_MS)
}

function remainingCooldownSeconds(endsAt: number): number {
  return Math.max(1, Math.ceil((endsAt - Date.now()) / 1000))
}

let revocationTimer: ReturnType<typeof setInterval> | null = null

function stopRevocationPolling() {
  if (revocationTimer) {
    clearInterval(revocationTimer)
    revocationTimer = null
  }
}

function startRevocationPolling(userId: string) {
  stopRevocationPolling()
  const check = async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('devices')
      .select('revoked_at')
      .eq('user_id', userId)
      .eq('device_id', getDeviceId())
      .maybeSingle()
    if (data?.revoked_at) {
      await useCloudStore.getState().signOut()
    }
  }
  void check()
  revocationTimer = setInterval(() => void check(), 60_000)
}

// Auto-save: pushes the active workspace on an interval (configurable in
// Settings, 2-60 min, default 5), but only if it's actually changed since the
// last push - this is what keeps normal editing from generating constant
// network requests. Manual save/load and the beforeunload warning cover the
// gap between "changed" and "the timer got around to it."
let autoSaveTimer: ReturnType<typeof setInterval> | null = null

function stopAutoSaveTimer() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
  }
}

function startAutoSaveTimer() {
  stopAutoSaveTimer()
  if (!useSettingsStore.getState().cloudAutoSaveEnabled) return
  const minutes = useSettingsStore.getState().cloudAutoSaveIntervalMinutes
  autoSaveTimer = setInterval(
    () => {
      if (useCloudStore.getState().hasUnsavedChanges) {
        void pushWorkspaceNow(useWorkspaceStore.getState().currentWorkspaceId)
      }
    },
    minutes * 60 * 1000
  )
}

async function registerDevice(userId: string) {
  if (!supabase) return
  await supabase.from('devices').upsert(
    {
      user_id: userId,
      device_id: getDeviceId(),
      label: getDeviceLabel(),
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: 'user_id,device_id' }
  )
}

// App.tsx kicks off cloud init and workspace-registry init in parallel, so the
// registry (which syncAllWorkspaces reads from) might not be hydrated yet.
function waitForRegistryHydrated(): Promise<void> {
  if (useWorkspaceRegistry.getState().hydrated) return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = useWorkspaceRegistry.subscribe((state) => {
      if (state.hydrated) {
        unsubscribe()
        resolve()
      }
    })
  })
}

async function handleSignedIn(session: Session) {
  await registerDevice(session.user.id)
  startRevocationPolling(session.user.id)
  startAutoSaveTimer()
  await useCloudStore.getState().refreshDevices()
  await useCloudStore.getState().refreshUsage()
  await waitForRegistryHydrated()
  void syncAllWorkspaces()
}

export const useCloudStore = create<CloudState>((set, get) => ({
  configured: cloudSyncConfigured,
  session: null,
  authLoading: false,
  authError: null,
  usageBytes: 0,
  quotaExceeded: false,
  devices: [],
  conflict: null,
  syncing: false,
  saving: false,
  loadingWorkspace: false,
  saveOnCooldown: false,
  loadOnCooldown: false,
  hasUnsavedChanges: false,

  init: async () => {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    set({ session: data.session })
    if (data.session) void handleSignedIn(data.session)

    supabase.auth.onAuthStateChange((_event, session) => {
      const wasSignedIn = Boolean(get().session)
      set({ session })
      if (session && !wasSignedIn) void handleSignedIn(session)
      if (!session && wasSignedIn) {
        stopRevocationPolling()
        stopAutoSaveTimer()
      }
    })
  },

  signUp: async (email, password) => {
    if (!supabase) return
    set({ authLoading: true, authError: null })
    const { error } = await supabase.auth.signUp({ email, password })
    set({ authLoading: false, authError: error?.message ?? null })
  },

  signIn: async (email, password) => {
    if (!supabase) return
    set({ authLoading: true, authError: null })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    set({ authLoading: false, authError: error?.message ?? null })
  },

  signOut: async () => {
    stopRevocationPolling()
    stopAutoSaveTimer()
    if (saveCooldownTimer) clearTimeout(saveCooldownTimer)
    if (loadCooldownTimer) clearTimeout(loadCooldownTimer)
    if (supabase) await supabase.auth.signOut()
    set({
      session: null,
      devices: [],
      usageBytes: 0,
      quotaExceeded: false,
      conflict: null,
      hasUnsavedChanges: false,
      saveOnCooldown: false,
      loadOnCooldown: false,
    })
  },

  deleteAccount: async () => {
    const session = get().session
    if (!session) return
    await fetch('/api/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    await get().signOut()
  },

  resolveConflict: async (choice) => {
    const conflict = get().conflict
    const session = get().session
    if (!conflict || !supabase || !session) return

    if (choice === 'local') {
      await pushWorkspaceNow(conflict.workspaceId)
    } else {
      await idbSet(storageKey(conflict.workspaceId), { workspace: conflict.cloud, savedAt: Date.now() })
      if (useWorkspaceStore.getState().currentWorkspaceId === conflict.workspaceId) {
        useWorkspaceStore.getState().hydrate(conflict.cloud, conflict.workspaceId)
      }
      await pullImagesForWorkspace(conflict.cloud, session.user.id)
    }

    set({ conflict: null, hasUnsavedChanges: false })
    void syncAllWorkspaces()
  },

  kickDevice: async (deviceRowId) => {
    if (!supabase) return
    await supabase.from('devices').update({ revoked_at: new Date().toISOString() }).eq('id', deviceRowId)
    void get().refreshDevices()
  },

  refreshUsage: async () => {
    if (!supabase) return
    const session = get().session
    if (!session) return
    const { data } = await supabase.from('usage').select('bytes_used').eq('user_id', session.user.id).maybeSingle()
    const bytes = data?.bytes_used ?? 0
    set({ usageBytes: bytes, quotaExceeded: bytes >= QUOTA_CAP_BYTES })
  },

  refreshDevices: async () => {
    if (!supabase) return
    const session = get().session
    if (!session) return
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', session.user.id)
      .order('last_seen_at', { ascending: false })
    set({ devices: (data ?? []) as DeviceRow[] })
  },

  saveNow: async () => {
    if (!get().session) return
    if (get().saveOnCooldown) {
      useToastStore
        .getState()
        .show(`Saving is limited to once a minute - try again in ${remainingCooldownSeconds(saveCooldownEndsAt)}s.`)
      return
    }
    startSaveCooldown()
    set({ saving: true })
    try {
      await pushWorkspaceNow(useWorkspaceStore.getState().currentWorkspaceId)
    } finally {
      set({ saving: false })
    }
  },

  loadNow: async () => {
    if (!get().session) return
    if (get().loadOnCooldown) {
      useToastStore
        .getState()
        .show(`Loading is limited to once a minute - try again in ${remainingCooldownSeconds(loadCooldownEndsAt)}s.`)
      return
    }
    startLoadCooldown()
    set({ loadingWorkspace: true })
    try {
      await checkCloudForActiveWorkspace()
    } finally {
      set({ loadingWorkspace: false })
    }
  },
}))

// Restart (or stop) the auto-save timer whenever it's toggled or its interval changes.
useSettingsStore.subscribe((state, prevState) => {
  if (
    state.cloudAutoSaveIntervalMinutes === prevState.cloudAutoSaveIntervalMinutes &&
    state.cloudAutoSaveEnabled === prevState.cloudAutoSaveEnabled
  ) {
    return
  }
  if (useCloudStore.getState().session) startAutoSaveTimer()
})

// Warn before closing/reloading the tab if the active workspace hasn't been
// pushed to the cloud yet - local IndexedDB persistence is unaffected either way.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (useCloudStore.getState().session && useCloudStore.getState().hasUnsavedChanges) {
      e.preventDefault()
      e.returnValue = ''
    }
  })
}

// Marks the active workspace dirty on real edits (not on switching to a
// different workspace, which loads fresh data that isn't "unsaved").
useWorkspaceStore.subscribe((state, prevState) => {
  if (state.currentWorkspaceId !== prevState.currentWorkspaceId) return
  if (state.cards === prevState.cards && state.viewport === prevState.viewport && state.connectors === prevState.connectors)
    return
  if (!useCloudStore.getState().hasUnsavedChanges) useCloudStore.setState({ hasUnsavedChanges: true })
})

// Mirror workspace create/rename/delete to the cloud when signed in, and flush
// the outgoing workspace's pending changes (if any) when switching away from it.
let prevWorkspaceNames = new Map<string, string>()
let prevActiveId = ''
useWorkspaceRegistry.subscribe((state) => {
  const signedIn = Boolean(useCloudStore.getState().session)

  if (state.activeId !== prevActiveId) {
    const outgoingId = prevActiveId
    prevActiveId = state.activeId
    if (signedIn && outgoingId && useCloudStore.getState().hasUnsavedChanges) {
      void pushWorkspaceNow(outgoingId)
    }
    useCloudStore.setState({ hasUnsavedChanges: false })
  }

  const nextNames = new Map(state.workspaces.map((w) => [w.id, w.name]))
  if (!signedIn) {
    prevWorkspaceNames = nextNames
    return
  }
  for (const [id, name] of nextNames) {
    if (prevWorkspaceNames.get(id) !== name) void pushWorkspaceNow(id) // created, imported, adopted, or renamed
  }
  for (const id of prevWorkspaceNames.keys()) {
    if (!nextNames.has(id)) void deleteCloudWorkspace(id) // deleted locally
  }
  prevWorkspaceNames = nextNames
})
