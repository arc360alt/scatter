import { useMemo, useState } from 'react'
import { Icon as FontAwesomeIcon } from '../components/Icon'
import { faChevronLeft, faChevronRight, faXmark } from '@fortawesome/free-solid-svg-icons'
import type { CalendarCard as CalendarCardType, Card } from '../types'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { makeId } from '../lib/id'
import { parseDateStr, toDateStr, todayStr } from '../lib/dates'
import { jumpToCard } from '../lib/boardActions'

interface DueEntry {
  cardId: string
  cardTitle: string
  itemId: string
  text: string
  done: boolean
  kind: 'todo' | 'kanban'
}

/** Every dated todo/board item on the board, keyed by YYYY-MM-DD. */
function collectDue(cards: Card[]): Map<string, DueEntry[]> {
  const map = new Map<string, DueEntry[]>()
  const add = (date: string, e: DueEntry) => map.set(date, [...(map.get(date) ?? []), e])
  for (const c of cards) {
    if (c.type === 'todo') {
      for (const it of c.items)
        if (it.due) add(it.due, { cardId: c.id, cardTitle: c.title, itemId: it.id, text: it.text, done: it.done, kind: 'todo' })
    } else if (c.type === 'kanban') {
      const lastCol = c.columns[c.columns.length - 1]
      for (const it of Object.values(c.items)) {
        if (!it.due) continue
        // Items in a board's last column ("Done") count as finished.
        const done = Boolean(lastCol?.itemIds.includes(it.id) && c.columns.length > 1)
        add(it.due, { cardId: c.id, cardTitle: c.title, itemId: it.id, text: it.text, done, kind: 'kanban' })
      }
    }
  }
  return map
}

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: 'narrow' })
)

export function CalendarCard({ card }: { card: CalendarCardType }) {
  const cards = useWorkspaceStore((s) => s.cards)
  const updateCard = useWorkspaceStore((s) => s.updateCard)
  const toggleTodoItem = useWorkspaceStore((s) => s.toggleTodoItem)
  const editMode = useSettingsStore((s) => s.editMode)
  const today = todayStr()
  const [selected, setSelected] = useState(today)
  const [draft, setDraft] = useState('')

  const due = useMemo(() => collectDue(cards), [cards])
  const [y, m] = card.month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const daysInMonth = new Date(y, m, 0).getDate()
  const lead = first.getDay()
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateStr(new Date(y, m - 1, i + 1))),
  ]
  while (cells.length % 7) cells.push(null)

  function shiftMonth(delta: number) {
    const d = new Date(y, m - 1 + delta, 1)
    updateCard<CalendarCardType>(card.id, { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  }

  function goToday() {
    const d = new Date()
    setSelected(today)
    updateCard<CalendarCardType>(card.id, { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  }

  function addEvent() {
    const text = draft.trim()
    if (!text) return
    updateCard<CalendarCardType>(card.id, { events: [...card.events, { id: makeId(), date: selected, text }] })
    setDraft('')
  }

  const dayEvents = card.events.filter((e) => e.date === selected)
  const dayDue = due.get(selected) ?? []

  return (
    <div className="calendar-card">
      <div className="calendar-head">
        <button className="calendar-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <button className="calendar-month" onClick={goToday} title="Jump to today">
          {first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </button>
        <button className="calendar-nav" onClick={() => shiftMonth(1)} aria-label="Next month">
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="calendar-weekday">
            {d}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={i} />
          const items = due.get(date) ?? []
          const events = card.events.filter((e) => e.date === date)
          const pending = items.filter((x) => !x.done).length
          const overdue = date < today && pending > 0
          return (
            <button
              key={date}
              className={[
                'calendar-day',
                date === today && 'today',
                date === selected && 'selected',
                overdue && 'overdue',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelected(date)}
            >
              {parseDateStr(date).getDate()}
              {(events.length > 0 || items.length > 0) && (
                <span className="calendar-dots">
                  {events.length > 0 && <i className="dot-event" />}
                  {pending > 0 && <i className="dot-due" />}
                  {items.length > pending && <i className="dot-done" />}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="calendar-day-detail">
        <div className="calendar-day-title">
          {parseDateStr(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <div className="calendar-entries">
          {dayDue.map((d) => (
            <div key={d.itemId} className={`calendar-entry due${d.done ? ' done' : ''}`}>
              {d.kind === 'todo' ? (
                <input type="checkbox" checked={d.done} onChange={() => toggleTodoItem(d.cardId, d.itemId)} />
              ) : (
                <span className="calendar-entry-bullet" />
              )}
              <span className="calendar-entry-text">{d.text}</span>
              <button className="calendar-entry-src" onClick={() => jumpToCard(d.cardId)} title="Show the card">
                {d.cardTitle || 'card'}
              </button>
            </div>
          ))}
          {dayEvents.map((ev) => (
            <div key={ev.id} className="calendar-entry event">
              <span className="calendar-entry-bullet event" />
              <span className="calendar-entry-text">{ev.text}</span>
              {editMode && (
                <button
                  className="calendar-entry-remove"
                  aria-label="Remove event"
                  onClick={() => updateCard<CalendarCardType>(card.id, { events: card.events.filter((e) => e.id !== ev.id) })}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              )}
            </div>
          ))}
          {dayDue.length === 0 && dayEvents.length === 0 && <div className="calendar-empty">Nothing on this day.</div>}
        </div>
        {editMode && (
          <input
            className="todo-add-input"
            placeholder="Add an event…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addEvent()}
            onBlur={addEvent}
          />
        )}
      </div>
    </div>
  )
}
