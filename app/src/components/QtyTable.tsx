import { useMemo, useState } from 'react'
import type { Item } from '../model/types'
import { KIND_LABEL } from '../model/types'
import { parentCount, totalQty, walk, type Tree } from '../model/tree'

/**
 * Список всех позиций изделия с суммарным количеством.
 * Количество вхождения умножается на количество сборок-родителей.
 */
export function QtyTable({ tree, onUsage }: { tree: Tree; onUsage: (item: Item) => void }) {
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const seen = new Map<string, Item>()
    walk(tree.roots, (n) => seen.set(n.item.id, n.item))
    const s = q.trim().toLowerCase()
    return [...seen.values()]
      .filter((i) => !s || i.name.toLowerCase().includes(s) || (i.designation ?? '').toLowerCase().includes(s))
      .sort((a, b) => (a.designation ?? 'яяя' + a.name).localeCompare(b.designation ?? 'яяя' + b.name, 'ru'))
  }, [tree, q])

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Поиск по номеру ТС или наименованию…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="grow" />
        <span className="small muted">Позиций: {rows.length}</span>
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr className="cols">
              <th className="c" style={{ width: 56 }}>
                №
              </th>
              <th>Номер ТС</th>
              <th>Наименование</th>
              <th>Тип</th>
              <th className="c" title="В скольких сборках встречается">
                Сборок
              </th>
              <th className="c" title="Всего на изделие с учётом вложенности">
                Итого
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => {
              const parents = parentCount(tree, item.id)
              return (
                <tr key={item.id}>
                  <td className="num">{i + 1}</td>
                  <td className="mono">{item.designation || '—'}</td>
                  <td>{item.name}</td>
                  <td>
                    <span className={`kind ${item.kind}`}>{KIND_LABEL[item.kind]}</span>
                  </td>
                  <td className="c">
                    {parents > 1 ? (
                      <button className="usage-badge" title="Показать, где стоит" onClick={() => onUsage(item)}>
                        в {parents} сборках
                      </button>
                    ) : (
                      <span className="muted">1</span>
                    )}
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {totalQty(tree, item.id)}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">Ничего не найдено.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
