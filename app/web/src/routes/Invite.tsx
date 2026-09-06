import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { saveFlow } from '../lib/flow'
import { formatAsTyped, toE164 } from '../lib/phone'
import type { InviteState } from '../lib/types'
import { Err, Shell } from '../ui/Shell'

/** Экран 01 — переход по личной ссылке-приглашению. */
export default function Invite() {
  const { token = '' } = useParams()
  const navigate = useNavigate()

  const [invite, setInvite] = useState<InviteState | null>(null)
  const [editing, setEditing] = useState(false)
  const [typed, setTyped] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zanyat, setZanyat] = useState(false)

  useEffect(() => {
    let alive = true
    api.invite(token).then((state) => {
      if (!alive) return
      setInvite(state)
      // Заготовка из таблицы заказчика приходит без номера — просим сразу.
      if (state.status === 'ok' && !state.phoneMasked) setEditing(true)
    })
    return () => {
      alive = false
    }
  }, [token])

  if (invite === null) {
    return (
      <Shell>
        <div className="spinner" role="status" aria-label="Загружаем приглашение" />
      </Shell>
    )
  }

  if (invite.status === 'dead') {
    return (
      <Shell>
        <h1>Ссылка недействительна</h1>
        <p className="sub">
          Приглашение просрочено или им уже воспользовались. Напишите администратору Ассоциации — он
          пришлёт новое.
        </p>
        <button className="btn ghost" onClick={() => navigate('/vhod')}>
          Я уже регистрировался
        </button>
      </Shell>
    )
  }

  const phone = editing ? toE164(typed) : undefined
  const canSend = agreed && !sending && (!editing || phone !== null)

  async function send() {
    if (!canSend) return
    setSending(true)
    setError(null)
    setZanyat(false)

    const res = await api.start(editing ? { token, phone: phone! } : { token })
    setSending(false)

    if (!res.ok) {
      if (res.reason === 'dead-invite') setInvite({ status: 'dead' })
      else if (res.reason === 'phone-taken') setZanyat(true)
      else if (res.reason === 'need-phone') {
        setEditing(true)
        setError('Впишите свой номер — на него придёт код.')
      } else if (res.reason === 'bad-phone') setError('Проверьте номер — такой не подходит.')
      else if (res.reason === 'no-delivery')
        setError(
          'Номер верный, но код до него не дошёл. Если у вас Beeline — так и будет, ' +
            'мы это чиним. Напишите в Ассоциацию блогеров, вам продиктуют код.',
        )
      else if (res.reason === 'too-often')
        setError(`Код уже отправлен. Следующий можно запросить через ${res.retryAfter} сек.`)
      else setError('Не получилось отправить код. Попробуйте ещё раз.')
      return
    }

    saveFlow({ kind: 'invite', token, phoneMasked: res.phoneMasked })
    navigate('/kod')
  }

  return (
    <Shell>
      <h1>Это вы?</h1>

      <div className="idcard">
        <div className="ava" aria-hidden="true">
          {initials(invite.nick)}
        </div>
        <div>
          <div className="nm">{invite.nick}</div>
          <div className="mt">
            {invite.invitedAt ? `Приглашение от ${invite.invitedAt}` : 'Личное приглашение'}
          </div>
        </div>
      </div>

      <div>
        <span className="field-label" id="phone-label">
          Ваш номер
        </span>
        {editing ? (
          <input
            className={`input${typed !== '' && phone === null ? ' bad' : ''}`}
            aria-labelledby="phone-label"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            placeholder="+7 700 000 00 00"
            value={typed}
            onChange={(e) => setTyped(formatAsTyped(e.target.value))}
          />
        ) : (
          <div className="phone-known">
            <span className="val">{invite.phoneMasked}</span>
            <button className="linkbtn" onClick={() => setEditing(true)}>
              Изменить
            </button>
          </div>
        )}
      </div>

      <p className="sub">
        {editing
          ? 'Введите номер — на него привяжем вашу карточку.'
          : 'Номер уже в приглашении. Проверьте и поправьте, если не тот.'}
      </p>

      <label className="consent">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          Согласен на обработку номера телефона. Наружу он не публикуется — только если сам укажу
          его в карточке.
        </span>
      </label>

      {zanyat && (
        <Err>
          Этот номер уже привязан к другой карточке. Если она ваша — просто войдите по номеру,
          приглашение для этого не нужно.
        </Err>
      )}
      {zanyat && (
        <button className="btn ghost" onClick={() => navigate('/vhod')}>
          Войти по номеру
        </button>
      )}
      {error && <Err>{error}</Err>}

      <button className="btn" disabled={!canSend} onClick={send}>
        {sending ? 'Отправляем…' : 'Получить код'}
      </button>

      <p className="fine">Ссылка личная и одноразовая. После входа она перестаёт работать.</p>
    </Shell>
  )
}

function initials(nick: string): string {
  const clean = nick.replace(/^@/, '')
  const parts = clean.split(/[._-]/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
}
