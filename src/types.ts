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
  /** Position/size are fixed and the card can't be deleted; its content stays editable. */
  locked?: boolean
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
  /** Due date as YYYY-MM-DD (local calendar day). */
  due?: string
}

export interface KanbanItem {
  id: string
  text: string
  due?: string
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

// ---------- drawing ----------

export type DrawBackground = 'blank' | 'grid' | 'lined' | 'dots'

export interface StrokeElement {
  id: string
  kind: 'stroke'
  tool: 'pen' | 'highlighter' | 'eraser'
  /** Flattened [x0, y0, x1, y1, ...] in drawing-document coordinates. */
  points: number[]
  color: string
  size: number
}

export interface ShapeElement {
  id: string
  kind: 'rect' | 'ellipse' | 'line' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  size: number
  fill: boolean
}

export interface TextElement {
  id: string
  kind: 'text'
  x: number
  y: number
  text: string
  color: string
  size: number
}

export interface ImageElement {
  id: string
  kind: 'image'
  imageId: string
  x: number
  y: number
  w: number
  h: number
}

export type DrawElement = StrokeElement | ShapeElement | TextElement | ImageElement

export interface DrawingCard extends CardBase {
  type: 'drawing'
  docWidth: number
  docHeight: number
  background: DrawBackground
  elements: DrawElement[]
}

// ---------- other card types ----------

export interface ImageCard extends CardBase {
  type: 'image'
  imageId: string | null
  fit: 'cover' | 'contain'
  caption: string
}

export interface LinkCard extends CardBase {
  type: 'link'
  url: string
  description: string
}

export interface StickyCard extends CardBase {
  type: 'sticky'
  text: string
}

export type TimerMode = 'pomodoro' | 'countdown' | 'stopwatch'
export type PomodoroPhase = 'focus' | 'short' | 'long'

export interface TimerCard extends CardBase {
  type: 'timer'
  mode: TimerMode
  /** Countdown length in ms (for countdown mode; pomodoro derives it from the phase). */
  durationMs: number
  /** Epoch ms the current run started, or null when paused/stopped. */
  startedAt: number | null
  /** Time already elapsed before the current run (accumulates across pauses). */
  elapsedMs: number
  phase: PomodoroPhase
  completedFocus: number
  focusMin: number
  shortMin: number
  longMin: number
}

export interface CalendarEvent {
  id: string
  date: string
  text: string
}

export interface CalendarCard extends CardBase {
  type: 'calendar'
  /** Month being viewed, YYYY-MM. */
  month: string
  events: CalendarEvent[]
}

export interface CodeCard extends CardBase {
  type: 'code'
  code: string
  language: string
}

/** A labelled frame: cards sitting inside it move with it. */
export interface GroupCard extends CardBase {
  type: 'group'
}

export type Card =
  | NoteCard
  | TodoCard
  | KanbanCard
  | DrawingCard
  | ImageCard
  | LinkCard
  | StickyCard
  | TimerCard
  | CalendarCard
  | CodeCard
  | GroupCard
export type CardType = Card['type']

export type ConnectorEnds = 'end' | 'both' | 'none'

export interface Connector {
  id: string
  from: string
  to: string
  color: CardColor | 'ink'
  ends: ConnectorEnds
  label: string
}

export interface Viewport {
  x: number
  y: number
  scale: number
}

export interface Workspace {
  cards: Card[]
  viewport: Viewport
  connectors?: Connector[]
}
