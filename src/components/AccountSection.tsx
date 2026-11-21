import { useState } from 'react'
import { Icon as FontAwesomeIcon } from './Icon'
import { faRightFromBracket, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons'
import { QUOTA_CAP_BYTES, useCloudStore } from '../store/cloud'
import { getDeviceId } from '../lib/deviceId'
import { formatBytes } from '../lib/formatBytes'
import {
  CLOUD_AUTO_SAVE_MAX_MINUTES,
  CLOUD_AUTO_SAVE_MIN_MINUTES,
  useSettingsStore,
} from '../store/settings'
import { SettingsToggle } from './SettingsToggle'
import { confirmDialog } from '../store/dialog'

export function AccountSection() {
  const configured = useCloudStore((s) => s.configured)
  const session = useCloudStore((s) => s.session)
  const authLoading = useCloudStore((s) => s.authLoading)
  const authError = useCloudStore((s) => s.authError)
  const usageBytes = useCloudStore((s) => s.usageBytes)
  const quotaExceeded = useCloudStore((s) => s.quotaExceeded)
  const devices = useCloudStore((s) => s.devices)
  const signUp = useCloudStore((s) => s.signUp)
  const signIn = useCloudStore((s) => s.signIn)
  const signOut = useCloudStore((s) => s.signOut)
  const deleteAccount = useCloudStore((s) => s.deleteAccount)
  const kickDevice = useCloudStore((s) => s.kickDevice)
  const autoSaveEnabled = useSettingsStore((s) => s.cloudAutoSaveEnabled)
  const toggleAutoSave = useSettingsStore((s) => s.toggleCloudAutoSave)
  const autoSaveMinutes = useSettingsStore((s) => s.cloudAutoSaveIntervalMinutes)
  const setAutoSaveMinutes = useSettingsStore((s) => s.setCloudAutoSaveIntervalMinutes)

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (!configured) {
    return (
      <section className="settings-section">
        <h3>Account</h3>
        <p className="settings-hint">Cloud sync isn't configured for this deployment.</p>
      </section>
    )
  }

  function submitAuth() {
    // Checked against live store state, not the render-time `authLoading` closure above -
    // React state updates aren't synchronous, so a second Enter/click right after the first
    // (key repeat, a stray double keydown, whatever) could otherwise fire before the button
    // visually disables, sending two requests (and, e.g., burning through Supabase's email
    // rate limit on a single "one" signup attempt).
    if (useCloudStore.getState().authLoading) return
    if (!email.trim() || !password) return
    if (mode === 'signup') void signUp(email.trim(), password)
    else void signIn(email.trim(), password)
  }

  if (!session) {
    return (
      <section className="settings-section">
        <h3>Account</h3>
        <p className="settings-hint">Log in to sync your workspaces and images across devices.</p>
        <div className="account-form">
          <input
            className="account-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="account-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitAuth()}
          />
          {authError && <p className="account-error">{authError}</p>}
          <div className="account-form-row">
            <button className="settings-upload-btn" disabled={authLoading} onClick={submitAuth}>
              {authLoading ? 'Working…' : mode === 'signup' ? 'Sign up' : 'Log in'}
            </button>
            <button
              className="account-mode-toggle"
              onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
            >
              {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </button>
          </div>
        </div>
      </section>
    )
  }

  const usagePct = Math.min(100, (usageBytes / QUOTA_CAP_BYTES) * 100)
  const currentDeviceId = getDeviceId()

  return (
    <section className="settings-section">
      <h3>Account</h3>
      <p className="settings-hint">{session.user.email}</p>

      <div className="account-usage">
        <div className="account-usage-track">
          <div
            className={`account-usage-fill${quotaExceeded ? ' over' : usagePct > 85 ? ' warn' : ''}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <span className="settings-collapsible-hint">
          {formatBytes(usageBytes)} / {formatBytes(QUOTA_CAP_BYTES)}
        </span>
      </div>
      {quotaExceeded && (
        <p className="account-error">
          You're out of cloud storage. Delete some notes, images, or workspaces to keep syncing - your local data
          on this device is unaffected.
        </p>
      )}

      <SettingsToggle
        label="Auto-save to cloud"
        hint="Periodically push changes to the cloud in the background. Manual save/load buttons work either way."
        checked={autoSaveEnabled}
        onToggle={toggleAutoSave}
      />
      {autoSaveEnabled && (
        <div className="account-sync-interval">
          <label htmlFor="cloud-autosave-minutes">Auto-save every</label>
          <input
            id="cloud-autosave-minutes"
            className="account-input account-sync-interval-input"
            type="number"
            min={CLOUD_AUTO_SAVE_MIN_MINUTES}
            max={CLOUD_AUTO_SAVE_MAX_MINUTES}
            value={autoSaveMinutes}
            onChange={(e) => {
              const value = Number.parseInt(e.target.value, 10)
              if (Number.isFinite(value)) setAutoSaveMinutes(value)
            }}
          />
          <span>minutes (when there are unsaved changes)</span>
        </div>
      )}

      <div className="account-form-row">
        <button className="settings-upload-btn" onClick={() => void signOut()}>
          <FontAwesomeIcon icon={faRightFromBracket} /> Log out
        </button>
        <button
          className="settings-upload-btn"
          onClick={() => {
            void confirmDialog({
              title: 'Delete your account?',
              message:
                "This permanently removes your cloud data. This device's local data stays untouched. It can't be undone.",
              confirmLabel: 'Delete account',
              danger: true,
            }).then((ok) => {
              if (ok) void deleteAccount()
            })
          }}
        >
          <FontAwesomeIcon icon={faTrash} /> Delete account
        </button>
      </div>

      {devices.length > 0 && (
        <div className="account-devices">
          <h4 className="account-devices-heading">Devices</h4>
          {devices.map((d) => (
            <div key={d.id} className="account-device-row">
              <div>
                <div className="account-device-label">
                  {d.label}
                  {d.device_id === currentDeviceId && <span className="account-device-tag">this device</span>}
                </div>
                <div className="settings-collapsible-hint">
                  Last seen {new Date(d.last_seen_at).toLocaleString()}
                </div>
              </div>
              {d.device_id !== currentDeviceId && (
                <button className="workspace-item-action" aria-label="Kick out device" onClick={() => void kickDevice(d.id)}>
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
