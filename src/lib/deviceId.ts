import { makeId } from './id'

const DEVICE_ID_KEY = 'scatter-device-id'

/** A random id identifying this browser install, persisted outside any account -
 * used to tell devices apart in the "logged in devices" list. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = makeId()
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    // localStorage unavailable (private mode, disabled) - fall back to a per-session id
    return makeId()
  }
}

/** A short human-readable label like "Chrome on macOS" for the devices list. */
export function getDeviceLabel(): string {
  const ua = navigator.userAgent

  let browser = 'Unknown browser'
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Chrome/') || ua.includes('Chromium/')) browser = 'Chrome'
  else if (ua.includes('Safari/')) browser = 'Safari'

  let os = 'Unknown OS'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS X')) os = 'macOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Linux')) os = 'Linux'

  return `${browser} on ${os}`
}
