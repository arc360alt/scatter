import { useEffect } from 'react'
import { Canvas } from './canvas/Canvas'
import { Toolbar } from './components/Toolbar'
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher'
import { ConflictModal } from './components/ConflictModal'
import { CloudSyncButtons } from './components/CloudSyncButtons'
import { NeoHeader } from './components/NeoHeader'
import { Toast } from './components/Toast'
import { AssistantPanel } from './assistant/AssistantPanel'
import { useWorkspaceStore } from './store/workspace'
import { useWorkspaceRegistry } from './store/workspaceRegistry'
import { loadSettings, useSettingsStore } from './store/settings'
import { useCloudStore } from './store/cloud'
import { useUiStore } from './store/ui'
import { useToastStore } from './store/toast'
import { ContextMenu } from './components/ContextMenu'
import { SearchBar } from './components/SearchBar'
import { ShortcutsModal } from './components/ShortcutsModal'
import { DialogHost } from './components/DialogHost'
import { SettingsModal } from './components/SettingsModal'
import { DrawingEditor } from './drawing/DrawingEditor'
import { installGlobalShortcuts } from './lib/shortcuts'
import { installPasteHandlers } from './lib/paste'
import { todayStr } from './lib/dates'
import type { Card } from './types'

/** Counts unfinished todo/board items that are due today or already overdue. */
function countDue(cards: Card[]) {
  const today = todayStr()
  let dueToday = 0
  let overdue = 0
  for (const c of cards) {
    const items =
      c.type === 'todo'
        ? c.items.filter((i) => !i.done)
        : c.type === 'kanban'
          ? Object.values(c.items).filter((i) => !c.columns[c.columns.length - 1]?.itemIds.includes(i.id))
          : []
    for (const i of items) {
      if (!i.due) continue
      if (i.due === today) dueToday++
      else if (i.due < today) overdue++
    }
  }
  return { dueToday, overdue }
}

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
  const uiMode = useSettingsStore((s) => s.uiMode)
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId)
  const drawingEditorId = useUiStore((s) => s.drawingEditorId)

  useEffect(() => installGlobalShortcuts(), [])
  useEffect(() => installPasteHandlers(), [])

  // A gentle heads-up about due items whenever a workspace is opened.
  useEffect(() => {
    if (!hydrated) return
    const { dueToday, overdue } = countDue(useWorkspaceStore.getState().cards)
    if (!dueToday && !overdue) return
    const parts = [dueToday && `${dueToday} due today`, overdue && `${overdue} overdue`].filter(Boolean)
    const t = setTimeout(() => useToastStore.getState().show(`Heads up: ${parts.join(', ')}`, 5000), 800)
    return () => clearTimeout(t)
  }, [hydrated, currentWorkspaceId])

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
    // Glass is a Classic-only look; NeoKit panels are always solid.
    document.documentElement.toggleAttribute('data-glass', glassUI && uiMode === 'classic')
  }, [settingsHydrated, glassUI, uiMode])

  useEffect(() => {
    if (!settingsHydrated) return
    document.documentElement.setAttribute('data-ui', uiMode)
  }, [settingsHydrated, uiMode])

  if (!hydrated) {
    return null
  }

  return (
    <div className="app">
      {uiMode === 'neokit' ? (
        <NeoHeader />
      ) : (
        <>
          <WorkspaceSwitcher />
          <Toolbar />
        </>
      )}
      <Canvas />
      <SearchBar />
      <AssistantPanel />
      <ContextMenu />
      <SettingsModal />
      <ShortcutsModal />
      <DialogHost />
      {drawingEditorId && <DrawingEditor key={drawingEditorId} cardId={drawingEditorId} />}
      <ConflictModal />
      {uiMode === 'classic' && <CloudSyncButtons />}
      <Toast />
    </div>
  )
}
