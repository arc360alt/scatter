import { useMemo, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/free-solid-svg-icons'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import java from 'highlight.js/lib/languages/java'
import csharp from 'highlight.js/lib/languages/csharp'
import cpp from 'highlight.js/lib/languages/cpp'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import markdown from 'highlight.js/lib/languages/markdown'
import yaml from 'highlight.js/lib/languages/yaml'
import lua from 'highlight.js/lib/languages/lua'
import type { CodeCard as CodeCardType } from '../types'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { useToastStore } from '../store/toast'

const LANGUAGES: [string, string, Parameters<typeof hljs.registerLanguage>[1]][] = [
  ['javascript', 'JavaScript', javascript],
  ['typescript', 'TypeScript', typescript],
  ['python', 'Python', python],
  ['xml', 'HTML / XML', xml],
  ['css', 'CSS', css],
  ['json', 'JSON', json],
  ['bash', 'Shell', bash],
  ['sql', 'SQL', sql],
  ['java', 'Java', java],
  ['csharp', 'C#', csharp],
  ['cpp', 'C / C++', cpp],
  ['go', 'Go', go],
  ['rust', 'Rust', rust],
  ['lua', 'Lua', lua],
  ['markdown', 'Markdown', markdown],
  ['yaml', 'YAML', yaml],
]
for (const [id, , def] of LANGUAGES) hljs.registerLanguage(id, def)

/** A textarea layered exactly over a highlighted <pre>, so you edit plain text but see colors. */
export function CodeCard({ card }: { card: CodeCardType }) {
  const updateCard = useWorkspaceStore((s) => s.updateCard)
  const editMode = useSettingsStore((s) => s.editMode)
  const preRef = useRef<HTMLPreElement>(null)

  const html = useMemo(() => {
    const lang = hljs.getLanguage(card.language) ? card.language : 'plaintext'
    const src = card.code + (card.code.endsWith('\n') ? ' ' : '\n')
    return lang === 'plaintext' ? escapeHtml(src) : hljs.highlight(src, { language: lang }).value
  }, [card.code, card.language])

  async function copy() {
    try {
      await navigator.clipboard.writeText(card.code)
      useToastStore.getState().show('Code copied')
    } catch {
      useToastStore.getState().show("Couldn't access the clipboard")
    }
  }

  return (
    <div className="code-card">
      <div className="code-card-bar">
        <select
          className="code-card-lang"
          value={card.language}
          disabled={!editMode}
          onChange={(e) => updateCard<CodeCardType>(card.id, { language: e.target.value })}
        >
          {LANGUAGES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
          <option value="plaintext">Plain text</option>
        </select>
        <button className="code-card-copy" onClick={copy} title="Copy code">
          <FontAwesomeIcon icon={faCopy} /> Copy
        </button>
      </div>
      <div className="code-card-editor">
        <pre ref={preRef} className="code-card-pre hljs" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
        <textarea
          className="code-card-input"
          value={card.code}
          spellCheck={false}
          readOnly={!editMode}
          placeholder={editMode ? '// paste or type code…' : ''}
          onChange={(e) => updateCard<CodeCardType>(card.id, { code: e.target.value })}
          onScroll={(e) => {
            if (preRef.current) {
              preRef.current.scrollTop = e.currentTarget.scrollTop
              preRef.current.scrollLeft = e.currentTarget.scrollLeft
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && editMode) {
              e.preventDefault()
              const t = e.currentTarget
              const { selectionStart: s, selectionEnd: end } = t
              const next = card.code.slice(0, s) + '  ' + card.code.slice(end)
              updateCard<CodeCardType>(card.id, { code: next })
              requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2))
            }
          }}
        />
      </div>
    </div>
  )
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
