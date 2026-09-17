export function SettingsToggle({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string
  hint: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="settings-toggle-row">
      <div>
        <div className="settings-toggle-label">{label}</div>
        <div className="settings-toggle-hint">{hint}</div>
      </div>
      <button
        className={`settings-switch${checked ? ' on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
      />
    </div>
  )
}
