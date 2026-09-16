import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import type {
  Card,
  CardColor,
  CardType,
  KanbanCard,
  NoteCard,
  TodoCard,
  Viewport,
  Workspace,
} from '../types'
import { makeId } from '../lib/id'
import { extractScatterImageIds, reconcileCheckboxStates } from '../lib/noteContent'
import { deleteImageBlob } from '../lib/imageStore'

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

const COLORS: CardColor[] = ['terracotta', 'olive', 'mustard', 'teal', 'plum', 'slate']

function randomRotation() {
  return Math.random() * 6 - 3
}

function randomColor(): CardColor {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

export function blankWorkspace(): Workspace {
  return { viewport: { x: 0, y: 0, scale: 1 }, cards: [] }
}

export function defaultWorkspace(): Workspace {
  const now = Date.now()
  const welcomeContent =
    '# Welcome to Scatter\n\nDrag any card by its title bar. Resize from the corner. Pick a color from the swatch.\n\n- [ ] Check this off\n- [ ] Add a note, todo list, or board from the toolbar above\n- [ ] Open the assistant (bottom right) and ask it about your cards\n\nNotes support **markdown** _and_ raw <code>&lt;b&gt;HTML&lt;/b&gt;</code>.'
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

interface WorkspaceState extends Workspace {
  selectedId: string | null
  hydrated: boolean
  currentWorkspaceId: string
  nextZ: number
  hydrate: (workspace: Workspace, id: string) => void

  select: (id: string | null) => void
  addCard: (type: CardType, at?: { x: number; y: number }) => string
  updateCardBase: (
    id: string,
    patch: Partial<Pick<Card, 'x' | 'y' | 'width' | 'height' | 'color' | 'title'>>
  ) => void
  bringToFront: (id: string) => void
  deleteCard: (id: string) => void
  setViewport: (patch: Partial<Viewport>) => void

  setNoteContent: (id: string, content: string) => void
  toggleCheckbox: (id: string, index: number) => void

  addTodoItem: (id: string, text: string) => void
  toggleTodoItem: (id: string, itemId: string) => void
  updateTodoItemText: (id: string, itemId: string, text: string) => void
  removeTodoItem: (id: string, itemId: string) => void

  addKanbanColumn: (id: string, title: string) => void
  removeKanbanColumn: (id: string, columnId: string) => void
  renameKanbanColumn: (id: string, columnId: string, title: string) => void
  addKanbanItem: (id: string, columnId: string, text: string) => void
  removeKanbanItem: (id: string, itemId: string) => void
  updateKanbanItemText: (id: string, itemId: string, text: string) => void
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

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  cards: [],
  viewport: { x: 0, y: 0, scale: 1 },
  selectedId: null,
  hydrated: false,
  currentWorkspaceId: '',
  nextZ: 1,

  hydrate: (workspace, id) =>
    set({
      cards: workspace.cards,
      viewport: workspace.viewport,
      hydrated: true,
      currentWorkspaceId: id,
      selectedId: null,
      nextZ: workspace.cards.reduce((max, c) => Math.max(max, c.zIndex), 0) + 1,
    }),

  select: (id) => set({ selectedId: id }),

  addCard: (type, at) => {
    const id = makeId()
    const now = Date.now()
    const z = get().nextZ
    // Cascade new cards diagonally (like a "new window" offset) instead of dropping
    // them all in the same random patch, where quick successive adds would bury
    // each other under near-total overlap.
    const cascade = (get().cards.length % 6) * 70
    const base = {
      id,
      x: at?.x ?? 120 + cascade + Math.random() * 30,
      y: at?.y ?? 120 + cascade + Math.random() * 30,
      width: type === 'kanban' ? 440 : 260,
      height: type === 'kanban' ? 320 : 220,
      color: randomColor(),
      rotation: randomRotation(),
      zIndex: z,
      title: type === 'note' ? 'New note' : type === 'todo' ? 'New list' : 'New board',
      createdAt: now,
      updatedAt: now,
    }
    let card: Card
    if (type === 'note') {
      card = { ...base, type: 'note', content: '', checkboxStates: [] } satisfies NoteCard
    } else if (type === 'todo') {
      card = { ...base, type: 'todo', items: [] } satisfies TodoCard
    } else {
      card = {
        ...base,
        type: 'kanban',
        columns: [
          { id: makeId(), title: 'To do', itemIds: [] },
          { id: makeId(), title: 'Doing', itemIds: [] },
          { id: makeId(), title: 'Done', itemIds: [] },
        ],
        items: {},
      } satisfies KanbanCard
    }
    set((s) => ({ cards: [...s.cards, card], nextZ: z + 1, selectedId: id }))
    return id
  },

  updateCardBase: (id, patch) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)),
    })),

  bringToFront: (id) => {
    const z = get().nextZ
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, zIndex: z } : c)),
      nextZ: z + 1,
    }))
  },

  deleteCard: (id) => {
    const card = get().cards.find((c) => c.id === id)
    if (card?.type === 'note') {
      extractScatterImageIds(card.content).forEach((imageId) => void deleteImageBlob(imageId))
    }
    set((s) => ({
      cards: s.cards.filter((c) => c.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
  },

  setViewport: (patch) => set((s) => ({ viewport: { ...s.viewport, ...patch } })),

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

  addTodoItem: (id, text) =>
    set((s) => ({
      cards: withCard<TodoCard>(s.cards, id, 'todo', (c) => ({
        ...c,
        items: [...c.items, { id: makeId(), text, done: false }],
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

useWorkspaceStore.subscribe((state) => {
  if (!state.hydrated) return
  scheduleSave(state.currentWorkspaceId, { cards: state.cards, viewport: state.viewport })
})
