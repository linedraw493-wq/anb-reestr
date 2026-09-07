import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { clearFlow, readFlow, saveFlow } from '../lib/flow'
import { OTP_LIVE } from '../lib/otp'
import type { Flow } from '../lib/types'
import { Err, Shell } from '../ui/Shell'

const LEN = 6

/** Откуда человеку ждать код. Врать тут нельзя: он смотрит не туда и
    решает, что сайт сломан. Канал сообщает сервер при запросе кода. */
function kudaKod(kanal: string | undefined): string {
  if (kanal === 'zvonok') return 'Звоним и продиктуем код'
  if (kanal === 'sms') return 'Код отправлен SMS'
  if (kanal === 'telegram') return 'Код отправлен в Telegram'
  return OTP_LIVE ? 'Код отправлен' : 'Код отправлен'
}

/** Экран 02 — ввод кода. */
export default function Code() {
  const navigate = useNavigate()
  const [flow] = useState<Flow | null>(() => readFlow())

  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dead, setDead] = useState(false)
  const [left, setLeft] = useState(60)
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = useRef(false)

  // Обновили страницу в приватном окне — номера уже нет, просим войти заново.
  useEffect(() => {
    if (!flow) navigate('/vhod', { replace: true })
  }, [flow, navigate])

  // Отсчёт до «отправить заново».
  useEffect(() => {
    if (left <= 0) return
    const id = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [left])

  const submit = useCallback(
    async (value: string) => {
      if (!flow || busy.current) return
      busy.current = true
      setChecking(true)
      setError(null)

      const res = await api.check({ code: value, token: flow.token, phone: flow.phone })

      busy.current = false
      setChecking(false)

      if (res.ok) {
        clearFlow()
        // Новичка ведём заполнять карточку, вернувшегося — в каталог.
        // Шёл в админку — туда и вернём. Иначе по общему правилу: новичка
        // на «карточка готова», вернувшегося в каталог.
        navigate(flow.kuda ?? (res.next === 'katalog' ? '/' : '/gotovo'), { replace: true })
        return
      }

      setCode('')
      inputRef.current?.focus()
      if (res.reason === 'wrong') {
        setError(`Неверный код. ${plural(res.attemptsLeft)}.`)
      } else if (res.reason === 'expired') {
        setError('Код устарел. Запросите новый.')
        setLeft(0)
      } else {
        setDead(true)
      }
    },
    [flow, navigate],
  )

  function onType(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, LEN)
    setCode(digits)
    setError(null)
    if (digits.length === LEN) void submit(digits)
  }

  async function resend() {
    if (!flow || left > 0) return
    setError(null)
    setCode('')
    const res = await api.start({ token: flow.token, phone: flow.phone })
    if (res.ok) {
      saveFlow({ ...flow, phoneMasked: res.phoneMasked })
      setLeft(res.resendAfter)
      inputRef.current?.focus()
    } else if (res.reason === 'too-often') {
      setLeft(res.retryAfter)
    } else {
      setDead(true)
    }
  }

  if (!flow) return null

  if (dead) {
    return (
      <Shell>
        <h1>Слишком много попыток</h1>
        <p className="sub">
          Мы приостановили проверку кода. Начните вход заново или напишите администратору
          Ассоциации.
        </p>
        <button
          className="btn"
          onClick={() => {
            clearFlow()
            navigate('/vhod', { replace: true })
          }}
        >
          Начать заново
        </button>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1>Введите код</h1>
      <p className="sub">
        {kudaKod(flow.kanal)} · {flow.phoneMasked}
      </p>

      <div className="code" onClick={() => inputRef.current?.focus()}>
        <div className="code-cells" aria-hidden="true">
          {Array.from({ length: LEN }, (_, i) => (
            <div
              key={i}
              className={[
                'cell',
                code[i] ? 'filled' : '',
                i === code.length && !checking ? 'active' : '',
                error ? 'bad' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {code[i] ?? ''}
            </div>
          ))}
        </div>
        <input
          ref={inputRef}
          className="code-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Код подтверждения"
          maxLength={LEN}
          autoFocus
          disabled={checking}
          value={code}
          onChange={(e) => onType(e.target.value)}
        />
      </div>

      <div className="resend">
        <button className="linkbtn" disabled={left > 0} onClick={resend}>
          Отправить заново
        </button>
        <span className="t">{left > 0 ? clock(left) : 'можно сейчас'}</span>
      </div>

      {error && <Err>{error}</Err>}

      <button className="btn" disabled={code.length < LEN || checking} onClick={() => submit(code)}>
        {checking ? 'Проверяем…' : 'Подтвердить'}
      </button>

      <p className="fine">
        SMS иногда идёт несколько минут — подождите, прежде чем просить новый код. Не пришла совсем
        — напишите в Ассоциацию блогеров, вам продиктуют код.
      </p>
    </Shell>
  )
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60)
  return `${m}:${String(sec % 60).padStart(2, '0')}`
}

function plural(n: number): string {
  const last = n % 10
  const tens = n % 100
  if (tens >= 11 && tens <= 14) return `Осталось ${n} попыток`
  if (last === 1) return `Осталась ${n} попытка`
  if (last >= 2 && last <= 4) return `Осталось ${n} попытки`
  return `Осталось ${n} попыток`
}
