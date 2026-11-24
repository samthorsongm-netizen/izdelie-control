import type { EventLog, Item, Occurrence, Product, Profile, Snapshot } from '../model/types'
import type { Repo } from './repo'

/**
 * Демо-хранилище: данные в localStorage, без сервера.
 * Стартовые данные берутся из public/seed.json (если его нет — демо пустое).
 */
const KEY = 'izdelie-control:v1'

interface Db {
  products: Product[]
  items: Item[]
  occurrences: Occurrence[]
  events: EventLog[]
}

const empty = (): Db => ({ products: [], items: [], occurrences: [], events: [] })

let seedPromise: Promise<Db> | null = null

function loadSeed(): Promise<Db> {
  if (!seedPromise) {
    seedPromise = fetch(`${import.meta.env.BASE_URL}seed.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s?.product) return empty()
        const p = s.product as Product
        return {
          products: [p],
          items: (s.items as Omit<Item, 'product_id'>[]).map((i) => ({ ...i, product_id: p.id })),
          occurrences: (s.occurrences as Occurrence[]).map((o) => ({ ...o, product_id: p.id })),
          events: [],
        }
      })
      .catch(() => empty())
  }
  return seedPromise
}

async function read(): Promise<Db> {
  const raw = localStorage.getItem(KEY)
  if (!raw) {
    const db = await loadSeed()
    write(db)
    return db
  }
  try {
    return JSON.parse(raw) as Db
  } catch {
    const db = await loadSeed()
    write(db)
    return db
  }
}

function write(db: Db) {
  localStorage.setItem(KEY, JSON.stringify(db))
}

export function resetDemo() {
  localStorage.removeItem(KEY)
  seedPromise = null
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

async function tx<T>(fn: (db: Db) => T): Promise<T> {
  const db = await read()
  const out = fn(db)
  write(db)
  notify()
  return out
}

export const localRepo: Repo = {
  mode: 'demo',
  me: { id: 'demo', email: 'demo@local', name: 'Тодорович', role: 'admin' } as Profile,

  async listProducts() {
    return (await read()).products
  },

  async listPeople() {
    const db = await read()
    const names = new Set<string>()
    for (const i of db.items) {
      if (i.responsible_3d) names.add(i.responsible_3d)
      if (i.responsible_dwg) names.add(i.responsible_dwg)
    }
    if (localRepo.me?.name) names.add(localRepo.me.name)
    return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
  },

  async loadProduct(id): Promise<Snapshot> {
    const db = await read()
    return {
      product: db.products.find((p) => p.id === id)!,
      items: db.items.filter((i) => i.product_id === id),
      occurrences: db.occurrences.filter((o) => o.product_id === id),
    }
  },

  async createProduct(p, cloneFrom) {
    await tx((db) => {
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
    await tx((db) => {
      db.products = db.products.filter((p) => p.id !== id)
      db.items = db.items.filter((i) => i.product_id !== id)
      db.occurrences = db.occurrences.filter((o) => o.product_id !== id)
    })
  },

  async insertItem(i) {
    await tx((db) => void db.items.push(i))
  },
  async updateItem(i) {
    await tx((db) => {
      const k = db.items.findIndex((x) => x.id === i.id)
      if (k >= 0) db.items[k] = i
    })
  },
  async deleteItem(id) {
    await tx((db) => void (db.items = db.items.filter((x) => x.id !== id)))
  },
  async insertOcc(o) {
    await tx((db) => void db.occurrences.push(o))
  },
  async updateOcc(o) {
    await tx((db) => {
      const k = db.occurrences.findIndex((x) => x.id === o.id)
      if (k >= 0) db.occurrences[k] = o
    })
  },
  async deleteOcc(id) {
    await tx((db) => void (db.occurrences = db.occurrences.filter((x) => x.id !== id)))
  },
  async log(e) {
    await tx((db) => {
      db.events.unshift({ ...e, id: Date.now(), created_at: new Date().toISOString() })
      db.events = db.events.slice(0, 500)
    })
  },
  async listEvents(productId, limit) {
    return (await read()).events.filter((e) => e.product_id === productId).slice(0, limit)
  },
  subscribe(_productId, cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
}
