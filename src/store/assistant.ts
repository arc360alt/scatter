import { create } from 'zustand'
import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm'
import { DEFAULT_MODEL_ID } from '../assistant/models'
import { buildSystemPrompt } from '../assistant/context'
import type { Card } from '../types'
import { extractActions, type AssistantAction } from '../assistant/actions'
import { useUiStore } from './ui'
import { useWorkspaceStore } from './workspace'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Board changes the assistant proposed in this reply, awaiting review. */
  actions?: AssistantAction[]
  actionsState?: 'pending' | 'applied' | 'dismissed'
}

type EngineStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported'

interface AssistantState {
  status: EngineStatus
  progress: number
  progressText: string
  errorMessage: string | null
  modelId: string
  messages: ChatMessage[]
  sending: boolean
  engine: WebWorkerMLCEngine | null

  loadModel: (modelId: string) => Promise<void>
  /** A prompt waiting for the model to finish loading (sent from a card's "Ask AI" menu). */
  pendingPrompt: string | null
  sendMessage: (text: string, cards: Card[], selectedIds?: string[]) => Promise<void>
  /** Opens the panel and asks something, queueing it until the model is ready. */
  ask: (text: string) => void
  setActionsState: (index: number, state: 'applied' | 'dismissed') => void
  reset: () => void
  unload: () => void
}

const NO_WEBGPU_MESSAGE = "This browser doesn't support WebGPU, which the local AI model needs. Try the latest Chrome or Edge."

export const useAssistantStore = create<AssistantState>((set, get) => ({
  status: 'idle',
  progress: 0,
  progressText: '',
  errorMessage: null,
  modelId: DEFAULT_MODEL_ID,
  messages: [],
  sending: false,
  engine: null,
  pendingPrompt: null,

  loadModel: async (modelId) => {
    if (!('gpu' in navigator)) {
      set({ status: 'unsupported', errorMessage: NO_WEBGPU_MESSAGE })
      return
    }
    const prevEngine = get().engine
    void prevEngine?.unload().catch(() => {})
    set({ status: 'loading', progress: 0, progressText: 'Starting…', modelId, errorMessage: null, engine: null })
    try {
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm')
      const worker = new Worker(new URL('../assistant/worker.ts', import.meta.url), { type: 'module' })
      const engine = await CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: (report) => {
          set({ progress: report.progress, progressText: report.text })
        },
      })
      set({ engine, status: 'ready' })
    } catch (err) {
      set({ status: 'error', errorMessage: err instanceof Error ? err.message : String(err) })
    }
  },

  sendMessage: async (text, cards, selectedIds = []) => {
    const { engine, messages } = get()
    if (!engine || !text.trim()) return
    const userMessage: ChatMessage = { role: 'user', content: text }
    const nextMessages: ChatMessage[] = [...messages, userMessage, { role: 'assistant', content: '' }]
    set({ messages: nextMessages, sending: true })

    try {
      const stream = await engine.chat.completions.create({
        messages: [
          { role: 'system' as const, content: buildSystemPrompt(cards, selectedIds) },
          ...[...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
        ],
        stream: true,
      })
      let acc = ''
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? ''
        acc += delta
        set((s) => {
          const msgs = [...s.messages]
          msgs[msgs.length - 1] = { role: 'assistant', content: acc }
          return { messages: msgs }
        })
      }
    } catch (err) {
      set((s) => {
        const msgs = [...s.messages]
        msgs[msgs.length - 1] = {
          role: 'assistant',
          content: `Something went wrong: ${err instanceof Error ? err.message : String(err)}`,
        }
        return { messages: msgs }
      })
    } finally {
      set((s) => {
        const msgs = [...s.messages]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant') {
          const { actions } = extractActions(last.content)
          if (actions.length) msgs[msgs.length - 1] = { ...last, actions, actionsState: 'pending' }
        }
        return { messages: msgs, sending: false }
      })
    }
  },

  ask: (text) => {
    useUiStore.getState().setAssistantOpen(true)
    const { status, sending } = get()
    if (status === 'ready' && !sending) {
      const ws = useWorkspaceStore.getState()
      void get().sendMessage(text, ws.cards, ws.selectedIds)
    } else {
      set({ pendingPrompt: text })
    }
  },

  setActionsState: (index, state) =>
    set((s) => ({ messages: s.messages.map((m, i) => (i === index ? { ...m, actionsState: state } : m)) })),

  reset: () => set({ messages: [] }),

  // Frees the loaded model's memory when AI features are turned off in settings.
  unload: () => {
    const engine = get().engine
    void engine?.unload().catch(() => {})
    set({ engine: null, status: 'idle', progress: 0, progressText: '', messages: [], pendingPrompt: null })
  },
}))
