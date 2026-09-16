import type { Card } from '../types'

function cardToText(card: Card): string {
  const heading = `### ${card.title || 'Untitled'} (${card.type})`
  if (card.type === 'note') {
    return `${heading}\n${card.content.trim() || '(empty)'}`
  }
  if (card.type === 'todo') {
    const lines = card.items.map((item) => `- [${item.done ? 'x' : ' '}] ${item.text}`)
    return `${heading}\n${lines.join('\n') || '(empty)'}`
  }
  const lines = card.columns.map((col) => {
    const items = col.itemIds.map((id) => card.items[id]?.text).filter(Boolean)
    return `${col.title}:\n${items.map((t) => `  - ${t}`).join('\n') || '  (empty)'}`
  })
  return `${heading}\n${lines.join('\n')}`
}

export function buildWorkspaceContext(cards: Card[], maxChars = 6000): string {
  if (cards.length === 0) return 'The workspace is currently empty.'
  const full = cards.map(cardToText).join('\n\n')
  if (full.length <= maxChars) return full
  return `${full.slice(0, maxChars)}\n\n[...truncated, the workspace has more cards than fit here...]`
}

export function buildSystemPrompt(cards: Card[]): string {
  return [
    'You are the built-in assistant inside Scatter, a freeform notes/todo/kanban workspace app.',
    "The user's current workspace cards are given below as context. Use them to answer questions, suggest priorities, and help the user figure out how to tackle their notes, todos, and boards.",
    'Be concise and practical. Reference specific card titles when relevant. If the context is empty or unrelated to the question, just answer normally.',
    '',
    '--- WORKSPACE CONTEXT ---',
    buildWorkspaceContext(cards),
    '--- END CONTEXT ---',
  ].join('\n')
}
