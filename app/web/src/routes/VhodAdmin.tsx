import { useNavigate } from 'react-router-dom'
import { VhodParolem } from '../ui/VhodParolem'
import { Shell } from '../ui/Shell'

/**
 * Свой адрес запасной двери — `/vhod/admin`.
 *
 * Слово владельца 07.09.2026: «сделай возможность входа в админку через
 * лог/пароль, но не делай это видимым интерфейсом на входе… скрытно, но
 * понятно для обычного юзера». Ссылок сюда нет ни с одного экрана: адрес
 * знает тот, кому сказали. Открылась — и это обычная понятная форма.
 *
 * Обычный вход по номеру и коду остаётся главным и никуда не девается.
 */
export default function VhodAdmin() {
  const navigate = useNavigate()
  return (
    <Shell>
      <h1>Вход администратора</h1>
      <p className="sub">Логин и пароль Ассоциации. Обычный вход — по номеру и коду.</p>

      <VhodParolem gotovo={() => navigate('/admin', { replace: true })} />

      <button className="linkbtn" onClick={() => navigate('/vhod', { replace: true })}>
        Войти по номеру телефона
      </button>
    </Shell>
  )
}
