import type { Item, Occurrence } from './types'
import { progressOf } from './stages'

export interface Node {
  occ: Occurrence
  item: Item
  depth: number
  children: Node[]
}

export interface Tree {
  roots: Node[]
  byOcc: Map<string, Node>
  byItemId: Map<string, Item>
  /** вхождения по позиции: одна деталь может стоять в нескольких местах */
  usesOf: Map<string, Occurrence[]>
}

export function buildTree(items: Item[], occs: Occurrence[]): Tree {
  const byItemId = new Map(items.map((i) => [i.id, i]))
  const byOcc = new Map<string, Node>()
  const childrenOf = new Map<string | null, Occurrence[]>()

  for (const o of occs) {
    if (!byItemId.has(o.item_id)) continue
    const list = childrenOf.get(o.parent_id) ?? []
    list.push(o)
    childrenOf.set(o.parent_id, list)
  }
  for (const list of childrenOf.values()) list.sort((a, b) => a.sort - b.sort)

  const roots: Node[] = []
  const visit = (o: Occurrence, depth: number, guard: Set<string>): Node => {
    const node: Node = { occ: o, item: byItemId.get(o.item_id)!, depth, children: [] }
    byOcc.set(o.id, node)
    if (guard.has(o.id)) return node
    guard.add(o.id)
    for (const c of childrenOf.get(o.id) ?? []) node.children.push(visit(c, depth + 1, guard))
    return node
  }
  for (const o of childrenOf.get(null) ?? []) roots.push(visit(o, 0, new Set()))

  const usesOf = new Map<string, Occurrence[]>()
  for (const o of occs) {
    const list = usesOf.get(o.item_id) ?? []
    list.push(o)
    usesOf.set(o.item_id, list)
  }

  return { roots, byOcc, byItemId, usesOf }
}

/** Порядок обхода с учётом свёрнутых веток. */
export function visibleRows(roots: Node[], collapsed: Set<string>): Node[] {
  const out: Node[] = []
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      out.push(n)
      if (!collapsed.has(n.occ.id)) walk(n.children)
    }
  }
  walk(roots)
  return out
}

export function walk(nodes: Node[], fn: (n: Node) => void): void {
  for (const n of nodes) {
    fn(n)
    walk(n.children, fn)
  }
}

/** Все вхождения в поддереве, включая само. */
export function subtree(node: Node): Node[] {
  const out: Node[] = []
  walk([node], (n) => out.push(n))
  return out
}

/**
 * Готовность узла: своя и с детьми (среднее по разным позициям поддерева).
 */
export function progress(node: Node): { own: number; withChildren: number; items: number } {
  const seen = new Map<string, Item>()
  walk([node], (n) => seen.set(n.item.id, n.item))
  let sum = 0
  for (const item of seen.values()) sum += progressOf(item)
  return {
    own: progressOf(node.item),
    withChildren: seen.size ? sum / seen.size : 0,
    items: seen.size,
  }
}

/** Можно ли перетащить occId внутрь targetOccId (нельзя в себя и в своего потомка). */
export function canMoveInto(tree: Tree, occId: string, targetOccId: string | null): boolean {
  if (!targetOccId) return true
  if (occId === targetOccId) return false
  const target = tree.byOcc.get(targetOccId)
  if (!target) return false
  const source = tree.byOcc.get(occId)
  if (!source) return false
  return !subtree(source).some((n) => n.occ.id === targetOccId)
}

/** В скольких РАЗНЫХ сборках стоит позиция (не количество, а число родителей). */
export function parentCount(tree: Tree, itemId: string): number {
  return new Set((tree.usesOf.get(itemId) ?? []).map((o) => o.parent_id)).size
}

/**
 * Сколько всего нужно на изделие: количество вхождения умножается на
 * количество всех сборок-родителей до корня.
 */
export function totalQty(tree: Tree, itemId: string): number {
  let sum = 0
  for (const o of tree.usesOf.get(itemId) ?? []) {
    let mult = o.qty
    let p = o.parent_id
    let guard = 0
    while (p && guard++ < 64) {
      const node = tree.byOcc.get(p)
      if (!node) break
      mult *= node.occ.qty
      p = node.occ.parent_id
    }
    sum += mult
  }
  return Math.round(sum * 1000) / 1000
}

/** Путь «Сборка → Сборка → Деталь» для подсказки «где используется». */
export function pathTitles(tree: Tree, occ: Occurrence): string[] {
  const out: string[] = [tree.byItemId.get(occ.item_id)?.name ?? '']
  let cur = occ.parent_id
  let guard = 0
  while (cur && guard++ < 64) {
    const node = tree.byOcc.get(cur)
    if (!node) break
    out.unshift(node.item.name)
    cur = node.occ.parent_id
  }
  return out.filter(Boolean)
}

/** id всех предков вхождения — чтобы раскрыть ветку к найденной позиции. */
export function ancestorsOf(tree: Tree, occId: string): string[] {
  const out: string[] = []
  let node = tree.byOcc.get(occId)
  let guard = 0
  while (node?.occ.parent_id && guard++ < 64) {
    out.push(node.occ.parent_id)
    node = tree.byOcc.get(node.occ.parent_id)
  }
  return out
}
