import { useState } from 'react'

const PRESETS: [number, string][] = [
  [5, '5s'], [10, '10s'], [15, '15s'], [30, '30s'], [60, '1 min'], [120, '2 min'], [300, '5 min'], [0, 'Ilimitado']
]

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return h ? `${h}:${mmss}` : mmss
}

export function formatDuration(sec: number): string {
  if (sec === 0) return 'Ilimitado'
  return PRESETS.find(([v]) => v === sec)?.[1] ?? formatClock(sec * 1000)
}

/** Seconds; 0 = unlimited. */
export function DurationPicker({ value, onChange }: { value: number; onChange: (sec: number) => void }) {
  const isPreset = PRESETS.some(([v]) => v === value)
  const [custom, setCustom] = useState(!isPreset)
  const min = Math.floor(value / 60)
  const sec = value % 60
  const setCustomValue = (m: number, s: number) => {
    const total = Math.max(0, Math.min(999, m || 0)) * 60 + Math.max(0, Math.min(59, s || 0))
    onChange(Math.max(1, total))
  }
  return (
    <div className="duration">
      <div className="chips" role="radiogroup" aria-label="Duração da gravação">
        {PRESETS.map(([v, label]) => (
          <button key={v} role="radio" aria-checked={!custom && value === v}
            className={'chip' + (!custom && value === v ? ' active' : '')}
            onClick={() => { setCustom(false); onChange(v) }}>
            {label}
          </button>
        ))}
        <button role="radio" aria-checked={custom} className={'chip' + (custom ? ' active' : '')}
          onClick={() => { setCustom(true); if (value === 0) onChange(90) }}>
          Personalizada
        </button>
      </div>
      {custom && (
        <div className="custom-duration">
          <label>
            <input type="number" min={0} max={999} value={min} aria-label="Minutos"
              onChange={(e) => setCustomValue(Number(e.target.value), sec)} />
            min
          </label>
          <label>
            <input type="number" min={0} max={59} value={sec} aria-label="Segundos"
              onChange={(e) => setCustomValue(min, Number(e.target.value))} />
            s
          </label>
        </div>
      )}
    </div>
  )
}
