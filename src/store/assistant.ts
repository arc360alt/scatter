import { create } from 'zustand'
import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm'
import { DEFAULT_MODEL_ID } from '../assistant/models'
import { buildSystemPrompt } from '../assistant/context'
import type { Card } from '../types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
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
  sendMessage: (text: string, cards: Card[]) => Promise<void>
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

  sendMessage: async (text, cards) => {
    const { engine, messages } = get()
    if (!engine || !text.trim()) return
    const userMessage: ChatMessage = { role: 'user', content: text }
    const nextMessages: ChatMessage[] = [...messages, userMessage, { role: 'assistant', content: '' }]
    set({ messages: nextMessages, sending: true })

    try {
      const stream = await engine.chat.completions.create({
        messages: [
          { role: 'system' as const, content: buildSystemPrompt(cards) },
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
      set({ sending: false })
    }
  },

  reset: () => set({ messages: [] }),

  // Frees the loaded model's memory when AI features are turned off in settings.
  unload: () => {
    const engine = get().engine
    void engine?.unload().catch(() => {})
    set({ engine: null, status: 'idle', progress: 0, progressText: '', messages: [] })
  },
}))
