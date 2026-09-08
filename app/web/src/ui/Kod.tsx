import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { clearFlow, saveFlow } from '../lib/flow'
import type { Flow } from '../lib/types'
import { Err } from './Shell'

/* ---------------------------------------------------------------------------
   Ввод кода. Живёт отдельно от экрана, потому что нужен в двух местах: на
   входе по номеру (там он появляется прямо под номером, без перехода на
   другую страницу) и на отдельном адресе `/kod` — туда попадают по ссылке-
   приглашению и те, кто обновил страницу.

   Слово владельца 07.09.2026: «сделай авторизацию и регистрацию проще,
   удобнее, красивее». Проще всего оказалось не делить вход на два экрана.
--------------------------------------------------------------------------- */

const DLINA = 6

/** Откуда человеку ждать код. Врать тут нельзя: он смотрит не туда и
    решает, что сайт сломан. Канал сообщает сервер при запросе кода. */
export function kudaKod(kanal: string | undefined): string {
  if (kanal === 'zvonok') return 'Сейчас позвоним и продиктуем код'
  if (kanal === 'sms') return 'Код отправлен SMS'
  if (kanal === 'telegram') return 'Код отправлен в Telegram'
  if (kanal === 'postoyannyy') return 'Для этого номера действует постоянный код'
  return 'Код отправлен'
}

function chasy(sek: number): string {
  const m = Math.floor(sek / 60)
  return `${m}:${String(sek % 60).padStart(2, '0')}`
}

function popytki(n: number): string {
  const posledn = n % 10
  const desyatki = n % 100
  if (desyatki >= 11 && desyatki <= 14) return `Осталось ${n} попыток`
  if (posledn === 1) return `Осталась ${n} попытка`
  if (posledn >= 2 && posledn <= 4) return `Осталось ${n} попытки`
  return `Осталось ${n} попыток`
}

export function Kod({
  flow,
  gotovo,
  smenitNomer,
}: {
  flow: Flow
  /** куда вести дальше: сервер говорит 'katalog' или 'card' */
  gotovo: (next: 'katalog' | 'card') => void
  /** назад к номеру. Нет — ссылку не показываем (пришли по приглашению) */
  smenitNomer?: () => void
}) {
  const [kod, setKod] = useState('')
  const [proveryaem, setProveryaem] = useState(false)
  const [beda, setBeda] = useState<string | null>(null)
  const [vsyo, setVsyo] = useState(false)
  const [ostalos, setOstalos] = useState(flow.resendAfter ?? 60)
  const pole = useRef<HTMLInputElement>(null)
  const zanyat = useRef(false)

  useEffect(() => {
    if (ostalos <= 0) return
    const id = setTimeout(() => setOstalos((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [ostalos])

  const proverit = useCallback(
    async (znachenie: string) => {
      if (zanyat.current) return
      zanyat.current = true
      setProveryaem(true)
      setBeda(null)

      const otvet = await api.check({ code: znachenie, token: flow.token, phone: flow.phone })

      zanyat.current = false
      setProveryaem(false)

      if (otvet.ok) {
        clearFlow()
        gotovo(otvet.next === 'katalog' ? 'katalog' : 'card')
        return
      }

      setKod('')
      pole.current?.focus()
      if (otvet.reason === 'wrong') setBeda(`Неверный код. ${popytki(otvet.attemptsLeft)}.`)
      else if (otvet.reason === 'expired') {
        setBeda('Код устарел. Запросите новый.')
        setOstalos(0)
      } else setVsyo(true)
    },
    [flow, gotovo],
  )

  async function zanovo() {
    if (ostalos > 0) return
    setBeda(null)
    setKod('')
    const otvet = await api.start({ token: flow.token, phone: flow.phone })
    if (otvet.ok) {
      saveFlow({ ...flow, phoneMasked: otvet.phoneMasked, kanal: otvet.kanal })
      setOstalos(otvet.resendAfter)
      pole.current?.focus()
    } else if (otvet.reason === 'too-often') setOstalos(otvet.retryAfter)
    else setVsyo(true)
  }

  if (vsyo) {
    return (
      <>
        <h1>Слишком много попыток</h1>
        <p className="sub">
          Мы приостановили проверку кода. Начните вход заново или напишите администратору
          Ассоциации.
        </p>
        <button
          className="btn"
          onClick={() => {
            clearFlow()
            if (smenitNomer) smenitNomer()
            else location.assign('/vhod')
          }}
        >
          Начать заново
        </button>
      </>
    )
  }

  return (
    <>
      <div className="kod-komu">
        <span className="kod-kuda">{kudaKod(flow.kanal)}</span>
        <span className="kod-nomer">{flow.phoneMasked}</span>
        {smenitNomer && (
          <button className="linkbtn" onClick={smenitNomer}>
            Изменить номер
          </button>
        )}
      </div>

      <div className="code" onClick={() => pole.current?.focus()}>
        <div className="code-cells" aria-hidden="true">
          {Array.from({ length: DLINA }, (_, i) => (
            <div
              key={i}
              className={[
                'cell',
                kod[i] ? 'filled' : '',
                i === kod.length && !proveryaem ? 'active' : '',
                beda ? 'bad' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {kod[i] ?? ''}
            </div>
          ))}
        </div>
        <input
          ref={pole}
          className="code-input"
          type="text"
          inputMode="numeric"
          // Телефон сам подставит код из SMS — человеку не надо его помнить.
          autoComplete="one-time-code"
          aria-label="Код подтверждения"
          maxLength={DLINA}
          autoFocus
          disabled={proveryaem}
          value={kod}
          onChange={(e) => {
            const cifry = e.target.value.replace(/\D/g, '').slice(0, DLINA)
            setKod(cifry)
            setBeda(null)
            if (cifry.length === DLINA) void proverit(cifry)
          }}
        />
      </div>

      {beda && <Err>{beda}</Err>}

      <button
        className="btn"
        disabled={kod.length < DLINA || proveryaem}
        onClick={() => void proverit(kod)}
      >
        {proveryaem ? 'Проверяем…' : 'Войти'}
      </button>

      <div className="resend">
        <button className="linkbtn" disabled={ostalos > 0} onClick={() => void zanovo()}>
          Прислать код заново
        </button>
        <span className="t">{ostalos > 0 ? chasy(ostalos) : 'можно сейчас'}</span>
      </div>

      <p className="fine">
        {flow.kanal === 'postoyannyy'
          ? 'Этому номеру код не отправляется: у него постоянный код, введите его. Звонка и SMS не будет — ждать нечего.'
          : flow.kanal === 'zvonok'
            ? 'Звонок сбросится сам — отвечать не нужно, просто послушайте код. Не дозвонились — напишите в Ассоциацию блогеров, вам продиктуют код.'
            : 'Иногда код идёт пару минут — подождите, прежде чем просить новый. Не пришёл совсем — напишите в Ассоциацию блогеров, вам продиктуют его.'}
      </p>
    </>
  )
}
