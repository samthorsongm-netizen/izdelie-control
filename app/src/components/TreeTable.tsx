import { useEffect, useState } from 'react'
import type { Item, Kind, Occurrence, StageId } from '../model/types'
import { KINDS, KIND_LABEL } from '../model/types'
import { STATUS_LABEL, hasStage, isBch, isOverdue, isSoon, statusOf } from '../model/stages'
import { progress as nodeProgress, type Node, type Tree } from '../model/tree'

export interface TreeTableProps {
  rows: Node[]
  tree: Tree
  people: string[]
  canEdit: boolean
  canStructure: boolean
  collapsed: Set<string>
  q: string
  selected: string | null
  onSelect: (occId: string) => void
  onToggleCollapse: (occId: string) => void
  onToggleStage: (node: Node, stage: StageId) => void
  onField: (item: Item, patch: Partial<Item>, label: string) => void
  onQty: (occ: Occurrence, qty: number) => void
  onAdd: (parentOccId: string | null) => void
  onEdit: (item: Item) => void
  onMove: (occ: Occurrence) => void
  onDelete: (node: Node) => void
  onReorder: (sourceOccId: string, targetOccId: string, pos: 'before' | 'after') => void
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <span className="hl">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  )
}

function TextCell({
  value,
  onCommit,
  disabled,
  type = 'text',
  placeholder,
  emptyHighlight,
}: {
  value: string | null
  onCommit: (v: string) => void
  disabled?: boolean
  type?: 'text' | 'date'
  placeholder?: string
  emptyHighlight?: boolean
}) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  const commit = () => {
    if ((value ?? '') !== v) onCommit(v.trim())
  }
  return (
    <input
      className={`cell-input${emptyHighlight && !v ? ' empty' : ''}`}
      type={type}
      value={v}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setV(value ?? '')
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

/** Ответственный: выбор из пользователей. Старое значение вне списка не теряем. */
function PersonCell({
  value,
  people,
  disabled,
  onCommit,
  emptyHighlight,
}: {
  value: string | null
  people: string[]
  disabled?: boolean
  onCommit: (v: string) => void
  emptyHighlight?: boolean
}) {
  const v = value ?? ''
  const options = v && !people.includes(v) ? [...people, v] : people
  return (
    <select
      className={`cell-input${emptyHighlight && !v ? ' empty' : ''}`}
      value={v}
      disabled={disabled}
      onChange={(e) => onCommit(e.target.value)}
    >
      <option value="">—</option>
      {options.map((person) => (
        <option key={person} value={person}>
          {person}
        </option>
      ))}
    </select>
  )
}

/** Количество в этой сборке. */
function QtyCell({ value, disabled, onCommit }: { value: number; disabled?: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    const n = Math.max(1, Math.round(Number(v.replace(',', '.')) || 1))
    setV(String(n))
    if (n !== value) onCommit(n)
  }
  return (
    <input
      className="cell-input qty"
      type="number"
      min={1}
      value={v}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setV(String(value))
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

/** Галка этапа: серый прочерк = этап для этого типа не нужен. */
function Tick({ on, applicable, onClick, disabled }: { on: boolean; applicable: boolean; onClick: () => void; disabled?: boolean }) {
  if (!applicable) return <button className="tick na" disabled tabIndex={-1}>·</button>
  return (
    <button
      className={`tick${on ? ' on' : ''}${disabled ? ' readonly' : ''}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={on ? 'Снять отметку' : 'Отметить выполненным'}
    >
      {on ? '✓' : ''}
    </button>
  )
}

export function TreeTable(p: TreeTableProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; pos: 'before' | 'after' } | null>(null)

  return (
    <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr className="groups">
            <th className="name-col" colSpan={3}>
              ОСНОВНЫЕ ДАННЫЕ
            </th>
            <th colSpan={3}>3D</th>
            <th colSpan={3}>ЧЕРТЁЖ</th>
            <th colSpan={7}>ОСТАЛЬНЫЕ ЭТАПЫ</th>
            <th>ЗАКУПКА</th>
            <th colSpan={2}>ГОТОВНОСТЬ</th>
            <th />
          </tr>
          <tr className="cols">
            <th className="name-col">Наименование</th>
            <th>Тип</th>
            <th className="c" title="Количество в этой сборке">Кол-во</th>
            <th className="c" title="3D">3D</th>
            <th>Ответственный</th>
            <th>Срок</th>
            <th className="c" title="Чертёж / номер БЧ">Чертёж</th>
            <th>Ответственный</th>
            <th>Срок</th>
            <th className="c">Проверка</th>
            <th className="c">Спец.</th>
            <th className="c">Карт.</th>
            <th className="c">Зел. док</th>
            <th className="c">ЧМ 3D</th>
            <th className="c">ЧМ черт.</th>
            <th className="c">Извещ.</th>
            <th className="c">Закод.</th>
            <th>Готовность</th>
            <th className="c">Статус</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {p.rows.map((n) => {
            const item = n.item
            const pr = nodeProgress(n)
            const st = statusOf(item)
            const overdue = isOverdue(item)
            const soon = !overdue && isSoon(item)
            const canDropHere = !!dragId && dragId !== n.occ.id && n.depth > 0
            const dropPos = over?.id === n.occ.id ? over.pos : null

            return (
              <tr
                key={n.occ.id}
                className={[
                  p.selected === n.occ.id ? 'sel' : '',
                  n.depth === 0 ? 'root' : '',
                  dropPos === 'before' ? 'drop-before' : dropPos === 'after' ? 'drop-after' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => p.onSelect(n.occ.id)}
                onDragOver={(e) => {
                  if (!canDropHere) return
                  e.preventDefault()
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setOver({ id: n.occ.id, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' })
                }}
                onDragLeave={() => setOver((x) => (x?.id === n.occ.id ? null : x))}
                onDrop={(e) => {
                  if (!canDropHere || !over) return
                  e.preventDefault()
                  p.onReorder(dragId!, n.occ.id, over.pos)
                  setOver(null)
                  setDragId(null)
                }}
              >
                <td className="name-col">
                  <div className="name-cell" style={{ paddingLeft: 2 + n.depth * 16 }}>
                    <span
                      className={`grip${p.canStructure && n.depth > 0 ? '' : ' off'}`}
                      draggable={p.canStructure && n.depth > 0}
                      title="Перетащить строку"
                      onClick={(e) => e.stopPropagation()}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', n.occ.id)
                        setDragId(n.occ.id)
                      }}
                      onDragEnd={() => setDragId(null)}
                    >
                      ⠿
                    </span>
                    <span
                      className={`twisty${n.children.length ? '' : ' empty'}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (n.children.length) p.onToggleCollapse(n.occ.id)
                      }}
                    >
                      {n.children.length ? (p.collapsed.has(n.occ.id) ? '▸' : '▾') : '·'}
                    </span>
                    <span className="name-text" title={item.name}>
                      <Highlight text={item.name} q={p.q} />
                      {item.designation && (
                        <span className="designation">
                          <Highlight text={item.designation} q={p.q} />
                        </span>
                      )}
                    </span>
                  </div>
                </td>

                <td>
                  {p.canEdit ? (
                    <select
                      className={`kind kind-select ${item.kind}`}
                      value={item.kind}
                      title="Изменить тип элемента"
                      style={{ border: '1px solid transparent', cursor: 'pointer', maxWidth: 98 }}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => p.onField(item, { kind: e.target.value as Kind }, `Тип — ${item.name}`)}
                    >
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`kind ${item.kind}`}>{KIND_LABEL[item.kind]}</span>
                  )}
                </td>

                <td className="num">
                  <QtyCell value={n.occ.qty} disabled={!p.canStructure} onCommit={(v) => p.onQty(n.occ, v)} />
                </td>

                <td className="c">
                  <Tick
                    on={!!item.stages.st_3d}
                    applicable={hasStage(item.kind, 'st_3d')}
                    disabled={!p.canEdit}
                    onClick={() => p.onToggleStage(n, 'st_3d')}
                  />
                </td>
                <td>
                  <PersonCell
                    value={item.responsible_3d}
                    people={p.people}
                    disabled={!p.canEdit || !hasStage(item.kind, 'st_3d')}
                    emptyHighlight={hasStage(item.kind, 'st_3d') && !item.stages.st_3d}
                    onCommit={(v) => p.onField(item, { responsible_3d: v || null }, `Ответственный за 3D — ${item.name}`)}
                  />
                </td>
                <td className={overdue && !item.stages.st_3d ? 'overdue' : soon && !item.stages.st_3d ? 'soon' : ''}>
                  <TextCell
                    type="date"
                    value={item.due_3d}
                    disabled={!p.canEdit || !hasStage(item.kind, 'st_3d')}
                    onCommit={(v) => p.onField(item, { due_3d: v || null }, `Срок 3D — ${item.name}`)}
                  />
                </td>

                <td className="c">
                  {isBch(item.kind) ? (
                    <button className="bch-ref" title="Чертёж находится на документе БЧ" onClick={() => p.onEdit(item)}>
                      {item.bch_ref || 'БЧ?'}
                    </button>
                  ) : (
                    <Tick
                      on={!!item.stages.st_dwg}
                      applicable={hasStage(item.kind, 'st_dwg')}
                      disabled={!p.canEdit}
                      onClick={() => p.onToggleStage(n, 'st_dwg')}
                    />
                  )}
                </td>
                <td>
                  <PersonCell
                    value={item.responsible_dwg}
                    people={p.people}
                    disabled={!p.canEdit || !hasStage(item.kind, 'st_dwg')}
                    emptyHighlight={hasStage(item.kind, 'st_dwg') && !item.stages.st_dwg}
                    onCommit={(v) => p.onField(item, { responsible_dwg: v || null }, `Ответственный за чертёж — ${item.name}`)}
                  />
                </td>
                <td className={overdue && !item.stages.st_dwg ? 'overdue' : soon && !item.stages.st_dwg ? 'soon' : ''}>
                  <TextCell
                    type="date"
                    value={item.due_dwg}
                    disabled={!p.canEdit || !hasStage(item.kind, 'st_dwg')}
                    onCommit={(v) => p.onField(item, { due_dwg: v || null }, `Срок чертежа — ${item.name}`)}
                  />
                </td>

                {(['st_dwg_check', 'st_spec', 'st_card', 'st_green_doc', 'st_cm_3d', 'st_cm_dwg', 'st_notice'] as StageId[]).map((id) => (
                  <td className="c" key={id}>
                    <Tick
                      on={!!item.stages[id]}
                      applicable={hasStage(item.kind, id)}
                      disabled={!p.canEdit}
                      onClick={() => p.onToggleStage(n, id)}
                    />
                  </td>
                ))}
                <td className="c">
                  <Tick
                    on={!!item.stages.st_coded}
                    applicable={hasStage(item.kind, 'st_coded')}
                    disabled={!p.canEdit}
                    onClick={() => p.onToggleStage(n, 'st_coded')}
                  />
                </td>

                <td>
                  <div className="bar" title={`Свои этапы: ${Math.round(pr.own * 100)}%${n.children.length ? `, с детьми: ${Math.round(pr.withChildren * 100)}%` : ''}`}>
                    <i style={{ width: `${Math.round(pr.own * 100)}%` }} />
                    <span>{Math.round(pr.own * 100)}%</span>
                  </div>
                  {n.children.length > 0 && (
                    <div className="bar ghost" style={{ height: 3, marginTop: 2, minWidth: 0 }} title="С учётом вложенных">
                      <i style={{ width: `${Math.round(pr.withChildren * 100)}%` }} />
                    </div>
                  )}
                </td>

                <td className="c">
                  <span className={`status ${st}`}>{STATUS_LABEL[st]}</span>
                </td>

                <td className="row-actions">
                  <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                    {p.canStructure && (
                      <button className="btn ghost sm" title="Добавить внутрь" onClick={(e) => { e.stopPropagation(); p.onAdd(n.occ.id) }}>
                        +
                      </button>
                    )}
                    {p.canEdit && (
                      <button className="btn ghost sm" title="Свойства позиции" onClick={(e) => { e.stopPropagation(); p.onEdit(item) }}>
                        ✎
                      </button>
                    )}
                    {p.canStructure && n.depth > 0 && (
                      <>
                        <button className="btn ghost sm" title="Переместить в другую сборку" onClick={(e) => { e.stopPropagation(); p.onMove(n.occ) }}>
                          ⇄
                        </button>
                        <button className="btn ghost sm" title="Удалить из сборки" onClick={(e) => { e.stopPropagation(); p.onDelete(n) }}>
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          {p.rows.length === 0 && (
            <tr>
              <td colSpan={20}>
                <div className="empty-state">Ничего не найдено под фильтр.</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {p.rows.length > 0 && (
        <div className="row" style={{ padding: '10px 12px', borderTop: '1px solid var(--line-soft)' }}>
          <span className="small muted">
            Строк: {p.rows.length}. Тащить за ⠿ слева — переставить по порядку; «⇄» — в другую сборку; «+» — внутрь.
            Тип меняется кликом по нему.
          </span>
        </div>
      )}
    </div>
  )
}
