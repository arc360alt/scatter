export interface ModelOption {
  id: string
  label: string
  blurb: string
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    label: 'Fast',
    blurb: '~0.9GB download, quick to load, good for quick questions.',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Balanced',
    blurb: '~1.3GB download, a bit sharper reasoning than Fast.',
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    label: 'Capable',
    blurb: '~2.4GB download, best answers, needs a decent GPU.',
  },
]

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id
