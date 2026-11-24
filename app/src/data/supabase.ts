import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { EventLog, Item, Occurrence, Product, Profile, Role, Snapshot } from '../model/types'
import type { Repo } from './repo'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const cloudEnabled = Boolean(url && anon)

export const sb: SupabaseClient | null = cloudEnabled ? createClient(url!, anon!) : null

/** Разбудить проект Supabase, пока пользователь вводит пароль (free-план засыпает). */
export async function warmup(): Promise<void> {
  if (!cloudEnabled) return
  try {
    await fetch(`${url}/auth/v1/health`, { cache: 'no-store' })
  } catch {
    /* не критично */
  }
}

/** Список людей не меняется каждую минуту — держим в памяти на сессию. */
let peopleCache: string[] | null = null
export function resetPeopleCache() {
  peopleCache = null
}

function db(): SupabaseClient {
  if (!sb) throw new Error('Supabase не настроен')
  return sb
}

export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut() {
  await db().auth.signOut()
}

export async function currentSession() {
  const { data } = await db().auth.getSession()
  return data.session
}

export async function loadProfile(): Promise<Profile | null> {
  const session = await currentSession()
  if (!session) return null
  const { data, error } = await db()
    .from('profiles')
    .select('id,email,name,role')
    .eq('id', session.user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return { id: session.user.id, email: session.user.email ?? '', name: session.user.email ?? '', role: 'viewer' }
  return data as Profile
}

// ---------- управление пользователями (только admin) ----------

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await db().from('profiles').select('id,email,name,role').order('email')
  if (error) throw new Error(error.message)
  return (data ?? []) as Profile[]
}

export async function setRole(id: string, role: Role): Promise<void> {
  const { error } = await db().from('profiles').update({ role }).eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Создание пользователя без service-ключа: signUp во временном клиенте,
 * чтобы не сбить сессию администратора. Роль триггер ставит 'viewer',
 * нужную проставляем сразу после.
 */
export async function createUser(email: string, password: string, name: string, role: Role): Promise<string> {
  const tmp = createClient(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await tmp.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { name: name.trim() || email.split('@')[0] } },
  })
  if (error) {
    const m = error.message
    if (m.includes('already registered')) throw new Error('Такой пользователь уже есть — поменяйте ему роль в списке.')
    if (m.toLowerCase().includes('signups not allowed'))
      throw new Error(
        'В Supabase выключена регистрация. Включите Authentication → Providers → Email → Enable sign ups, иначе без service-ключа пользователей не создать.',
      )
    if (m.toLowerCase().includes('password'))
      throw new Error('Пароль не подошёл: минимум 6 символов, без кириллицы.')
    throw new Error(m)
  }
  const uid = data.user?.id
  if (!uid) throw new Error('Пользователь не создан. Проверьте настройки регистрации в Supabase.')
  const { error: e2 } = await db().from('profiles').update({ role }).eq('id', uid)
  if (e2) throw new Error(`Пользователь создан, но роль не выставлена: ${e2.message}`)
  resetPeopleCache()
  return uid
}

export const cloudRepo: Repo = {
  mode: 'cloud',
  me: null,

  async listProducts() {
    const { data, error } = await db().from('products').select('id,code,name').order('created_at')
    if (error) throw new Error(error.message)
    return (data ?? []) as Product[]
  },

  async listPeople() {
    if (peopleCache) return peopleCache
    const { data, error } = await db().from('profiles').select('name,email').order('name')
    if (error) throw new Error(error.message)
    const names = (data ?? []).map((r: { name: string | null; email: string | null }) => (r.name || r.email || '').trim())
    peopleCache = [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
    return peopleCache
  },

  async findItemByDesignation(productId: string, designation: string) {
    const { data, error } = await db()
      .from('items')
      .select('*')
      .eq('product_id', productId)
      .ilike('designation', designation.trim().replace(/[%_]/g, (m) => `\\${m}`))
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data ?? null) as Item | null
  },

  async mergeItems(fromId: string, toId: string, patch: Partial<Item>) {
    const { error: e1 } = await db().from('occurrences').update({ item_id: toId }).eq('item_id', fromId)
    if (e1) throw new Error(e1.message)
    const { id: _id, product_id: _pid, ...rest } = patch
    const { error: e2 } = await db().from('items').update(rest).eq('id', toId)
    if (e2) throw new Error(e2.message)
    const { error: e3 } = await db().from('items').delete().eq('id', fromId)
    if (e3) throw new Error(e3.message)
  },

  async swapDesignations(aId: string, bId: string) {
    const { data, error } = await db().from('items').select('id,designation').in('id', [aId, bId])
    if (error) throw new Error(error.message)
    const a = (data ?? []).find((x: { id: string }) => x.id === aId)
    const b = (data ?? []).find((x: { id: string }) => x.id === bId)
    if (!a || !b) throw new Error('Позиции для обмена не найдены')
    // три шага через временный номер: уникальный индекс не даст обменять напрямую
    const steps: [string, string | null][] = [
      [aId, `__swap_${crypto.randomUUID()}`],
      [bId, a.designation],
      [aId, b.designation],
    ]
    for (const [id, value] of steps) {
      const { error: e } = await db().from('items').update({ designation: value }).eq('id', id)
      if (e) throw new Error(e.message)
    }
  },

  async loadProduct(id): Promise<Snapshot> {
    const [p, i, o] = await Promise.all([
      db().from('products').select('id,code,name').eq('id', id).single(),
      db().from('items').select('*').eq('product_id', id),
      db().from('occurrences').select('*').eq('product_id', id).order('sort'),
    ])
    if (p.error) throw new Error(p.error.message)
    if (i.error) throw new Error(i.error.message)
    if (o.error) throw new Error(o.error.message)
    return {
      product: p.data as Product,
      items: (i.data ?? []) as Item[],
      occurrences: (o.data ?? []) as Occurrence[],
    }
  },

  async createProduct(p, cloneFrom) {
    const { error } = await db().from('products').insert({ id: p.id, code: p.code, name: p.name })
    if (error) throw new Error(error.message)
    if (cloneFrom) {
      const { error: e2 } = await db().rpc('clone_product_structure', { src: cloneFrom, dst: p.id, new_code: p.code })
      if (e2) throw new Error(e2.message)
      return
    }
    const rootItem = {
      id: crypto.randomUUID(),
      product_id: p.id,
      designation: p.code,
      name: p.name,
      kind: 'assembly',
      stages: {},
    }
    const { error: e1 } = await db().from('items').insert(rootItem)
    if (e1) throw new Error(e1.message)
    const { error: e2 } = await db()
      .from('occurrences')
      .insert({ id: crypto.randomUUID(), product_id: p.id, parent_id: null, item_id: rootItem.id, qty: 1, sort: 1 })
    if (e2) throw new Error(e2.message)
  },

  async deleteProduct(id) {
    const { error } = await db().from('products').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },

  async insertItem(i) {
    const { error } = await db().from('items').insert(i)
    if (error) throw new Error(error.message)
  },
  async updateItem(i) {
    const { error } = await db().from('items').update(i).eq('id', i.id)
    if (error) throw new Error(error.message)
  },
  async deleteItem(id) {
    const { error } = await db().from('items').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },
  async insertOcc(o) {
    const { error } = await db().from('occurrences').insert(o)
    if (error) throw new Error(error.message)
  },
  async updateOcc(o) {
    const { error } = await db().from('occurrences').update(o).eq('id', o.id)
    if (error) throw new Error(error.message)
  },
  async deleteOcc(id) {
    const { error } = await db().from('occurrences').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },
  async log(e) {
    await db().from('events').insert(e)
  },
  async listEvents(productId, limit) {
    const { data, error } = await db()
      .from('events')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    return (data ?? []) as EventLog[]
  },

  subscribe(productId, cb) {
    const channel = db()
      .channel(`product-${productId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `product_id=eq.${productId}` }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences', filter: `product_id=eq.${productId}` }, cb)
      .subscribe()
    return () => {
      void db().removeChannel(channel)
    }
  },
}
