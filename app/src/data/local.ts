import seed from './seed.json'
import type { EventLog, Item, Occurrence, Product, Profile, Snapshot } from '../model/types'
import type { Repo } from './repo'

/**
 * Демо-хранилище: данные в localStorage, без сервера.
 * Нужно, чтобы приложение можно было пощупать до настройки Supabase.
 */
const KEY = 'izdelie-control:v1'

interface Db {
  products: Product[]
  items: Item[]
  occurrences: Occurrence[]
  events: EventLog[]
}

function fromSeed(): Db {
  const p = seed.product as Product
  const items = (seed.items as unknown as Omit<Item, 'product_id'>[]).map((i) => ({ ...i, product_id: p.id }))
  const occs = (seed.occurrences as Occurrence[]).map((o) => ({ ...o, product_id: p.id }))
  return { products: [p], items, occurrences: occs, events: [] }
}

function read(): Db {
  const raw = localStorage.getItem(KEY)
  if (!raw) {
    const db = fromSeed()
    write(db)
    return db
  }
  try {
    return JSON.parse(raw) as Db
  } catch {
    const db = fromSeed()
    write(db)
    return db
  }
}

function write(db: Db) {
  localStorage.setItem(KEY, JSON.stringify(db))
}

export function resetDemo() {
  localStorage.removeItem(KEY)
}

const listeners = new Set<() => void>()
function notify() {
  for (const fn of listeners) fn()
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) notify()
  })
}

function tx<T>(fn: (db: Db) => T): T {
  const db = read()
  const out = fn(db)
  write(db)
  notify()
  return out
}

export const localRepo: Repo = {
  mode: 'demo',
  me: { id: 'demo', email: 'demo@local', name: 'Тодорович', role: 'admin' } as Profile,

  async listProducts() {
    return read().products
  },

  async loadProduct(id): Promise<Snapshot> {
    const db = read()
    return {
      product: db.products.find((p) => p.id === id)!,
      items: db.items.filter((i) => i.product_id === id),
      occurrences: db.occurrences.filter((o) => o.product_id === id),
    }
  },

  async createProduct(p, cloneFrom) {
    tx((db) => {
      db.products.push(p)
      if (cloneFrom) {
        const map = new Map<string, string>()
        for (const i of db.items.filter((x) => x.product_id === cloneFrom)) {
          const nid = crypto.randomUUID()
          map.set(i.id, nid)
          db.items.push({ ...i, id: nid, product_id: p.id, stages: {}, due_3d: null, due_dwg: null })
        }
        const mapOcc = new Map<string, string>()
        const src = db.occurrences.filter((x) => x.product_id === cloneFrom)
        for (const o of src) mapOcc.set(o.id, crypto.randomUUID())
        for (const o of src) {
          db.occurrences.push({
            ...o,
            id: mapOcc.get(o.id)!,
            product_id: p.id,
            item_id: map.get(o.item_id)!,
            parent_id: o.parent_id ? mapOcc.get(o.parent_id)! : null,
          })
        }
        const rootOcc = db.occurrences.find((o) => o.product_id === p.id && o.parent_id === null)
        const rootItem = rootOcc && db.items.find((i) => i.id === rootOcc.item_id)
        if (rootItem && p.code) rootItem.designation = p.code
        return
      }
      // у каждого изделия ровно один корень — сама сборка изделия
      const root: Item = {
        id: crypto.randomUUID(),
        product_id: p.id,
        designation: p.code,
        name: p.name,
        kind: 'assembly',
        bch_ref: null,
        supplier: null,
        manufacturer_part_no: null,
        comment: null,
        responsible_3d: null,
        due_3d: null,
        responsible_dwg: null,
        due_dwg: null,
        stages: {},
      }
      db.items.push(root)
      db.occurrences.push({ id: crypto.randomUUID(), product_id: p.id, parent_id: null, item_id: root.id, qty: 1, sort: 1 })
    })
  },

  async deleteProduct(id) {
    tx((db) => {
      db.products = db.products.filter((p) => p.id !== id)
      db.items = db.items.filter((i) => i.product_id !== id)
      db.occurrences = db.occurrences.filter((o) => o.product_id !== id)
    })
  },

  async insertItem(i) {
    tx((db) => void db.items.push(i))
  },
  async updateItem(i) {
    tx((db) => {
      const k = db.items.findIndex((x) => x.id === i.id)
      if (k >= 0) db.items[k] = i
    })
  },
  async deleteItem(id) {
    tx((db) => void (db.items = db.items.filter((x) => x.id !== id)))
  },
  async insertOcc(o) {
    tx((db) => void db.occurrences.push(o))
  },
  async updateOcc(o) {
    tx((db) => {
      const k = db.occurrences.findIndex((x) => x.id === o.id)
      if (k >= 0) db.occurrences[k] = o
    })
  },
  async deleteOcc(id) {
    tx((db) => void (db.occurrences = db.occurrences.filter((x) => x.id !== id)))
  },
  async log(e) {
    tx((db) => {
      db.events.unshift({ ...e, id: Date.now(), created_at: new Date().toISOString() })
      db.events = db.events.slice(0, 500)
    })
  },
  async listEvents(productId, limit) {
    return read()
      .events.filter((e) => e.product_id === productId)
      .slice(0, limit)
  },
  subscribe(_productId, cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
}
