import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import seed from '../data/seed.json'
import type { Item, Occurrence } from '../model/types'
import { buildTree, visibleRows } from '../model/tree'
import { TreeTable } from './TreeTable'

const items = seed.items as unknown as Item[]
const occs = seed.occurrences as unknown as Occurrence[]
const tree = buildTree(items, occs)

const noop = () => {}

describe('таблица структуры', () => {
  const html = renderToStaticMarkup(
    <TreeTable
      rows={visibleRows(tree.roots, new Set())}
      tree={tree}
      canEdit
      canStructure
      collapsed={new Set()}
      q=""
      selected={null}
      onSelect={noop}
      onToggleCollapse={noop}
      onToggleStage={noop}
      onField={noop}
      onAdd={noop}
      onEdit={noop}
      onMove={noop}
      onDelete={noop}
      onUsage={noop}
      onDrop={noop}
    />,
  )

  it('рендерит корень и вложенные позиции', () => {
    expect(html).toContain('Электродвигатель тяговый с аксиальным потоком')
    expect(html).toContain('Шина приварная')
  })

  it('галок больше, чем строк: этапы только у применимых типов', () => {
    const ticks = html.match(/class="tick/g) ?? []
    const na = html.match(/class="tick na/g) ?? []
    expect(ticks.length).toBeGreaterThan(500)
    expect(na.length).toBeGreaterThan(100)
  })

  it('у БЧ-позиции вместо чертежа — номер БЧ-документа', () => {
    expect(html).toContain('bch-ref')
    expect(html).toContain('6282-2103810-10')
  })

  it('прогресс и статус выводятся', () => {
    expect(html).toContain('Готово')
    expect(html).toContain('Не начато')
    expect(html).toContain('%')
  })
})
