import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Repo } from '../data/repo'
import { restoreSnapshot } from '../data/restore'
import type { Item, Kind, Occurrence, Profile, Snapshot, StageId } from '../model/types'
import { KIND_LABEL } from '../model/types'
import { STAGE_BY_ID, hasStage, isOverdue, progressOf, statusOf } from '../model/stages'
import { ancestorsOf, buildTree, canMoveInto, subtree, visibleRows, walk, type Node } from '../model/tree'
import { TreeTable } from './TreeTable'
import { AddDialog, EditItemDialog, type AddPayload } from './ItemDialog'
import { MoveDialog } from './MoveDialog'
import { HistoryDialog, UsageDialog } from './InfoDialogs'
import { QtyTable } from './QtyTable'
import { Confirm } from './Modal'
import { exportXlsx } from './exportXlsx'

type StatusFilter = 'all' | 'done' | 'wip' | 'new'

interface Filters {
  q: string
  kind: Kind | 'all'
  status: StatusFilter
  mine: boolean
  overdue: boolean
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function ProductPage({
  repo,
  me,
  productId,
  onBack,
}: {
  repo: Repo
  me: Profile
  productId: string
  onBack: () => void
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null)
  const [f, setF] = useState<Filters>({ q: '', kind: 'all', status: 'all', mine: false, overdue: false })
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState<{ parent: string | null } | null>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [moving, setMoving] = useState<Node | null>(null)
  const [deleting, setDeleting] = useState<Node | null>(null)
  const [usage, setUsage] = useState<Item | null>(null)
  const [history, setHistory] = useState(false)
  const [busy, setBusy] = useState(false)
  const [undoInfo, setUndoInfo] = useState<{ label: string; n: number }>({ label: '', n: 0 })
  const [people, setPeople] = useState<string[]>([])
  const [view, setView] = useState<'tree' | 'qty'>('tree')
  const undoRef = useRef<{ label: string; before: Snapshot }[]>([])

  const canEdit = me.role !== 'viewer'
  const canStructure = me.role === 'admin'

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const reload = useCallback(async () => {
    try {
      setSnap(await repo.loadProduct(productId))
      setError('')
    } catch (e) {
      setError(msg(e))
    }
  }, [repo, productId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    repo
      .listPeople()
      .then(setPeople)
      .catch(() => setPeople([]))
  }, [repo])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = repo.subscribe(productId, () => {
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), 300)
    })
    return () => {
      clearTimeout(timer)
      off()
    }
  }, [repo, productId, reload])

  const tree = useMemo(() => (snap ? buildTree(snap.items, snap.occurrences) : null), [snap])

  const pushUndo = (label: string, before: Snapshot) => {
    undoRef.current.push({ label, before })
    if (undoRef.current.length > 10) undoRef.current.shift()
    setUndoInfo({ label, n: undoRef.current.length })
  }

  const commit = async (
    label: string,
    optimistic: (s: Snapshot) => Snapshot,
    persist: () => Promise<void>,
  ) => {
    if (!snap) return
    const before = snap
    setSnap(optimistic(before))
    try {
      await persist()
      pushUndo(label, before)
      void repo.log({ product_id: productId, actor: me.name, kind: 'edit', detail: label })
    } catch (e) {
      setSnap(before)
      setToast({ text: msg(e), bad: true })
    }
  }

  const onToggleStage = (node: Node, stage: StageId) => {
    if (!canEdit) return
    const item = node.item
    const next: Item = { ...item, stages: { ...item.stages, [stage]: !item.stages[stage] } }
    void commit(
      `«${STAGE_BY_ID[stage].label}» ${next.stages[stage] ? 'поставлена' : 'снята'} — ${item.name}`,
      (s) => ({ ...s, items: s.items.map((i) => (i.id === item.id ? next : i)) }),
      () => repo.updateItem(next),
    )
  }

  const onField = (item: Item, patch: Partial<Item>, label: string) => {
    if (!canEdit) return
    const next: Item = { ...item, ...patch }
    void commit(
      label,
      (s) => ({ ...s, items: s.items.map((i) => (i.id === item.id ? next : i)) }),
      () => repo.updateItem(next),
    )
  }

  const onQty = (occ: Occurrence, qty: number) => {
    if (!canStructure) return
    const next: Occurrence = { ...occ, qty }
    void commit(
      `Количество: ${tree?.byOcc.get(occ.id)?.item.name ?? ''} — ${qty}`,
      (s) => ({ ...s, occurrences: s.occurrences.map((o) => (o.id === occ.id ? next : o)) }),
      () => repo.updateOcc(next),
    )
  }

  /** Перестановка строки относительно другой: вставить до/после в том же родителе. */
  const onReorder = (srcId: string, targetId: string, pos: 'before' | 'after') => {
    if (!snap || !tree || !canStructure) return
    const src = tree.byOcc.get(srcId)
    const tgt = tree.byOcc.get(targetId)
    if (!src || !tgt || src.occ.id === tgt.occ.id || tgt.depth === 0) return
    const newParent = tgt.occ.parent_id
    if (!canMoveInto(tree, srcId, newParent)) {
      setToast({ text: 'Нельзя переместить сборку внутрь самой себя', bad: true })
      return
    }
    const oldParent = src.occ.parent_id
    const moved: Occurrence = { ...src.occ, parent_id: newParent }

    const siblings = snap.occurrences
      .filter((o) => o.parent_id === newParent && o.id !== srcId)
      .sort((a, b) => a.sort - b.sort)
    const at = Math.max(0, siblings.findIndex((o) => o.id === targetId))
    const insertAt = pos === 'before' ? at : at + 1
    const ordered = [...siblings.slice(0, insertAt), moved, ...siblings.slice(insertAt)]

    const changed = new Map<string, Occurrence>()
    ordered.forEach((o, i) => changed.set(o.id, { ...o, sort: i + 1 }))
    if (oldParent !== newParent) {
      snap.occurrences
        .filter((o) => o.parent_id === oldParent && o.id !== srcId)
        .sort((a, b) => a.sort - b.sort)
        .forEach((o, i) => changed.set(o.id, { ...o, sort: i + 1 }))
    }

    void commit(
      `Порядок: ${src.item.name}`,
      (s) => ({ ...s, occurrences: s.occurrences.map((o) => changed.get(o.id) ?? o) }),
      async () => {
        for (const o of changed.values()) await repo.updateOcc(o)
      },
    )
  }

  const onSaveItem = (next: Item) => {
    setEditing(null)
    onField(next, {}, `Свойства — ${next.name}`)
  }

  const onAdd = async (payload: AddPayload) => {
    if (!snap) return
    const parentId = adding?.parent ?? null
    setAdding(null)
    const item: Item | undefined = payload.draft
      ? {
          id: crypto.randomUUID(),
          product_id: productId,
          designation: payload.draft.designation,
          name: payload.draft.name,
          kind: payload.draft.kind,
          bch_ref: payload.draft.bch_ref,
          supplier: null,
          manufacturer_part_no: null,
          comment: null,
          responsible_3d: null,
          due_3d: null,
          responsible_dwg: null,
          due_dwg: null,
          stages: {},
        }
      : undefined
    const itemId = item?.id ?? payload.itemId
    if (!itemId) return
    const siblings = snap.occurrences.filter((o) => o.parent_id === parentId)
    const sort = siblings.reduce((m, o) => Math.max(m, o.sort), 0) + 1
    const occ: Occurrence = {
      id: crypto.randomUUID(),
      product_id: productId,
      parent_id: parentId,
      item_id: itemId,
      qty: payload.qty,
      sort,
    }
    const name = item?.name ?? snap.items.find((i) => i.id === itemId)?.name ?? ''
    await commit(
      `Добавлено: ${name}`,
      (s) => ({
        ...s,
        items: item ? [...s.items, item] : s.items,
        occurrences: [...s.occurrences, occ],
      }),
      async () => {
        if (item) await repo.insertItem(item)
        await repo.insertOcc(occ)
      },
    )
    if (parentId) {
      setCollapsed((c) => {
        const n = new Set(c)
        n.delete(parentId)
        return n
      })
    }
  }

  const onMoveNode = async (node: Node, parentId: string | null) => {
    if (!snap || !tree) return
    if (!canMoveInto(tree, node.occ.id, parentId)) {
      setToast({ text: 'Нельзя переместить сборку внутрь самой себя', bad: true })
      return
    }
    const siblings = snap.occurrences.filter((o) => o.parent_id === parentId && o.id !== node.occ.id)
    const sort = siblings.reduce((m, o) => Math.max(m, o.sort), 0) + 1
    const next: Occurrence = { ...node.occ, parent_id: parentId, sort }
    setCollapsed((c) => {
      const n = new Set(c)
      if (parentId) n.delete(parentId)
      return n
    })
    await commit(
      `Перемещено: ${node.item.name}`,
      (s) => ({ ...s, occurrences: s.occurrences.map((o) => (o.id === next.id ? next : o)) }),
      () => repo.updateOcc(next),
    )
  }

  const onDelete = (mode: 'all' | 'promote') => {
    const node = deleting
    if (!node || !snap) return
    setDeleting(null)
    const nodes = subtree(node)
    const occIds = new Set(nodes.map((n) => n.occ.id))
    const itemIds = new Set(nodes.map((n) => n.item.id))

    if (mode === 'promote') {
      const parentId = node.occ.parent_id
      const rest = snap.occurrences.filter((o) => !occIds.has(o.id))
      const movedChildren = snap.occurrences.filter((o) => o.parent_id === node.occ.id)
      let sort = rest.filter((o) => o.parent_id === parentId).reduce((m, o) => Math.max(m, o.sort), 0)
      const patched = movedChildren.map((o) => ({ ...o, parent_id: parentId, sort: ++sort }))
      const patchedMap = new Map(patched.map((o) => [o.id, o]))
      void commit(
        `Удалено из сборки (детали подняты): ${node.item.name}`,
        (s) => ({ ...s, occurrences: s.occurrences.filter((o) => !occIds.has(o.id)).map((o) => patchedMap.get(o.id) ?? o) }),
        async () => {
          for (const o of patched) await repo.updateOcc(o)
          await repo.deleteOcc(node.occ.id)
        },
      )
      return
    }

    const remaining = snap.occurrences.filter((o) => !occIds.has(o.id))
    const usedAfter = new Set(remaining.map((o) => o.item_id))
    const itemsToDelete = [...itemIds].filter((id) => !usedAfter.has(id))
    void commit(
      `Удалено: ${node.item.name} (${nodes.length} поз.)`,
      (s) => ({
        ...s,
        occurrences: s.occurrences.filter((o) => !occIds.has(o.id)),
        items: s.items.filter((i) => !itemsToDelete.includes(i.id)),
      }),
      async () => {
        for (const id of occIds) await repo.deleteOcc(id)
        for (const id of itemsToDelete) await repo.deleteItem(id)
      },
    )
  }

  const undo = async () => {
    const step = undoRef.current.pop()
    if (!step || !snap) return
    setBusy(true)
    try {
      await restoreSnapshot(repo, step.before, snap)
      await reload()
      setToast({ text: `Отменено: ${step.label}` })
    } catch (e) {
      setToast({ text: msg(e), bad: true })
      await reload()
    } finally {
      setBusy(false)
      setUndoInfo({ label: undoRef.current[undoRef.current.length - 1]?.label ?? '', n: undoRef.current.length })
    }
  }

  const kpi = useMemo(() => {
    if (!tree) return null
    const seen = new Map<string, Item>()
    walk(tree.roots, (n) => seen.set(n.item.id, n.item))
    const all = [...seen.values()]
    const by = (s: string) => all.filter((i) => statusOf(i) === s).length
    const avg = all.length ? all.reduce((a, i) => a + progressOf(i), 0) / all.length : 0
    const d3 = all.filter((i) => hasStage(i.kind, 'st_3d'))
    const dw = all.filter((i) => hasStage(i.kind, 'st_dwg'))
    return {
      total: all.length,
      done: by('done'),
      wip: by('wip'),
      fresh: by('new'),
      overdue: all.filter((i) => isOverdue(i)).length,
      avg,
      d3: { done: d3.filter((i) => i.stages.st_3d).length, total: d3.length },
      dw: { done: dw.filter((i) => i.stages.st_dwg).length, total: dw.length },
    }
  }, [tree])

  const surname = (me.name.split(' ')[0] ?? '').toLowerCase()
  const matches = useCallback(
    (item: Item) => {
      const q = f.q.trim().toLowerCase()
      if (q && !item.name.toLowerCase().includes(q) && !(item.designation ?? '').toLowerCase().includes(q)) return false
      if (f.kind !== 'all' && item.kind !== f.kind) return false
      if (f.status !== 'all' && statusOf(item) !== f.status) return false
      if (f.mine) {
        const r = `${item.responsible_3d ?? ''} ${item.responsible_dwg ?? ''}`.toLowerCase()
        if (!surname || !r.includes(surname)) return false
      }
      if (f.overdue && !isOverdue(item)) return false
      return true
    },
    [f, surname],
  )

  const activeFilter = !!(f.q || f.kind !== 'all' || f.status !== 'all' || f.mine || f.overdue)

  const rows: Node[] = useMemo(() => {
    if (!tree) return []
    if (!activeFilter) return visibleRows(tree.roots, collapsed)
    const keep = new Set<string>()
    walk(tree.roots, (n) => {
      if (!matches(n.item)) return
      keep.add(n.occ.id)
      for (const a of ancestorsOf(tree, n.occ.id)) keep.add(a)
    })
    const out: Node[] = []
    const rec = (list: Node[]) => {
      for (const n of list) {
        if (!keep.has(n.occ.id)) continue
        out.push(n)
        rec(n.children)
      }
    }
    rec(tree.roots)
    return out
  }, [tree, collapsed, activeFilter, matches])

  const parentName = adding ? (adding.parent ? tree?.byOcc.get(adding.parent)?.item.name ?? '—' : 'Корень изделия') : ''
  if (!snap) return <div className="empty-state">{error || 'Загрузка…'}</div>

  return (
    <>
      <div className="product-head">
        <button className="btn ghost sm" onClick={onBack}>
          ← Изделия
        </button>
        <div>
          <h2>{snap.product.name}</h2>
          <div className="code">{snap.product.code || 'без номера'}</div>
        </div>
        <div className="grow" />
        <div className="row">
          <button className="btn" onClick={undo} disabled={!undoInfo.n || busy} title={undoInfo.n ? `Отменить: ${undoInfo.label}` : 'Нечего отменять'}>
            ↶ Отменить{undoInfo.n ? ` (${undoInfo.n})` : ''}
          </button>
          <button className="btn" onClick={() => setHistory(true)}>
            История
          </button>
          <button className="btn" onClick={() => void exportXlsx(snap)}>
            Excel
          </button>
          <button className="btn" onClick={() => window.print()}>
            Печать
          </button>
          {canStructure && (
            <button className="btn primary" onClick={() => setAdding({ parent: tree?.roots[0]?.occ.id ?? null })}>
              + Позиция
            </button>
          )}
        </div>
      </div>

      {error && <div className="banner">{error}</div>}

      {kpi && (
        <div className="kpis">
          <div className="kpi">
            <div className="k">Позиций</div>
            <div className="v">{kpi.total}</div>
          </div>
          <div className="kpi ok">
            <div className="k">Готово</div>
            <div className="v">{kpi.done}</div>
          </div>
          <div className="kpi">
            <div className="k">В работе</div>
            <div className="v">{kpi.wip}</div>
          </div>
          <div className="kpi">
            <div className="k">Не начато</div>
            <div className="v">{kpi.fresh}</div>
          </div>
          <div className={`kpi${kpi.overdue ? ' bad' : ''}`}>
            <div className="k">Просрочено</div>
            <div className="v">{kpi.overdue}</div>
          </div>
          <div className="kpi">
            <div className="k">Средняя готовность</div>
            <div className="v">{Math.round(kpi.avg * 100)}%</div>
          </div>
          <div className="kpi">
            <div className="k">3D</div>
            <div className="v">
              {kpi.d3.done} <small>из {kpi.d3.total}</small>
            </div>
          </div>
          <div className="kpi">
            <div className="k">Чертежи</div>
            <div className="v">
              {kpi.dw.done} <small>из {kpi.dw.total}</small>
            </div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <button className={`chip-toggle${view === 'tree' ? ' on' : ''}`} onClick={() => setView('tree')}>
          Структура
        </button>
        <button className={`chip-toggle${view === 'qty' ? ' on' : ''}`} onClick={() => setView('qty')}>
          Количество по изделию
        </button>
      </div>

      {view === 'qty' ? (
        tree && <QtyTable tree={tree} onUsage={setUsage} />
      ) : (
        <>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Поиск по номеру ТС или наименованию…"
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
            />
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind | 'all' })}>
              <option value="all">Все типы</option>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as StatusFilter })}>
              <option value="all">Любой статус</option>
              <option value="new">Не начато</option>
              <option value="wip">В работе</option>
              <option value="done">Готово</option>
            </select>
            <button className={`chip-toggle${f.mine ? ' on' : ''}`} onClick={() => setF({ ...f, mine: !f.mine })}>
              Мои задачи
            </button>
            <button className={`chip-toggle${f.overdue ? ' on' : ''}`} onClick={() => setF({ ...f, overdue: !f.overdue })}>
              Просроченные
            </button>
            <div className="grow" />
            <button
              className="btn sm"
              onClick={() => {
                if (!tree) return
                const ids: string[] = []
                walk(tree.roots, (n) => {
                  if (n.children.length) ids.push(n.occ.id)
                })
                setCollapsed(new Set(ids))
              }}
            >
              Свернуть всё
            </button>
            <button className="btn sm" onClick={() => setCollapsed(new Set())}>
              Развернуть всё
            </button>
            <span className="small muted">
              {rows.length} из {kpi?.total ?? 0}
            </span>
          </div>

          {tree && (
            <TreeTable
              rows={rows}
              tree={tree}
              people={people}
              canEdit={canEdit}
              canStructure={canStructure}
              collapsed={collapsed}
              q={f.q.trim()}
              selected={selected}
              onSelect={setSelected}
              onToggleCollapse={(id) =>
                setCollapsed((c) => {
                  const n = new Set(c)
                  if (n.has(id)) n.delete(id)
                  else n.add(id)
                  return n
                })
              }
              onToggleStage={onToggleStage}
              onField={onField}
              onQty={onQty}
              onAdd={(parent) => setAdding({ parent })}
              onEdit={(item) => setEditing(item)}
              onMove={(occ) => setMoving(tree.byOcc.get(occ.id) ?? null)}
              onDelete={(node) => setDeleting(node)}
              onReorder={onReorder}
            />
          )}
        </>
      )}

      {adding && (
        <AddDialog
          parentName={parentName}
          items={snap.items}
          onClose={() => setAdding(null)}
          onSubmit={(p) => void onAdd(p)}
        />
      )}

      {editing && (
        <EditItemDialog
          item={editing}
          uses={tree?.usesOf.get(editing.id)?.length ?? 1}
          onClose={() => setEditing(null)}
          onSave={onSaveItem}
        />
      )}

      {moving && (
        <MoveDialog
          tree={tree!}
          node={moving}
          onClose={() => setMoving(null)}
          onMove={(pid) => {
            const n = moving
            setMoving(null)
            if (n) void onMoveNode(n, pid)
          }}
        />
      )}

      {deleting && (
        <Confirm
          title="Удалить из структуры"
          text={
            <>
              <p>
                <b>{deleting.item.name}</b>
                {deleting.item.designation ? ` (${deleting.item.designation})` : ''} — внутри{' '}
                {subtree(deleting).length - 1} вложенных позиций.
              </p>
              <p className="small muted">
                «Удалить всё» уберёт сборку вместе с содержимым. «Поднять» — уберёт только её, а детали перейдут на
                уровень выше. Сами позиции (отметки, сроки) сохранятся в изделии, их можно добавить обратно.
              </p>
            </>
          }
          onClose={() => setDeleting(null)}
          actions={[
            { label: 'Поднять детали', onClick: () => onDelete('promote') },
            { label: 'Удалить всё', tone: 'danger', onClick: () => onDelete('all') },
          ]}
        />
      )}

      {usage && <UsageDialog tree={tree!} item={usage} onClose={() => setUsage(null)} />}
      {history && <HistoryDialog repo={repo} productId={productId} onClose={() => setHistory(false)} />}

      {toast && <div className={`toast${toast.bad ? ' bad' : ''}`}>{toast.text}</div>}
    </>
  )
}
