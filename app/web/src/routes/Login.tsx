import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, vhodParol } from '../lib/api'
import { saveFlow } from '../lib/flow'
import { formatAsTyped, toE164 } from '../lib/phone'
import { Err, Shell } from '../ui/Shell'

/** Повторный вход — без ссылки, по номеру. Решение 02.09.2026. */
export default function Login() {
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState(false)

  // Вход администратора по логину и паролю — прячется под ссылкой.
  const [poParolyu, setPoParolyu] = useState(false)
  const [login, setLogin] = useState('')
  const [parol, setParol] = useState('')
  const [vhozhu, setVhozhu] = useState(false)
  const [parolError, setParolError] = useState<string | null>(null)

  const phone = toE164(typed)
  const canSend = phone !== null && !sending

  async function send() {
    if (!canSend) return
    setSending(true)
    setError(null)
    setUnknown(false)

    const res = await api.start({ phone })
    setSending(false)

    if (!res.ok) {
      // Слово владельца: номера нет в базе — так и пишем, без хитростей.
      if (res.reason === 'unknown-phone') setUnknown(true)
      else if (res.reason === 'bad-phone') setError('Проверьте номер — такой не подходит.')
      else if (res.reason === 'no-delivery')
        setError(
          'Номер верный, но код до него не дошёл. Напишите в Ассоциацию блогеров — ' +
            'вам продиктуют код для входа.',
        )
      else if (res.reason === 'too-often')
        setError(`Код уже отправлен. Следующий можно запросить через ${res.retryAfter} сек.`)
      else setError('Не получилось отправить код. Попробуйте ещё раз.')
      return
    }

    saveFlow({ kind: 'login', phone, phoneMasked: res.phoneMasked })
    navigate('/kod')
  }

  async function vhodPoParolyu() {
    if (vhozhu || login.trim() === '' || parol === '') return
    setVhozhu(true)
    setParolError(null)
    const r = await vhodParol(login.trim(), parol)
    setVhozhu(false)
    if (r.ok) {
      navigate('/moderator/priglasheniya', { replace: true })
      return
    }
    if (r.reason === 'off') setParolError('Вход по паролю выключен.')
    else setParolError('Логин или пароль не подходят.')
  }

  return (
    <Shell>
      <h1>Вход в реестр</h1>
      <p className="sub">Введите номер, с которым регистрировались. Пришлём код.</p>

      <div>
        <span className="field-label" id="phone-label">
          Номер телефона
        </span>
        <input
          className={`input${typed !== '' && phone === null ? ' bad' : ''}`}
          aria-labelledby="phone-label"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          placeholder="+7 700 000 00 00"
          value={typed}
          onChange={(e) => {
            setTyped(formatAsTyped(e.target.value))
            setUnknown(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
      </div>

      {unknown && (
        <Err>
          Такого номера в реестре нет. Регистрация — по личной ссылке от Ассоциации блогеров. Если
          ссылки нет, напишите администратору.
        </Err>
      )}
      {error && <Err>{error}</Err>}

      <button className="btn" disabled={!canSend} onClick={send}>
        {sending ? 'Отправляем…' : 'Получить код'}
      </button>

      <p className="fine">
        Первый раз здесь? Вход только по личной ссылке-приглашению — её выдаёт администратор
        Ассоциации.
      </p>

      <div className="admin-vhod">
        {!poParolyu ? (
          <button className="linkbtn" onClick={() => setPoParolyu(true)}>
            Вход для администратора
          </button>
        ) : (
          <>
            <span className="field-label" id="login-label">
              Логин и пароль администратора
            </span>
            <input
              className="input"
              aria-labelledby="login-label"
              type="text"
              autoComplete="username"
              placeholder="логин"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && vhodPoParolyu()}
            />
            <input
              className="input"
              aria-label="Пароль администратора"
              type="password"
              autoComplete="current-password"
              placeholder="пароль"
              value={parol}
              onChange={(e) => setParol(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && vhodPoParolyu()}
            />
            {parolError && <Err>{parolError}</Err>}
            <button
              className="btn"
              disabled={vhozhu || login.trim() === '' || parol === ''}
              onClick={vhodPoParolyu}
            >
              {vhozhu ? 'Входим…' : 'Войти'}
            </button>
          </>
        )}
      </div>
    </Shell>
  )
}
