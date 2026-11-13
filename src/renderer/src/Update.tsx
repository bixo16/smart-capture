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
    case 'downloading': return `A transferir ${s.latest}… ${s.percent ?? 0}%`
    case 'installing': return 'A instalar… a app vai reiniciar.'
    case 'error': return `Não foi possível atualizar: ${s.error ?? 'erro desconhecido'}`
    default: return ''
  }
}

/** One button for the whole flow: download → silent install → restart. */
export function UpdateButton({ state, compact }: { state: UpdateState; compact?: boolean }) {
  const busy = state.status === 'downloading' || state.status === 'installing'
  if (state.status === 'available' || (state.status === 'error' && state.latest) || busy) {
    return (
      <button className={'primary update-btn' + (compact ? ' compact' : '')} disabled={busy}
        onClick={() => window.api.installUpdate()} aria-live="polite">
        <Icon name="save" size={16} />
        {state.status === 'downloading' ? `A transferir… ${state.percent ?? 0}%`
          : state.status === 'installing' ? 'A instalar…'
          : `Atualizar para ${state.latest}`}
        {state.status === 'downloading' && <span className="update-progress" style={{ transform: `scaleX(${(state.percent ?? 0) / 100})` }} />}
      </button>
    )
  }
  if (compact) return null
  return (
    <button disabled={state.status === 'unsupported' || state.status === 'checking'} onClick={() => window.api.checkForUpdates()}>
      <Icon name="history" size={16} /> Procurar atualizações
    </button>
  )
}
