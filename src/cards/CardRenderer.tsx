import { memo } from 'react'
import type { Card } from '../types'
import { CardShell } from './CardShell'
import { NoteCard } from './NoteCard'
import { TodoCard } from './TodoCard'
import { KanbanCard } from './KanbanCard'
import { DrawingCard } from './DrawingCard'
import { CodeCard } from './CodeCard'
import { TimerCard } from './TimerCard'
import { CalendarCard } from './CalendarCard'
import { GroupCard, ImageCard, LinkCard, StickyCard } from './SimpleCards'

function CardBody({ card }: { card: Card }) {
  switch (card.type) {
    case 'note':
      return <NoteCard card={card} />
    case 'todo':
      return <TodoCard card={card} />
    case 'kanban':
      return <KanbanCard card={card} />
    case 'drawing':
      return <DrawingCard card={card} />
    case 'image':
      return <ImageCard card={card} />
    case 'link':
      return <LinkCard card={card} />
    case 'sticky':
      return <StickyCard card={card} />
    case 'timer':
      return <TimerCard card={card} />
    case 'calendar':
      return <CalendarCard card={card} />
    case 'code':
      return <CodeCard card={card} />
    case 'group':
      return <GroupCard card={card} />
  }
}

// Memoized so dragging one card (a new object) doesn't re-render every other card.
export const CardRenderer = memo(function CardRenderer({ card, viewportScale }: { card: Card; viewportScale: number }) {
  return (
    <CardShell card={card} viewportScale={viewportScale}>
      <CardBody card={card} />
    </CardShell>
  )
})
