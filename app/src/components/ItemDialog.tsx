import { useMemo, useState } from 'react'
import type { Item, Kind } from '../model/types'
import { KINDS, KIND_LABEL } from '../model/types'
import { isBch } from '../model/stages'
import { Modal } from './Modal'

export interface AddPayload {
  itemId?: string
  qty: number
  draft?: {
    designation: string | null
    name: string
    kind: Kind
    bch_ref: string | null
  }
}

export function AddDialog({
  parentName,
  items,
  onClose,
  onSubmit,
}: {
  parentName: string
  items: Item[]
  onClose: () => void
  onSubmit: (p: AddPayload) => void
}) {
  const [mode, setMode] = useState<'existing' | 'new'>(items.length ? 'existing' : 'new')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Item | null>(null)
  const [qty, setQty] = useState('1')
  const [name, setName] = useState('')
  const [designation, setDesignation] = useState('')
  const [kind, setKind] = useState<Kind>('part')
  const [bchRef, setBchRef] = useState('')

  const found = useMemo(() => {
    const s = q.trim().toLowerCase()
    return items
      .filter((i) => !s || i.name.toLowerCase().includes(s) || (i.designation ?? '').toLowerCase().includes(s))
      .slice(0, 40)
  }, [items, q])

  const canSubmit = mode === 'existing' ? !!picked : name.trim().length > 0

  return (
    <Modal
      title="Добавить позицию"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn primary"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit(
                mode === 'existing'
                  ? { itemId: picked!.id, qty: Math.max(1, Number(qty) || 1) }
                  : {
                      qty: Math.max(1, Number(qty) || 1),
                      draft: {
                        designation: designation.trim() || null,
                        name: name.trim(),
                        kind,
                        bch_ref: isBch(kind) ? bchRef.trim() || null : null,
                      },
                    },
              )
            }
          >
            Добавить
          </button>
        </>
      }
    >
      <div className="field">
        <label>Куда добавляем</label>
        <div><b>{parentName}</b></div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <label className="chip-toggle">
          <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} /> Найти существующую
        </label>
        <label className="chip-toggle">
          <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> Создать новую
        </label>
      </div>

      {mode === 'existing' ? (
        <>
          <div className="field">
            <label>Номер ТС или наименование</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="начните вводить…" autoFocus />
            <div className="hint">
              Одна и та же позиция может стоять в разных сборках — отметки у неё общие.
            </div>
          </div>
          <div className="opt-list">
            {found.map((i) => (
              <div
                key={i.id}
                className={`opt${picked?.id === i.id ? ' sel' : ''}`}
                onClick={() => setPicked(i)}
              >
                <div className="t">
                  <div>{i.name}</div>
                  <div className="small muted">
                    {i.designation || 'без номера'} · {KIND_LABEL[i.kind]}
                  </div>
                </div>
              </div>
            ))}
            {found.length === 0 && <div className="opt muted">Ничего не найдено — создайте новую.</div>}
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label>Наименование</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="например Шина переходная" />
          </div>
          <div className="grid2">
            <div className="field">
              <label>Номер ТС</label>
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="можно позже" />
            </div>
            <div className="field">
              <label>Тип элемента</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {isBch(kind) && (
            <div className="field">
              <label>Чертёж находится на БЧ</label>
              <input value={bchRef} onChange={(e) => setBchRef(e.target.value)} placeholder="номер БЧ-документа или группового чертежа" />
              <div className="hint">У БЧ-позиции своего чертежа нет — отмечается чертёж того документа, где она нарисована.</div>
            </div>
          )}
        </>
      )}

      <div className="field" style={{ maxWidth: 160 }}>
        <label>Количество в этой сборке</label>
        <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>
    </Modal>
  )
}

export function EditItemDialog({
  item,
  uses,
  onClose,
  onSave,
}: {
  item: Item
  uses: number
  onClose: () => void
  onSave: (next: Item) => void
}) {
  const [draft, setDraft] = useState<Item>({ ...item, stages: { ...item.stages } })
  const set = (patch: Partial<Item>) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <Modal
      title="Свойства позиции"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={() => onSave({ ...draft, name: draft.name.trim() })} disabled={!draft.name.trim()}>
            Сохранить
          </button>
        </>
      }
    >
      {uses > 1 && (
        <div className="banner" style={{ borderRadius: 8, marginBottom: 12 }}>
          Позиция стоит в структуре <b>{uses}</b> раз. Изменения наименования, номера и типа увидят все вхождения.
        </div>
      )}
      <div className="field">
        <label>Наименование</label>
        <input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div className="grid2">
        <div className="field">
          <label>Номер ТС</label>
          <input value={draft.designation ?? ''} onChange={(e) => set({ designation: e.target.value.trim() || null })} />
        </div>
        <div className="field">
          <label>Тип элемента</label>
          <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as Kind })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {isBch(draft.kind) && (
        <div className="field">
          <label>Чертёж находится на БЧ</label>
          <input value={draft.bch_ref ?? ''} onChange={(e) => set({ bch_ref: e.target.value.trim() || null })} />
        </div>
      )}
      <div className="grid2">
        <div className="field">
          <label>Поставщик</label>
          <input value={draft.supplier ?? ''} onChange={(e) => set({ supplier: e.target.value.trim() || null })} />
        </div>
        <div className="field">
          <label>Номер у производителя</label>
          <input
            value={draft.manufacturer_part_no ?? ''}
            onChange={(e) => set({ manufacturer_part_no: e.target.value.trim() || null })}
          />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Ответственный за 3D</label>
          <input value={draft.responsible_3d ?? ''} onChange={(e) => set({ responsible_3d: e.target.value.trim() || null })} />
        </div>
        <div className="field">
          <label>Срок 3D</label>
          <input type="date" value={draft.due_3d ?? ''} onChange={(e) => set({ due_3d: e.target.value || null })} />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Ответственный за чертёж</label>
          <input value={draft.responsible_dwg ?? ''} onChange={(e) => set({ responsible_dwg: e.target.value.trim() || null })} />
        </div>
        <div className="field">
          <label>Срок чертежа</label>
          <input type="date" value={draft.due_dwg ?? ''} onChange={(e) => set({ due_dwg: e.target.value || null })} />
        </div>
      </div>
      <div className="field">
        <label>Комментарий</label>
        <textarea
          value={draft.comment ?? ''}
          onChange={(e) => set({ comment: e.target.value || null })}
          placeholder="замечания проверки, причина задержки и т.п."
        />
      </div>
    </Modal>
  )
}
