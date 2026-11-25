export type Kind = 'assembly' | 'assembly_bch' | 'part' | 'part_bch' | 'purchased'

export const KINDS: Kind[] = ['assembly', 'assembly_bch', 'part', 'part_bch', 'purchased']

export const KIND_LABEL: Record<Kind, string> = {
  assembly: 'Сборка',
  assembly_bch: 'Сборка БЧ',
  part: 'Деталь',
  part_bch: 'Деталь БЧ',
  purchased: 'Покупной',
}

export type StageId =
  | 'st_3d'
  | 'st_dwg'
  | 'st_dwg_check'
  | 'st_spec'
  | 'st_card'
  | 'st_green_doc'
  | 'st_cm_3d'
  | 'st_cm_dwg'
  | 'st_notice'
  | 'st_coded'

export type Stages = Partial<Record<StageId, boolean>>

export interface Item {
  id: string
  product_id: string
  designation: string | null
  name: string
  kind: Kind
  bch_ref: string | null
  supplier: string | null
  manufacturer_part_no: string | null
  comment: string | null
  responsible_3d: string | null
  due_3d: string | null
  responsible_dwg: string | null
  due_dwg: string | null
  stages: Stages
}

export interface Occurrence {
  id: string
  product_id: string
  parent_id: string | null
  item_id: string
  qty: number
  sort: number
  /** к какой позиции относится (напр. винты → крышка); только подсказка, структуру не меняет */
  link_item_id?: string | null
}

export interface Product {
  id: string
  code: string | null
  name: string
}

export type Role = 'admin' | 'editor' | 'viewer'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Полный доступ',
  editor: 'Отметки и поля',
  viewer: 'Только просмотр',
}

export interface Profile {
  id: string
  email: string
  name: string
  role: Role
}

export interface EventLog {
  id?: number
  product_id: string
  actor: string | null
  kind: string
  detail: string | null
  created_at?: string
}

export interface Snapshot {
  product: Product
  items: Item[]
  occurrences: Occurrence[]
}
