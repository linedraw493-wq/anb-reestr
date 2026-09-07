import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ktoYa, vyyti, type Ya } from '../lib/api'

/* ---------------------------------------------------------------------------
   Админка — одно табло, а не пять отдельных страниц.

   Слово владельца 07.09.2026: «перенеси эту панель влево, как табло, чтобы
   было аккуратней и красивее» и «сделай эту панель общей, чтобы не было
   деления на разные категории и перехода как будто новая страница сайта,
   мув должен быть плавным и мягким, функционал должен быть в одном табло».

   Было: кнопка «Админка» в правом углу, под ней выпадашка, и каждый пункт
   уводил на отдельную страницу — с перерисовкой всего, включая шапку.
   Стало: слева колонка со всеми разделами, справа — их содержимое. Колонка
   живёт постоянно и при переходе не перерисовывается: React Router держит
   её на месте, меняется только `Outlet` внутри. Отсюда и «плавный мув» —
   меняется одна область, а не весь экран.

   Дверь тут же: не вошёл — отправим за кодом и вернём обратно; вошёл
   блогером — скажем, что сюда нельзя. Права всё равно проверяет сервер, это
   лишь чтобы человек не смотрел на пустой экран с ошибкой.
--------------------------------------------------------------------------- */

const RAZDELY = [
  { put: '/admin', imya: 'Проверка карточек', znak: '✓' },
  { put: '/admin/priglasheniya', imya: 'Приглашения', znak: '✉' },
  { put: '/admin/prava', imya: 'Права', znak: '⚿' },
  { put: '/admin/spiski', imya: 'Списки', znak: '☰' },
  { put: '/admin/svodka', imya: 'Сводка', znak: '◔' },
]

export function Adminka() {
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

  if (ya.rol !== 'admin') {
    return (
      <div className="form-page narrow">
        <header className="form-head">
          <div className="wordmark">Ассоциация блогеров · админка</div>
          <h1>Сюда нельзя</h1>
          <p className="sub">
            Админка — для администраторов Ассоциации. Вы вошли как блогер: всё своё у вас в
            карточке.
          </p>
        </header>
        <button className="btn" onClick={() => navigate('/kartochka')}>
          Моя карточка
        </button>
      </div>
    )
  }

  return (
    <div className="adm">
      <aside className="adm-bok">
        <NavLink to="/" className="adm-imya">
          <span className="znachok" aria-hidden="true">
            РБ
          </span>
          <span>Реестр блогеров</span>
        </NavLink>

        <nav className="adm-menyu">
          {RAZDELY.map((r) => (
            <NavLink
              key={r.put}
              to={r.put}
              end={r.put === '/admin'}
              className={({ isActive }) => `adm-punkt${isActive ? ' on' : ''}`}
            >
              <span className="adm-znak" aria-hidden="true">
                {r.znak}
              </span>
              {r.imya}
            </NavLink>
          ))}
        </nav>

        <div className="adm-niz">
          <NavLink to="/" className="adm-punkt tihiy">
            <span className="adm-znak" aria-hidden="true">
              ⌂
            </span>
            Каталог
          </NavLink>
          <button
            className="adm-punkt tihiy"
            onClick={async () => {
              await vyyti()
              navigate('/', { replace: true })
              location.reload()
            }}
          >
            <span className="adm-znak" aria-hidden="true">
              ⇥
            </span>
            Выйти
          </button>
        </div>
      </aside>

      {/* key по адресу — содержимое мягко проявляется при смене раздела,
          а колонка слева при этом не мигает: она вне этого узла. */}
      <main className="adm-telo" key={mesto.pathname}>
        <Outlet />
      </main>
    </div>
  )
}
