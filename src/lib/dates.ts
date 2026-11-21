/** YYYY-MM-DD for a Date in the local timezone (not UTC, so "today" matches the user's wall clock). */
export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  return toDateStr(new Date())
}

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export type DueStatus = 'overdue' | 'today' | 'soon' | 'later'

export function dueStatus(due: string, today = todayStr()): DueStatus {
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  const diffDays = (parseDateStr(due).getTime() - parseDateStr(today).getTime()) / 86_400_000
  return diffDays <= 3 ? 'soon' : 'later'
}

export function formatDue(due: string, today = todayStr()): string {
  if (due === today) return 'Today'
  const diffDays = Math.round((parseDateStr(due).getTime() - parseDateStr(today).getTime()) / 86_400_000)
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  return parseDateStr(due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
