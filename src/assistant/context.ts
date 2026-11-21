import type { Card } from '../types'
import { cardBodyText } from '../lib/cardText'
import { cardTypeLabel } from '../lib/cardFactory'
import { todayStr } from '../lib/dates'
import { ACTIONS_PROMPT, numberedCards } from './actions'

function cardToText(card: Card, index: number, selected: boolean): string {
  const heading = `### [${index}] ${card.title || 'Untitled'} (${cardTypeLabel(card).toLowerCase()})${selected ? ' <- SELECTED' : ''}`
  const body = cardBodyText(card).trim()
  return `${heading}\n${body || '(empty)'}`
}

export function buildWorkspaceContext(cards: Card[], selectedIds: string[] = [], maxChars = 6000): string {
  const list = numberedCards(cards)
  if (list.length === 0) return 'The workspace is currently empty.'
  // The selected cards go first so they survive truncation on big boards.
  const entries = list.map((c, i) => ({ c, i: i + 1, sel: selectedIds.includes(c.id) }))
  entries.sort((a, b) => Number(b.sel) - Number(a.sel))
  const full = entries.map((e) => cardToText(e.c, e.i, e.sel)).join('\n\n')
  if (full.length <= maxChars) return full
  return `${full.slice(0, maxChars)}\n\n[...truncated, the workspace has more cards than fit here...]`
}

export function buildSystemPrompt(cards: Card[], selectedIds: string[] = []): string {
  return [
    'You are the built-in assistant inside Scatter, a freeform corkboard of notes, todo lists, kanban boards, drawings, timers and more.',
    `Today is ${todayStr()}.`,
    "The user's current workspace cards are listed below, each with a [number]. Use them to answer questions, suggest priorities, and help the user plan.",
    'Be concise and practical. Reference specific card titles when relevant. If the context is empty or unrelated to the question, just answer normally.',
    selectedIds.length ? 'Cards marked SELECTED are what the user means by "this card" / "the selected card".' : '',
    '',
    ACTIONS_PROMPT,
    '',
    '--- WORKSPACE CONTEXT ---',
    buildWorkspaceContext(cards, selectedIds),
    '--- END CONTEXT ---',
  ]
    .filter((l) => l !== '')
    .join('\n')
}
