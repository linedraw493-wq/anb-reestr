import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shell } from '../ui/Shell'

/** Экран 03 — телефон подтверждён, ведём к карточке. */
export default function Done() {
  const navigate = useNavigate()

  useEffect(() => {
    const id = setTimeout(() => navigate('/kartochka', { replace: true }), 2200)
    return () => clearTimeout(id)
  }, [navigate])

  return (
    <Shell>
      <div className="checkwrap">
        <div className="check" aria-hidden="true">
          ✓
        </div>
        <h1 className="center">Телефон подтверждён</h1>
      </div>
      <p className="sub center">Аккаунт создан. Ссылка-приглашение больше не нужна.</p>
      <button className="btn" onClick={() => navigate('/kartochka', { replace: true })}>
        Заполнить карточку
      </button>
    </Shell>
  )
}
