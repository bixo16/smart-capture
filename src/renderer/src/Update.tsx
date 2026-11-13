import { useEffect, useState } from 'react'
import type { UpdateState } from '../../shared/types'
import { Icon } from './icons'

export function useUpdateState(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    window.api.getUpdateState().then(setState)
    return window.api.on('update-state', setState)
  }, [])
  return state
}

export function updateLabel(s: UpdateState): string {
  switch (s.status) {
    case 'unsupported': return 'As atualizações só funcionam na versão instalada.'
    case 'checking': return 'A procurar atualizações…'
    case 'latest': return 'Tens a versão mais recente.'
    case 'available': return `Nova versão disponível: ${s.latest}`
    case 'downloading': return `A transferir a versão ${s.latest}… ${s.percent ?? 0}%`
    case 'ready': return `A versão ${s.latest} está pronta. Reinicia para atualizar.`
    case 'installing': return 'A instalar… a app vai reiniciar.'
    case 'error': return `Não foi possível atualizar: ${s.error ?? 'erro desconhecido'}`
    default: return ''
  }
}

/**
 * Sidebar (compact) and Settings button. Downloads run by themselves in the background;
 * once ready, one click restarts into the new version.
 */
export function UpdateButton({ state, compact }: { state: UpdateState; compact?: boolean }) {
  const { status } = state
  if (status === 'downloading' || status === 'installing') {
    return (
      <button className={'update-btn' + (compact ? ' compact' : '')} disabled aria-live="polite">
        <Icon name="save" size={16} />
        {status === 'installing' ? 'A instalar…' : `A transferir ${state.latest}… ${state.percent ?? 0}%`}
        {status === 'downloading' && <span className="update-progress" style={{ transform: `scaleX(${(state.percent ?? 0) / 100})` }} />}
      </button>
    )
  }
  if (status === 'ready' || ((status === 'available' || status === 'error') && state.latest)) {
    return (
      <button className={'primary update-btn' + (compact ? ' compact ready' : '')} onClick={() => window.api.installUpdate()}
        title={status === 'ready' ? `Reinicia a app e instala a versão ${state.latest}` : undefined}>
        <Icon name="save" size={16} />
        {status === 'ready'
          ? <span className="update-text"><strong>Pronto a atualizar</strong><small>Reiniciar · v{state.latest}</small></span>
          : `Atualizar para ${state.latest}`}
      </button>
    )
  }
  if (compact) return null
  return (
    <button disabled={status === 'unsupported' || status === 'checking'} onClick={() => window.api.checkForUpdates()}>
      <Icon name="history" size={16} /> Procurar atualizações
    </button>
  )
}

/** Launch splash: shown while the app checks for and installs updates before opening. */
export function Splash() {
  const state = useUpdateState()
  const downloading = state?.status === 'downloading'
  const text = !state || state.status === 'idle' || state.status === 'checking' ? 'A procurar atualizações…'
    : downloading ? `A transferir a versão ${state.latest}…`
    : state.status === 'installing' ? `A instalar a versão ${state.latest}…`
    : 'A abrir…'
  return (
    <div className="splash">
      <img src="./icon.svg" alt="" width={48} height={48} />
      <div className="splash-body">
        <strong>Smart Capture</strong>
        <span className="muted" aria-live="polite">{text}</span>
        <div className="splash-bar">
          <span className={downloading ? '' : 'indeterminate'}
            style={downloading ? { transform: `scaleX(${(state!.percent ?? 0) / 100})` } : undefined} />
        </div>
      </div>
      {downloading && (
        <button className="link splash-skip" onClick={() => window.api.skipStartupUpdate()} title="Abrir já; a atualização continua em segundo plano">
          Saltar
        </button>
      )}
    </div>
  )
}
