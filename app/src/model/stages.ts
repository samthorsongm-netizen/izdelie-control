import type { Item, Kind, StageId, Stages } from './types'

export interface StageDef {
  id: StageId
  label: string
  short: string
  group: '3d' | 'dwg' | 'other' | 'buy'
  kinds: Kind[]
}

const NO_BCH: Kind[] = ['assembly', 'part']

/** Матрица «этап × тип элемента» — ровно как в исходном Excel. */
export const STAGES: StageDef[] = [
  { id: 'st_3d', label: '3D', short: '3D', group: '3d', kinds: ['assembly', 'assembly_bch', 'part', 'part_bch'] },
  { id: 'st_dwg', label: 'Чертеж', short: 'Чертёж', group: 'dwg', kinds: NO_BCH },
  { id: 'st_dwg_check', label: 'Проверка чертежа', short: 'Пров.', group: 'dwg', kinds: ['assembly', 'part'] },
  { id: 'st_spec', label: 'Спецификация', short: 'Спец.', group: 'other', kinds: ['assembly', 'assembly_bch'] },
  { id: 'st_card', label: 'Карточка', short: 'Карт.', group: 'other', kinds: ['assembly', 'assembly_bch', 'part', 'part_bch'] },
  { id: 'st_green_doc', label: 'Зеленый документ', short: 'Зел.', group: 'other', kinds: ['assembly', 'assembly_bch'] },
  { id: 'st_cm_3d', label: 'Чекмейт 3D', short: 'ЧМ 3D', group: 'other', kinds: ['assembly', 'assembly_bch', 'part', 'part_bch'] },
  { id: 'st_cm_dwg', label: 'Чекмейт чертежа', short: 'ЧМ черт.', group: 'other', kinds: ['assembly', 'part'] },
  { id: 'st_notice', label: 'Добавлено в извещение', short: 'Извещ.', group: 'other', kinds: ['assembly', 'assembly_bch', 'part', 'part_bch'] },
  { id: 'st_coded', label: 'Закодировано', short: 'Закод.', group: 'buy', kinds: ['purchased'] },
]

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, StageDef>

export const STAGE_ORDER: StageId[] = STAGES.map((s) => s.id)

export function applicableStages(kind: Kind): StageId[] {
  return STAGES.filter((s) => s.kinds.includes(kind)).map((s) => s.id)
}

export function hasStage(kind: Kind, id: StageId): boolean {
  return STAGE_BY_ID[id].kinds.includes(kind)
}

/** У БЧ-типов вместо своего чертежа — ссылка на документ, где чертёж лежит. */
export function isBch(kind: Kind): boolean {
  return kind === 'assembly_bch' || kind === 'part_bch'
}

export function hasDrawing(item: Item): boolean {
  return hasStage(item.kind, 'st_dwg') || hasStage(item.kind, 'st_dwg_check')
}

export type Status = 'done' | 'wip' | 'new'

export const STATUS_LABEL: Record<Status, string> = {
  done: 'Готово',
  wip: 'В работе',
  new: 'Не начато',
}

export function progressOf(item: Pick<Item, 'kind' | 'stages'>): number {
  const ids = applicableStages(item.kind)
  if (!ids.length) return 0
  return ids.filter((id) => item.stages[id]).length / ids.length
}

export function statusOf(item: Pick<Item, 'kind' | 'stages'>): Status {
  const p = progressOf(item)
  return p >= 1 ? 'done' : p <= 0 ? 'new' : 'wip'
}

export function emptyStages(): Stages {
  return Object.fromEntries(STAGE_ORDER.map((id) => [id, false])) as Stages
}

/** Этап применяется, но не отмечен и срок уже прошёл. */
export function isOverdue(item: Item, today = new Date()): boolean {
  const d = today.toISOString().slice(0, 10)
  const a = !!item.due_3d && item.due_3d < d && !item.stages.st_3d && hasStage(item.kind, 'st_3d')
  const b = !!item.due_dwg && item.due_dwg < d && !item.stages.st_dwg && hasStage(item.kind, 'st_dwg')
  return a || b
}

/** Срок в пределах 7 дней — предупреждение. */
export function isSoon(item: Item, today = new Date()): boolean {
  const d = today.toISOString().slice(0, 10)
  const soon = new Date(today.getTime() + 7 * 864e5).toISOString().slice(0, 10)
  const a = !!item.due_3d && item.due_3d >= d && item.due_3d <= soon && !item.stages.st_3d && hasStage(item.kind, 'st_3d')
  const b = !!item.due_dwg && item.due_dwg >= d && item.due_dwg <= soon && !item.stages.st_dwg && hasStage(item.kind, 'st_dwg')
  return a || b
}
