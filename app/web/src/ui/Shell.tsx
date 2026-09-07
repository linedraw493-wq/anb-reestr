import type { ReactNode } from 'react'
import { USE_FAKE } from '../lib/rezhim'
import { Nadpis } from './Nadpis'

const PODSKAZKA = 'Заглушка: сервера нет, код всегда 000000'

/**
 * Рамка экранов входа: одна карточка посредине.
 *
 * Слово владельца 02.09.2026: «дизайн убери, нам нужно рабочее MVP». Отсюда
 * ушла рекламная панель слева с придуманными блогерами — она ничего не
 * делала, а на входе показывать выдуманные цифры и вовсе неправильно.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <main className="pane">
        {/* Надпись — на весь экран за карточкой, а не внутри неё: так она
            читается как фон страницы, ради чего и затевалась. */}
        <Nadpis slovo="РЕЕСТР" />
        <div className="card">
          <div className="wordmark pane-mark">Реестр блогеров</div>
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
