import { useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { USE_FAKE } from '../lib/rezhim'

const PODSKAZKA = 'Заглушка: сервера нет, код всегда 000000'

/**
 * Рамка экранов входа: одна карточка посредине.
 *
 * Слово владельца 02.09.2026: «дизайн убери, нам нужно рабочее MVP». Отсюда
 * ушла рекламная панель слева с придуманными блогерами — она ничего не
 * делала, а на входе показывать выдуманные цифры и вовсе неправильно.
 */
export function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  // Скрытая дверь в админку: пять нажатий по надписи над заголовком.
  // Слово владельца 07.09.2026 — «скрытно, но понятно для обычного юзера».
  // Случайно так не нажимают, а тот, кому сказали, попадёт без адреса.
  const nazhatiya = useRef<number[]>([])

  function poNadpisi() {
    const teper = Date.now()
    nazhatiya.current = [...nazhatiya.current, teper].filter((t) => teper - t < 3000)
    if (nazhatiya.current.length >= 5) {
      nazhatiya.current = []
      navigate('/vhod/admin')
    }
  }

  return (
    <div className="page">
      <main className="pane">
        <div className="card">
          <div className="wordmark pane-mark" onClick={poNadpisi}>
            Реестр блогеров
          </div>
          {children}
          {USE_FAKE && (
            <div className="note hint" role="status">
              {PODSKAZKA}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export function Err({ children }: { children: ReactNode }) {
  return (
    <div className="note err" role="alert">
      <span className="dot" aria-hidden="true">
        !
      </span>
      <span>{children}</span>
    </div>
  )
}
