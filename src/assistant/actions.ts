import type { Card, CardColor, KanbanCard, NoteCard, TodoCard } from '../types'
import { useWorkspaceStore } from '../store/workspace'
import { buildCard, CARD_COLORS, cardTypeLabel } from '../lib/cardFactory'
import { worldCenter } from '../lib/boardActions'
import { makeId } from '../lib/id'
import { reconcileCheckboxStates } from '../lib/noteContent'

/** One change the assistant proposes. The model writes these as a JSON array in
 * an ```actions fenced block; the user reviews and applies them. */
export type AssistantAction =
  | { action: 'create_note'; title?: string; content?: string }
  | { action: 'create_todo'; title?: string; items?: string[] }
  | { action: 'create_board'; title?: string; columns?: Record<string, string[]> }
  | { action: 'create_sticky'; text?: string }
  | { action: 'add_todo_items'; card: CardRef; items?: string[] }
  | { action: 'complete_todo_items'; card: CardRef; items?: string[] }
  | { action: 'append_note'; card: CardRef; text?: string }
  | { action: 'rename_card'; card: CardRef; title?: string }
  | { action: 'set_color'; card: CardRef; color?: string }
  | { action: 'set_due'; card: CardRef; item?: string; date?: string }
  | { action: 'delete_card'; card: CardRef }

type CardRef = number | string

const KNOWN = new Set([
  'create_note',
  'create_todo',
  'create_board',
  'create_sticky',
  'add_todo_items',
  'complete_todo_items',
  'append_note',
  'rename_card',
  'set_color',
  'set_due',
  'delete_card',
])

export const ACTIONS_PROMPT = `You can also CHANGE the board. When the user asks you to create, add, update, organise, or turn something into cards, end your reply with ONE fenced block tagged "actions" holding a JSON array. The user reviews it before anything happens. Only use it when they ask for a change. Refer to existing cards by their [number].
Available actions:
{"action":"create_note","title":"...","content":"markdown"}
{"action":"create_todo","title":"...","items":["...","..."]}
{"action":"create_board","title":"...","columns":{"To do":["..."],"Doing":[],"Done":[]}}
{"action":"create_sticky","text":"..."}
{"action":"add_todo_items","card":2,"items":["..."]}
{"action":"complete_todo_items","card":2,"items":["text of item"]}
{"action":"append_note","card":1,"text":"..."}
{"action":"rename_card","card":1,"title":"..."}
{"action":"set_color","card":1,"color":"terracotta|olive|mustard|teal|plum|slate"}
{"action":"set_due","card":2,"item":"text of item","date":"YYYY-MM-DD"}
{"action":"delete_card","card":3}
Example:
\`\`\`actions
[{"action":"create_todo","title":"Groceries","items":["Milk","Eggs"]}]
\`\`\``

const FENCE_RE = /```(actions|json)?\s*\n?([\s\S]*?)```/g

function normalize(raw: unknown): AssistantAction[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []
  return list.filter(
    (a): a is AssistantAction =>
      Boolean(a) && typeof a === 'object' && typeof (a as { action?: unknown }).action === 'string' && KNOWN.has((a as { action: string }).action)
  )
}

/** Splits a reply into the text to show and any proposed actions. */
export function extractActions(content: string): { text: string; actions: AssistantAction[] } {
  const actions: AssistantAction[] = []
  let text = content
  for (const m of content.matchAll(FENCE_RE)) {
    const tag = m[1]
    try {
      const parsed = normalize(JSON.parse(m[2].trim()))
      if (parsed.length || tag === 'actions') {
        actions.push(...parsed)
        text = text.replace(m[0], '')
      }
    } catch {
      if (tag === 'actions') text = text.replace(m[0], '')
    }
  }
  // Mid-stream: hide a half-written actions block instead of flashing raw JSON.
  const open = text.indexOf('```actions')
  if (open !== -1) text = text.slice(0, open)
  return { text: text.trim(), actions }
}

/** Card list numbering shared with the context prompt. */
export function numberedCards(cards: Card[]): Card[] {
  return cards.filter((c) => c.type !== 'group')
}

function resolveCard(ref: CardRef | undefined, cards: Card[]): Card | undefined {
  if (ref === undefined || ref === null) return undefined
  const list = numberedCards(cards)
  const n = typeof ref === 'number' ? ref : /^\[?\d+\]?$/.test(String(ref).trim()) ? Number(String(ref).replace(/\D/g, '')) : NaN
  if (Number.isFinite(n) && list[n - 1]) return list[n - 1]
  const q = String(ref).toLowerCase().trim()
  return (
    list.find((c) => c.title.toLowerCase() === q) ?? list.find((c) => q && c.title.toLowerCase().includes(q))
  )
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : [])

function matchItem<T extends { text: string }>(items: T[], q: string): T | undefined {
  const needle = q.toLowerCase().trim()
  return items.find((i) => i.text.toLowerCase() === needle) ?? items.find((i) => i.text.toLowerCase().includes(needle))
}

/** A one-line, human description of an action for the review list. */
export function describeAction(a: AssistantAction, cards: Card[]): string {
  const target = 'card' in a ? resolveCard(a.card, cards) : undefined
  const name = target ? `"${target.title || cardTypeLabel(target)}"` : `card ${'card' in a ? String(a.card) : ''} (not found)`
  switch (a.action) {
    case 'create_note':
      return `New note "${a.title || 'Note'}"`
    case 'create_todo':
      return `New todo list "${a.title || 'List'}" with ${strs(a.items).length} item(s)`
    case 'create_board':
      return `New board "${a.title || 'Board'}" (${Object.keys(a.columns ?? {}).length || 3} columns)`
    case 'create_sticky':
      return `New sticky: "${(a.text ?? '').slice(0, 40)}"`
    case 'add_todo_items':
      return `Add ${strs(a.items).length} item(s) to ${name}`
    case 'complete_todo_items':
      return `Check off ${strs(a.items).length} item(s) in ${name}`
    case 'append_note':
      return `Add text to ${name}`
    case 'rename_card':
      return `Rename ${name} to "${a.title ?? ''}"`
    case 'set_color':
      return `Make ${name} ${a.color}`
    case 'set_due':
      return `Set "${a.item}" in ${name} due ${a.date}`
    case 'delete_card':
      return `Delete ${name}`
  }
}

/** Applies actions to the board as one undoable batch. Returns how many took effect. */
export function applyActions(actions: AssistantAction[]): number {
  const ws = useWorkspaceStore.getState()
  const center = worldCenter()
  let applied = 0
  let created = 0
  const newCards: Card[] = []

  const place = () => {
    const i = created++
    return { x: center.x - 140 + (i % 3) * 300, y: center.y - 120 + Math.floor(i / 3) * 280, zIndex: 0 }
  }

  for (const a of actions) {
    const target = 'card' in a ? resolveCard(a.card, useWorkspaceStore.getState().cards) : undefined
    switch (a.action) {
      case 'create_note': {
        const content = a.content ?? ''
        newCards.push(
          buildCard('note', place(), {
            title: a.title || 'Note',
            content,
            checkboxStates: reconcileCheckboxStates(content, []),
          } as Partial<NoteCard>)
        )
        applied++
        break
      }
      case 'create_todo':
        newCards.push(
          buildCard('todo', place(), {
            title: a.title || 'Todo list',
            items: strs(a.items).map((text) => ({ id: makeId(), text, done: false })),
          } as Partial<TodoCard>)
        )
        applied++
        break
      case 'create_board': {
        const cols = a.columns && Object.keys(a.columns).length ? a.columns : { 'To do': [], Doing: [], Done: [] }
        const items: KanbanCard['items'] = {}
        const columns = Object.entries(cols).map(([title, list]) => {
          const ids = strs(list).map((text) => {
            const id = makeId()
            items[id] = { id, text }
            return id
          })
          return { id: makeId(), title, itemIds: ids }
        })
        newCards.push(buildCard('kanban', place(), { title: a.title || 'Board', columns, items } as Partial<KanbanCard>))
        applied++
        break
      }
      case 'create_sticky':
        newCards.push(buildCard('sticky', place(), { text: a.text ?? '' }))
        applied++
        break
      case 'add_todo_items':
        if (target?.type === 'todo') {
          strs(a.items).forEach((t) => ws.addTodoItem(target.id, t))
          applied++
        } else if (target?.type === 'note') {
          ws.setNoteContent(target.id, `${target.content.trimEnd()}\n${strs(a.items).map((t) => `- [ ] ${t}`).join('\n')}\n`)
          applied++
        }
        break
      case 'complete_todo_items':
        if (target?.type === 'todo') {
          for (const q of strs(a.items)) {
            const live = useWorkspaceStore.getState().cards.find((c) => c.id === target.id) as TodoCard
            const it = matchItem(live.items, q)
            if (it && !it.done) ws.toggleTodoItem(target.id, it.id)
          }
          applied++
        }
        break
      case 'append_note':
        if (target?.type === 'note' && a.text) {
          ws.setNoteContent(target.id, `${target.content.trimEnd()}\n\n${a.text}`)
          applied++
        }
        break
      case 'rename_card':
        if (target && a.title) {
          ws.updateCardBase(target.id, { title: a.title })
          applied++
        }
        break
      case 'set_color':
        if (target && CARD_COLORS.includes(a.color as CardColor)) {
          ws.setColor([target.id], a.color as CardColor)
          applied++
        }
        break
      case 'set_due':
        if (target && a.item && a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date)) {
          if (target.type === 'todo') {
            const it = matchItem(target.items, a.item)
            if (it) {
              ws.setTodoItemDue(target.id, it.id, a.date)
              applied++
            }
          } else if (target.type === 'kanban') {
            const it = matchItem(Object.values(target.items), a.item)
            if (it) {
              ws.setKanbanItemDue(target.id, it.id, a.date)
              applied++
            }
          }
        }
        break
      case 'delete_card':
        if (target && !target.locked) {
          ws.deleteCards([target.id])
          applied++
        }
        break
    }
  }
  if (newCards.length) ws.insertCards(newCards)
  return applied
}
