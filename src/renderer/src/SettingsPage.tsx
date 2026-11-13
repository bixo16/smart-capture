import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Settings, Shortcuts } from '../../shared/types'
import { Kbd } from './App'
import { DurationPicker } from './DurationPicker'
import { Icon, type IconName } from './icons'

type Update = (p: Partial<Settings>) => void

function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  )
}

function Card({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="settings-card">
      <h2><Icon name={icon} /> {title}</h2>
      {children}
    </section>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
}

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', PrintScreen: 'PrintScreen',
  Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Tab: 'Tab'
}

/** KeyboardEvent → Electron accelerator ("Ctrl+Shift+S"), or null if not a usable combo yet. */
function toAccelerator(e: KeyboardEvent): string | null {
  let key: string | undefined
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5)
  else if (/^F\d{1,2}$/.test(e.key)) key = e.key
  else key = KEY_NAMES[e.key]
  if (!key) return null
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean)
  if (!mods.length && !/^F\d|PrintScreen/.test(key)) return null // bare letters would hijack typing system-wide
  return [...mods, key].join('+')
}

function ShortcutInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [listening, setListening] = useState(false)
  return (
    <button
      className={'shortcut-input' + (listening ? ' listening' : '')}
      aria-label={`${label}: ${value || 'nenhum'}. Clica e prime a nova combinação.`}
      onFocus={() => { setListening(true); window.api.suspendShortcuts(true) }}
      onBlur={() => { setListening(false); window.api.suspendShortcuts(false) }}
      onKeyDown={(e) => {
        if (e.key === 'Tab') return
        e.preventDefault()
        if (e.key === 'Escape') return (e.currentTarget as HTMLButtonElement).blur()
        if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
          onChange('')
          return (e.currentTarget as HTMLButtonElement).blur()
        }
        const acc = toAccelerator(e)
        if (acc) {
          onChange(acc)
          ;(e.currentTarget as HTMLButtonElement).blur()
        }
      }}>
      {listening ? 'Prime a combinação…' : <Kbd combo={value} />}
    </button>
  )
}

export function SettingsPage({ settings: s, update, shortcutErrors }: { settings: Settings; update: Update; shortcutErrors: string[] }) {
  const [devices, setDevices] = useState<string[] | null>(null)
  const loadDevices = () => {
    setDevices(null)
    window.api.listAudioDevices().then(setDevices)
  }
  useEffect(loadDevices, [])
  const setShortcut = (k: keyof Shortcuts, v: string) => update({ shortcuts: { ...s.shortcuts, [k]: v } })

  return (
    <div className="page fade-in">
      <h1>Definições</h1>

      <Card icon="folder" title="Ficheiros">
        <Row label="Pasta predefinida" hint={s.saveFolder}>
          <button onClick={async () => { const f = await window.api.chooseFolder(); if (f) update({ saveFolder: f }) }}>Alterar…</button>
          <button onClick={() => window.api.openFolder()}>Abrir</button>
        </Row>
        <Row label="Formato das imagens">
          <Segmented label="Formato das imagens" value={s.imageFormat} options={[['png', 'PNG'], ['jpg', 'JPG']]} onChange={(v) => update({ imageFormat: v })} />
        </Row>
        <Row label="Copiar screenshots para a área de transferência">
          <Toggle label="Copiar screenshots" checked={s.copyToClipboard} onChange={(v) => update({ copyToClipboard: v })} />
        </Row>
      </Card>

      <Card icon="video" title="Gravação">
        <Row label="Formato do vídeo" hint="MP4 (H.264) é o mais compatível">
          <Segmented label="Formato do vídeo" value={s.videoFormat} options={[['mp4', 'MP4'], ['webm', 'WebM']]} onChange={(v) => update({ videoFormat: v })} />
        </Row>
        <Row label="Qualidade">
          <Segmented label="Qualidade" value={s.quality} options={[['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']]} onChange={(v) => update({ quality: v })} />
        </Row>
        <Row label="Frames por segundo">
          <Segmented label="FPS" value={s.fps} options={[[30, '30 FPS'], [60, '60 FPS']]} onChange={(v) => update({ fps: v })} />
        </Row>
        <div className="row column">
          <div className="row-label"><span>Duração predefinida</span></div>
          <DurationPicker value={s.defaultDuration} onChange={(v) => update({ defaultDuration: v })} />
        </div>
      </Card>

      <Card icon="mic" title="Áudio">
        <Row label="Gravar áudio" hint="Microfone, ou “Mistura estéreo” para o som do sistema">
          <Toggle label="Gravar áudio" checked={s.audioEnabled} onChange={(v) => update({ audioEnabled: v })} />
        </Row>
        {s.audioEnabled && (
          <Row label="Dispositivo">
            <select value={s.audioDevice} onChange={(e) => update({ audioDevice: e.target.value })} aria-label="Dispositivo de áudio">
              <option value="">{devices === null ? 'A procurar…' : devices.length ? 'Escolher…' : 'Nenhum dispositivo encontrado'}</option>
              {devices?.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button className="icon-btn" title="Atualizar lista" aria-label="Atualizar lista de dispositivos" onClick={loadDevices}>
              <Icon name="history" size={16} />
            </button>
          </Row>
        )}
      </Card>

      <Card icon="keyboard" title="Atalhos de teclado">
        <Row label="Nova captura" hint="Seleciona a área e escolhe Screenshot ou Gravar. Durante uma gravação, termina-a.">
          <ShortcutInput label="Nova captura" value={s.shortcuts.capture} onChange={(v) => setShortcut('capture', v)} />
        </Row>
        <Row label="Gravar diretamente" hint="Começa a gravar assim que a área é selecionada">
          <ShortcutInput label="Gravar diretamente" value={s.shortcuts.record} onChange={(v) => setShortcut('record', v)} />
        </Row>
        <Row label="Pausar / retomar" hint="Ativo apenas durante a gravação. Espaço também funciona na barra.">
          <ShortcutInput label="Pausar / retomar" value={s.shortcuts.pause} onChange={(v) => setShortcut('pause', v)} />
        </Row>
        {shortcutErrors.length > 0 && (
          <p className="warning" role="alert">
            Em uso por outra aplicação ou pelo Windows: {shortcutErrors.join(', ')}. (Win+Shift+S está reservado à Ferramenta de Recorte.)
          </p>
        )}
      </Card>

      <Card icon="palette" title="Aparência">
        <Row label="Tema">
          <Segmented label="Tema" value={s.theme} options={[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']]} onChange={(v) => update({ theme: v })} />
        </Row>
      </Card>
    </div>
  )
}
