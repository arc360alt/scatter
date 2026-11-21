import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faCalendarDays,
  faClock,
  faCode,
  faImage,
  faLink,
  faNoteSticky,
  faObjectGroup,
  faPaintbrush,
  faSquareCheck,
  faStopwatch,
  faTableColumns,
  faFileLines,
} from '@fortawesome/free-solid-svg-icons'
import type { Card, CardColor, CardType } from '../types'
import { makeId } from './id'

/** Things you can add from the toolbar / right-click menu. Mostly 1:1 with card
 * types, except "Pomodoro" and "Timer" are two presets of the same timer card. */
export type AddEntryId =
  | 'note'
  | 'sticky'
  | 'todo'
  | 'kanban'
  | 'drawing'
  | 'image'
  | 'link'
  | 'code'
  | 'pomodoro'
  | 'timer'
  | 'calendar'
  | 'group'

export interface AddEntry {
  id: AddEntryId
  label: string
  icon: IconDefinition
  blurb: string
}

export const ADD_ENTRIES: AddEntry[] = [
  { id: 'note', label: 'Note', icon: faFileLines, blurb: 'Markdown text with checkboxes and images' },
  { id: 'sticky', label: 'Sticky', icon: faNoteSticky, blurb: 'A quick little sticky note' },
  { id: 'todo', label: 'Todo list', icon: faSquareCheck, blurb: 'Checklist with due dates' },
  { id: 'kanban', label: 'Board', icon: faTableColumns, blurb: 'Kanban columns you drag items between' },
  { id: 'drawing', label: 'Drawing', icon: faPaintbrush, blurb: 'Sketch, add shapes, text and images' },
  { id: 'image', label: 'Image', icon: faImage, blurb: 'A photo or screenshot' },
  { id: 'link', label: 'Link', icon: faLink, blurb: 'A bookmarked web page' },
  { id: 'code', label: 'Code', icon: faCode, blurb: 'Syntax-highlighted snippet' },
  { id: 'pomodoro', label: 'Pomodoro', icon: faClock, blurb: 'Focus / break cycles' },
  { id: 'timer', label: 'Timer', icon: faStopwatch, blurb: 'Countdown or stopwatch' },
  { id: 'calendar', label: 'Calendar', icon: faCalendarDays, blurb: 'Month view with your due dates' },
  { id: 'group', label: 'Group', icon: faObjectGroup, blurb: 'A frame - cards inside move with it' },
]

export const ADD_ENTRY_BY_ID = Object.fromEntries(ADD_ENTRIES.map((e) => [e.id, e])) as Record<AddEntryId, AddEntry>

export const DEFAULT_QUICK_ADD: AddEntryId[] = ['note', 'todo', 'kanban']

export const CARD_COLORS: CardColor[] = ['terracotta', 'olive', 'mustard', 'teal', 'plum', 'slate']

export function randomColor(): CardColor {
  return CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)]
}

export function randomRotation() {
  return Math.random() * 6 - 3
}

const SIZES: Record<AddEntryId, [number, number]> = {
  note: [260, 220],
  sticky: [200, 180],
  todo: [260, 240],
  kanban: [440, 320],
  drawing: [340, 270],
  image: [300, 260],
  link: [300, 180],
  code: [380, 260],
  pomodoro: [260, 320],
  timer: [260, 310],
  calendar: [340, 480],
  group: [560, 400],
}

/** Smallest size each card type can be resized to. Measured in a headless browser in
 * both interface modes: below these, controls get pushed out of the card or text
 * overlaps (the timer's readout and the calendar's day list need the most room). */
const MIN_SIZES: Partial<Record<CardType, [number, number]>> = {
  sticky: [130, 110],
  todo: [220, 140],
  kanban: [300, 200],
  image: [160, 150],
  link: [200, 170],
  timer: [220, 290],
  calendar: [240, 320],
}
const DEFAULT_MIN_SIZE: [number, number] = [200, 140]

export function minCardSize(type: CardType): [number, number] {
  return MIN_SIZES[type] ?? DEFAULT_MIN_SIZE
}

/** Returns the card grown to its type's minimum size if it's smaller (or the card itself if not). */
export function clampCardSize<T extends Card>(card: T): T {
  const [minW, minH] = minCardSize(card.type)
  if (card.width >= minW && card.height >= minH) return card
  return { ...card, width: Math.max(minW, card.width), height: Math.max(minH, card.height) }
}

const TITLES: Record<AddEntryId, string> = {
  note: 'New note',
  sticky: '',
  todo: 'New list',
  kanban: 'New board',
  drawing: 'New drawing',
  image: 'Image',
  link: 'Link',
  code: 'Snippet',
  pomodoro: 'Pomodoro',
  timer: 'Timer',
  calendar: 'Calendar',
  group: 'Group',
}

export function entryForCardType(type: CardType): AddEntryId {
  return type === 'timer' ? 'timer' : (type as AddEntryId)
}

/** Builds a fresh card for an add-menu entry. `patch` overrides any field
 * (used by templates, paste, and the assistant to pre-fill content). */
export function buildCard(
  entry: AddEntryId,
  opts: { x: number; y: number; zIndex: number },
  patch: Partial<Card> = {}
): Card {
  const now = Date.now()
  const [width, height] = SIZES[entry]
  const base = {
    id: makeId(),
    x: opts.x,
    y: opts.y,
    width,
    height,
    color: entry === 'group' ? ('slate' as CardColor) : randomColor(),
    rotation: entry === 'group' ? 0 : randomRotation(),
    zIndex: opts.zIndex,
    title: TITLES[entry],
    createdAt: now,
    updatedAt: now,
  }
  let card: Card
  switch (entry) {
    case 'note':
      card = { ...base, type: 'note', content: '', checkboxStates: [] }
      break
    case 'sticky':
      card = { ...base, type: 'sticky', text: '', color: 'mustard' }
      break
    case 'todo':
      card = { ...base, type: 'todo', items: [] }
      break
    case 'kanban':
      card = {
        ...base,
        type: 'kanban',
        columns: [
          { id: makeId(), title: 'To do', itemIds: [] },
          { id: makeId(), title: 'Doing', itemIds: [] },
          { id: makeId(), title: 'Done', itemIds: [] },
        ],
        items: {},
      }
      break
    case 'drawing':
      card = { ...base, type: 'drawing', docWidth: 1600, docHeight: 1100, background: 'blank', elements: [] }
      break
    case 'image':
      card = { ...base, type: 'image', imageId: null, fit: 'cover', caption: '' }
      break
    case 'link':
      card = { ...base, type: 'link', url: '', description: '' }
      break
    case 'code':
      card = { ...base, type: 'code', code: '', language: 'javascript' }
      break
    case 'pomodoro':
    case 'timer':
      card = {
        ...base,
        type: 'timer',
        mode: entry === 'pomodoro' ? 'pomodoro' : 'countdown',
        durationMs: 10 * 60_000,
        startedAt: null,
        elapsedMs: 0,
        phase: 'focus',
        completedFocus: 0,
        focusMin: 25,
        shortMin: 5,
        longMin: 15,
      }
      break
    case 'calendar': {
      const d = new Date()
      card = {
        ...base,
        type: 'calendar',
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        events: [],
      }
      break
    }
    case 'group':
      card = { ...base, type: 'group' }
      break
  }
  return clampCardSize({ ...card, ...patch } as Card)
}

export function cardTypeLabel(card: Card): string {
  if (card.type === 'timer') return card.mode === 'pomodoro' ? 'Pomodoro' : 'Timer'
  return ADD_ENTRY_BY_ID[card.type as AddEntryId]?.label ?? card.type
}

export function cardIcon(card: Card): IconDefinition {
  if (card.type === 'timer') return card.mode === 'pomodoro' ? faClock : faStopwatch
  return ADD_ENTRY_BY_ID[card.type as AddEntryId]?.icon ?? faFileLines
}
