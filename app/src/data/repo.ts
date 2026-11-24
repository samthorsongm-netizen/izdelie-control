import type { EventLog, Item, Occurrence, Product, Profile, Snapshot } from '../model/types'

export interface Repo {
  mode: 'demo' | 'cloud'
  me: Profile | null
  listProducts(): Promise<Product[]>
  /** имена пользователей для выпадающего списка ответственных */
  listPeople(): Promise<string[]>
  loadProduct(id: string): Promise<Snapshot>
  /** позиция с таким номером ТС (без учёта регистра) */
  findItemByDesignation(productId: string, designation: string): Promise<Item | null>
  /** слить позицию fromId в toId: вхождения переезжают, fromId удаляется */
  mergeItems(fromId: string, toId: string, patch: Partial<Item>): Promise<void>
  /** поменять номера ТС двух позиций местами (через временное значение) */
  swapDesignations(aId: string, bId: string): Promise<void>
  createProduct(p: Product, cloneFrom?: string): Promise<void>
  deleteProduct(id: string): Promise<void>
  insertItem(i: Item): Promise<void>
  updateItem(i: Item): Promise<void>
  deleteItem(id: string): Promise<void>
  insertOcc(o: Occurrence): Promise<void>
  updateOcc(o: Occurrence): Promise<void>
  deleteOcc(id: string): Promise<void>
  log(e: EventLog): Promise<void>
  listEvents(productId: string, limit: number): Promise<EventLog[]>
  subscribe(productId: string, cb: () => void): () => void
  signIn?(email: string, password: string): Promise<void>
  signOut?(): Promise<void>
}
