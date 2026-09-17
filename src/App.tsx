import { useEffect } from 'react'
import { Canvas } from './canvas/Canvas'
import { Toolbar } from './components/Toolbar'
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher'
import { ConflictModal } from './components/ConflictModal'
import { CloudSyncButtons } from './components/CloudSyncButtons'
import { Toast } from './components/Toast'
import { AssistantPanel } from './assistant/AssistantPanel'
import { useWorkspaceStore } from './store/workspace'
import { useWorkspaceRegistry } from './store/workspaceRegistry'
import { loadSettings, useSettingsStore } from './store/settings'
import { useCloudStore } from './store/cloud'

export default function App() {
  const hydrated = useWorkspaceStore((s) => s.hydrated)
  const initRegistry = useWorkspaceRegistry((s) => s.init)
  const initCloud = useCloudStore((s) => s.init)

  const settingsHydrated = useSettingsStore((s) => s.hydrated)
  const hydrateSettings = useSettingsStore((s) => s.hydrate)
  const fontId = useSettingsStore((s) => s.fontId)
  const theme = useSettingsStore((s) => s.theme)
  const background = useSettingsStore((s) => s.background)
  const glassUI = useSettingsStore((s) => s.glassUI)

  useEffect(() => {
    void initRegistry()
  }, [initRegistry])

  useEffect(() => {
    void initCloud()
  }, [initCloud])

  useEffect(() => {
    void loadSettings().then(hydrateSettings)
  }, [hydrateSettings])

  useEffect(() => {
    if (!settingsHydrated) return
    document.documentElement.setAttribute('data-font', fontId)
  }, [settingsHydrated, fontId])

  useEffect(() => {
    if (!settingsHydrated) return
    const root = document.documentElement
    function applyResolvedTheme() {
      const resolved =
        theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
      root.setAttribute('data-theme', resolved)
    }
    applyResolvedTheme()
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', applyResolvedTheme)
    return () => mq.removeEventListener('change', applyResolvedTheme)
  }, [settingsHydrated, theme])

  // Only the preset-color CSS variables are applied here; the actual visual
  // background (including the camera-following dot texture, or a custom image)
  // is rendered by Canvas.tsx itself, since it needs the live pan offset.
  useEffect(() => {
    if (!settingsHydrated || background.type !== 'preset') return
    document.documentElement.setAttribute('data-bg', background.id)
  }, [settingsHydrated, background])

  useEffect(() => {
    if (!settingsHydrated) return
    document.documentElement.toggleAttribute('data-glass', glassUI)
  }, [settingsHydrated, glassUI])

  if (!hydrated) {
    return null
  }

  return (
    <div className="app">
      <WorkspaceSwitcher />
      <Toolbar />
      <Canvas />
      <AssistantPanel />
      <ConflictModal />
      <CloudSyncButtons />
      <Toast />
    </div>
  )
}
