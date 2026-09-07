import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shapka } from '../ui/Shapka'

/* ---------------------------------------------------------------------------
   Списки, из которых человек выбирает: тематики и города. Спека прямо
   требует: «администратор ведёт базу без разработчика».

   Районов здесь больше нет — убраны 07.09.2026 словом владельца («убери
   район где адрес»), вместе с ними ушло и слияние: оно было нужно, чтобы
   прибирать наплодившиеся районы. Слово того же дня: «убери слить в городе».

   Удаления нет намеренно. Удалишь тематику — поедут все карточки, где она
   стояла. Вместо этого «скрыть»: из выбора пропадает, у старых остаётся.
--------------------------------------------------------------------------- */

type Stroka = { id: number; nazvanie: string; skolko: number; vidna?: boolean; vidno?: boolean }
type Spiski = { tematiki: Stroka[]; goroda: Stroka[] }

type Tip = 'tematika' | 'gorod'

const VKLADKI: { key: Tip; label: string }[] = [
  { key: 'tematika', label: 'Тематики' },
  { key: 'gorod', label: 'Города' },
]

/** Границы названия. Короче — это опечатка, длиннее — не влезет в фильтры. */
const MIN_DLINA = 2
const MAX_DLINA = 40

/** Что не так с названием. Пусто — всё хорошо. */
function chtoNeTak(nazvanie: string, tip: Tip, est: Stroka[], krome?: number): string | null {
  const chisto = nazvanie.trim()
  const chto = tip === 'tematika' ? 'Тематика' : 'Город'
  if (chisto.length < MIN_DLINA)
    return `${chto}: слишком коротко, нужно хотя бы ${MIN_DLINA} буквы.`
  if (chisto.length > MAX_DLINA)
    return `${chto}: слишком длинно — не больше ${MAX_DLINA} символов, иначе не влезет в фильтры.`
  if (!/[\p{L}]/u.test(chisto)) return `${chto}: в названии должны быть буквы.`
  const zanyato = est.some(
    (s) => s.id !== krome && s.nazvanie.trim().toLowerCase() === chisto.toLowerCase(),
  )
  if (zanyato) return `«${chisto}» уже есть в списке.`
  return null
}

export default function SpiskiEkran() {
  const navigate = useNavigate()
  const [dannye, setDannye] = useState<Spiski | null>(null)
  const [vkladka, setVkladka] = useState<Tip>('tematika')
  const [netPrav, setNetPrav] = useState(false)
  const [zanyat, setZanyat] = useState(false)
  const [novoe, setNovoe] = useState('')
  const [beda, setBeda] = useState<string | null>(null)

  const perechitat = useCallback(async () => {
    const otvet = await fetch('/api/moder/spiski', { credentials: 'same-origin' })
    if (otvet.status === 403) {
      setNetPrav(true)
      return
    }
    setDannye((await otvet.json()) as Spiski)
  }, [])

  useEffect(() => {
    void perechitat()
  }, [perechitat])

  /** Сервер проверяет то же самое ещё раз — экран можно обойти. Если он
      всё-таки отказал, показываем его причину, а не молчим. */
  async function pravka(telo: Record<string, unknown>) {
    setZanyat(true)
    const otvet = await fetch('/api/moder/spisok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tip: vkladka, ...telo }),
      credentials: 'same-origin',
    })
    const d = (await otvet.json()) as { ok: boolean; reason?: string; est?: string }
    setZanyat(false)
    if (!d.ok) {
      if (d.reason === 'zanyato') setBeda(`«${d.est}» уже есть в списке.`)
      else if (d.reason === 'bad-name')
        setBeda(`Название не подходит: от ${MIN_DLINA} до ${MAX_DLINA} символов, и с буквами.`)
      else setBeda('Не вышло сохранить. Попробуйте ещё раз.')
      await perechitat()
      return
    }
    await perechitat()
  }

  if (netPrav) {
    return (
      <div className="form-page narrow">
        <Shapka />
        <header className="form-head">
          <h1>Сюда нельзя</h1>
          <p className="sub">Списки правит администратор Ассоциации.</p>
        </header>
        <button className="btn" onClick={() => navigate('/vhod?kuda=/admin')}>
          Войти
        </button>
      </div>
    )
  }

  if (!dannye) {
    return (
      <div className="form-page">
        <div className="spinner" role="status" aria-label="Загружаем списки" />
      </div>
    )
  }

  const stroki = vkladka === 'tematika' ? dannye.tematiki : dannye.goroda
  const vidno = (s: Stroka) => (vkladka === 'tematika' ? s.vidna : s.vidno) !== false

  function dobavit() {
    const oshibka = chtoNeTak(novoe, vkladka, stroki)
    if (oshibka) {
      setBeda(oshibka)
      return
    }
    setBeda(null)
    void pravka({ chto: 'dobavit', nazvanie: novoe.trim() })
    setNovoe('')
  }

  return (
    <div className="form-page narrow">
      <Shapka />
      <header className="form-head">
        <div className="wordmark">Ассоциация блогеров · списки</div>
        <h1>Списки для выбора</h1>
        <p className="sub">
          Из этих строк блогер выбирает в своей карточке, а рекламодатель — в фильтрах каталога.
          Правьте их сами, без нас.
        </p>
      </header>

      <div className="tabs">
        {VKLADKI.map((v) => (
          <button
            key={v.key}
            className={`tab${vkladka === v.key ? ' on' : ''}`}
            onClick={() => {
              setVkladka(v.key)
              setBeda(null)
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="paste dobavlenie">
        <input
          className={`input${beda ? ' bad' : ''}`}
          value={novoe}
          maxLength={MAX_DLINA}
          placeholder={vkladka === 'tematika' ? 'Новая тематика' : 'Новый город'}
          onChange={(e) => {
            setNovoe(e.target.value)
            setBeda(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && dobavit()}
        />
        <button className="btn small" disabled={!novoe.trim() || zanyat} onClick={dobavit}>
          Добавить
        </button>
      </div>

      {beda && (
        <div className="note err" role="alert">
          <span className="dot" aria-hidden="true">
            !
          </span>
          <span>{beda}</span>
        </div>
      )}

      <ul className="spisok">
        {stroki.map((s) => (
          <li key={s.id} className={vidno(s) ? '' : 'skryta'}>
            <input
              className="input bare-name"
              defaultValue={s.nazvanie}
              maxLength={MAX_DLINA}
              aria-label={`Название: ${s.nazvanie}`}
              onBlur={(e) => {
                const novoeImya = e.target.value.trim()
                if (!novoeImya || novoeImya === s.nazvanie) {
                  e.target.value = s.nazvanie
                  return
                }
                const oshibka = chtoNeTak(novoeImya, vkladka, stroki, s.id)
                if (oshibka) {
                  setBeda(oshibka)
                  e.target.value = s.nazvanie
                  return
                }
                setBeda(null)
                void pravka({ chto: 'pereimenovat', id: s.id, nazvanie: novoeImya })
              }}
            />
            <span className="sp-skolko" title="в скольких карточках стоит">
              {s.skolko}
            </span>
            <button
              className="linkbtn"
              disabled={zanyat}
              onClick={() => void pravka({ chto: 'skryt', id: s.id, vidno: !vidno(s) })}
            >
              {vidno(s) ? 'скрыть' : 'вернуть'}
            </button>
          </li>
        ))}
      </ul>

      <p className="fine">
        Число рядом — в скольких карточках строка стоит сейчас. Переименование безопасно: карточки
        не трогаются, меняется только надпись. Название — от {MIN_DLINA} до {MAX_DLINA} символов.
      </p>
    </div>
  )
}
