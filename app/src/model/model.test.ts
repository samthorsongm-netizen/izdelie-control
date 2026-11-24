import { describe, expect, it } from 'vitest'
import seed from '../data/seed.json'
import type { Item, Occurrence, Snapshot } from './types'
import { applicableStages, hasStage, isOverdue, progressOf, statusOf } from './stages'
import { buildTree, canMoveInto, progress as nodeProgress, pathTitles, subtree, visibleRows, walk } from './tree'
import { restoreSnapshot } from '../data/restore'
import type { Repo } from '../data/repo'

const item = (over: Partial<Item>): Item => ({
  id: 'x',
  product_id: 'p',
  designation: null,
  name: 'x',
  kind: 'part',
  bch_ref: null,
  supplier: null,
  manufacturer_part_no: null,
  comment: null,
  responsible_3d: null,
  due_3d: null,
  responsible_dwg: null,
  due_dwg: null,
  stages: {},
  ...over,
})

describe('матрица этапов', () => {
  it('совпадает с Excel: 9/6/7/4/1', () => {
    expect(applicableStages('assembly')).toHaveLength(9)
    expect(applicableStages('assembly_bch')).toHaveLength(6)
    expect(applicableStages('part')).toHaveLength(7)
    expect(applicableStages('part_bch')).toHaveLength(4)
    expect(applicableStages('purchased')).toHaveLength(1)
  })

  it('у БЧ нет своего чертежа и проверки', () => {
    expect(hasStage('part_bch', 'st_dwg')).toBe(false)
    expect(hasStage('part_bch', 'st_dwg_check')).toBe(false)
    expect(hasStage('part', 'st_dwg')).toBe(true)
  })
})

describe('прогресс и статус', () => {
  it('деталь без отметок — не начата', () => {
    expect(progressOf(item({ kind: 'part' }))).toBe(0)
    expect(statusOf(item({ kind: 'part' }))).toBe('new')
  })
  it('частичная готовность считается по применимым этапам', () => {
    const i = item({ kind: 'part_bch', stages: { st_3d: true, st_card: true } })
    expect(progressOf(i)).toBe(0.5)
    expect(statusOf(i)).toBe('wip')
  })
  it('покупной закрывается одной галкой', () => {
    expect(statusOf(item({ kind: 'purchased', stages: { st_coded: true } }))).toBe('done')
  })
  it('просрочка только для применимого и неотмеченного этапа', () => {
    const today = new Date('2026-05-01T00:00:00Z')
    expect(isOverdue(item({ kind: 'part', due_3d: '2026-04-01' }), today)).toBe(true)
    expect(isOverdue(item({ kind: 'part', due_3d: '2026-04-01', stages: { st_3d: true } }), today)).toBe(false)
    expect(isOverdue(item({ kind: 'assembly_bch', due_dwg: '2026-04-01' }), today)).toBe(false)
  })
})

describe('дерево', () => {
  const items = [
    item({ id: 'a', name: 'Сборка', kind: 'assembly' }),
    item({ id: 'b', name: 'Деталь', kind: 'part' }),
    item({ id: 'c', name: 'Подсборка', kind: 'assembly' }),
  ]
  const occs: Occurrence[] = [
    { id: 'o1', product_id: 'p', parent_id: null, item_id: 'a', qty: 1, sort: 1 },
    { id: 'o2', product_id: 'p', parent_id: 'o1', item_id: 'b', qty: 4, sort: 2 },
    { id: 'o3', product_id: 'p', parent_id: 'o1', item_id: 'c', qty: 1, sort: 1 },
    { id: 'o4', product_id: 'p', parent_id: 'o3', item_id: 'b', qty: 2, sort: 1 },
  ]

  it('строит вложенность и порядок по sort', () => {
    const t = buildTree(items, occs)
    expect(t.roots).toHaveLength(1)
    expect(t.roots[0].children.map((n) => n.occ.id)).toEqual(['o3', 'o2'])
    expect(t.roots[0].children[0].depth).toBe(1)
  })

  it('одна деталь в двух местах — два вхождения, одна позиция', () => {
    const t = buildTree(items, occs)
    expect(t.usesOf.get('b')).toHaveLength(2)
    expect(t.byItemId.size).toBe(3)
  })

  it('готовность с детьми считает позиции один раз', () => {
    const t = buildTree(items, occs)
    const root = t.roots[0]
    const pr = nodeProgress(root)
    expect(pr.items).toBe(3)
    expect(pr.own).toBe(0)
  })

  it('нельзя положить сборку внутрь себя или потомка', () => {
    const t = buildTree(items, occs)
    expect(canMoveInto(t, 'o3', 'o4')).toBe(false)
    expect(canMoveInto(t, 'o3', 'o1')).toBe(true)
    expect(canMoveInto(t, 'o3', 'o3')).toBe(false)
  })

  it('свёрнутые ветки скрывают детей', () => {
    const t = buildTree(items, occs)
    expect(visibleRows(t.roots, new Set(['o1']))).toHaveLength(1)
    expect(visibleRows(t.roots, new Set(['o3']))).toHaveLength(3)
    expect(visibleRows(t.roots, new Set())).toHaveLength(4)
  })

  it('путь до детали для подсказки «где используется»', () => {
    const t = buildTree(items, occs)
    expect(pathTitles(t, t.usesOf.get('b')![1])).toEqual(['Сборка', 'Подсборка', 'Деталь'])
  })

  it('поддерево включает саму сборку', () => {
    const t = buildTree(items, occs)
    expect(subtree(t.roots[0].children[0])).toHaveLength(2)
  })
})

describe('импорт примера', () => {
  const items = seed.items as unknown as Item[]
  const occs = seed.occurrences as unknown as Occurrence[]
  const tree = buildTree(items, occs)

  it('78 позиций, 92 вхождения, один корень', () => {
    expect(items).toHaveLength(78)
    expect(occs).toHaveLength(92)
    expect(tree.roots).toHaveLength(1)
  })

  it('все вхождения достижимы от корня, без циклов', () => {
    let n = 0
    walk(tree.roots, () => n++)
    expect(n).toBe(92)
  })

  it('дубли схлопнуты: уникальные номера ТС', () => {
    const desig = items.map((i) => i.designation).filter(Boolean)
    expect(new Set(desig).size).toBe(desig.length)
    expect(items.filter((i) => !i.designation)).toHaveLength(30)
  })

  it('глубина дерева 5 уровней (0..4)', () => {
    let max = 0
    walk(tree.roots, (n) => (max = Math.max(max, n.depth)))
    expect(max).toBe(4)
  })
})

describe('отмена действия', () => {
  function fakeRepo(snap: Snapshot) {
    const items = new Map(snap.items.map((i) => [i.id, i]))
    const occs = new Map(snap.occurrences.map((o) => [o.id, o]))
    const repo = {
      updateItem: async (i: Item) => void items.set(i.id, i),
      insertItem: async (i: Item) => void items.set(i.id, i),
      deleteItem: async (id: string) => void items.delete(id),
      insertOcc: async (o: Occurrence) => void occs.set(o.id, o),
      updateOcc: async (o: Occurrence) => void occs.set(o.id, o),
      deleteOcc: async (id: string) => void occs.delete(id),
    }
    return { repo: repo as unknown as Repo, items, occs }
  }

  const product = { id: 'p', code: null, name: 'p' }
  const a = item({ id: 'a', name: 'A', kind: 'assembly' })
  const b = item({ id: 'b', name: 'B' })
  const oa: Occurrence = { id: 'oa', product_id: 'p', parent_id: null, item_id: 'a', qty: 1, sort: 1 }
  const ob: Occurrence = { id: 'ob', product_id: 'p', parent_id: 'oa', item_id: 'b', qty: 1, sort: 1 }
  const before: Snapshot = { product, items: [a, b], occurrences: [oa, ob] }

  it('снятая галка возвращается', async () => {
    const { repo, items } = fakeRepo(before)
    const changed = { ...b, stages: { st_3d: true } }
    await repo.updateItem(changed)
    const current: Snapshot = { product, items: [a, changed], occurrences: [oa, ob] }
    await restoreSnapshot(repo, before, current)
    expect(items.get('b')!.stages).toEqual({})
  })

  it('добавленная деталь удаляется вместе с вхождением', async () => {
    const { repo, items, occs } = fakeRepo(before)
    const c = item({ id: 'c', name: 'C' })
    const oc: Occurrence = { id: 'oc', product_id: 'p', parent_id: 'oa', item_id: 'c', qty: 1, sort: 2 }
    await repo.insertItem(c)
    await repo.insertOcc(oc)
    await restoreSnapshot(repo, before, { product, items: [a, b, c], occurrences: [oa, ob, oc] })
    expect(items.has('c')).toBe(false)
    expect(occs.has('oc')).toBe(false)
  })

  it('удалённое поддерево восстанавливается', async () => {
    const { repo, items, occs } = fakeRepo(before)
    await repo.deleteOcc('ob')
    await repo.deleteItem('b')
    await restoreSnapshot(repo, before, { product, items: [a], occurrences: [oa] })
    expect(items.has('b')).toBe(true)
    expect(occs.has('ob')).toBe(true)
  })
})
