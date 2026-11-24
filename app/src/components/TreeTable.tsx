import { useEffect, useState } from 'react'
import type { Item, Occurrence, StageId } from '../model/types'
import { KIND_LABEL } from '../model/types'
import { STATUS_LABEL, hasStage, isBch, isOverdue, isSoon, statusOf } from '../model/stages'
import { canMoveInto, progress as nodeProgress, type Node, type Tree } from '../model/tree'

export interface TreeTableProps {
  rows: Node[]
  tree: Tree
  canEdit: boolean
  canStructure: boolean
  collapsed: Set<string>
  q: string
  selected: string | null
  onSelect: (occId: string) => void
  onToggleCollapse: (occId: string) => void
  onToggleStage: (node: Node, stage: StageId) => void
  onField: (item: Item, patch: Partial<Item>, label: string) => void
  onAdd: (parentOccId: string | null) => void
  onEdit: (item: Item) => void
  onMove: (occ: Occurrence) => void
  onDelete: (node: Node) => void
  onUsage: (item: Item) => void
  onDrop: (sourceOccId: string, targetOccId: string) => void
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
  const [overId, setOverId] = useState<string | null>(null)

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
            <th className="c">Кол-во</th>
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
            const isAssembly = item.kind === 'assembly' || item.kind === 'assembly_bch'
            const pr = nodeProgress(n)
            const st = statusOf(item)
            const uses = p.tree.usesOf.get(item.id)?.length ?? 1
            const overdue = isOverdue(item)
            const soon = !overdue && isSoon(item)
            const canDropHere = isAssembly && dragId && canMoveInto(p.tree, dragId, n.occ.id) && dragId !== n.occ.id

            return (
              <tr
                key={n.occ.id}
                className={[
                  p.selected === n.occ.id ? 'sel' : '',
                  n.depth === 0 ? 'root' : '',
                  overId === n.occ.id ? 'drop-target' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => p.onSelect(n.occ.id)}
                onDragOver={(e) => {
                  if (!canDropHere) return
                  e.preventDefault()
                  setOverId(n.occ.id)
                }}
                onDragLeave={() => setOverId((x) => (x === n.occ.id ? null : x))}
                onDrop={(e) => {
                  if (!canDropHere) return
                  e.preventDefault()
                  setOverId(null)
                  if (dragId) p.onDrop(dragId, n.occ.id)
                  setDragId(null)
                }}
              >
                <td className="name-col">
                  <div
                    className="name-cell"
                    style={{ paddingLeft: 4 + n.depth * 16 }}
                    draggable={p.canStructure}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', n.occ.id)
                      setDragId(n.occ.id)
                    }}
                    onDragEnd={() => setDragId(null)}
                  >
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
                    {uses > 1 && (
                      <button
                        className="usage-badge"
                        title="Используется в нескольких местах — показать где"
                        onClick={(e) => {
                          e.stopPropagation()
                          p.onUsage(item)
                        }}
                      >
                        ×{uses}
                      </button>
                    )}
                  </div>
                </td>

                <td>
                  <span className={`kind ${item.kind}`}>{KIND_LABEL[item.kind]}</span>
                </td>

                <td className="num">{isAssembly ? '' : n.occ.qty}</td>

                {/* 3D */}
                <td className="c">
                  <Tick
                    on={!!item.stages.st_3d}
                    applicable={hasStage(item.kind, 'st_3d')}
                    disabled={!p.canEdit}
                    onClick={() => p.onToggleStage(n, 'st_3d')}
                  />
                </td>
                <td>
                  <TextCell
                    value={item.responsible_3d}
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

                {/* Чертёж */}
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
                  <TextCell
                    value={item.responsible_dwg}
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

                {/* остальные этапы */}
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
                        <button className="btn ghost sm" title="Переместить" onClick={(e) => { e.stopPropagation(); p.onMove(n.occ) }}>
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
            Строк: {p.rows.length}. Перетащите строку на сборку, чтобы перенести, или «+» на строке, чтобы добавить
            внутрь.
          </span>
        </div>
      )}
    </div>
  )
}
