import type { Repo } from './repo'
import type { Occurrence, Snapshot } from '../model/types'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function depthOf(occ: Occurrence, map: Map<string, Occurrence>): number {
  let d = 0
  let p = occ.parent_id
  const seen = new Set<string>()
  while (p && map.has(p) && !seen.has(p) && d < 64) {
    seen.add(p)
    d++
    p = map.get(p)!.parent_id
  }
  return d
}

/**
 * Возврат изделия к снимку состояния (для отмены действия).
 * Пишет только то, что реально разошлось, в безопасном порядке.
 */
export async function restoreSnapshot(repo: Repo, target: Snapshot, current: Snapshot): Promise<void> {
  const curI = new Map(current.items.map((i) => [i.id, i]))
  const tgtI = new Map(target.items.map((i) => [i.id, i]))
  const curO = new Map(current.occurrences.map((o) => [o.id, o]))
  const tgtO = new Map(target.occurrences.map((o) => [o.id, o]))

  for (const [id, row] of tgtI) {
    const c = curI.get(id)
    if (c && !same(c, row)) await repo.updateItem(row)
  }
  for (const [id, row] of tgtI) if (!curI.has(id)) await repo.insertItem(row)

  const extra = [...curO.values()].filter((o) => !tgtO.has(o.id)).sort((a, b) => depthOf(b, curO) - depthOf(a, curO))
  for (const o of extra) await repo.deleteOcc(o.id)

  for (const id of curI.keys()) if (!tgtI.has(id)) await repo.deleteItem(id)

  const back = [...tgtO.values()].filter((o) => !curO.has(o.id)).sort((a, b) => depthOf(a, tgtO) - depthOf(b, tgtO))
  for (const o of back) await repo.insertOcc(o)

  for (const [id, row] of tgtO) {
    const c = curO.get(id)
    if (c && !same(c, row)) await repo.updateOcc(row)
  }
}
