import { useEffect, useMemo, useState } from 'react'
import type { HistoryItem } from '../../shared/types'
import { formatClock } from './DurationPicker'
import { Icon, type IconName } from './icons'

const src = (h: HistoryItem) => `media://${h.id}/`

export function Thumb({ item }: { item: HistoryItem }) {
  return (
    <div className="thumb">
      {item.kind === 'image' ? (
        <img src={src(item)} alt="" loading="lazy" draggable={false} />
      ) : (
        // #t= fragment makes Chromium paint a real frame instead of a black poster.
        <video src={src(item) + '#t=0.1'} preload="metadata" muted />
      )}
      {item.kind === 'video' && (
        <span className="badge"><Icon name="video" size={12} /> {formatClock(item.durationMs ?? 0)}</span>
      )}
    </div>
  )
}

function formatSize(b: number): string {
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`
}

const dateFmt = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' })

export function History({ items }: { items: HistoryItem[] }) {
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all')
  const [newestFirst, setNewestFirst] = useState(true)
  const [preview, setPreview] = useState<HistoryItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const shown = useMemo(() => {
    const list = items.filter((h) => filter === 'all' || h.kind === filter)
    return list.sort((a, b) => (newestFirst ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
  }, [items, filter, newestFirst])

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPreview(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview])

  const action = (icon: IconName, label: string, fn: () => void, cls = '') => (
    <button className={'icon-btn ' + cls} title={label} aria-label={label} onClick={(e) => { e.stopPropagation(); fn() }}>
      <Icon name={icon} size={16} />
    </button>
  )

  return (
    <div className="page fade-in">
      <div className="section-head">
        <h1>Histórico</h1>
        <div className="toolbar">
          <div className="segmented" role="radiogroup" aria-label="Filtrar">
            {([['all', 'Tudo'], ['image', 'Imagens'], ['video', 'Vídeos']] as const).map(([v, l]) => (
              <button key={v} role="radio" aria-checked={filter === v} className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
          <select value={newestFirst ? 'new' : 'old'} onChange={(e) => setNewestFirst(e.target.value === 'new')} aria-label="Ordenar por data">
            <option value="new">Mais recentes</option>
            <option value="old">Mais antigos</option>
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="empty-state">Nada por aqui ainda.</p>
      ) : (
        <div className="grid">
          {shown.map((h) => (
            <article key={h.id} className="card" tabIndex={0} onClick={() => setPreview(h)}
              onKeyDown={(e) => e.key === 'Enter' && setPreview(h)}>
              <Thumb item={h} />
              <div className="card-body">
                <div className="card-title" title={h.path}>{h.path.split(/[\\/]/).pop()}</div>
                <div className="card-meta">{dateFmt.format(h.createdAt)} · {h.width}×{h.height} · {formatSize(h.size)}</div>
              </div>
              <div className="card-actions">
                {h.kind === 'video'
                  ? action('play', 'Reproduzir', () => setPreview(h))
                  : action('copy', 'Copiar imagem', () => window.api.copyItem(h.id))}
                {action('open', 'Abrir', () => window.api.openItem(h.id))}
                {action('folder', 'Abrir localização', () => window.api.showItem(h.id))}
                {action('save', 'Guardar como…', () => window.api.saveItemAs(h.id))}
                {confirmDelete === h.id ? (
                  <button className="danger-btn" onClick={(e) => { e.stopPropagation(); window.api.deleteItem(h.id) }}
                    onBlur={() => setConfirmDelete(null)} autoFocus>
                    Eliminar?
                  </button>
                ) : (
                  action('trash', 'Eliminar (vai para a Reciclagem)', () => setConfirmDelete(h.id), 'danger')
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {preview && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Pré-visualização" onClick={() => setPreview(null)}>
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            {preview.kind === 'image'
              ? <img src={src(preview)} alt="" />
              : <video src={src(preview)} controls autoPlay />}
            <div className="modal-bar">
              <span>{preview.path.split(/[\\/]/).pop()}</span>
              <span className="spacer" />
              {preview.kind === 'image' && <button onClick={() => window.api.copyItem(preview.id)}><Icon name="copy" size={16} /> Copiar</button>}
              <button onClick={() => window.api.showItem(preview.id)}><Icon name="folder" size={16} /> Localização</button>
              <button onClick={() => window.api.saveItemAs(preview.id)}><Icon name="save" size={16} /> Guardar como…</button>
              <button className="icon-btn" aria-label="Fechar" onClick={() => setPreview(null)}><Icon name="x" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
