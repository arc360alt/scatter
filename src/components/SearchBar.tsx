import { useMemo, useState } from 'react'
import { Icon as FontAwesomeIcon } from './Icon'
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useUiStore } from '../store/ui'
import { useWorkspaceStore } from '../store/workspace'
import { cardSearchText } from '../lib/cardText'
import { cardIcon, cardTypeLabel } from '../lib/cardFactory'
import { jumpToCard } from '../lib/boardActions'

interface Hit {
  id: string
  title: string
  type: string
  icon: ReturnType<typeof cardIcon>
  snippet: { before: string; match: string; after: string } | null
}

function makeSnippet(text: string, q: string): Hit['snippet'] {
  const i = text.toLowerCase().indexOf(q)
  if (i === -1) return null
  const start = Math.max(0, i - 30)
  const end = Math.min(text.length, i + q.length + 50)
  const clean = (s: string) => s.replace(/\s+/g, ' ')
  return {
    before: (start > 0 ? '…' : '') + clean(text.slice(start, i)),
    match: text.slice(i, i + q.length),
    after: clean(text.slice(i + q.length, end)) + (end < text.length ? '…' : ''),
  }
}

export function SearchBar() {
  const open = useUiStore((s) => s.searchOpen)
  return open ? <SearchBarInner /> : null
}

function SearchBarInner() {
  const setOpen = useUiStore((s) => s.setSearchOpen)
  const cards = useWorkspaceStore((s) => s.cards)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return cards
      .filter((c) => cardSearchText(c).toLowerCase().includes(q))
      .map((c) => {
        const inTitle = c.title.toLowerCase().includes(q)
        return {
          id: c.id,
          title: c.title || cardTypeLabel(c),
          type: cardTypeLabel(c),
          icon: cardIcon(c),
          snippet: inTitle ? null : makeSnippet(cardSearchText(c), q),
        }
      })
  }, [cards, query])

  function go(i: number) {
    const hit = hits[i]
    if (!hit) return
    setActive(i)
    jumpToCard(hit.id)
  }

  return (
    <div className="search-bar" role="search">
      <div className="search-input-row">
        <FontAwesomeIcon icon={faMagnifyingGlass} className="search-icon" />
        <input
          autoFocus
          className="search-input"
          placeholder="Search all cards…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              // Enter cycles through matches; Shift+Enter goes backwards.
              if (!hits.length) return
              const next = e.shiftKey ? (active - 1 + hits.length) % hits.length : hits[active] ? active : 0
              go(next)
              if (!e.shiftKey) setActive((next + 1) % hits.length)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(hits.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            }
          }}
        />
        {query && <span className="search-count">{hits.length ? `${hits.length} found` : 'No matches'}</span>}
        <button className="search-close" aria-label="Close search" onClick={() => setOpen(false)}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>
      {hits.length > 0 && (
        <ul className="search-results">
          {hits.slice(0, 30).map((h, i) => (
            <li key={h.id}>
              <button className={`search-result${i === active ? ' active' : ''}`} onClick={() => go(i)}>
                <FontAwesomeIcon icon={h.icon} className="search-result-icon" />
                <span className="search-result-text">
                  <span className="search-result-title">{h.title}</span>
                  {h.snippet ? (
                    <span className="search-result-snippet">
                      {h.snippet.before}
                      <mark>{h.snippet.match}</mark>
                      {h.snippet.after}
                    </span>
                  ) : (
                    <span className="search-result-snippet">{h.type}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
