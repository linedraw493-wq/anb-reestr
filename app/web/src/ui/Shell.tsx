import type { ReactNode } from 'react'
import { USE_FAKE } from '../lib/rezhim'

const PODSKAZKA = 'Заглушка: сервера нет, код всегда 000000'

/** Вымышленные, только чтобы показать, куда человек вступает. */
const taste = [
  { ini: 'АС', nick: '@aigerim.style', mt: 'Мода · Алматы', v: '48.2K' },
  { ini: 'ДТ', nick: '@dastan.tech', mt: 'IT · Астана', v: '31.7K' },
  { ini: 'МЕ', nick: '@meiram.eats', mt: 'Еда · Шымкент', v: '92.4K' },
]

/**
 * Рамка экранов входа.
 * На телефоне — одна карточка. На большом экране слева встаёт панель
 * «зачем это вам» с живыми карточками каталога; сама форма не меняется.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <aside className="pitch">
        <div className="pitch-inner">
          <div className="wordmark">Ассоциация блогеров</div>
          <h2 className="pitch-h">Реестр, по которому вас найдут</h2>
          <p className="pitch-p">
            Блогеры Казахстана в одном каталоге. Рекламодатель ищет по тематике, охвату и
            району — и пишет вам сам.
          </p>
          <ul className="taste">
            {taste.map((t) => (
              <li key={t.nick} className="tcard">
                <span className="ava" aria-hidden="true">
                  {t.ini}
                </span>
                <span className="tcard-txt">
                  <span className="nm">{t.nick}</span>
                  <span className="mt">{t.mt}</span>
                </span>
                <span className="tcard-v">{t.v}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="pane">
        <div className="card">
          <div className="wordmark pane-mark">Ассоциация блогеров</div>
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
