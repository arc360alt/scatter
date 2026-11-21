import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import type { Card, CardColor, Connector, KanbanCard, NoteCard, TodoCard, Viewport, Workspace } from '../types'
import { makeId } from '../lib/id'
import { reconcileCheckboxStates } from '../lib/noteContent'
import { buildCard, clampCardSize, type AddEntryId } from '../lib/cardFactory'
import { boundsOf } from '../lib/geometry'

// Pre-multi-workspace versions stored a single workspace under this exact key;
// workspaceRegistry.ts checks it once at startup to migrate rather than discard it.
export const LEGACY_STORAGE_KEY = 'scatter-workspace-v1'
const STORAGE_PREFIX = 'scatter-workspace-v1:'
const FALLBACK_PREFIX = 'scatter-workspace-fallback-v1:'
const SAVE_DEBOUNCE_MS = 300

export function storageKey(id: string) {
  return `${STORAGE_PREFIX}${id}`
}
function fallbackKey(id: string) {
  return `${FALLBACK_PREFIX}${id}`
}

interface StoredWorkspace {
  workspace: Workspace
  savedAt: number
}

export function blankWorkspace(): Workspace {
  return { viewport: { x: 0, y: 0, scale: 1 }, cards: [], connectors: [] }
}

export function defaultWorkspace(): Workspace {
  const now = Date.now()
  const welcomeContent =
    '# Welcome to Scatter\n\nDrag any card by its title bar. Resize from the corner. Pick a color from the swatch.\n\n- [ ] Check this off\n- [ ] Add a card from the toolbar, or right-click the board (long-press on mobile) for every card type\n- [ ] Open the assistant (bottom right) and ask it about your cards\n\nNotes support **markdown** _and_ raw <code>&lt;b&gt;HTML&lt;/b&gt;</code>.'
  return {
    viewport: { x: 0, y: 0, scale: 1 },
    cards: [
      {
        id: makeId(),
        type: 'note',
        x: 60,
        y: 90,
        width: 280,
        height: 260,
        color: 'mustard',
        rotation: -2.5,
        zIndex: 1,
        title: 'Welcome',
        content: welcomeContent,
        checkboxStates: [false, false, false],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: makeId(),
        type: 'todo',
        x: 400,
        y: 60,
        width: 260,
        height: 240,
        color: 'teal',
        rotation: 1.5,
        zIndex: 2,
        title: 'Today',
        items: [
          { id: makeId(), text: 'Try dragging this list around', done: false },
          { id: makeId(), text: 'Check something off', done: false },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: makeId(),
        type: 'kanban',
        x: 60,
        y: 400,
        width: 420,
        height: 320,
        color: 'plum',
        rotation: -1,
        zIndex: 3,
        title: 'Project board',
        columns: [
          { id: 'todo', title: 'To do', itemIds: ['a'] },
          { id: 'doing', title: 'Doing', itemIds: [] },
          { id: 'done', title: 'Done', itemIds: [] },
        ],
        items: {
          a: { id: 'a', text: 'Drag cards between columns' },
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: { id: string; workspace: Workspace } | null = null

function scheduleSave(id: string, workspace: Workspace) {
  pendingSave = { id, workspace }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
}

// A debounced IndexedDB write can still be in flight when the tab reloads/closes,
// and IndexedDB itself is async so it isn't guaranteed to finish before unload.
// On flush we also mirror to localStorage (synchronous, so it reliably lands
// before unload) as a fallback that loadWorkspace() reconciles against. Also
// called directly (not just via the timer) right before switching workspaces.
export function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!pendingSave) return
  const { id, workspace } = pendingSave
  const record: StoredWorkspace = { workspace, savedAt: Date.now() }
  pendingSave = null
  void idbSet(storageKey(id), record)
  try {
    localStorage.setItem(fallbackKey(id), JSON.stringify(record))
  } catch {
    // quota exceeded or storage disabled (e.g. private browsing) - IndexedDB write above still stands a chance
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave()
  })
}

export async function loadWorkspace(id: string, makeDefault: () => Workspace = blankWorkspace): Promise<Workspace> {
  const idbRecord = await idbGet<StoredWorkspace>(storageKey(id))
  let fallbackRecord: StoredWorkspace | null = null
  try {
    const raw = localStorage.getItem(fallbackKey(id))
    if (raw) fallbackRecord = JSON.parse(raw) as StoredWorkspace
  } catch {
    fallbackRecord = null
  }
  const candidates = [idbRecord, fallbackRecord].filter(
    (r): r is StoredWorkspace => Boolean(r?.workspace?.cards)
  )
  if (candidates.length === 0) return makeDefault()
  candidates.sort((a, b) => b.savedAt - a.savedAt)
  return candidates[0].workspace
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

interface WorkspaceState extends Workspace {
  connectors: Connector[]
  /** The most recently focused card (what a single-card UI like note editing keys off). */
  selectedId: string | null
  /** Everything currently selected (always includes selectedId when it's set). */
  selectedIds: string[]
  selectedConnectorId: string | null
  /** Card id we're drawing an arrow from, while in "click a card to connect" mode. */
  connectingFrom: string | null
  /** Card id that just got jumped to (search, etc.), so it can flash briefly. */
  flashId: string | null
  hydrated: boolean
  currentWorkspaceId: string
  nextZ: number
  canUndo: boolean
  canRedo: boolean
  hydrate: (workspace: Workspace, id: string) => void
  snapshot: () => Workspace

  select: (id: string | null) => void
  toggleSelect: (id: string) => void
  setSelection: (ids: string[]) => void
  selectAll: () => void
  selectConnector: (id: string | null) => void
  flash: (id: string) => void

  addCard: (entry: AddEntryId, at?: { x: number; y: number }, patch?: Partial<Card>) => string
  /** Adds already-built cards (templates, paste, duplicate), restacking them on top. */
  insertCards: (cards: Card[], connectors?: Connector[]) => void
  updateCardBase: (
    id: string,
    patch: Partial<Pick<Card, 'x' | 'y' | 'width' | 'height' | 'color' | 'title' | 'rotation'>>
  ) => void
  /** Generic content patch for the simpler card types. */
  updateCard: <T extends Card>(id: string, patch: Partial<Omit<T, 'id' | 'type'>>) => void
  moveCards: (positions: Record<string, { x: number; y: number }>) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  deleteCard: (id: string) => void
  deleteCards: (ids: string[]) => void
  duplicateCards: (ids: string[]) => string[]
  setLocked: (ids: string[], locked: boolean) => void
  setColor: (ids: string[], color: CardColor) => void
  alignCards: (ids: string[], mode: AlignMode) => void
  distributeCards: (ids: string[], axis: 'h' | 'v') => void
  groupCards: (ids: string[]) => string | null
  setViewport: (patch: Partial<Viewport>) => void

  startConnecting: (fromId: string | null) => void
  addConnector: (from: string, to: string) => void
  updateConnector: (id: string, patch: Partial<Omit<Connector, 'id' | 'from' | 'to'>>) => void
  deleteConnector: (id: string) => void

  undo: () => void
  redo: () => void

  setNoteContent: (id: string, content: string) => void
  toggleCheckbox: (id: string, index: number) => void

  addTodoItem: (id: string, text: string, due?: string) => void
  toggleTodoItem: (id: string, itemId: string) => void
  updateTodoItemText: (id: string, itemId: string, text: string) => void
  setTodoItemDue: (id: string, itemId: string, due: string | undefined) => void
  removeTodoItem: (id: string, itemId: string) => void

  addKanbanColumn: (id: string, title: string) => void
  removeKanbanColumn: (id: string, columnId: string) => void
  renameKanbanColumn: (id: string, columnId: string, title: string) => void
  addKanbanItem: (id: string, columnId: string, text: string) => void
  removeKanbanItem: (id: string, itemId: string) => void
  updateKanbanItemText: (id: string, itemId: string, text: string) => void
  setKanbanItemDue: (id: string, itemId: string, due: string | undefined) => void
  moveKanbanItem: (id: string, itemId: string, toColumnId: string, toIndex: number) => void
}

function withCard<T extends Card>(
  cards: Card[],
  id: string,
  type: T['type'],
  fn: (card: T) => T
): Card[] {
  return cards.map((c) => (c.id === id && c.type === type ? fn(c as T) : c))
}

// ---------- undo / redo ----------
// Every change to cards/connectors is recorded automatically by a store
// subscriber (below) rather than by each action, so new actions get undo for
// free. Rapid successive changes (a drag, typing a word) are coalesced into a
// single step by waiting for a short pause before committing the "before" state.

interface HistorySnap {
  cards: Card[]
  connectors: Connector[]
}

const HISTORY_LIMIT = 100
const HISTORY_COALESCE_MS = 600
let undoStack: HistorySnap[] = []
let redoStack: HistorySnap[] = []
let pendingBase: HistorySnap | null = null
let pendingTimer: ReturnType<typeof setTimeout> | null = null
let silent = 0

/** Runs a state change without recording it as an undo step (z-order bumps, history bookkeeping). */
function quietly(fn: () => void) {
  silent++
  try {
    fn()
  } finally {
    silent--
  }
}

function syncHistoryFlags() {
  quietly(() =>
    useWorkspaceStore.setState({
      canUndo: undoStack.length > 0 || pendingBase !== null,
      canRedo: redoStack.length > 0,
    })
  )
}

function commitPending() {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = null
  if (!pendingBase) return
  undoStack.push(pendingBase)
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  pendingBase = null
}

function resetHistory() {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = null
  pendingBase = null
  undoStack = []
  redoStack = []
}

function pruneSelection(s: { selectedIds: string[]; selectedId: string | null }, cards: Card[]) {
  const ids = new Set(cards.map((c) => c.id))
  const selectedIds = s.selectedIds.filter((id) => ids.has(id))
  return { selectedIds, selectedId: s.selectedId && ids.has(s.selectedId) ? s.selectedId : null }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  cards: [],
  connectors: [],
  viewport: { x: 0, y: 0, scale: 1 },
  selectedId: null,
  selectedIds: [],
  selectedConnectorId: null,
  connectingFrom: null,
  flashId: null,
  hydrated: false,
  currentWorkspaceId: '',
  nextZ: 1,
  canUndo: false,
  canRedo: false,

  hydrate: (workspace, id) => {
    resetHistory()
    quietly(() => set({
      // Cards saved before the current size limits existed are grown to fit their content.
      cards: workspace.cards.map(clampCardSize),
      connectors: workspace.connectors ?? [],
      viewport: workspace.viewport,
      hydrated: true,
      currentWorkspaceId: id,
      selectedId: null,
      selectedIds: [],
      selectedConnectorId: null,
      connectingFrom: null,
      canUndo: false,
      canRedo: false,
      nextZ: workspace.cards.reduce((max, c) => Math.max(max, c.zIndex), 0) + 1,
    }))
  },

  snapshot: () => {
    const s = get()
    // Leave `connectors` out entirely when there are none, so boards without arrows
    // serialize exactly as they did before arrows existed (cloud sync compares JSON).
    return s.connectors.length
      ? { cards: s.cards, viewport: s.viewport, connectors: s.connectors }
      : { cards: s.cards, viewport: s.viewport }
  },

  select: (id) => set({ selectedId: id, selectedIds: id ? [id] : [], selectedConnectorId: null }),

  toggleSelect: (id) =>
    set((s) => {
      const has = s.selectedIds.includes(id)
      const selectedIds = has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id]
      return {
        selectedIds,
        selectedId: has ? (selectedIds[selectedIds.length - 1] ?? null) : id,
        selectedConnectorId: null,
      }
    }),

  setSelection: (ids) => set({ selectedIds: ids, selectedId: ids[ids.length - 1] ?? null, selectedConnectorId: null }),

  selectAll: () => {
    const ids = get().cards.map((c) => c.id)
    set({ selectedIds: ids, selectedId: ids[ids.length - 1] ?? null, selectedConnectorId: null })
  },

  selectConnector: (id) => set({ selectedConnectorId: id, selectedId: null, selectedIds: [] }),

  flash: (id) => {
    set({ flashId: id })
    setTimeout(() => {
      if (get().flashId === id) set({ flashId: null })
    }, 1400)
  },

  addCard: (entry, at, patch) => {
    const z = get().nextZ
    // Cascade new cards diagonally (like a "new window" offset) instead of dropping
    // them all in the same random patch, where quick successive adds would bury
    // each other under near-total overlap.
    const cascade = (get().cards.length % 6) * 70
    const card = buildCard(
      entry,
      {
        x: at?.x ?? 120 + cascade + Math.random() * 30,
        y: at?.y ?? 120 + cascade + Math.random() * 30,
        zIndex: z,
      },
      patch
    )
    set((s) => ({
      cards: [...s.cards, card],
      nextZ: z + 1,
      selectedId: card.id,
      selectedIds: [card.id],
      selectedConnectorId: null,
    }))
    return card.id
  },

  insertCards: (cards, connectors = []) => {
    let z = get().nextZ
    const restacked = cards
      .slice()
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((c) => ({ ...c, zIndex: z++ }))
    const ids = restacked.map((c) => c.id)
    set((s) => ({
      cards: [...s.cards, ...restacked],
      connectors: [...s.connectors, ...connectors],
      nextZ: z,
      selectedIds: ids,
      selectedId: ids[ids.length - 1] ?? null,
      selectedConnectorId: null,
    }))
  },

  updateCardBase: (id, patch) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)),
    })),

  updateCard: (id, patch) =>
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== id) return c
        const next = { ...c, ...patch, updatedAt: Date.now() } as Card
        return 'width' in patch || 'height' in patch ? clampCardSize(next) : next
      }),
    })),

  moveCards: (positions) =>
    set((s) => ({
      cards: s.cards.map((c) => (positions[c.id] ? { ...c, ...positions[c.id] } : c)),
    })),

  bringToFront: (id) => {
    const { nextZ: z, cards } = get()
    const card = cards.find((c) => c.id === id)
    if (!card || card.zIndex === z - 1) return
    quietly(() =>
      set((s) => ({
        cards: s.cards.map((c) => (c.id === id ? { ...c, zIndex: z } : c)),
        nextZ: z + 1,
      }))
    )
  },

  sendToBack: (id) => {
    const minZ = get().cards.reduce((m, c) => Math.min(m, c.zIndex), Infinity)
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, zIndex: minZ - 1 } : c)) }))
  },

  // Image blobs are deliberately NOT deleted here: the card can come back via
  // undo. Orphaned images are cleaned up from Settings > Image library.
  deleteCard: (id) => get().deleteCards([id]),

  deleteCards: (ids) => {
    const doomed = new Set(get().cards.filter((c) => ids.includes(c.id) && !c.locked).map((c) => c.id))
    if (doomed.size === 0) return
    set((s) => {
      const cards = s.cards.filter((c) => !doomed.has(c.id))
      return {
        cards,
        connectors: s.connectors.filter((k) => !doomed.has(k.from) && !doomed.has(k.to)),
        ...pruneSelection(s, cards),
        connectingFrom: s.connectingFrom && doomed.has(s.connectingFrom) ? null : s.connectingFrom,
      }
    })
  },

  duplicateCards: (ids) => {
    const { cards, connectors } = get()
    const idMap = new Map<string, string>()
    const now = Date.now()
    const copies = cards
      .filter((c) => ids.includes(c.id))
      .map((c) => {
        const id = makeId()
        idMap.set(c.id, id)
        return { ...structuredClone(c), id, x: c.x + 30, y: c.y + 30, locked: false, createdAt: now, updatedAt: now }
      })
    // Arrows between two duplicated cards come along too.
    const copiedConnectors = connectors
      .filter((k) => idMap.has(k.from) && idMap.has(k.to))
      .map((k) => ({ ...k, id: makeId(), from: idMap.get(k.from)!, to: idMap.get(k.to)! }))
    get().insertCards(copies, copiedConnectors)
    return copies.map((c) => c.id)
  },

  setLocked: (ids, locked) =>
    set((s) => ({ cards: s.cards.map((c) => (ids.includes(c.id) ? { ...c, locked } : c)) })),

  setColor: (ids, color) =>
    set((s) => ({ cards: s.cards.map((c) => (ids.includes(c.id) ? { ...c, color, updatedAt: Date.now() } : c)) })),

  alignCards: (ids, mode) => {
    const targets = get().cards.filter((c) => ids.includes(c.id) && !c.locked)
    const b = boundsOf(targets)
    if (!b || targets.length < 2) return
    const positions: Record<string, { x: number; y: number }> = {}
    for (const c of targets) {
      let { x, y } = c
      if (mode === 'left') x = b.x
      if (mode === 'right') x = b.x + b.width - c.width
      if (mode === 'hcenter') x = b.x + b.width / 2 - c.width / 2
      if (mode === 'top') y = b.y
      if (mode === 'bottom') y = b.y + b.height - c.height
      if (mode === 'vcenter') y = b.y + b.height / 2 - c.height / 2
      positions[c.id] = { x, y }
    }
    set((s) => ({ cards: s.cards.map((c) => (positions[c.id] ? { ...c, ...positions[c.id], rotation: 0 } : c)) }))
  },

  // Spaces cards so the gaps between them are equal, keeping the outermost two in place.
  distributeCards: (ids, axis) => {
    const targets = get().cards.filter((c) => ids.includes(c.id) && !c.locked)
    if (targets.length < 3) return
    const pos = axis === 'h' ? 'x' : 'y'
    const size = axis === 'h' ? 'width' : 'height'
    const sorted = targets.slice().sort((a, b) => a[pos] - b[pos])
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = last[pos] + last[size] - first[pos]
    const totalSize = sorted.reduce((sum, c) => sum + c[size], 0)
    const gap = (span - totalSize) / (sorted.length - 1)
    const positions: Record<string, number> = {}
    let cursor = first[pos]
    for (const c of sorted) {
      positions[c.id] = cursor
      cursor += c[size] + gap
    }
    set((s) => ({
      cards: s.cards.map((c) => (c.id in positions ? { ...c, [pos]: positions[c.id] } : c)),
    }))
  },

  groupCards: (ids) => {
    const targets = get().cards.filter((c) => ids.includes(c.id))
    const b = boundsOf(targets)
    if (!b) return null
    const minZ = get().cards.reduce((m, c) => Math.min(m, c.zIndex), Infinity)
    const pad = 40
    const group = buildCard(
      'group',
      { x: b.x - pad, y: b.y - pad - 30, zIndex: minZ - 1 },
      { width: b.width + pad * 2, height: b.height + pad * 2 + 30 }
    )
    set((s) => ({ cards: [...s.cards, group], selectedId: group.id, selectedIds: [group.id] }))
    return group.id
  },

  setViewport: (patch) => set((s) => ({ viewport: { ...s.viewport, ...patch } })),

  startConnecting: (fromId) => set({ connectingFrom: fromId }),

  addConnector: (from, to) => {
    if (from === to) return
    const exists = get().connectors.some(
      (k) => (k.from === from && k.to === to) || (k.from === to && k.to === from)
    )
    if (exists) {
      set({ connectingFrom: null })
      return
    }
    const connector: Connector = { id: makeId(), from, to, color: 'ink', ends: 'end', label: '' }
    set((s) => ({ connectors: [...s.connectors, connector], connectingFrom: null, selectedConnectorId: connector.id }))
  },

  updateConnector: (id, patch) =>
    set((s) => ({ connectors: s.connectors.map((k) => (k.id === id ? { ...k, ...patch } : k)) })),

  deleteConnector: (id) =>
    set((s) => ({
      connectors: s.connectors.filter((k) => k.id !== id),
      selectedConnectorId: s.selectedConnectorId === id ? null : s.selectedConnectorId,
    })),

  undo: () => {
    commitPending()
    const prev = undoStack.pop()
    if (!prev) return
    const s = get()
    redoStack.push({ cards: s.cards, connectors: s.connectors })
    quietly(() => set({ cards: prev.cards, connectors: prev.connectors, ...pruneSelection(s, prev.cards) }))
    syncHistoryFlags()
  },

  redo: () => {
    commitPending()
    const next = redoStack.pop()
    if (!next) return
    const s = get()
    undoStack.push({ cards: s.cards, connectors: s.connectors })
    quietly(() => set({ cards: next.cards, connectors: next.connectors, ...pruneSelection(s, next.cards) }))
    syncHistoryFlags()
  },

  setNoteContent: (id, content) =>
    set((s) => ({
      cards: withCard<NoteCard>(s.cards, id, 'note', (c) => ({
        ...c,
        content,
        checkboxStates: reconcileCheckboxStates(content, c.checkboxStates),
        updatedAt: Date.now(),
      })),
    })),

  toggleCheckbox: (id, index) =>
    set((s) => ({
      cards: withCard<NoteCard>(s.cards, id, 'note', (c) => {
        const states = [...c.checkboxStates]
        states[index] = !states[index]
        return { ...c, checkboxStates: states, updatedAt: Date.now() }
      }),
    })),

  addTodoItem: (id, text, due) =>
    set((s) => ({
      cards: withCard<TodoCard>(s.cards, id, 'todo', (c) => ({
        ...c,
        items: [...c.items, { id: makeId(), text, done: false, ...(due ? { due } : {}) }],
        updatedAt: Date.now(),
      })),
    })),

  toggleTodoItem: (id, itemId) =>
    set((s) => ({
      cards: withCard<TodoCard>(s.cards, id, 'todo', (c) => ({
        ...c,
        items: c.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)),
        updatedAt: Date.now(),
      })),
    })),

  updateTodoItemText: (id, itemId, text) =>
    set((s) => ({
      cards: withCard<TodoCard>(s.cards, id, 'todo', (c) => ({
        ...c,
        items: c.items.map((it) => (it.id === itemId ? { ...it, text } : it)),
        updatedAt: Date.now(),
      })),
    })),

  setTodoItemDue: (id, itemId, due) =>
    set((s) => ({
      cards: withCard<TodoCard>(s.cards, id, 'todo', (c) => ({
        ...c,
        items: c.items.map((it) => (it.id === itemId ? { ...it, due } : it)),
        updatedAt: Date.now(),
      })),
    })),

  removeTodoItem: (id, itemId) =>
    set((s) => ({
      cards: withCard<TodoCard>(s.cards, id, 'todo', (c) => ({
        ...c,
        items: c.items.filter((it) => it.id !== itemId),
        updatedAt: Date.now(),
      })),
    })),

  addKanbanColumn: (id, title) =>
    set((s) => ({
      cards: withCard<KanbanCard>(s.cards, id, 'kanban', (c) => ({
        ...c,
        columns: [...c.columns, { id: makeId(), title, itemIds: [] }],
        updatedAt: Date.now(),
      })),
    })),

  removeKanbanColumn: (id, columnId) =>
    set((s) => ({
      cards: withCard<KanbanCard>(s.cards, id, 'kanban', (c) => {
        const removed = c.columns.find((col) => col.id === columnId)
        const items = { ...c.items }
        removed?.itemIds.forEach((itemId) => delete items[itemId])
        return {
          ...c,
          columns: c.columns.filter((col) => col.id !== columnId),
          items,
          updatedAt: Date.now(),
        }
      }),
    })),

  renameKanbanColumn: (id, columnId, title) =>
    set((s) => ({
      cards: withCard<KanbanCard>(s.cards, id, 'kanban', (c) => ({
        ...c,
        columns: c.columns.map((col) => (col.id === columnId ? { ...col, title } : col)),
        updatedAt: Date.now(),
      })),
    })),

  addKanbanItem: (id, columnId, text) =>
    set((s) => ({
      cards: withCard<KanbanCard>(s.cards, id, 'kanban', (c) => {
        const itemId = makeId()
        return {
          ...c,
          items: { ...c.items, [itemId]: { id: itemId, text } },
          columns: c.columns.map((col) =>
            col.id === columnId ? { ...col, itemIds: [...col.itemIds, itemId] } : col
          ),
          updatedAt: Date.now(),
        }
      }),
    })),

  removeKanbanItem: (id, itemId) =>
    set((s) => ({
      cards: withCard<KanbanCard>(s.cards, id, 'kanban', (c) => {
        const items = { ...c.items }
        delete items[itemId]
        return {
          ...c,
          items,
          columns: c.columns.map((col) => ({
            ...col,
            itemIds: col.itemIds.filter((i) => i !== itemId),
          })),
          updatedAt: Date.now(),
        }
      }),
    })),

  updateKanbanItemText: (id, itemId, text) =>
    set((s) => ({
      cards: withCard<KanbanCard>(s.cards, id, 'kanban', (c) => ({
        ...c,
        items: { ...c.items, [itemId]: { ...c.items[itemId], text } },
        updatedAt: Date.now(),
      })),
    })),

  setKanbanItemDue: (id, itemId, due) =>
    set((s) => ({
      cards: withCard<KanbanCard>(s.cards, id, 'kanban', (c) => ({
        ...c,
        items: { ...c.items, [itemId]: { ...c.items[itemId], due } },
        updatedAt: Date.now(),
      })),
    })),

  moveKanbanItem: (id, itemId, toColumnId, toIndex) =>
    set((s) => ({
      cards: withCard<KanbanCard>(s.cards, id, 'kanban', (c) => {
        const columns = c.columns.map((col) => ({
          ...col,
          itemIds: col.itemIds.filter((i) => i !== itemId),
        }))
        const target = columns.find((col) => col.id === toColumnId)
        if (target) {
          target.itemIds.splice(toIndex, 0, itemId)
        }
        return { ...c, columns, updatedAt: Date.now() }
      }),
    })),
}))

useWorkspaceStore.subscribe((state, prev) => {
  if (!state.hydrated) return
  if (state.cards !== prev.cards || state.viewport !== prev.viewport || state.connectors !== prev.connectors) {
    scheduleSave(state.currentWorkspaceId, state.snapshot())
  }
})

useWorkspaceStore.subscribe((state, prev) => {
  if (silent > 0 || !state.hydrated || !prev.hydrated) return
  if (state.currentWorkspaceId !== prev.currentWorkspaceId) return
  if (state.cards === prev.cards && state.connectors === prev.connectors) return
  if (!pendingBase) pendingBase = { cards: prev.cards, connectors: prev.connectors }
  redoStack = []
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => {
    commitPending()
    syncHistoryFlags()
  }, HISTORY_COALESCE_MS)
  if (!state.canUndo || state.canRedo) syncHistoryFlags()
})
