import { STAGES, STATUS_LABEL, progressOf, statusOf, hasStage } from '../model/stages'
import { KIND_LABEL, type Kind, type Snapshot } from '../model/types'
import { buildTree, progress, walk } from '../model/tree'

const NB = '\u00A0'

/** Выгрузка в Excel: лист структуры с отступами + сводка по типам. */
export async function exportXlsx(snap: Snapshot): Promise<void> {
  // xlsx тяжелый — грузим только когда реально нужен экспорт
  const XLSX = await import('xlsx')
  const tree = buildTree(snap.items, snap.occurrences)

  const head = [
    'Наименование',
    'Тип',
    'Номер ТС',
    'Кол-во',
    'БЧ',
    ...STAGES.map((s) => s.label),
    'Готовность',
    'С детьми',
    'Статус',
    'Комментарий',
  ]

  const rows: (string | number)[][] = [head]
  walk(tree.roots, (n) => {
    const i = n.item
    const pr = progress(n)
    rows.push([
      NB.repeat(n.depth * 4) + i.name,
      KIND_LABEL[i.kind],
      i.designation ?? '',
      n.item.kind === 'assembly' || n.item.kind === 'assembly_bch' ? '' : n.occ.qty,
      i.bch_ref ?? '',
      ...STAGES.map((s) => (hasStage(i.kind, s.id) ? (i.stages[s.id] ? '✓' : '') : '')),
      Math.round(pr.own * 100) / 100,
      Math.round(pr.withChildren * 100) / 100,
      STATUS_LABEL[statusOf(i)],
      i.comment ?? '',
    ])
  })

  const kinds: Kind[] = ['assembly', 'assembly_bch', 'part', 'part_bch', 'purchased']
  const seen = new Map<string, (typeof snap.items)[number]>()
  walk(tree.roots, (n) => seen.set(n.item.id, n.item))
  const all = [...seen.values()]
  const sum: (string | number)[][] = [['Тип элемента', 'Всего', 'Готово', 'В работе', 'Не начато', 'Средний прогресс']]
  for (const k of kinds) {
    const list = all.filter((i) => i.kind === k)
    if (!list.length) continue
    const done = list.filter((i) => statusOf(i) === 'done').length
    const wip = list.filter((i) => statusOf(i) === 'wip').length
    const fresh = list.filter((i) => statusOf(i) === 'new').length
    const avg = list.reduce((a, i) => a + progressOf(i), 0) / list.length
    sum.push([KIND_LABEL[k], list.length, done, wip, fresh, Math.round(avg * 100) / 100])
  }
  const avgAll = all.length ? all.reduce((a, i) => a + progressOf(i), 0) / all.length : 0
  sum.push(['ИТОГО', all.length, all.filter((i) => statusOf(i) === 'done').length, '', '', Math.round(avgAll * 100) / 100])

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 58 }, { wch: 12 }, { wch: 20 }, { wch: 7 }, { wch: 18 }, ...STAGES.map(() => ({ wch: 8 })), { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 30 }]
  ws['!freeze'] = { xSplit: 1, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, ws, 'Структура')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Сводка')

  const base = (snap.product.code || snap.product.name || 'izdelie').replace(/[\\/:*?"<>|]+/g, '_')
  XLSX.writeFile(wb, `Контроль ${base}.xlsx`)
}
