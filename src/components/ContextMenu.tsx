import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faAlignCenter,
  faAlignLeft,
  faAlignRight,
  faArrowDown,
  faArrowLeft,
  faArrowRightLong,
  faArrowUp,
  faArrowsLeftRight,
  faArrowsUpDown,
  faChevronRight,
  faClone,
  faCopy,
  faCrosshairs,
  faDownload,
  faFileImage,
  faFileLines,
  faFilePdf,
  faLayerGroup,
  faLock,
  faLockOpen,
  faMagnet,
  faMap,
  faObjectGroup,
  faPaintbrush,
  faPlus,
  faRotateLeft,
  faRotateRight,
  faTableCellsLarge,
  faThumbtack,
  faTrashCan,
  faObjectUngroup,
  faWandMagicSparkles,
  faArrowsLeftRightToLine,
  faTag,
  faKeyboard,
} from '@fortawesome/free-solid-svg-icons'
import { useUiStore, type ContextMenuState } from '../store/ui'
import { useWorkspaceStore, type AlignMode } from '../store/workspace'
import { useSettingsStore } from '../store/settings'
import { useAssistantStore } from '../store/assistant'
import { ADD_ENTRIES, CARD_COLORS } from '../lib/cardFactory'
import { addEntryAt, deleteSelection, fitAll } from '../lib/boardActions'
import { TEMPLATES, insertTemplate } from '../lib/templates'
import { cardsInGroup } from '../lib/geometry'
import {
  copyCardMarkdown,
  exportBoardMarkdown,
  exportBoardPdf,
  exportBoardPng,
  exportCardMarkdown,
  exportCardPng,
} from '../lib/exportBoard'
import { shortcutHint } from '../lib/shortcuts'
import type { CardColor, Connector } from '../types'

type Page = 'root' | 'add' | 'templates' | 'export' | 'arrange' | 'ai' | 'label'

interface Item {
  label: string
  icon?: IconDefinition
  hint?: string
  onSelect?: () => void
  page?: Page
  danger?: boolean
  disabled?: boolean
  /** Extra control at the end of the row (e.g. a pin toggle). */
  trailing?: ReactNode
  keepOpen?: boolean
}

type Row = Item | 'divider' | { custom: ReactNode; key: string }

export function ContextMenu() {
  const menu = useUiStore((s) => s.contextMenu)
  // Remount per opening so the page/position state starts fresh.
  return menu ? <ContextMenuInner key={`${menu.x},${menu.y},${JSON.stringify(menu.target)}`} menu={menu} /> : null
}

function ContextMenuInner({ menu }: { menu: ContextMenuState }) {
  const close = useUiStore((s) => s.closeContextMenu)
  const openDrawingEditor = useUiStore((s) => s.openDrawingEditor)
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)
  const editMode = useSettingsStore((s) => s.editMode)
  const quickAdd = useSettingsStore((s) => s.quickAdd)
  const toggleQuickAdd = useSettingsStore((s) => s.toggleQuickAdd)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const toggleSnap = useSettingsStore((s) => s.toggleSnapToGrid)
  const showMinimap = useSettingsStore((s) => s.showMinimap)
  const toggleMinimap = useSettingsStore((s) => s.toggleMinimap)
  const shortcuts = useSettingsStore((s) => s.shortcuts)
  const aiEnabled = useSettingsStore((s) => s.aiEnabled)
  const ws = useWorkspaceStore()
  const ask = useAssistantStore((s) => s.ask)

  const [pages, setPages] = useState<Page[]>(['root'])
  const page = pages[pages.length - 1]
  const setPage = (p: Page) => setPages((stack) => [...stack, p])
  const back = () => setPages((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack))
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: menu.x, top: menu.y, ready: false })

  const target = menu.target
  const targetCard = target.kind === 'card' ? ws.cards.find((c) => c.id === target.id) : undefined
  const selection =
    target.kind === 'selection' ? ws.cards.filter((c) => ws.selectedIds.includes(c.id)) : targetCard ? [targetCard] : []
  const selIds = selection.map((c) => c.id)
  const connector: Connector | undefined =
    target.kind === 'connector' ? ws.connectors.find((k) => k.id === target.id) : undefined
  const worldPoint = target.kind === 'canvas' ? { x: target.worldX, y: target.worldY } : undefined

  // Keep the menu fully on screen, flipping up/left near the edges.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 8
    let left = menu.x
    let top = menu.y
    if (left + r.width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - r.width - margin)
    if (top + r.height > window.innerHeight - margin) top = Math.max(margin, menu.y - r.height)
    if (top + r.height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - r.height - margin)
    setPos({ left, top, ready: true })
  }, [menu.x, menu.y, page])

  function run(item: Item) {
    if (item.disabled) return
    if (item.page) {
      setPage(item.page)
      return
    }
    item.onSelect?.()
    if (!item.keepOpen) close()
  }

  const colorRow = (ids: string[], current?: CardColor): Row => ({
    key: 'colors',
    custom: (
      <div className="ctx-colors">
        {CARD_COLORS.map((c) => (
          <button
            key={c}
            className={`ctx-color${current === c ? ' active' : ''}`}
            style={{ background: `var(--${c})` }}
            aria-label={c}
            onClick={() => {
              ws.setColor(ids, c)
              close()
            }}
          />
        ))}
      </div>
    ),
  })

  let rows: Row[] = []
  let heading: string | null = null

  if (page === 'add') {
    heading = 'Add a card'
    rows = ADD_ENTRIES.map((e) => ({
      label: e.label,
      icon: e.icon,
      hint: shortcutHint(`add:${e.id}`, shortcuts),
      onSelect: () => addEntryAt(e.id, worldPoint),
      trailing: (
        <button
          className={`ctx-pin${quickAdd.includes(e.id) ? ' pinned' : ''}`}
          title={quickAdd.includes(e.id) ? 'Unpin from toolbar' : 'Pin to toolbar'}
          aria-label={quickAdd.includes(e.id) ? `Unpin ${e.label} from toolbar` : `Pin ${e.label} to toolbar`}
          onClick={(ev) => {
            ev.stopPropagation()
            toggleQuickAdd(e.id)
          }}
        >
          <FontAwesomeIcon icon={faThumbtack} />
        </button>
      ),
    }))
    rows.push('divider', { label: 'From a template…', icon: faLayerGroup, page: 'templates' })
  } else if (page === 'templates') {
    heading = 'Templates'
    rows = TEMPLATES.map((t) => ({ label: t.name, icon: t.icon, hint: '', onSelect: () => insertTemplate(t, worldPoint) }))
  } else if (page === 'export') {
    heading = targetCard ? 'Export card' : 'Export board'
    rows = targetCard
      ? [
          { label: 'Image (PNG)', icon: faFileImage, onSelect: () => void exportCardPng(targetCard.id) },
          { label: 'Markdown file', icon: faFileLines, onSelect: () => exportCardMarkdown(targetCard.id) },
          { label: 'Copy as Markdown', icon: faCopy, onSelect: () => void copyCardMarkdown(targetCard.id) },
        ]
      : [
          { label: 'Image (PNG)', icon: faFileImage, hint: shortcutHint('exportPng', shortcuts), onSelect: () => void exportBoardPng() },
          { label: 'PDF', icon: faFilePdf, onSelect: () => void exportBoardPdf() },
          { label: 'Markdown', icon: faFileLines, onSelect: exportBoardMarkdown },
        ]
  } else if (page === 'arrange') {
    heading = 'Align & distribute'
    const align = (mode: AlignMode) => () => ws.alignCards(selIds, mode)
    rows = [
      { label: 'Align left edges', icon: faAlignLeft, onSelect: align('left') },
      { label: 'Align centers', icon: faAlignCenter, onSelect: align('hcenter') },
      { label: 'Align right edges', icon: faAlignRight, onSelect: align('right') },
      'divider',
      { label: 'Align top edges', icon: faArrowUp, onSelect: align('top') },
      { label: 'Align middles', icon: faArrowsUpDown, onSelect: align('vcenter') },
      { label: 'Align bottom edges', icon: faArrowDown, onSelect: align('bottom') },
      'divider',
      { label: 'Space evenly across', icon: faArrowsLeftRight, onSelect: () => ws.distributeCards(selIds, 'h'), disabled: selIds.length < 3 },
      { label: 'Space evenly down', icon: faArrowsUpDown, onSelect: () => ws.distributeCards(selIds, 'v'), disabled: selIds.length < 3 },
    ]
  } else if (page === 'label' && connector) {
    heading = 'Arrow label'
    rows = [
      {
        key: 'label-input',
        custom: (
          <form
            className="ctx-label-form"
            onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.elements.namedItem('label') as HTMLInputElement
              ws.updateConnector(connector.id, { label: input.value.trim() })
              close()
            }}
          >
            <input name="label" className="todo-add-input" autoFocus defaultValue={connector.label} placeholder="e.g. leads to" />
            <button type="submit" className="link-card-save">
              Save
            </button>
          </form>
        ),
      },
    ]
  } else if (page === 'ai' && targetCard) {
    heading = 'Ask the assistant'
    const name = `"${targetCard.title || 'this card'}"`
    const q = (text: string) => () => ask(text)
    rows = [
      { label: 'Summarise it', icon: faWandMagicSparkles, onSelect: q(`Summarise the selected card ${name}.`) },
      {
        label: 'Turn it into a todo list',
        icon: faWandMagicSparkles,
        onSelect: q(`Turn the selected card ${name} into a new todo list of concrete tasks.`),
      },
      {
        label: 'Break it into tasks on a board',
        icon: faWandMagicSparkles,
        onSelect: q(`Break the selected card ${name} down into tasks and create a kanban board for them.`),
      },
      { label: 'Suggest next steps', icon: faWandMagicSparkles, onSelect: q(`What should I do next with ${name}?`) },
    ]
  } else if (target.kind === 'canvas') {
    rows = [
      ...(editMode
        ? ([
            { label: 'Add card', icon: faPlus, page: 'add' },
            { label: 'Insert template', icon: faLayerGroup, page: 'templates' },
            'divider',
          ] as Row[])
        : []),
      { label: 'Undo', icon: faRotateLeft, hint: shortcutHint('undo', shortcuts), onSelect: ws.undo, disabled: !ws.canUndo },
      { label: 'Redo', icon: faRotateRight, hint: shortcutHint('redo', shortcuts), onSelect: ws.redo, disabled: !ws.canRedo },
      { label: 'Select all', icon: faObjectUngroup, hint: shortcutHint('selectAll', shortcuts), onSelect: ws.selectAll, disabled: !ws.cards.length },
      'divider',
      { label: 'Fit all cards in view', icon: faCrosshairs, hint: shortcutHint('fitAll', shortcuts), onSelect: fitAll },
      { label: showMinimap ? 'Hide minimap' : 'Show minimap', icon: faMap, onSelect: toggleMinimap },
      { label: snapToGrid ? 'Snap to grid: on' : 'Snap to grid: off', icon: faMagnet, onSelect: toggleSnap },
      { label: 'Export board', icon: faDownload, page: 'export' },
      { label: 'Keyboard shortcuts', icon: faKeyboard, hint: shortcutHint('shortcuts', shortcuts), onSelect: () => setShortcutsOpen(true) },
    ]
  } else if (target.kind === 'connector' && connector) {
    heading = 'Arrow'
    const set = (patch: Partial<Connector>) => () => ws.updateConnector(connector.id, patch)
    rows = [
      { label: 'Arrow at the end', icon: faArrowRightLong, onSelect: set({ ends: 'end' }), disabled: !editMode },
      { label: 'Arrows at both ends', icon: faArrowsLeftRight, onSelect: set({ ends: 'both' }), disabled: !editMode },
      { label: 'Plain line', icon: faArrowsLeftRightToLine, onSelect: set({ ends: 'none' }), disabled: !editMode },
      { label: 'Reverse direction', icon: faRotateRight, onSelect: () => reverse(connector), disabled: !editMode },
      { label: connector.label ? 'Edit label' : 'Add label', icon: faTag, disabled: !editMode, page: 'label' },
      {
        key: 'conn-colors',
        custom: (
          <div className="ctx-colors">
            {(['ink', ...CARD_COLORS] as Connector['color'][]).map((c) => (
              <button
                key={c}
                className={`ctx-color${connector.color === c ? ' active' : ''}`}
                style={{ background: c === 'ink' ? 'var(--ink)' : `var(--${c})` }}
                aria-label={c}
                disabled={!editMode}
                onClick={() => {
                  ws.updateConnector(connector.id, { color: c })
                  close()
                }}
              />
            ))}
          </div>
        ),
      },
      'divider',
      { label: 'Delete arrow', icon: faTrashCan, danger: true, onSelect: () => ws.deleteConnector(connector.id), disabled: !editMode },
    ]
  } else if (selection.length) {
    const multi = selection.length > 1
    const allLocked = selection.every((c) => c.locked)
    heading = multi ? `${selection.length} cards` : null
    rows = [
      ...(targetCard?.type === 'drawing' && editMode
        ? ([{ label: 'Edit drawing', icon: faPaintbrush, onSelect: () => openDrawingEditor(targetCard.id) }, 'divider'] as Row[])
        : []),
      ...(editMode ? [colorRow(selIds, multi ? undefined : selection[0].color)] : []),
      ...(editMode
        ? ([
            { label: 'Duplicate', icon: faClone, hint: shortcutHint('duplicate', shortcuts), onSelect: () => ws.duplicateCards(selIds) },
            {
              label: allLocked ? 'Unlock position' : 'Lock position',
              icon: allLocked ? faLockOpen : faLock,
              hint: shortcutHint('lock', shortcuts),
              onSelect: () => ws.setLocked(selIds, !allLocked),
            },
          ] as Row[])
        : []),
      ...(!multi && targetCard && editMode
        ? ([
            {
              label: 'Draw arrow to…',
              icon: faArrowRightLong,
              hint: shortcutHint('connect', shortcuts),
              onSelect: () => ws.startConnecting(targetCard.id),
            },
          ] as Row[])
        : []),
      ...(multi && editMode
        ? ([
            { label: 'Align & distribute', icon: faTableCellsLarge, page: 'arrange' },
            { label: 'Group into a frame', icon: faObjectGroup, hint: shortcutHint('group', shortcuts), onSelect: () => ws.groupCards(selIds) },
          ] as Row[])
        : []),
      ...(!multi && targetCard
        ? ([
            { label: 'Bring to front', icon: faArrowUp, hint: shortcutHint('front', shortcuts), onSelect: () => ws.bringToFront(targetCard.id) },
            { label: 'Send to back', icon: faArrowDown, hint: shortcutHint('back', shortcuts), onSelect: () => ws.sendToBack(targetCard.id) },
          ] as Row[])
        : []),
      ...(!multi && targetCard
        ? ([
            {
              label: 'Select (add more after)',
              icon: faObjectUngroup,
              hint: 'Shift+click',
              onSelect: () => ws.setSelection([...new Set([...ws.selectedIds, targetCard.id])]),
            },
          ] as Row[])
        : []),
      'divider',
      ...(!multi && targetCard && aiEnabled && targetCard.type !== 'group'
        ? ([{ label: 'Ask AI about this', icon: faWandMagicSparkles, page: 'ai' }] as Row[])
        : []),
      ...(!multi && targetCard ? ([{ label: 'Export', icon: faDownload, page: 'export' }] as Row[]) : []),
      ...(editMode
        ? ([
            'divider',
            {
              label: multi ? `Delete ${selection.length} cards` : 'Delete',
              icon: faTrashCan,
              hint: shortcutHint('delete', shortcuts),
              danger: true,
              disabled: allLocked,
              onSelect: () => {
                ws.setSelection(selIds)
                deleteSelection()
              },
            },
            ...(!multi && targetCard?.type === 'group'
              ? [
                  {
                    label: 'Delete group + cards inside',
                    icon: faTrashCan,
                    danger: true,
                    disabled: targetCard.locked,
                    onSelect: () => {
                      const inside = cardsInGroup(targetCard, ws.cards)
                      const n = inside.length
                      if (window.confirm(`Delete "${targetCard.title || 'Group'}" and the ${n} card${n === 1 ? '' : 's'} inside it?`)) {
                        ws.deleteCards([targetCard.id, ...inside.map((c) => c.id)])
                      }
                    },
                  },
                ]
              : []),
          ] as Row[])
        : []),
    ]
  }

  function reverse(k: Connector) {
    useWorkspaceStore.setState((s) => ({
      connectors: s.connectors.map((c) => (c.id === k.id ? { ...c, from: k.to, to: k.from } : c)),
    }))
  }

  // Trim leading/trailing/double dividers left by conditional sections.
  rows = rows.filter((r, i, arr) => r !== 'divider' || (i > 0 && i < arr.length - 1 && arr[i - 1] !== 'divider'))

  return (
    <>
      <div
        className="ctx-backdrop"
        onPointerDown={close}
        onContextMenu={(e) => {
          e.preventDefault()
          close()
        }}
      />
      <div
        ref={ref}
        className={`ctx-menu${menu.touch ? ' touch' : ''}`}
        role="menu"
        style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {(page !== 'root' || heading) && (
          <div className="ctx-heading">
            {page !== 'root' && (
              <button
                className="ctx-back"
                aria-label="Back"
                onClick={back}
              >
                <FontAwesomeIcon icon={faArrowLeft} />
              </button>
            )}
            <span>{heading}</span>
          </div>
        )}
        <div className="ctx-items">
          {rows.map((r, i) => {
            if (r === 'divider') return <div key={`d${i}`} className="ctx-divider" />
            if ('custom' in r) return <div key={r.key}>{r.custom}</div>
            return (
              <div key={r.label} className="ctx-row">
                <button
                  role="menuitem"
                  className={`ctx-item${r.danger ? ' danger' : ''}`}
                  disabled={r.disabled}
                  onClick={() => run(r)}
                >
                  <span className="ctx-icon">{r.icon && <FontAwesomeIcon icon={r.icon} />}</span>
                  <span className="ctx-label">{r.label}</span>
                  {r.hint && <span className="ctx-hint">{r.hint}</span>}
                  {r.page && <FontAwesomeIcon className="ctx-chevron" icon={faChevronRight} />}
                </button>
                {r.trailing}
              </div>
            )
          })}
        </div>
        {page === 'add' && <div className="ctx-footnote">Pin a card type to show it in the toolbar.</div>}
      </div>
    </>
  )
}

