import { useCallback, useEffect, useState } from 'react'
import type { HistoryItem, Settings } from '../../shared/types'
import { DurationPicker, formatDuration } from './DurationPicker'
import { History, Thumb } from './History'
import { Icon, type IconName } from './icons'
import { SettingsPage } from './SettingsPage'

type Page = 'home' | 'history' | 'settings'
const NAV: [Page, IconName, string][] = [
  ['home', 'home', 'Início'],
  ['history', 'history', 'Histórico'],
  ['settings', 'settings', 'Definições']
]
const QUALITY = { high: 'Alta', medium: 'Média', low: 'Baixa' }

export function Kbd({ combo }: { combo: string }) {
  if (!combo) return <span className="muted">—</span>
  return <span className="kbd-combo">{combo.split('+').map((k) => <kbd key={k}>{k === 'Super' ? 'Win' : k}</kbd>)}</span>
}

export function App() {
  const [page, setPage] = useState<Page>('home')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [shortcutErrors, setShortcutErrors] = useState<string[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])

  const loadSettings = useCallback(() => window.api.getSettings().then((r) => {
    setSettings(r.settings)
    setShortcutErrors(r.shortcutErrors)
  }), [])
  const loadHistory = useCallback(() => window.api.listHistory().then(setHistory), [])

  useEffect(() => {
    loadSettings()
    loadHistory()
    const offs = [
      window.api.on('history-changed', loadHistory),
      window.api.on('settings-changed', loadSettings),
      window.api.on('navigate', (p: Page) => setPage(p))
    ]
    return () => offs.forEach((off) => off())
  }, [loadSettings, loadHistory])

  const update = async (patch: Partial<Settings>) => {
    const r = await window.api.setSettings(patch)
    setSettings(r.settings)
    setShortcutErrors(r.shortcutErrors)
  }

  if (!settings) return null

  return (
    <div className="app">
      <header className="titlebar">
        <img src="./icon.svg" alt="" width={18} height={18} />
        <span>Smart Capture</span>
      </header>
      <nav className="sidebar" aria-label="Navegação">
        {NAV.map(([id, icon, label]) => (
          <button key={id} className={'nav-item' + (page === id ? ' active' : '')} aria-current={page === id ? 'page' : undefined}
            onClick={() => setPage(id)}>
            <Icon name={icon} /> {label}
          </button>
        ))}
      </nav>
      <main className="content">
        {page === 'home' && <Home settings={settings} history={history} update={update} go={setPage} shortcutErrors={shortcutErrors} />}
        {page === 'history' && <History items={history} />}
        {page === 'settings' && <SettingsPage settings={settings} update={update} shortcutErrors={shortcutErrors} />}
      </main>
    </div>
  )
}

function Home({ settings, history, update, go, shortcutErrors }: {
  settings: Settings
  history: HistoryItem[]
  update: (p: Partial<Settings>) => void
  go: (p: Page) => void
  shortcutErrors: string[]
}) {
  const sc = settings.shortcuts
  return (
    <div className="page fade-in">
      <section>
        <h1>O que pretendes fazer?</h1>
        <div className="action-cards">
          <button className="action-card" onClick={() => window.api.startCapture('screenshot')}>
            <span className="action-icon"><Icon name="camera" size={22} /></span>
            <strong>Screenshot</strong>
            <span>Capturar imagem de uma região</span>
          </button>
          <button className="action-card" onClick={() => window.api.startCapture('record')}>
            <span className="action-icon rec"><Icon name="video" size={22} /></span>
            <strong>Gravar vídeo</strong>
            <span>Gravar só a região selecionada · {formatDuration(settings.defaultDuration)}</span>
          </button>
        </div>
      </section>

      <section>
        <h2>Duração da gravação</h2>
        <DurationPicker value={settings.defaultDuration} onChange={(v) => update({ defaultDuration: v })} />
        <p className="meta-line">
          {settings.fps} FPS · {settings.videoFormat.toUpperCase()} · Qualidade {QUALITY[settings.quality].toLowerCase()} ·{' '}
          Áudio {settings.audioEnabled && settings.audioDevice ? 'ligado' : 'desligado'}
          <button className="link" onClick={() => go('settings')}>Alterar</button>
        </p>
      </section>

      <section className="shortcut-hints">
        <div><Kbd combo={sc.capture} /> Nova captura</div>
        <div><Kbd combo={sc.record} /> Gravar região</div>
        <div><Kbd combo={sc.pause} /> Pausar / retomar</div>
        <div><kbd>Esc</kbd> Cancelar</div>
        {shortcutErrors.length > 0 && (
          <p className="warning" role="alert">
            Não foi possível registar: {shortcutErrors.join(', ')} (em uso por outra aplicação). Escolhe outro atalho nas Definições.
          </p>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Recentes</h2>
          {history.length > 0 && <button className="link" onClick={() => go('history')}>Ver tudo</button>}
        </div>
        {history.length === 0 ? (
          <p className="empty-state">Ainda não há capturas. Carrega em <Kbd combo={sc.capture} /> para começar.</p>
        ) : (
          <div className="recent-strip">
            {history.slice(0, 4).map((h) => (
              <button key={h.id} className="recent" onClick={() => window.api.openItem(h.id)} title={h.path}>
                <Thumb item={h} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
