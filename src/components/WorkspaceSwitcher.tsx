import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faDownload, faPen, faPlus, faUpload, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useWorkspaceRegistry } from '../store/workspaceRegistry'
import { exportWorkspace, importWorkspaceFile } from '../lib/workspaceTransfer'

export function WorkspaceSwitcher() {
  const activeId = useWorkspaceRegistry((s) => s.activeId)
  const workspaces = useWorkspaceRegistry((s) => s.workspaces)
  const switchWorkspace = useWorkspaceRegistry((s) => s.switchWorkspace)
  const createWorkspace = useWorkspaceRegistry((s) => s.createWorkspace)
  const importWorkspace = useWorkspaceRegistry((s) => s.importWorkspace)
  const renameWorkspace = useWorkspaceRegistry((s) => s.renameWorkspace)
  const deleteWorkspace = useWorkspaceRegistry((s) => s.deleteWorkspace)

  const [open, setOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [newName, setNewName] = useState('')
  const [importing, setImporting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const active = workspaces.find((w) => w.id === activeId)

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  function startRename(id: string, currentName: string) {
    setRenamingId(id)
    setDraftName(currentName)
  }

  function commitRename() {
    if (renamingId) renameWorkspace(renamingId, draftName)
    setRenamingId(null)
  }

  function submitNew() {
    const name = newName.trim()
    if (!name) return
    void createWorkspace(name)
    setNewName('')
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const { name, workspace } = await importWorkspaceFile(file)
      await importWorkspace(name, workspace)
      setOpen(false)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not import that file.')
    } finally {
      setImporting(false)
    }
  }

  if (!active) return null

  return (
    <div className="workspace-switcher" ref={rootRef}>
      <button className="workspace-switcher-trigger" onClick={() => setOpen((v) => !v)}>
        <span>{active.name}</span> <FontAwesomeIcon icon={faChevronDown} size="xs" />
      </button>
      {open && (
        <div className="workspace-switcher-menu">
          {workspaces.map((w) => (
            <div key={w.id} className={`workspace-item${w.id === activeId ? ' active' : ''}`}>
              {renamingId === w.id ? (
                <input
                  className="workspace-item-input"
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                />
              ) : (
                <button
                  className="workspace-item-name"
                  onClick={() => {
                    void switchWorkspace(w.id)
                    setOpen(false)
                  }}
                >
                  {w.name}
                </button>
              )}
              <button className="workspace-item-action" aria-label="Rename" onClick={() => startRename(w.id, w.name)}>
                <FontAwesomeIcon icon={faPen} />
              </button>
              <button
                className="workspace-item-action"
                aria-label="Export"
                title="Export to a file"
                onClick={() => void exportWorkspace(w.id, w.name)}
              >
                <FontAwesomeIcon icon={faDownload} />
              </button>
              {workspaces.length > 1 && (
                <button
                  className="workspace-item-action"
                  aria-label="Delete"
                  onClick={() => {
                    if (window.confirm(`Delete workspace "${w.name}"? This removes all its cards.`)) {
                      void deleteWorkspace(w.id)
                    }
                  }}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              )}
            </div>
          ))}
          <div className="workspace-switcher-divider" />
          <div className="workspace-new-row">
            <input
              className="workspace-new-input"
              placeholder="New workspace…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitNew()}
            />
            <button className="workspace-item-action" aria-label="Create workspace" onClick={submitNew}>
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
          <button
            className="workspace-import-btn"
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? (
              'Importing…'
            ) : (
              <>
                <FontAwesomeIcon icon={faUpload} /> Import a workspace file…
              </>
            )}
          </button>
          <input ref={importInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
        </div>
      )}
    </div>
  )
}
