import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faComment, faPaperPlane, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useAssistantStore } from '../store/assistant'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { MODEL_OPTIONS } from './models'
import { renderAssistantMarkdown } from './renderMarkdown'

export function AssistantPanel() {
  const [open, setOpen] = useState(false)
  const aiEnabled = useSettingsStore((s) => s.aiEnabled)
  const status = useAssistantStore((s) => s.status)
  const progress = useAssistantStore((s) => s.progress)
  const progressText = useAssistantStore((s) => s.progressText)
  const errorMessage = useAssistantStore((s) => s.errorMessage)
  const modelId = useAssistantStore((s) => s.modelId)
  const messages = useAssistantStore((s) => s.messages)
  const sending = useAssistantStore((s) => s.sending)
  const loadModel = useAssistantStore((s) => s.loadModel)
  const sendMessage = useAssistantStore((s) => s.sendMessage)
  const unload = useAssistantStore((s) => s.unload)
  const cards = useWorkspaceStore((s) => s.cards)

  const [draft, setDraft] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && status === 'idle') {
      void loadModel(modelId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Free the model's memory (and close the panel) the moment AI is turned off.
  useEffect(() => {
    if (!aiEnabled) {
      unload()
      setOpen(false)
    }
  }, [aiEnabled, unload])

  function handleSend() {
    const text = draft.trim()
    if (!text || sending || status !== 'ready') return
    setDraft('')
    void sendMessage(text, cards)
  }

  if (!aiEnabled) {
    return null
  }

  if (!open) {
    return (
      <button className="assistant-toggle" onClick={() => setOpen(true)}>
        <FontAwesomeIcon icon={faComment} /> Ask
      </button>
    )
  }

  return (
    <div className="assistant-panel">
      <div className="assistant-header">
        <h2>Assistant</h2>
        <button className="assistant-close" onClick={() => setOpen(false)} aria-label="Close">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="assistant-model-picker">
        {MODEL_OPTIONS.map((m) => (
          <button
            key={m.id}
            className={`assistant-model-btn${modelId === m.id ? ' active' : ''}`}
            disabled={status === 'loading'}
            title={m.blurb}
            onClick={() => void loadModel(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {status === 'loading' && (
        <div className="assistant-status">
          Loading model… {progressText}
          <div className="assistant-progress-track">
            <div className="assistant-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      )}
      {status === 'unsupported' && <div className="assistant-status">{errorMessage}</div>}
      {status === 'error' && <div className="assistant-status">Couldn't load the model: {errorMessage}</div>}

      <div className="assistant-body">
        <div className="assistant-messages">
          {messages.length === 0 && status === 'ready' && (
            <div className="assistant-empty">
              Ask me about your notes, todos, or boards, like "what should I tackle first?"
            </div>
          )}
          {messages.map((m, i) => {
            const placeholder = sending && i === messages.length - 1 ? '…' : ''
            return m.role === 'assistant' ? (
              <div
                key={i}
                className={`assistant-message ${m.role}`}
                dangerouslySetInnerHTML={{ __html: m.content ? renderAssistantMarkdown(m.content) : placeholder }}
              />
            ) : (
              <div key={i} className={`assistant-message ${m.role}`}>
                {m.content || placeholder}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="assistant-context-note">
          Sees all {cards.length} card{cards.length === 1 ? '' : 's'} in your workspace.
        </div>
        <div className="assistant-input-row">
          <textarea
            className="assistant-input"
            rows={1}
            placeholder={status === 'ready' ? 'Ask something…' : 'Waiting for the model…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            className="assistant-send"
            aria-label="Send"
            disabled={status !== 'ready' || sending || !draft.trim()}
            onClick={handleSend}
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        </div>
      </div>
    </div>
  )
}
