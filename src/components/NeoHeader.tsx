import { useEffect, useRef, useState } from 'react'
import { faCircleInfo, faDownload, faGear, faKeyboard } from '@fortawesome/free-solid-svg-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons'
import { Icon } from './Icon'
import { Toolbar } from './Toolbar'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { CloudSyncButtons } from './CloudSyncButtons'
import { useUiStore } from '../store/ui'
import { useSettingsStore } from '../store/settings'
import { exportBoardPng } from '../lib/exportBoard'

/** The NeoKit app header (same layout as the other NeoKit apps): logo menu and
 * workspace on the left, the board toolbar in the middle, sync/theme/settings on the right. */
export function NeoHeader() {
  const openSettings = useUiStore((s) => s.openSettings)
  return (
    <header className="neo-header">
      <div className="neo-header-left">
        <LogoMenu />
        <WorkspaceSwitcher />
      </div>
      <div className="neo-header-center">
        <Toolbar />
      </div>
      <nav className="neo-header-right">
        <CloudSyncButtons />
        <ThemeToggle />
        <button className="neo-icon-btn" aria-label="Settings" title="Settings" onClick={() => openSettings()}>
          <Icon icon={faGear} />
        </button>
      </nav>
    </header>
  )
}

function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const resolved =
    theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
  return (
    <button
      className="neo-icon-btn"
      aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={resolved === 'dark' ? 'Light theme' : 'Dark theme'}
      onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
    >
      <HugeiconsIcon icon={resolved === 'dark' ? Sun03Icon : Moon02Icon} size="1.1rem" strokeWidth={1.6} />
    </button>
  )
}

function LogoMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const openSettings = useUiStore((s) => s.openSettings)
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)

  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item = (label: string, icon: typeof faGear, run: () => void) => (
    <button
      role="menuitem"
      className="neo-menu-item"
      onClick={() => {
        setOpen(false)
        run()
      }}
    >
      <Icon icon={icon} /> {label}
    </button>
  )

  return (
    <div className="neo-logo-menu" ref={ref}>
      <button
        className="neo-icon-btn neo-logo-btn"
        aria-label="Scatter menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon={faCircleInfo} />
      </button>
      {open && (
        <div className="neo-menu" role="menu">
          {item('Keyboard shortcuts', faKeyboard, () => setShortcutsOpen(true))}
          {item('Export board as PNG', faDownload, () => void exportBoardPng())}
          <div className="neo-menu-sep" />
          {item('Settings', faGear, () => openSettings('general'))}
          {item('About Scatter', faCircleInfo, () => openSettings('about'))}
        </div>
      )}
    </div>
  )
}
