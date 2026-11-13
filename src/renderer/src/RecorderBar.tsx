import { useEffect, useState } from 'react'
import type { RecorderState } from '../../shared/types'
import { formatClock } from './DurationPicker'
import { Icon } from './icons'

export function RecorderBar() {
  const [state, setState] = useState<RecorderState>({ status: 'starting', elapsedMs: 0, since: null, limitMs: null })
  const [, tick] = useState(0)

  useEffect(() => window.api.on('recorder-state', setState), [])
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 200)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        window.api.recorderToggle()
      } else if (e.key === 'Escape') window.api.recorderStop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const elapsed = state.elapsedMs + (state.since ? Date.now() - state.since : 0)
  const limited = state.limitMs !== null
  const shown = limited ? state.limitMs! - elapsed : elapsed
  const progress = limited ? Math.min(1, elapsed / state.limitMs!) : 0
  const label = { starting: 'A iniciar…', recording: limited ? 'Restante' : 'A gravar', paused: 'Em pausa', saving: 'A guardar…' }[state.status]
  const busy = state.status === 'starting' || state.status === 'saving'

  return (
    <div className={`recorder ${state.status}`}>
      <span className="rec-dot" aria-hidden="true" />
      <div className="rec-time">
        <strong>{formatClock(shown)}</strong>
        <small>{label}</small>
      </div>
      <div className="rec-actions">
        <button className="icon-btn" disabled={busy} onClick={() => window.api.recorderToggle()}
          title={state.status === 'paused' ? 'Retomar (Espaço)' : 'Pausar (Espaço)'}
          aria-label={state.status === 'paused' ? 'Retomar' : 'Pausar'}>
          <Icon name={state.status === 'paused' ? 'play' : 'pause'} filled size={16} />
        </button>
        <button className="icon-btn stop" disabled={state.status === 'saving'} onClick={() => window.api.recorderStop()}
          title="Terminar e guardar (Esc)" aria-label="Terminar e guardar">
          <Icon name="stop" filled size={16} />
        </button>
        <button className="icon-btn" disabled={state.status === 'saving'} onClick={() => window.api.recorderCancel()}
          title="Descartar gravação" aria-label="Descartar gravação">
          <Icon name="x" size={16} />
        </button>
      </div>
      {limited && <div className="rec-progress" style={{ transform: `scaleX(${progress})` }} />}
    </div>
  )
}
