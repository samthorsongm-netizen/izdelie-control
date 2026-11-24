import { useEffect, useState } from 'react'
import type { Repo } from '../data/repo'
import type { EventLog, Item } from '../model/types'
import { pathTitles, type Tree } from '../model/tree'
import { Modal } from './Modal'

export function UsageDialog({ tree, item, onClose }: { tree: Tree; item: Item; onClose: () => void }) {
  const occs = tree.usesOf.get(item.id) ?? []
  return (
    <Modal
      title="Где используется"
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Закрыть
        </button>
      }
    >
      <p style={{ marginTop: 0 }}>
        <b>{item.name}</b> {item.designation && <span className="designation">{item.designation}</span>}
      </p>
      <ul className="usage-list">
        {occs.map((o) => (
          <li key={o.id}>{pathTitles(tree, o).join(' → ')}</li>
        ))}
        {occs.length === 0 && <li className="muted">Не стоит ни в одной сборке.</li>}
      </ul>
      <div className="hint">Отметки выполнения у позиции общие для всех вхождений.</div>
    </Modal>
  )
}

export function HistoryDialog({ repo, productId, onClose }: { repo: Repo; productId: string; onClose: () => void }) {
  const [events, setEvents] = useState<EventLog[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    repo
      .listEvents(productId, 150)
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [repo, productId])

  return (
    <Modal
      title="История изменений"
      onClose={onClose}
      wide
      footer={
        <button className="btn" onClick={onClose}>
          Закрыть
        </button>
      }
    >
      <div className="hint" style={{ marginBottom: 8 }}>
        Хранится 30 дней. Отменить своё последнее действие можно кнопкой «Отменить» на панели.
      </div>
      {error && <div className="banner">{error}</div>}
      {!events && <div className="muted">Загрузка…</div>}
      {events?.length === 0 && <div className="muted">Пока пусто.</div>}
      {events?.map((e) => (
        <div className="ev" key={e.id}>
          <span className="when">{e.created_at ? new Date(e.created_at).toLocaleString('ru-RU') : ''}</span>
          <span style={{ minWidth: 110 }}>{e.actor || '—'}</span>
          <span>{e.detail || e.kind}</span>
        </div>
      ))}
    </Modal>
  )
}
