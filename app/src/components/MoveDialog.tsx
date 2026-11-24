import { useState } from 'react'
import { canMoveInto, walk, type Node, type Tree } from '../model/tree'
import { Modal } from './Modal'

export function MoveDialog({
  tree,
  node,
  onClose,
  onMove,
}: {
  tree: Tree
  node: Node
  onClose: () => void
  onMove: (parentOccId: string | null) => void
}) {
  const [target, setTarget] = useState<string | null>(null)

  const options: Node[] = []
  walk(tree.roots, (n) => {
    const assembly = n.item.kind === 'assembly' || n.item.kind === 'assembly_bch'
    if (!assembly) return
    if (!canMoveInto(tree, node.occ.id, n.occ.id)) return
    options.push(n)
  })

  return (
    <Modal
      title="Переместить"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!target} onClick={() => target && onMove(target)}>
            Переместить
          </button>
        </>
      }
    >
      <div className="field">
        <label>Что перемещаем</label>
        <div>
          <b>{node.item.name}</b> {node.item.designation && <span className="designation">{node.item.designation}</span>}
        </div>
      </div>
      <div className="field">
        <label>Куда</label>
        <div className="opt-list" style={{ maxHeight: 320 }}>
          {options.map((n) => (
            <div
              key={n.occ.id}
              className={`opt${target === n.occ.id ? ' sel' : ''}`}
              onClick={() => setTarget(n.occ.id)}
              style={{ paddingLeft: 10 + n.depth * 14 }}
            >
              <input type="radio" readOnly checked={target === n.occ.id} />
              <div className="t">
                {n.item.name}
                {n.item.designation && <span className="designation">{n.item.designation}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
