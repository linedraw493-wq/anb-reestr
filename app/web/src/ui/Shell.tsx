import type { ReactNode } from 'react'
import { USE_FAKE } from '../lib/api'
import { fakeHint } from '../lib/fake'

/** Общая рамка всех экранов входа: бумага, карточка, подпись сверху. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <div className="card">
        <div className="wordmark">Ассоциация блогеров</div>
        {children}
        {USE_FAKE && (
          <div className="note hint" role="status">
            {fakeHint}
          </div>
        )}
      </div>
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
