import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { CaptureAction, CaptureMode } from '../../shared/types'
import { DurationPicker } from './DurationPicker'
import { Icon } from './icons'

type Rect = { x: number; y: number; w: number; h: number }
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Drag = { kind: 'new' | 'move' | Handle; sx: number; sy: number; start: Rect }

const params = new URLSearchParams(location.hash.split('?')[1])
const displayId = Number(params.get('display'))
const scale = Number(params.get('scale')) || 1
const mode = (params.get('mode') ?? 'choose') as CaptureMode
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const MIN = 4

function applyDrag(d: Drag, x: number, y: number): Rect {
  const W = window.innerWidth
  const H = window.innerHeight
  const cx = Math.max(0, Math.min(W, x))
  const cy = Math.max(0, Math.min(H, y))
  if (d.kind === 'new') {
    return { x: Math.min(d.sx, cx), y: Math.min(d.sy, cy), w: Math.abs(cx - d.sx), h: Math.abs(cy - d.sy) }
  }
  const s = d.start
  const dx = x - d.sx
  const dy = y - d.sy
  if (d.kind === 'move') {
    return { ...s, x: Math.max(0, Math.min(W - s.w, s.x + dx)), y: Math.max(0, Math.min(H - s.h, s.y + dy)) }
  }
  let l = s.x, t = s.y, r = s.x + s.w, b = s.y + s.h
  if (d.kind.includes('w')) l = Math.max(0, Math.min(W, l + dx))
  if (d.kind.includes('e')) r = Math.max(0, Math.min(W, r + dx))
  if (d.kind.includes('n')) t = Math.max(0, Math.min(H, t + dy))
  if (d.kind.includes('s')) b = Math.max(0, Math.min(H, b + dy))
  return { x: Math.min(l, r), y: Math.min(t, b), w: Math.abs(r - l), h: Math.abs(b - t) }
}

export function Overlay() {
  const [rect, setRect] = useState<Rect | null>(null)
  const [dragging, setDragging] = useState(false)
  const [duration, setDuration] = useState(30)
  const drag = useRef<Drag | null>(null)
  const sent = useRef(false)

  useEffect(() => {
    window.api.getSettings().then((r) => setDuration(r.settings.defaultDuration))
  }, [])

  const finish = (action: CaptureAction, r: Rect | null = rect) => {
    if (!r || sent.current) return
    sent.current = true
    window.api.selectRegion({ displayId, rect: { x: r.x, y: r.y, width: r.w, height: r.h }, action, durationSec: duration })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.api.cancelCapture()
      else if (e.key === 'Enter' && rect && !(e.target instanceof HTMLInputElement)) finish(mode === 'record' ? 'record' : 'screenshot')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onPointerDown = (e: RPointerEvent) => {
    if (e.button !== 0) return
    const handle = (e.target as HTMLElement).dataset.handle as Handle | undefined
    const inside = rect && e.clientX >= rect.x && e.clientX <= rect.x + rect.w && e.clientY >= rect.y && e.clientY <= rect.y + rect.h
    const kind = handle ?? (inside ? 'move' : 'new')
    drag.current = { kind, sx: e.clientX, sy: e.clientY, start: rect ?? { x: e.clientX, y: e.clientY, w: 0, h: 0 } }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
    if (kind === 'new') setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }

  const onPointerMove = (e: RPointerEvent) => {
    if (drag.current) setRect(applyDrag(drag.current, e.clientX, e.clientY))
  }

  const onPointerUp = (e: RPointerEvent) => {
    if (!drag.current) return
    const r = applyDrag(drag.current, e.clientX, e.clientY)
    drag.current = null
    setDragging(false)
    if (r.w < MIN || r.h < MIN) return setRect(null)
    setRect(r)
    // Direct modes (from the home buttons / record hotkey) act as soon as the area is drawn.
    if (mode !== 'choose') finish(mode, r)
  }

  const toolbarStyle = (() => {
    if (!rect) return {}
    const W = 640
    const H = 120
    const left = Math.max(12, Math.min(window.innerWidth - W - 12, rect.x + rect.w / 2 - W / 2))
    let top = rect.y + rect.h + 12
    if (top + H > window.innerHeight) top = rect.y - H - 12
    if (top < 12) top = rect.y + rect.h - H - 12
    return { left, top: Math.max(12, top), width: W }
  })()

  return (
    <div className={'overlay' + (rect ? '' : ' empty')} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onContextMenu={() => window.api.cancelCapture()}>
      {!rect && !dragging && (
        <div className="overlay-hint">
          {mode === 'record' ? 'Seleciona a área a gravar' : mode === 'screenshot' ? 'Seleciona a área a capturar' : 'Arrasta para selecionar uma área'}
          <span>Esc para cancelar</span>
        </div>
      )}
      {rect && (
        <div className="selection" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
          <div className="size-label">{Math.round(rect.w * scale)} × {Math.round(rect.h * scale)}</div>
          {!dragging && HANDLES.map((h) => <div key={h} data-handle={h} className={`handle h-${h}`} />)}
        </div>
      )}
      {rect && !dragging && mode === 'choose' && (
        <div className="capture-toolbar" style={toolbarStyle} onPointerDown={(e) => e.stopPropagation()}>
          <div className="toolbar-row">
            <button className="primary" onClick={() => finish('screenshot')} autoFocus>
              <Icon name="camera" /> Screenshot
            </button>
            <button className="record" onClick={() => finish('record')}>
              <Icon name="video" /> Gravar
            </button>
            <span className="spacer" />
            <button className="icon-btn" title="Cancelar (Esc)" aria-label="Cancelar" onClick={() => window.api.cancelCapture()}>
              <Icon name="x" />
            </button>
          </div>
          <DurationPicker value={duration} onChange={setDuration} />
        </div>
      )}
    </div>
  )
}
