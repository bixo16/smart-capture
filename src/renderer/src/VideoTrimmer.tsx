import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { HistoryItem } from '../../shared/types'
import { Icon } from './icons'

const fmt = (s: number) => {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}
const errorText = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Video player with an in/out range: drag the handles (or use I / O at the playhead) and save the part. */
export function VideoTrimmer({ item }: { item: HistoryItem }) {
  const video = useRef<HTMLVideoElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [duration, setDuration] = useState((item.durationMs ?? 0) / 1000)
  const [range, setRange] = useState<[number, number]>([0, duration])
  const [now, setNow] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const drag = useRef<0 | 1 | null>(null)

  const timeAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration
  }
  const seek = (t: number) => {
    if (video.current) video.current.currentTime = t
  }
  const setEdge = (edge: 0 | 1, t: number) =>
    setRange(([a, b]) => (edge === 0 ? [Math.min(t, b - 0.1), b] : [a, Math.max(t, a + 0.1)]))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'i' || e.key === 'I') setEdge(0, video.current?.currentTime ?? 0)
      else if (e.key === 'o' || e.key === 'O') setEdge(1, video.current?.currentTime ?? duration)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duration])

  const onPointerDown = (e: RPointerEvent) => {
    const t = timeAt(e.clientX)
    const handle = (e.target as HTMLElement).dataset.edge
    if (handle) {
      drag.current = Number(handle) as 0 | 1
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } else seek(t)
  }
  const onPointerMove = (e: RPointerEvent) => {
    if (drag.current === null) return
    const t = timeAt(e.clientX)
    setEdge(drag.current, t)
    seek(t)
  }

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await window.api.trimItem(item.id, range[0], range[1])
      setMessage({ ok: true, text: 'Guardado como um novo vídeo no Histórico. O original não foi alterado.' })
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const pct = (t: number) => `${duration ? (t / duration) * 100 : 0}%`
  const whole = range[0] <= 0.05 && range[1] >= duration - 0.05

  return (
    <>
      <video ref={video} src={`media://${item.id}/`} controls autoPlay
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          // MediaRecorder-style files can report Infinity; keep the probed duration then.
          if (Number.isFinite(d) && d > 0) {
            setDuration(d)
            setRange([0, d])
          }
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime
          setNow(t)
          // Loop inside the selection while editing, so you hear what you'll keep.
          if (!whole && t >= range[1]) seek(range[0])
        }} />
      <div className="trimmer">
        <div ref={track} className="trim-track" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}>
          <div className="trim-range" style={{ left: pct(range[0]), width: `calc(${pct(range[1])} - ${pct(range[0])})` }} />
          <div className="trim-playhead" style={{ left: pct(now) }} />
          {([0, 1] as const).map((edge) => (
            <div key={edge} data-edge={edge} className="trim-handle" style={{ left: pct(range[edge]) }}
              role="slider" tabIndex={0} aria-label={edge === 0 ? 'Início do corte' : 'Fim do corte'}
              aria-valuemin={0} aria-valuemax={Math.round(duration * 10) / 10} aria-valuenow={Math.round(range[edge] * 10) / 10}
              aria-valuetext={fmt(range[edge])}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 1 : 0.1
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault()
                  const t = Math.max(0, Math.min(duration, range[edge] + (e.key === 'ArrowLeft' ? -step : step)))
                  setEdge(edge, t)
                  seek(t)
                }
              }} />
          ))}
        </div>
        <div className="trim-controls">
          <button onClick={() => setEdge(0, now)} title="Início no ponto atual (I)"><kbd>I</kbd> Início aqui</button>
          <span className="trim-times">{fmt(range[0])} → {fmt(range[1])} <small>({fmt(range[1] - range[0])})</small></span>
          <button onClick={() => setEdge(1, now)} title="Fim no ponto atual (O)"><kbd>O</kbd> Fim aqui</button>
          <span className="spacer" />
          <button className="primary" disabled={busy || whole} onClick={save}>
            <Icon name="scissors" size={16} /> {busy ? 'A aparar…' : 'Guardar parte'}
          </button>
        </div>
        {message && <p className={message.ok ? 'trim-ok' : 'trim-error'} role="status">{message.text}</p>}
      </div>
    </>
  )
}
