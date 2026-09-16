export type CardColor =
  | 'terracotta'
  | 'olive'
  | 'mustard'
  | 'teal'
  | 'plum'
  | 'slate'

export interface CardBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  color: CardColor
  rotation: number
  zIndex: number
  title: string
  createdAt: number
  updatedAt: number
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
}

export interface KanbanItem {
  id: string
  text: string
}

export interface KanbanColumn {
  id: string
  title: string
  itemIds: string[]
}

export interface NoteCard extends CardBase {
  type: 'note'
  content: string
  checkboxStates: boolean[]
}

export interface TodoCard extends CardBase {
  type: 'todo'
  items: TodoItem[]
}

export interface KanbanCard extends CardBase {
  type: 'kanban'
  columns: KanbanColumn[]
  items: Record<string, KanbanItem>
}

export type Card = NoteCard | TodoCard | KanbanCard
export type CardType = Card['type']

export interface Viewport {
  x: number
  y: number
  scale: number
}

export interface Workspace {
  cards: Card[]
  viewport: Viewport
}
