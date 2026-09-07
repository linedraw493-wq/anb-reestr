import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { saveFlow } from '../lib/flow'
import { vspomnitNomer, zabytNomer, zapomnitNomer } from '../lib/pamyat'
import { formatAsTyped, toE164 } from '../lib/phone'
import type { Flow } from '../lib/types'
import { Kod } from '../ui/Kod'
import { Err, Shell } from '../ui/Shell'

/**
 * Вход по номеру — **один экран, а не два**.
 *
 * Слово владельца 07.09.2026: «сделай авторизацию и регистрацию проще,
 * удобнее, красивее». Раньше после номера человека уносило на отдельную
 * страницу `/kod`, и он терял из виду, куда и зачем шёл. Теперь поле кода
 * появляется прямо здесь, под номером, а «Изменить номер» возвращает на шаг
 * назад одним нажатием. Адрес `/kod` живой — там код спрашивают у тех, кто
 * пришёл по ссылке-приглашению.
 */
export default function Login() {
  const navigate = useNavigate()
  // `/vhod?kuda=/admin` — человек шёл в админку и был отправлен сюда за
  // кодом. Возвращаем его туда же, а не в каталог. Чужие адреса не берём:
  // только свои, начинающиеся с одной косой черты.
  const [adres] = useSearchParams()
  const kuda = (adres.get('kuda') ?? '').startsWith('/') ? adres.get('kuda')! : undefined
  const vAdminku = kuda?.startsWith('/admin') === true
  // Номер с прошлого раза — чтобы не набирать его заново. Сам вход держится
  // cookie и живёт 60 дней; это на случай, когда человек вышел сам.
  const zapomnennyy = vspomnitNomer()
  const [typed, setTyped] = useState(() => formatAsTyped(zapomnennyy ?? ''))
  const [pokazatChuzhoy, setPokazatChuzhoy] = useState(zapomnennyy !== null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState(false)
  // Код запрошен — показываем второй шаг прямо здесь, не уводя со страницы.
  const [shag, setShag] = useState<Flow | null>(null)

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
          'Номер верный, но код до него не дошёл. Если у вас Beeline — так и будет, ' +
            'мы это чиним. Напишите в Ассоциацию блогеров, вам продиктуют код.',
        )
      else if (res.reason === 'too-often')
        setError(`Код уже отправлен. Следующий можно запросить через ${res.retryAfter} сек.`)
      else setError('Не получилось отправить код. Попробуйте ещё раз.')
      return
    }

    zapomnitNomer(phone)
    const flow: Flow = {
      kind: 'login',
      phone,
      phoneMasked: res.phoneMasked,
      kuda,
      kanal: res.kanal,
      resendAfter: res.resendAfter,
    }
    // Кладём и в память вкладки: обновит страницу — попадёт на /kod и
    // продолжит с того же места, а не начнёт заново.
    saveFlow(flow)
    setShag(flow)
  }

  if (shag) {
    return (
      <Shell>
        <h1>{vAdminku ? 'Вход в админку' : 'Вход в реестр'}</h1>
        <Kod
          flow={shag}
          gotovo={(next) =>
            navigate(kuda ?? (next === 'katalog' ? '/' : '/gotovo'), { replace: true })
          }
          smenitNomer={() => setShag(null)}
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <h1>{vAdminku ? 'Вход в админку' : 'Вход в реестр'}</h1>
      <p className="sub">
        {vAdminku
          ? 'Номер администратора — пришлём на него код.'
          : 'Номер, с которым вы регистрировались. Пришлём на него код.'}
      </p>

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
        {pokazatChuzhoy && (
          <p className="fine">
            Номер с прошлого раза.{' '}
            <button
              className="linkbtn"
              onClick={() => {
                zabytNomer()
                setTyped('')
                setPokazatChuzhoy(false)
              }}
            >
              Это не мой номер
            </button>
          </p>
        )}
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

      {/* На входе в админку про приглашения писать незачем: администратора
          и модератора заводит другой администратор, а не ссылка. */}
      {vAdminku ? (
        <p className="fine">
          Права даёт администратор Ассоциации — он же добавляет номер в админку. Если номера там
          нет, код придёт, а дальше вас не пустят.
        </p>
      ) : (
        <p className="fine">
          Первый раз здесь? Вход только по личной ссылке-приглашению — её выдаёт администратор
          Ассоциации.
        </p>
      )}
    </Shell>
  )
}
