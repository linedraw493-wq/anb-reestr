import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ktoYa, vyyti, type Ya } from '../lib/api'

/**
 * Полоска сверху, одна на весь сайт.
 *
 * Было (слово владельца 02.09.2026, «перенасыщенно»): семь ссылок в ряд —
 * моя карточка, проверка, приглашения, сводка, списки, выход, да ещё имя со
 * значком. Стало: слева название, справа своя карточка и одна кнопка
 * «Админка» — всё хозяйство модератора спрятано под неё. Гость видит «Войти».
 */

/**
 * Что видно в «Админке». `tolkoAdmin` — не украшение: те же двери закрыты
 * ролью и на сервере. Слово владельца 07.09.2026: у модератора одна работа
 * — проверка карточек, остальное админское.
 */
const ADMINKA: { put: string; imya: string; tolkoAdmin?: boolean }[] = [
  { put: '/admin', imya: 'Проверка карточек' },
  { put: '/admin/priglasheniya', imya: 'Приглашения', tolkoAdmin: true },
  { put: '/admin/prava', imya: 'Права', tolkoAdmin: true },
  { put: '/admin/spiski', imya: 'Списки', tolkoAdmin: true },
  { put: '/admin/svodka', imya: 'Сводка', tolkoAdmin: true },
]

export function Shapka() {
  const navigate = useNavigate()
  const [ya, setYa] = useState<Ya | null>(null)
  const [menyu, setMenyu] = useState(false)
  const korobka = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let zhiv = true
    ktoYa().then((r) => zhiv && setYa(r))
    return () => {
      zhiv = false
    }
  }, [])

  // Нажали мимо меню — закрываем. Иначе оно висит и мешает.
  useEffect(() => {
    if (!menyu) return
    function mimo(e: MouseEvent) {
      if (!korobka.current?.contains(e.target as Node)) setMenyu(false)
    }
    document.addEventListener('mousedown', mimo)
    return () => document.removeEventListener('mousedown', mimo)
  }, [menyu])

  const vnutri = ya?.vnutri === true
  const moderator = vnutri && (ya.rol === 'moderator' || ya.rol === 'admin')

  return (
    <div className="shapka">
      <Link to="/" className="shapka-imya">
        Реестр блогеров
      </Link>

      <span className="shapka-knopki">
        {!ya && null}

        {ya && !vnutri && (
          <button className="linkbtn" onClick={() => navigate('/vhod')}>
            Войти
          </button>
        )}

        {vnutri && (
          <button className="linkbtn" onClick={() => navigate('/kartochka')}>
            {ya.kartochkaZapolnena ? 'Моя карточка' : 'Заполнить карточку'}
          </button>
        )}

        {moderator && (
          <span className="menyu" ref={korobka}>
            <button className="linkbtn" onClick={() => setMenyu((v) => !v)}>
              Админка {menyu ? '▴' : '▾'}
            </button>
            {menyu && (
              <span className="menyu-spisok">
                {ADMINKA.filter((p) => !p.tolkoAdmin || ya.rol === 'admin').map((p) => (
                  <button
                    key={p.put}
                    className="menyu-punkt"
                    onClick={() => {
                      setMenyu(false)
                      navigate(p.put)
                    }}
                  >
                    {p.imya}
                  </button>
                ))}
              </span>
            )}
          </span>
        )}

        {vnutri && (
          <button
            className="linkbtn"
            onClick={async () => {
              await vyyti()
              navigate('/', { replace: true })
              location.reload()
            }}
          >
            Выйти
          </button>
        )}
      </span>
    </div>
  )
}
