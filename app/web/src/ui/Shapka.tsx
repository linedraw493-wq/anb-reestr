import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ktoYa, vyyti, type Ya } from '../lib/api'

/**
 * Полоска сверху: кто вошёл, переход в проверку карточек (если есть права)
 * и выход. Без неё модератор не мог попасть к заявкам иначе как по памяти.
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

  if (!ya || !ya.vnutri) return null

  const moderator = ya.rol === 'moderator' || ya.rol === 'admin'

  return (
    <div className="shapka">
      <span className="shapka-kto">
        {ya.imya || ya.telefon}
        {moderator && <span className="pill neutral">{rolName(ya.rol)}</span>}
      </span>

      <span className="shapka-knopki">
        <button className="linkbtn" onClick={() => navigate('/kartochka')}>
          Моя карточка
        </button>
        {moderator && (
          <button className="linkbtn" onClick={() => navigate('/moderator')}>
            Проверка карточек
          </button>
        )}
        {ya.rol === 'admin' && (
          <button className="linkbtn" onClick={() => navigate('/moderator/spiski')}>
            Списки
          </button>
        )}
        <button
          className="linkbtn"
          onClick={async () => {
            await vyyti()
            navigate('/vhod', { replace: true })
            location.reload()
          }}
        >
          Выйти
        </button>
      </span>
    </div>
  )
}

function rolName(rol: string): string {
  return rol === 'admin' ? 'админ' : 'модератор'
}
