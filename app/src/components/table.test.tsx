import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Item, Occurrence } from '../model/types'
import { buildTree, visibleRows } from '../model/tree'
import { TreeTable } from './TreeTable'

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

const items: Item[] = [
  item({ id: 'a', designation: '6282-2103700-10', name: 'Электродвигатель тяговый с аксиальным потоком', kind: 'assembly' }),
  item({ id: 'b', designation: '6282-2103856', name: 'Шина приварная' }),
  item({ id: 'c', designation: '6282-2103834', name: 'Шина переходная фазная', kind: 'part_bch', bch_ref: '6282-2103810-10' }),
  item({ id: 'd', name: 'Винты крышки', kind: 'purchased', stages: { st_coded: true } }),
]
const occs: Occurrence[] = [
  { id: 'o1', product_id: 'p', parent_id: null, item_id: 'a', qty: 1, sort: 1 },
  { id: 'o2', product_id: 'p', parent_id: 'o1', item_id: 'b', qty: 1, sort: 1 },
  { id: 'o3', product_id: 'p', parent_id: 'o1', item_id: 'c', qty: 1, sort: 2 },
  { id: 'o4', product_id: 'p', parent_id: 'o1', item_id: 'd', qty: 4, sort: 3 },
  { id: 'o5', product_id: 'p', parent_id: 'o3', item_id: 'b', qty: 2, sort: 1 },
]
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

  it('этапы рисуются только у применимых типов', () => {
    const ticks = html.match(/class="tick/g) ?? []
    const na = html.match(/class="tick na/g) ?? []
    expect(ticks.length).toBeGreaterThan(10)
    expect(na.length).toBeGreaterThan(5)
  })

  it('у БЧ-позиции вместо чертежа — номер БЧ-документа', () => {
    expect(html).toContain('bch-ref')
    expect(html).toContain('6282-2103810-10')
  })

  it('бейдж использования: деталь стоит в двух местах', () => {
    expect(html).toContain('×2')
  })

  it('прогресс и статус выводятся', () => {
    expect(html).toContain('Готово')
    expect(html).toContain('Не начато')
    expect(html).toContain('%')
  })
})
