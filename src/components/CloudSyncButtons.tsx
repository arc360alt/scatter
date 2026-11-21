import { Icon as FontAwesomeIcon } from './Icon'
import { faCloudArrowDown, faCloudArrowUp, faSpinner } from '@fortawesome/free-solid-svg-icons'
import { useCloudStore } from '../store/cloud'

export function CloudSyncButtons() {
  const configured = useCloudStore((s) => s.configured)
  const session = useCloudStore((s) => s.session)
  const saving = useCloudStore((s) => s.saving)
  const loadingWorkspace = useCloudStore((s) => s.loadingWorkspace)
  const saveOnCooldown = useCloudStore((s) => s.saveOnCooldown)
  const loadOnCooldown = useCloudStore((s) => s.loadOnCooldown)
  const hasUnsavedChanges = useCloudStore((s) => s.hasUnsavedChanges)
  const saveNow = useCloudStore((s) => s.saveNow)
  const loadNow = useCloudStore((s) => s.loadNow)

  if (!configured || !session) return null

  return (
    <div className="cloud-sync-buttons">
      {/* Only disabled while a request is actually in flight - kept clickable during
          the cooldown itself so the click reaches saveNow/loadNow's own cooldown
          check, which is what shows the "try again in Xs" toast. A disabled button
          wouldn't fire onClick at all, leaving a cooldown click silently ignored. */}
      <button
        className={`cloud-sync-btn${hasUnsavedChanges ? ' pending' : ''}${saveOnCooldown ? ' cooldown' : ''}`}
        aria-label="Save to cloud"
        title={
          saveOnCooldown
            ? 'Save to cloud - wait a bit before syncing again'
            : hasUnsavedChanges
              ? 'Save to cloud - unsaved changes'
              : 'Save to cloud'
        }
        disabled={saving}
        onClick={() => void saveNow()}
      >
        <FontAwesomeIcon icon={saving ? faSpinner : faCloudArrowUp} spin={saving} />
      </button>
      <button
        className={`cloud-sync-btn${loadOnCooldown ? ' cooldown' : ''}`}
        aria-label="Load from cloud"
        title={loadOnCooldown ? 'Load from cloud - wait a bit before syncing again' : 'Load from cloud'}
        disabled={loadingWorkspace}
        onClick={() => void loadNow()}
      >
        <FontAwesomeIcon icon={loadingWorkspace ? faSpinner : faCloudArrowDown} spin={loadingWorkspace} />
      </button>
    </div>
  )
}
