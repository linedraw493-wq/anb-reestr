import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ktoYa, type Ya } from '../lib/api'
import { Shapka } from './Shapka'

/* ---------------------------------------------------------------------------
   Своя дверь в админку — слово владельца 07.09.2026: «сделай отдельную
   ссылку на админку, чтобы была специальная админка прямо url».

   Адрес один и запоминается: `/admin`. Что происходит, когда его открыли:

   - никто не вошёл → отправляем на вход и помним, куда человек шёл;
     после кода он попадёт обратно в админку, а не в каталог;
   - вошёл обычный блогер → честно говорим, что сюда нельзя;
   - вошёл модератор или админ → показываем экран.

   Права всё равно проверяет сервер: это лишь чтобы человек не смотрел на
   пустой экран с ошибкой. Обойти проверку, подделав адрес, нельзя —
   каждый ответ админки закрыт ролью на сервере.
--------------------------------------------------------------------------- */

export function Adminka({ children }: { children: React.ReactNode }) {
  const mesto = useLocation()
  const navigate = useNavigate()
  const [ya, setYa] = useState<Ya | null>(null)

  useEffect(() => {
    let zhiv = true
    void ktoYa().then((r) => zhiv && setYa(r))
    return () => {
      zhiv = false
    }
  }, [])

  if (ya === null) {
    return (
      <div className="form-page">
        <div className="spinner" role="status" aria-label="Проверяем доступ" />
      </div>
    )
  }

  if (!ya.vnutri) {
    const kuda = encodeURIComponent(mesto.pathname + mesto.search)
    return <Navigate to={`/vhod?kuda=${kuda}`} replace />
  }

  if (ya.rol === 'blogger') {
    return (
      <div className="form-page narrow">
        <Shapka />
        <header className="form-head">
          <div className="wordmark">Ассоциация блогеров · админка</div>
          <h1>Сюда нельзя</h1>
          <p className="sub">
            Админка — для администраторов и модераторов Ассоциации. Вы вошли как блогер: вам сюда не
            нужно, а всё своё — в карточке.
          </p>
        </header>
        <button className="btn" onClick={() => navigate('/kartochka')}>
          Моя карточка
        </button>
      </div>
    )
  }

  return <>{children}</>
}
