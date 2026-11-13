import { useEffect, useState } from 'react'
import type { HistoryItem } from '../../shared/types'
import { RenameField, Thumb } from './History'

const id = new URLSearchParams(location.hash.split('?')[1]).get('id')

/** Floating window shown right after a capture is saved (Settings → "Pedir o nome depois de capturar"). */
export function NamePrompt() {
  const [item, setItem] = useState<HistoryItem | null>(null)
  useEffect(() => {
    window.api.listHistory().then((h) => {
      const found = h.find((x) => x.id === id)
      if (found) setItem(found)
      else window.close()
    })
  }, [])
  if (!item) return null
  return (
    <div className="name-prompt">
      <div className="name-thumb"><Thumb item={item} /></div>
      <div className="name-body">
        <strong>{item.kind === 'video' ? 'Gravação guardada' : 'Screenshot guardado'}: dá-lhe um nome</strong>
        {/* Enter renames, Esc (or leaving the name as is) keeps the automatic name. */}
        <RenameField item={item} onDone={() => window.close()} />
        <small className="muted">Enter para guardar · Esc para manter este nome</small>
      </div>
    </div>
  )
}
