import { useState } from 'react'
import { useCloudStore } from '../store/cloud'

export function ConflictModal() {
  const conflict = useCloudStore((s) => s.conflict)
  const resolveConflict = useCloudStore((s) => s.resolveConflict)
  const [resolving, setResolving] = useState(false)

  if (!conflict) return null

  async function choose(which: 'local' | 'cloud') {
    setResolving(true)
    await resolveConflict(which)
    setResolving(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel conflict-panel">
        <div className="modal-header">
          <h2>Which version?</h2>
        </div>
        <div className="modal-body">
          <p className="settings-hint">
            "{conflict.workspaceName}" has changed on both this device and your account. Pick which one to keep -
            the other will be overwritten.
          </p>
          <div className="conflict-options">
            <button className="conflict-option" disabled={resolving} onClick={() => void choose('local')}>
              <strong>This device</strong>
              <span>{conflict.localCardCount} card{conflict.localCardCount === 1 ? '' : 's'}</span>
            </button>
            <button className="conflict-option" disabled={resolving} onClick={() => void choose('cloud')}>
              <strong>Cloud</strong>
              <span>{conflict.cloudCardCount} card{conflict.cloudCardCount === 1 ? '' : 's'}</span>
              <span className="settings-collapsible-hint">
                Saved {new Date(conflict.cloudUpdatedAt).toLocaleString()}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
