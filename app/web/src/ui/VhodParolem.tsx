import { useState } from 'react'
import { vhodParolem } from '../lib/api'

/* ---------------------------------------------------------------------------
   Запасная дверь в админку — логин и пароль.

   Слово владельца 07.09.2026: «сделай возможность входа в админку через
   лог/пароль, но не делай это видимым интерфейсом на входе… нужно как-то
   скрытно, но понятно для обычного юзера».

   Отсюда два правила:

   - **не видно.** На экране входа этой формы нет. Она открывается по своему
     адресу `/vhod/admin` или пятью нажатиями по надписи «Реестр блогеров»
     над заголовком — так её найдёт тот, кому сказали;
   - **понятно.** Открылась — и это обычная форма с двумя полями и кнопкой,
     без загадок: логин, пароль, «Войти».

   Пароля в коде нет и не будет: он живёт в настройках сервера. Не задан —
   дверь отвечает «выключено», как будто её и нет.
--------------------------------------------------------------------------- */

export function VhodParolem({ gotovo }: { gotovo: () => void }) {
  const [login, setLogin] = useState('')
  const [parol, setParol] = useState('')
  const [vhozhu, setVhozhu] = useState(false)
  const [beda, setBeda] = useState<string | null>(null)

  async function voyti() {
    if (vhozhu || login.trim() === '' || parol === '') return
    setVhozhu(true)
    setBeda(null)
    const otvet = await vhodParolem(login.trim(), parol)
    setVhozhu(false)
    if (otvet.ok) {
      gotovo()
      return
    }
    if (otvet.reason === 'off') setBeda('Этот вход выключен. Заходите номером и кодом.')
    else if (otvet.reason === 'too-often') setBeda('Слишком много попыток. Подождите минуту.')
    else setBeda('Логин или пароль не подходят.')
  }

  return (
    <>
      <label className="fld">
        <span className="field-label">Логин</span>
        <input
          className="input"
          type="text"
          autoComplete="username"
          autoFocus
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void voyti()}
        />
      </label>

      <label className="fld">
        <span className="field-label">Пароль</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={parol}
          onChange={(e) => setParol(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void voyti()}
        />
      </label>

      {beda && (
        <div className="note err" role="alert">
          <span className="dot" aria-hidden="true">
            !
          </span>
          <span>{beda}</span>
        </div>
      )}

      <button
        className="btn"
        disabled={vhozhu || login.trim() === '' || parol === ''}
        onClick={() => void voyti()}
      >
        {vhozhu ? 'Входим…' : 'Войти'}
      </button>
    </>
  )
}
