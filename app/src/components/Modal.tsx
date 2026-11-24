import { useEffect, type ReactNode } from 'react'

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export interface ConfirmAction {
  label: string
  tone?: 'primary' | 'danger'
  onClick: () => void
}

export function Confirm({
  title,
  text,
  actions,
  onClose,
}: {
  title: string
  text: ReactNode
  actions: ConfirmAction[]
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          {actions.map((a) => (
            <button key={a.label} className={`btn ${a.tone ?? ''}`} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </>
      }
    >
      <div>{text}</div>
    </Modal>
  )
}
