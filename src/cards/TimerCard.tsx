import { useEffect, useState } from 'react'
import { Icon as FontAwesomeIcon } from '../components/Icon'
import { faForwardStep, faGear, faPause, faPlay, faRotateLeft } from '@fortawesome/free-solid-svg-icons'
import type { PomodoroPhase, TimerCard as TimerCardType, TimerMode } from '../types'
import { useWorkspaceStore } from '../store/workspace'
import { useToastStore } from '../store/toast'
import { formatDuration } from '../lib/dates'

const PHASE_LABEL: Record<PomodoroPhase, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' }

function phaseDuration(card: TimerCardType): number {
  if (card.mode === 'pomodoro') {
    const min = card.phase === 'focus' ? card.focusMin : card.phase === 'short' ? card.shortMin : card.longMin
    return min * 60_000
  }
  return card.durationMs
}

function elapsedOf(card: TimerCardType, now: number) {
  return card.elapsedMs + (card.startedAt ? now - card.startedAt : 0)
}

let audioCtx: AudioContext | null = null
function chime() {
  try {
    audioCtx ??= new AudioContext()
    const ctx = audioCtx
    ;[0, 0.22, 0.44].forEach((t, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = [660, 880, 990][i]
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.4)
    })
  } catch {
    /* audio unavailable - the toast still shows */
  }
}

function notify(message: string) {
  useToastStore.getState().show(message, 6000)
  chime()
  if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try {
      new Notification('Scatter', { body: message })
    } catch {
      /* some mobile browsers only allow notifications via a service worker */
    }
  }
}

export function TimerCard({ card }: { card: TimerCardType }) {
  const updateCard = useWorkspaceStore((s) => s.updateCard)
  const [now, setNow] = useState(() => Date.now())
  const [showSettings, setShowSettings] = useState(false)
  const [editingDuration, setEditingDuration] = useState(false)
  const [durationDraft, setDurationDraft] = useState('')
  const running = card.startedAt !== null

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [running])

  const total = phaseDuration(card)
  const elapsed = elapsedOf(card, running ? now : 0)
  const remaining = Math.max(0, total - elapsed)
  const countsDown = card.mode !== 'stopwatch'

  // Completion. Re-reads the live card from the store so a double effect run
  // (StrictMode, or two renders racing) can only complete it once.
  useEffect(() => {
    if (!running || !countsDown || remaining > 0) return
    const live = useWorkspaceStore.getState().cards.find((c) => c.id === card.id) as TimerCardType | undefined
    if (!live || live.startedAt === null) return
    if (live.mode === 'pomodoro') {
      const finishedFocus = live.phase === 'focus'
      const completedFocus = live.completedFocus + (finishedFocus ? 1 : 0)
      const next: PomodoroPhase = finishedFocus ? (completedFocus % 4 === 0 ? 'long' : 'short') : 'focus'
      updateCard<TimerCardType>(card.id, { startedAt: null, elapsedMs: 0, phase: next, completedFocus })
      notify(
        finishedFocus
          ? `Focus session done${live.title ? ` (${live.title})` : ''} - time for a ${next === 'long' ? 'long' : 'short'} break.`
          : 'Break over - ready to focus?'
      )
    } else {
      updateCard<TimerCardType>(card.id, { startedAt: null, elapsedMs: live.durationMs })
      notify(`Time's up${live.title && live.title !== 'Timer' ? `: ${live.title}` : ''}!`)
    }
  }, [running, countsDown, remaining, card.id, updateCard])

  function start() {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
    // A finished countdown restarts from the top.
    const elapsedMs = countsDown && remaining <= 0 ? 0 : card.elapsedMs
    setNow(Date.now())
    updateCard<TimerCardType>(card.id, { startedAt: Date.now(), elapsedMs })
  }

  function pause() {
    updateCard<TimerCardType>(card.id, { startedAt: null, elapsedMs: elapsedOf(card, Date.now()) })
  }

  function reset() {
    updateCard<TimerCardType>(card.id, { startedAt: null, elapsedMs: 0 })
  }

  function skip() {
    const finishedFocus = card.phase === 'focus'
    const next: PomodoroPhase = finishedFocus ? ((card.completedFocus + 1) % 4 === 0 ? 'long' : 'short') : 'focus'
    updateCard<TimerCardType>(card.id, { startedAt: null, elapsedMs: 0, phase: next })
  }

  function setMode(mode: TimerMode) {
    updateCard<TimerCardType>(card.id, {
      mode,
      startedAt: null,
      elapsedMs: 0,
      title: card.title === 'Pomodoro' || card.title === 'Timer' || card.title === 'Stopwatch'
        ? mode === 'pomodoro' ? 'Pomodoro' : mode === 'countdown' ? 'Timer' : 'Stopwatch'
        : card.title,
    })
  }

  function commitDuration() {
    setEditingDuration(false)
    // Accepts "10", "10:30", "1:00:00".
    const parts = durationDraft.split(':').map((p) => Number(p.trim()))
    if (!parts.length || parts.some((p) => !Number.isFinite(p) || p < 0)) return
    let ms = 0
    if (parts.length === 1) ms = parts[0] * 60_000
    else if (parts.length === 2) ms = (parts[0] * 60 + parts[1]) * 1000
    else ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
    if (ms > 0) updateCard<TimerCardType>(card.id, { durationMs: Math.min(ms, 24 * 3600_000), elapsedMs: 0, startedAt: null })
  }

  const progress = countsDown ? (total ? 1 - remaining / total : 0) : (elapsed % 60_000) / 60_000
  const R = 52
  const C = 2 * Math.PI * R
  const display = countsDown ? formatDuration(remaining) : formatDuration(elapsed)

  return (
    <div className={`timer-card${running ? ' running' : ''} phase-${card.mode === 'pomodoro' ? card.phase : 'none'}`}>
      <div className="timer-modes">
        {(['pomodoro', 'countdown', 'stopwatch'] as TimerMode[]).map((m) => (
          <button key={m} className={card.mode === m ? 'active' : ''} onClick={() => setMode(m)}>
            {m === 'pomodoro' ? 'Pomodoro' : m === 'countdown' ? 'Timer' : 'Stopwatch'}
          </button>
        ))}
      </div>

      <div className="timer-dial">
        <svg viewBox="0 0 120 120" aria-hidden>
          <circle className="timer-track" cx="60" cy="60" r={R} />
          <circle
            className="timer-progress"
            cx="60"
            cy="60"
            r={R}
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="timer-readout">
          {editingDuration ? (
            <input
              className="timer-duration-input"
              autoFocus
              value={durationDraft}
              placeholder="mm:ss"
              onChange={(e) => setDurationDraft(e.target.value)}
              onBlur={commitDuration}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDuration()
                if (e.key === 'Escape') setEditingDuration(false)
              }}
            />
          ) : (
            <button
              className="timer-time"
              disabled={card.mode !== 'countdown' || running}
              title={card.mode === 'countdown' && !running ? 'Click to set the time' : undefined}
              onClick={() => {
                setDurationDraft(formatDuration(card.durationMs))
                setEditingDuration(true)
              }}
            >
              {display}
            </button>
          )}
          {card.mode === 'pomodoro' && (
            <span className="timer-phase">
              {PHASE_LABEL[card.phase]} · {card.completedFocus} done
            </span>
          )}
          {card.mode === 'countdown' && !running && remaining <= 0 && <span className="timer-phase">Done!</span>}
        </div>
      </div>

      <div className="timer-controls">
        <button className="timer-btn" onClick={reset} title="Reset" aria-label="Reset">
          <FontAwesomeIcon icon={faRotateLeft} />
        </button>
        <button className="timer-btn timer-main" onClick={running ? pause : start} aria-label={running ? 'Pause' : 'Start'}>
          <FontAwesomeIcon icon={running ? faPause : faPlay} />
        </button>
        {card.mode === 'pomodoro' ? (
          <button className="timer-btn" onClick={skip} title="Skip to next phase" aria-label="Skip">
            <FontAwesomeIcon icon={faForwardStep} />
          </button>
        ) : card.mode === 'countdown' ? (
          <button className="timer-btn" onClick={() => setShowSettings((v) => !v)} title="Presets" aria-label="Presets">
            <FontAwesomeIcon icon={faGear} />
          </button>
        ) : (
          <span className="timer-btn-spacer" />
        )}
        {card.mode === 'pomodoro' && (
          <button className="timer-btn" onClick={() => setShowSettings((v) => !v)} title="Lengths" aria-label="Session lengths">
            <FontAwesomeIcon icon={faGear} />
          </button>
        )}
      </div>

      {showSettings && card.mode === 'pomodoro' && (
        <div className="timer-settings">
          {(
            [
              ['focusMin', 'Focus'],
              ['shortMin', 'Short'],
              ['longMin', 'Long'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={1}
                max={180}
                value={card[key]}
                onChange={(e) =>
                  updateCard<TimerCardType>(card.id, { [key]: Math.max(1, Math.min(180, Number(e.target.value) || 1)) })
                }
              />
              min
            </label>
          ))}
        </div>
      )}
      {showSettings && card.mode === 'countdown' && (
        <div className="timer-settings">
          {[1, 5, 10, 15, 30, 60].map((m) => (
            <button
              key={m}
              className="timer-preset"
              onClick={() => {
                updateCard<TimerCardType>(card.id, { durationMs: m * 60_000, elapsedMs: 0, startedAt: null })
                setShowSettings(false)
              }}
            >
              {m}m
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
