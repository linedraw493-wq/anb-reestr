import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ktoYa, vyyti, type Ya } from '../lib/api'

/**
 * Полоска сверху — на публичных страницах: каталог, карточка блогера, своя
 * карточка. В админке её нет: там своя колонка слева.
 *
 * Было (слово владельца 02.09.2026, «перенасыщенно»): семь ссылок в ряд.
 * Потом — одна кнопка «Админка» с выпадашкой на пять разделов. 07.09.2026
 * эта выпадашка **переехала влево, в боковую колонку админки**, и здесь её
 * больше нет: держать один и тот же список в двух местах бессмысленно —
 * слово владельца, «ты получается тупо дублировал функционал». Наверху
 * остаётся одна ссылка «Админка» — просто дверь туда, где этот список и
 * живёт.
 */
export function Shapka() {
  const navigate = useNavigate()
  const [ya, setYa] = useState<Ya | null>(null)

  useEffect(() => {
    let zhiv = true
    ktoYa().then((r) => zhiv && setYa(r))
    return () => {
      zhiv = false
    }
  }, [])

  const vnutri = ya?.vnutri === true
  const admin = vnutri && ya.rol === 'admin'

  return (
    <div className="shapka">
      <Link to="/" className="shapka-imya">
        Реестр блогеров
      </Link>

      <span className="shapka-knopki">
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

        {admin && (
          <button className="linkbtn" onClick={() => navigate('/admin')}>
            Админка
          </button>
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
