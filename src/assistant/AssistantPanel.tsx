import { useEffect, useRef, useState } from 'react'
import { Icon as FontAwesomeIcon } from '../components/Icon'
import { faCheck, faComment, faPaperPlane, faRotateLeft, faTrashCan, faWandMagicSparkles, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useAssistantStore } from '../store/assistant'
import { useWorkspaceStore } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { useUiStore } from '../store/ui'
import { useToastStore } from '../store/toast'
import { MODEL_OPTIONS } from './models'
import { renderAssistantMarkdown } from './renderMarkdown'
import { applyActions, describeAction, extractActions } from './actions'

const BOARD_PROMPTS = [
  'Summarise my board',
  'What should I tackle first?',
  "What's due soon?",
  'Plan my week as a todo list',
]

const SELECTION_PROMPTS = [
  'Summarise the selected card',
  'Break the selected card into a todo list',
  'Suggest next steps for the selected card',
]

export function AssistantPanel() {
  const open = useUiStore((s) => s.assistantOpen)
  const setOpen = useUiStore((s) => s.setAssistantOpen)
  const aiEnabled = useSettingsStore((s) => s.aiEnabled)
  const status = useAssistantStore((s) => s.status)
  const progress = useAssistantStore((s) => s.progress)
  const progressText = useAssistantStore((s) => s.progressText)
  const errorMessage = useAssistantStore((s) => s.errorMessage)
  const modelId = useAssistantStore((s) => s.modelId)
  const messages = useAssistantStore((s) => s.messages)
  const sending = useAssistantStore((s) => s.sending)
  const pendingPrompt = useAssistantStore((s) => s.pendingPrompt)
  const loadModel = useAssistantStore((s) => s.loadModel)
  const sendMessage = useAssistantStore((s) => s.sendMessage)
  const setActionsState = useAssistantStore((s) => s.setActionsState)
  const reset = useAssistantStore((s) => s.reset)
  const unload = useAssistantStore((s) => s.unload)
  const cards = useWorkspaceStore((s) => s.cards)
  const selectedIds = useWorkspaceStore((s) => s.selectedIds)
  const undo = useWorkspaceStore((s) => s.undo)

  const [draft, setDraft] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const selectedCards = cards.filter((c) => selectedIds.includes(c.id))

  useEffect(() => {
    if (open && status === 'idle') {
      void loadModel(modelId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status])

  // A prompt queued from a card's "Ask AI" menu goes out as soon as the model is ready.
  useEffect(() => {
    if (status !== 'ready' || sending || !pendingPrompt) return
    useAssistantStore.setState({ pendingPrompt: null })
    const ws = useWorkspaceStore.getState()
    void sendMessage(pendingPrompt, ws.cards, ws.selectedIds)
  }, [status, sending, pendingPrompt, sendMessage])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Free the model's memory (and close the panel) the moment AI is turned off.
  useEffect(() => {
    if (!aiEnabled) {
      unload()
      setOpen(false)
    }
  }, [aiEnabled, unload, setOpen])

  function send(text: string) {
    const t = text.trim()
    if (!t || sending || status !== 'ready') return
    setDraft('')
    void sendMessage(t, cards, selectedIds)
  }

  function apply(index: number) {
    const msg = messages[index]
    if (!msg.actions) return
    const n = applyActions(msg.actions)
    setActionsState(index, 'applied')
    useToastStore.getState().show(n ? `Applied ${n} change${n === 1 ? '' : 's'} - undo is available` : 'Nothing could be applied')
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

  const quickPrompts = selectedCards.length ? [...SELECTION_PROMPTS, ...BOARD_PROMPTS.slice(0, 2)] : BOARD_PROMPTS

  return (
    <div className="assistant-panel">
      <div className="assistant-header">
        <h2>Assistant</h2>
        <div className="assistant-header-actions">
          {messages.length > 0 && (
            <button className="assistant-close" onClick={reset} aria-label="Clear chat" title="Clear chat">
              <FontAwesomeIcon icon={faTrashCan} />
            </button>
          )}
          <button className="assistant-close" onClick={() => setOpen(false)} aria-label="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
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
          {messages.length === 0 && (
            <div className="assistant-empty">
              Ask about your cards, or ask me to change them, like "turn my notes into a todo list" or "make a board
              for my project". I'll show you the changes before anything happens.
            </div>
          )}
          {messages.map((m, i) => {
            const placeholder = sending && i === messages.length - 1 ? '…' : ''
            if (m.role === 'user') {
              return (
                <div key={i} className="assistant-message user">
                  {m.content || placeholder}
                </div>
              )
            }
            const { text } = extractActions(m.content)
            return (
              <div key={i} className="assistant-message-group">
                {(text || placeholder) && (
                  <div
                    className="assistant-message assistant"
                    dangerouslySetInnerHTML={{ __html: text ? renderAssistantMarkdown(text) : placeholder }}
                  />
                )}
                {m.actions && m.actions.length > 0 && (
                  <div className={`assistant-proposal ${m.actionsState}`}>
                    <div className="assistant-proposal-title">
                      <FontAwesomeIcon icon={faWandMagicSparkles} /> Proposed changes
                    </div>
                    <ul>
                      {m.actions.map((a, j) => (
                        <li key={j}>{describeAction(a, cards)}</li>
                      ))}
                    </ul>
                    {m.actionsState === 'pending' && (
                      <div className="assistant-proposal-buttons">
                        <button className="assistant-apply" onClick={() => apply(i)}>
                          <FontAwesomeIcon icon={faCheck} /> Apply
                        </button>
                        <button className="assistant-dismiss" onClick={() => setActionsState(i, 'dismissed')}>
                          Dismiss
                        </button>
                      </div>
                    )}
                    {m.actionsState === 'applied' && (
                      <div className="assistant-proposal-buttons">
                        <span className="assistant-proposal-status">Applied</span>
                        <button className="assistant-dismiss" onClick={undo}>
                          <FontAwesomeIcon icon={faRotateLeft} /> Undo
                        </button>
                      </div>
                    )}
                    {m.actionsState === 'dismissed' && <span className="assistant-proposal-status">Dismissed</span>}
                  </div>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {status === 'ready' && !sending && (
          <div className="assistant-chips">
            {quickPrompts.map((p) => (
              <button key={p} className="assistant-chip" onClick={() => send(p)}>
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="assistant-context-note">
          {selectedCards.length > 0
            ? `Focused on: ${selectedCards.map((c) => `"${c.title || 'Untitled'}"`).join(', ')} · sees all ${cards.length} cards`
            : `Sees all ${cards.length} card${cards.length === 1 ? '' : 's'} · select a card to focus on it`}
        </div>
        <div className="assistant-input-row">
          <textarea
            className="assistant-input"
            rows={1}
            placeholder={status === 'ready' ? 'Ask or tell me what to change…' : 'Waiting for the model…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(draft)
              }
            }}
          />
          <button
            className="assistant-send"
            aria-label="Send"
            disabled={status !== 'ready' || sending || !draft.trim()}
            onClick={() => send(draft)}
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        </div>
      </div>
    </div>
  )
}
