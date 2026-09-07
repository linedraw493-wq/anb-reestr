import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Nadpis } from '../ui/Nadpis'
import { Shapka } from '../ui/Shapka'

/* ---------------------------------------------------------------------------
   Списки, из которых человек выбирает: тематики, города, районы.
   Спека прямо требует: «администратор ведёт базу без разработчика».

   Удаления здесь нет намеренно. Удалишь тематику — поедут все карточки, где
   она стояла. Вместо этого «скрыть»: из выбора пропадает, у старых остаётся.
   А чтобы можно было прибраться — слияние: перенести всех из одного в другой.
--------------------------------------------------------------------------- */

type Stroka = { id: number; nazvanie: string; skolko: number; vidna?: boolean; vidno?: boolean }
type Rayon = Stroka & { gorod: string; gorod_id: number }
type Spiski = { tematiki: Stroka[]; goroda: Stroka[]; rayony: Rayon[] }

type Tip = 'tematika' | 'gorod' | 'rayon'

const VKLADKI: { key: Tip; label: string }[] = [
  { key: 'tematika', label: 'Тематики' },
  { key: 'gorod', label: 'Города' },
  { key: 'rayon', label: 'Районы' },
]

export default function SpiskiEkran() {
  const navigate = useNavigate()
  const [dannye, setDannye] = useState<Spiski | null>(null)
  const [vkladka, setVkladka] = useState<Tip>('tematika')
  const [netPrav, setNetPrav] = useState(false)
  const [zanyat, setZanyat] = useState(false)
  const [novoe, setNovoe] = useState('')
  const [slit, setSlit] = useState<Stroka | null>(null)

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

  async function pravka(telo: Record<string, unknown>) {
    setZanyat(true)
    await fetch('/api/moder/spisok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tip: vkladka, ...telo }),
      credentials: 'same-origin',
    })
    setZanyat(false)
    setSlit(null)
    await perechitat()
  }

  if (netPrav) {
    return (
      <div className="form-page narrow">
        <Shapka />
        <header className="form-head">
          <Nadpis slovo="СПИСКИ" />
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

  const stroki: Stroka[] =
    vkladka === 'tematika' ? dannye.tematiki : vkladka === 'gorod' ? dannye.goroda : dannye.rayony
  const vidno = (s: Stroka) => s.vidna ?? s.vidno ?? true

  return (
    <div className="form-page">
      <Shapka />
      <header className="form-head">
        <Nadpis slovo="СПИСКИ" />
        <div className="wordmark">Ассоциация блогеров · списки</div>
        <h1>Списки для выбора</h1>
        <p className="sub">
          Из этих списков блогер выбирает тематику и адрес, по ним же работают фильтры каталога.
          Удаления нет: скрытая строка пропадает из выбора, но у старых карточек остаётся.
        </p>
      </header>

      <div className="tabs">
        {VKLADKI.map((v) => (
          <button
            key={v.key}
            className={`tab${vkladka === v.key ? ' on' : ''}`}
            onClick={() => {
              setVkladka(v.key)
              setSlit(null)
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {vkladka !== 'rayon' && (
        <div className="paste dobavlenie">
          <input
            className="input"
            value={novoe}
            placeholder={vkladka === 'tematika' ? 'Новая тематика' : 'Новый город'}
            onChange={(e) => setNovoe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && novoe.trim()) {
                void pravka({ chto: 'dobavit', nazvanie: novoe.trim() })
                setNovoe('')
              }
            }}
          />
          <button
            className="btn small"
            disabled={!novoe.trim() || zanyat}
            onClick={() => {
              void pravka({ chto: 'dobavit', nazvanie: novoe.trim() })
              setNovoe('')
            }}
          >
            Добавить
          </button>
        </div>
      )}

      {slit && (
        <div className="slitie" role="dialog" aria-label="Слияние">
          <p className="v-txt">
            Перенести всех из <b>«{slit.nazvanie}»</b> ({slit.skolko}) в какую строку?
          </p>
          <p className="fine">
            Все карточки переедут, а «{slit.nazvanie}» скроется из выбора. Отменить нельзя.
          </p>
          <div className="chips">
            {stroki
              .filter((s) => s.id !== slit.id && vidno(s))
              .map((s) => (
                <button
                  key={s.id}
                  className="chip"
                  disabled={zanyat}
                  onClick={() => void pravka({ chto: 'slit', iz_id: slit.id, v_id: s.id })}
                >
                  → {s.nazvanie}
                </button>
              ))}
          </div>
          <button className="linkbtn" onClick={() => setSlit(null)}>
            отмена
          </button>
        </div>
      )}

      <ul className="spisok">
        {stroki.map((s) => (
          <li key={s.id} className={vidno(s) ? '' : 'skryta'}>
            <input
              className="input bare-name"
              defaultValue={s.nazvanie}
              aria-label={`Название: ${s.nazvanie}`}
              onBlur={(e) => {
                const novoeImya = e.target.value.trim()
                if (novoeImya && novoeImya !== s.nazvanie)
                  void pravka({ chto: 'pereimenovat', id: s.id, nazvanie: novoeImya })
              }}
            />
            {'gorod' in s && <span className="sp-gorod">{(s as Rayon).gorod}</span>}
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
            <button className="linkbtn" disabled={zanyat} onClick={() => setSlit(s)}>
              слить
            </button>
          </li>
        ))}
      </ul>

      <p className="fine">
        Число рядом — в скольких карточках строка стоит сейчас. Переименование безопасно: карточки
        не трогаются, меняется только надпись.
      </p>
    </div>
  )
}
