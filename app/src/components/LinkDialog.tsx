import { useMemo, useState } from 'react'
import type { Item } from '../model/types'
import { KIND_LABEL } from '../model/types'
import { Modal } from './Modal'

/** Выбор позиции, к которой относится текущая (любая позиция изделия, в т.ч. из другой сборки). */
export function LinkDialog({
  items,
  currentItemId,
  linkedId,
  onClose,
  onPick,
}: {
  items: Item[]
  currentItemId: string
  linkedId: string | null
  onClose: () => void
  onPick: (itemId: string | null) => void
}) {
  const [q, setQ] = useState('')

  const found = useMemo(() => {
    const s = q.trim().toLowerCase()
    return items
      .filter((i) => i.id !== currentItemId)
      .filter((i) => !s || i.name.toLowerCase().includes(s) || (i.designation ?? '').toLowerCase().includes(s))
      .sort((a, b) => (a.designation ?? 'яяя' + a.name).localeCompare(b.designation ?? 'яяя' + b.name, 'ru'))
      .slice(0, 60)
  }, [items, q, currentItemId])

  return (
    <Modal
      title="К чему относится"
      onClose={onClose}
      wide
      footer={
        <>
          {linkedId && (
            <button className="btn danger" onClick={() => onPick(null)}>
              Убрать связь
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
        </>
      }
    >
      <div className="field">
        <label>Номер ТС или наименование</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="начните вводить…" autoFocus />
        <div className="hint">
          Можно выбрать позицию из любой сборки изделия. На структуру и спецификацию не влияет.
        </div>
      </div>
      <div className="opt-list" style={{ maxHeight: 340 }}>
        {found.map((i) => (
          <div key={i.id} className={`opt${linkedId === i.id ? ' sel' : ''}`} onClick={() => onPick(i.id)}>
            <div className="t">
              <div>{i.name}</div>
              <div className="small muted">
                {i.designation || 'без номера'} · {KIND_LABEL[i.kind]}
              </div>
            </div>
            {linkedId === i.id && <span className="small">текущая</span>}
          </div>
        ))}
        {found.length === 0 && <div className="opt muted">Ничего не найдено.</div>}
      </div>
    </Modal>
  )
}
