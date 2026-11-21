import type { Card } from '../types'
import { extractScatterImageIds } from './noteContent'
import { cardTypeLabel } from './cardFactory'
import { formatDuration } from './dates'

/** All searchable text in a card (title included), lowercased-free - callers lowercase. */
export function cardSearchText(card: Card): string {
  return [card.title, cardBodyText(card)].filter(Boolean).join('\n')
}

/** The card's content as plain-ish text (markdown where natural). */
export function cardBodyText(card: Card): string {
  switch (card.type) {
    case 'note':
      return card.content
    case 'sticky':
      return card.text
    case 'todo':
      return card.items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}${i.due ? ` (due ${i.due})` : ''}`).join('\n')
    case 'kanban':
      return card.columns
        .map((col) => {
          const items = col.itemIds
            .map((id) => card.items[id])
            .filter(Boolean)
            .map((it) => `  - ${it.text}${it.due ? ` (due ${it.due})` : ''}`)
          return `${col.title}:\n${items.join('\n') || '  (empty)'}`
        })
        .join('\n')
    case 'drawing': {
      const texts = card.elements.flatMap((e) => (e.kind === 'text' ? [e.text] : []))
      return texts.length ? `Drawing with text: ${texts.join(' / ')}` : `Drawing (${card.elements.length} elements)`
    }
    case 'image':
      return card.caption
    case 'link':
      return [card.url, card.description].filter(Boolean).join('\n')
    case 'code':
      return card.code
    case 'timer':
      return card.mode === 'pomodoro'
        ? `Pomodoro, ${card.focusMin}/${card.shortMin}/${card.longMin} min, ${card.completedFocus} focus sessions done`
        : card.mode === 'countdown'
          ? `Countdown ${formatDuration(card.durationMs)}`
          : 'Stopwatch'
    case 'calendar':
      return card.events
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => `- ${e.date}: ${e.text}`)
        .join('\n')
    case 'group':
      return ''
  }
}

/** A standalone markdown document for one card (card export / copy). */
export function cardToMarkdown(card: Card): string {
  const title = `# ${card.title || cardTypeLabel(card)}`
  let body: string
  switch (card.type) {
    case 'code':
      body = '```' + card.language + '\n' + card.code + '\n```'
      break
    case 'link':
      body = `[${card.url}](${card.url})${card.description ? `\n\n${card.description}` : ''}`
      break
    case 'kanban':
      body = card.columns
        .map((col) => {
          const items = col.itemIds
            .map((id) => card.items[id])
            .filter(Boolean)
            .map((it) => `- ${it.text}${it.due ? ` _(due ${it.due})_` : ''}`)
          return `## ${col.title}\n\n${items.join('\n') || '_(empty)_'}`
        })
        .join('\n\n')
      break
    default:
      body = cardBodyText(card)
  }
  return `${title}\n\n${body}\n`
}

/** Every image-store id a card references, so sync/export/cleanup can find them. */
export function cardImageIds(card: Card): string[] {
  switch (card.type) {
    case 'note':
      return extractScatterImageIds(card.content)
    case 'image':
      return card.imageId ? [card.imageId] : []
    case 'drawing':
      return card.elements.flatMap((e) => (e.kind === 'image' ? [e.imageId] : []))
    default:
      return []
  }
}

export function workspaceImageIds(cards: Card[]): string[] {
  const ids = new Set<string>()
  for (const card of cards) cardImageIds(card).forEach((id) => ids.add(id))
  return [...ids]
}

/** Rewrites image ids inside a card (used when importing a workspace file). */
export function remapCardImageIds(card: Card, map: Map<string, string>): Card {
  switch (card.type) {
    case 'note':
      return {
        ...card,
        content: card.content.replace(/scatter-image:([a-zA-Z0-9-]+)/g, (match, oldId: string) => {
          const newId = map.get(oldId)
          return newId ? `scatter-image:${newId}` : match
        }),
      }
    case 'image':
      return card.imageId && map.has(card.imageId) ? { ...card, imageId: map.get(card.imageId)! } : card
    case 'drawing':
      return {
        ...card,
        elements: card.elements.map((e) =>
          e.kind === 'image' && map.has(e.imageId) ? { ...e, imageId: map.get(e.imageId)! } : e
        ),
      }
    default:
      return card
  }
}
