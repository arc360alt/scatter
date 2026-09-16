import type { Card } from '../types'
import { CardShell } from './CardShell'
import { NoteCard } from './NoteCard'
import { TodoCard } from './TodoCard'
import { KanbanCard } from './KanbanCard'

export function CardRenderer({ card, viewportScale }: { card: Card; viewportScale: number }) {
  return (
    <CardShell card={card} viewportScale={viewportScale}>
      {card.type === 'note' && <NoteCard card={card} />}
      {card.type === 'todo' && <TodoCard card={card} />}
      {card.type === 'kanban' && <KanbanCard card={card} />}
    </CardShell>
  )
}
