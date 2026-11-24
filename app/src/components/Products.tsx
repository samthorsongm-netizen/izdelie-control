import { useCallback, useEffect, useState } from 'react'
import type { Repo } from '../data/repo'
import type { Product, Profile } from '../model/types'
import { Modal, Confirm } from './Modal'
import { resetDemo } from '../data/local'

export function Products({ repo, me, onOpen }: { repo: Repo; me: Profile; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<Product[]>([])
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Product | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await repo.listProducts())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [repo])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Изделия</h2>
        <div className="grow" />
        {me.role === 'admin' && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            + Изделие
          </button>
        )}
        {repo.mode === 'demo' && (
          <button
            className="btn"
            onClick={() => {
              resetDemo()
              void load()
              location.reload()
            }}
          >
            Сбросить демо-данные
          </button>
        )}
      </div>

      {error && <div className="banner">{error}</div>}

      {items.length === 0 ? (
        <div className="empty-state">Пока ни одного изделия. {me.role === 'admin' && 'Нажмите «+ Изделие».'}</div>
      ) : (
        <div className="products">
          {items.map((p) => (
            <div key={p.id} className="product-card" onClick={() => onOpen(p.id)}>
              <div className="code">{p.code || 'без номера'}</div>
              <h3>{p.name}</h3>
              <div className="row">
                <span className="small muted">Открыть структуру →</span>
                <div className="grow" />
                {me.role === 'admin' && (
                  <button
                    className="btn ghost sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleting(p)
                    }}
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateModal
          repo={repo}
          products={items}
          onClose={() => setCreating(false)}
          onDone={async (id) => {
            setCreating(false)
            await load()
            onOpen(id)
          }}
        />
      )}

      {deleting && (
        <Confirm
          title="Удалить изделие?"
          text={
            <>
              <b>{deleting.name}</b> ({deleting.code || 'без номера'}) — удалится вместе со всей структурой, позициями и
              историей. Отменить это нельзя.
            </>
          }
          onClose={() => setDeleting(null)}
          actions={[
            {
              label: 'Удалить навсегда',
              tone: 'danger',
              onClick: async () => {
                await repo.deleteProduct(deleting.id)
                setDeleting(null)
                await load()
              },
            },
          ]}
        />
      )}
    </>
  )
}

function CreateModal({
  repo,
  products,
  onClose,
  onDone,
}: {
  repo: Repo
  products: Product[]
  onClose: () => void
  onDone: (id: string) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [cloneFrom, setCloneFrom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return (
    <Modal
      title="Новое изделие"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn primary"
            disabled={busy || !name.trim()}
            onClick={async () => {
              const id = crypto.randomUUID()
              setBusy(true)
              try {
                await repo.createProduct({ id, code: code.trim() || null, name: name.trim() }, cloneFrom || undefined)
                onDone(id)
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
                setBusy(false)
              }
            }}
          >
            Создать
          </button>
        </>
      }
    >
      <div className="field">
        <label>Обозначение (основной номер)</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="например 6282-2103800-10" />
        <div className="hint">Можно оставить пустым и заполнить позже.</div>
      </div>
      <div className="field">
        <label>Наименование</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="например Электродвигатель тяговый" autoFocus />
      </div>
      <div className="field">
        <label>Скопировать структуру</label>
        <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}>
          <option value="">Не копировать — пустое изделие</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code || 'без номера'})
            </option>
          ))}
        </select>
        <div className="hint">Скопируются все сборки, детали и связи. Отметки и сроки сбросятся, ответственные останутся.</div>
      </div>
      {error && <div className="banner">{error}</div>}
    </Modal>
  )
}
