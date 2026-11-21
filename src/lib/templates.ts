import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faBrain, faCalendarWeek, faDiagramProject, faGraduationCap, faPalette } from '@fortawesome/free-solid-svg-icons'
import type { Card, CardColor, Connector, KanbanCard, NoteCard, TodoCard } from '../types'
import { buildCard, type AddEntryId } from './cardFactory'
import { makeId } from './id'
import { reconcileCheckboxStates } from './noteContent'
import { toDateStr } from './dates'
import { boundsOf } from './geometry'
import { requireEditMode, worldCenter } from './boardActions'
import { useWorkspaceStore } from '../store/workspace'

export interface Template {
  id: string
  name: string
  blurb: string
  icon: IconDefinition
  build: (origin: { x: number; y: number }) => { cards: Card[]; connectors: Connector[] }
}

function card(entry: AddEntryId, x: number, y: number, patch: Partial<Card> = {}): Card {
  return buildCard(entry, { x, y, zIndex: 0 }, patch)
}

function note(x: number, y: number, title: string, content: string, color: CardColor, extra: Partial<NoteCard> = {}) {
  return card('note', x, y, { title, content, color, checkboxStates: reconcileCheckboxStates(content, []), ...extra } as Partial<Card>)
}

function todo(x: number, y: number, title: string, items: string[], color: CardColor, extra: Partial<TodoCard> = {}) {
  return card('todo', x, y, {
    title,
    color,
    items: items.map((text) => ({ id: makeId(), text, done: false })),
    ...extra,
  } as Partial<Card>)
}

function kanban(x: number, y: number, title: string, cols: Record<string, string[]>, color: CardColor) {
  const items: KanbanCard['items'] = {}
  const columns = Object.entries(cols).map(([t, list]) => ({
    id: makeId(),
    title: t,
    itemIds: list.map((text) => {
      const id = makeId()
      items[id] = { id, text }
      return id
    }),
  }))
  return card('kanban', x, y, { title, color, columns, items, width: 480, height: 330 } as Partial<Card>)
}

function connect(from: Card, to: Card, label = ''): Connector {
  return { id: makeId(), from: from.id, to: to.id, color: 'ink', ends: 'end', label }
}

export const TEMPLATES: Template[] = [
  {
    id: 'weekly',
    name: 'Weekly planner',
    blurb: 'A todo list for each weekday, plus goals and a calendar',
    icon: faCalendarWeek,
    build: ({ x, y }) => {
      const monday = new Date()
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
      const colors: CardColor[] = ['terracotta', 'mustard', 'olive', 'teal', 'plum']
      const dayCards = days.map((d, i) => {
        const date = new Date(monday)
        date.setDate(monday.getDate() + i)
        return todo(x + 40 + i * 250, y + 70, d, [], colors[i], {
          width: 230,
          height: 260,
          rotation: 0,
          items: [{ id: makeId(), text: 'Add tasks for the day', done: false, due: toDateStr(date) }],
        })
      })
      const group = card('group', x, y, { title: 'This week', width: 40 + days.length * 250 + 20, height: 360 })
      const goals = note(x, y + 400, 'Goals this week', '- [ ] \n- [ ] \n- [ ] ', 'slate', { rotation: -1 })
      const cal = card('calendar', x + 300, y + 400, { color: 'teal', rotation: 1 })
      const notes = card('sticky', x + 660, y + 410, { text: 'Wins & notes from the week…' })
      return { cards: [group, ...dayCards, goals, cal, notes], connectors: [] }
    },
  },
  {
    id: 'project',
    name: 'Project kickoff',
    blurb: 'Brief, kanban board, milestones and a timeline',
    icon: faDiagramProject,
    build: ({ x, y }) => {
      const brief = note(
        x,
        y,
        'Project brief',
        '## Goal\nWhat does done look like?\n\n## Why\n\n## Out of scope\n',
        'terracotta',
        { width: 300, height: 300 }
      )
      const board = kanban(
        x + 340,
        y,
        'Work',
        { Backlog: ['Define scope', 'List open questions'], 'In progress': [], Review: [], Done: [] },
        'plum'
      )
      const milestones = todo(x, y + 340, 'Milestones', ['Kickoff', 'First draft', 'Launch'], 'olive')
      const cal = card('calendar', x + 340, y + 360, { color: 'teal' })
      const links = card('link', x + 700, y + 360, { title: 'Reference', color: 'slate' })
      return { cards: [brief, board, milestones, cal, links], connectors: [connect(brief, board), connect(milestones, cal)] }
    },
  },
  {
    id: 'mood',
    name: 'Mood board',
    blurb: 'Image slots, a sketch, colour notes and stickies',
    icon: faPalette,
    build: ({ x, y }) => {
      const group = card('group', x, y, { title: 'Mood board', width: 980, height: 640, color: 'plum' })
      const images = [0, 1, 2].map((i) =>
        card('image', x + 40 + i * 310, y + 70, { title: `Inspiration ${i + 1}`, width: 280, height: 240 })
      )
      const sketch = card('drawing', x + 40, y + 340, { title: 'Rough sketch', width: 340, height: 260 })
      const palette = note(x + 410, y + 340, 'Palette & type', '- Primary: \n- Accent: \n- Fonts: ', 'mustard', {
        width: 240,
        height: 240,
      })
      const s1 = card('sticky', x + 680, y + 350, { text: 'Words that describe the feel…' })
      const s2 = card('sticky', x + 700, y + 430 + 60, { text: 'Avoid…', color: 'terracotta' })
      return { cards: [group, ...images, sketch, palette, s1, s2], connectors: [] }
    },
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm map',
    blurb: 'A central question with connected idea stickies',
    icon: faBrain,
    build: ({ x, y }) => {
      const center = note(x + 330, y + 220, 'Big question', '## What are we solving?', 'terracotta', {
        width: 260,
        height: 160,
        rotation: 0,
      })
      const spots = [
        [x, y],
        [x + 360, y - 40],
        [x + 720, y],
        [x, y + 440],
        [x + 360, y + 480],
        [x + 720, y + 440],
      ]
      const ideas = spots.map(([sx, sy], i) => card('sticky', sx, sy, { text: `Idea ${i + 1}` }))
      return { cards: [center, ...ideas], connectors: ideas.map((idea) => connect(center, idea)) }
    },
  },
  {
    id: 'study',
    name: 'Study session',
    blurb: 'Pomodoro timer, tasks, notes and a scratch pad',
    icon: faGraduationCap,
    build: ({ x, y }) => {
      const timer = card('pomodoro', x, y, { color: 'terracotta' })
      const tasks = todo(x + 270, y, 'Session tasks', ['Review notes', 'Practice problems', 'Summarise'], 'teal')
      const notes = note(x + 560, y, 'Notes', '## Key ideas\n\n## Questions\n', 'mustard', { width: 300, height: 300 })
      const scratch = card('drawing', x, y + 290, { title: 'Scratch pad', width: 520, height: 300 })
      return { cards: [timer, tasks, notes, scratch], connectors: [] }
    },
  },
]

/** Drops a template onto the board, centered on a world point (default: middle of the screen). */
export function insertTemplate(t: Template, at?: { x: number; y: number }) {
  if (!requireEditMode()) return
  const built = t.build({ x: 0, y: 0 })
  const b = boundsOf(built.cards)
  if (!b) return
  const target = at ?? worldCenter()
  const dx = target.x - (b.x + b.width / 2)
  const dy = target.y - (b.y + b.height / 2)
  const cards = built.cards.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy }))
  useWorkspaceStore.getState().insertCards(cards, built.connectors)
}
