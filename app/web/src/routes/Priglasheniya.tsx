import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shapka } from '../ui/Shapka'

/* ---------------------------------------------------------------------------
   Выпуск инвайтов — спека, день 2–3 и день 5.

   Пока этого экрана не было, 305 ссылок лежали в базе, а достать их было
   нельзя — и рассылать заказчику было нечего.

   Здесь же резервные коды (спека, день 5): код показывается на экране и
   НЕ уходит в Telegram. Администратор читает его человеку голосом, когда
   доставка не сработала.
--------------------------------------------------------------------------- */

type Sostoyanie =
  | 'net-ssylki'
  | 'ne-otkryval'
  | 'otkryl'
  | 'ispolzovana'
  | 'prosrochena'
  | 'zaregistrirovalsya'

type Stroka = {
  chelovekId: number
  nik: string
  telefon: string
  estTelefon: boolean
  ssylka: string | null
  sostoyanie: Sostoyanie
  godnoDo: string | null
}

const NAZVANIE: Record<Sostoyanie, string> = {
  'net-ssylki': 'нет ссылки',
  'ne-otkryval': 'не открывал',
  otkryl: 'открыл, не дошёл',
  ispolzovana: 'ссылка использована',
  prosrochena: 'просрочена',
  zaregistrirovalsya: 'зарегистрировался',
}

const VID: Record<Sostoyanie, string> = {
  'net-ssylki': 'say',
  'ne-otkryval': 'neutral',
  otkryl: 'neutral',
  ispolzovana: 'neutral',
  prosrochena: 'say',
  zaregistrirovalsya: 'ok',
}

const VKLADKI: { key: Sostoyanie | 'vse'; label: string }[] = [
  { key: 'vse', label: 'Все' },
  { key: 'ne-otkryval', label: 'Не открывали' },
  { key: 'otkryl', label: 'Открыли, не дошли' },
  { key: 'zaregistrirovalsya', label: 'Зарегистрировались' },
  { key: 'prosrochena', label: 'Просроченные' },
]

export default function Priglasheniya() {
  const navigate = useNavigate()
  const [stroki, setStroki] = useState<Stroka[] | null>(null)
  const [netPrav, setNetPrav] = useState(false)
  const [vkladka, setVkladka] = useState<Sostoyanie | 'vse'>('vse')
  const [poisk, setPoisk] = useState('')
  const [zanyat, setZanyat] = useState(false)
  const [skopirovan, setSkopirovan] = useState<number | null>(null)
  const [kod, setKod] = useState<{ kto: string; kod: string; minut: number } | null>(null)

  const perechitat = useCallback(async () => {
    const r = await fetch('/api/moder/priglasheniya', { credentials: 'same-origin' })
    if (r.status === 403) {
      setNetPrav(true)
      return
    }
    setStroki((await r.json()) as Stroka[])
  }, [])

  useEffect(() => {
    void perechitat()
  }, [perechitat])

  const vidno = useMemo(() => {
    const vse = stroki ?? []
    const poVkladke = vkladka === 'vse' ? vse : vse.filter((s) => s.sostoyanie === vkladka)
    const q = poisk.trim().toLowerCase()
    return q ? poVkladke.filter((s) => s.nik.toLowerCase().includes(q)) : poVkladke
  }, [stroki, vkladka, poisk])

  const scheta = useMemo(() => {
    const c: Record<string, number> = { vse: (stroki ?? []).length }
    for (const s of stroki ?? []) c[s.sostoyanie] = (c[s.sostoyanie] ?? 0) + 1
    return c
  }, [stroki])

  function polnaya(ssylka: string): string {
    return `${location.origin}${ssylka}`
  }

  async function skopirovat(s: Stroka) {
    if (!s.ssylka) return
    try {
      await navigator.clipboard.writeText(polnaya(s.ssylka))
      setSkopirovan(s.chelovekId)
      setTimeout(() => setSkopirovan(null), 1600)
    } catch {
      // буфер закрыт браузером — покажем ссылку, чтобы скопировали руками
      prompt('Скопируйте ссылку:', polnaya(s.ssylka))
    }
  }

  async function vypustit(s: Stroka) {
    setZanyat(true)
    await fetch('/api/moder/priglashenie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chelovekId: s.chelovekId }),
      credentials: 'same-origin',
    })
    setZanyat(false)
    await perechitat()
  }

  async function rezervnyyKod(s: Stroka) {
    setZanyat(true)
    const r = await fetch('/api/moder/kod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chelovekId: s.chelovekId }),
      credentials: 'same-origin',
    })
    const d = (await r.json()) as { ok: boolean; kod?: string; minut?: number }
    setZanyat(false)
    if (d.ok && d.kod) setKod({ kto: s.nik || s.telefon, kod: d.kod, minut: d.minut ?? 5 })
  }

  /** Выгрузка таблицей: заказчик берёт файл и льёт в свою рассылку. */
  function vygruzit() {
    const shapka = ['Ник', 'Телефон', 'Состояние', 'Ссылка', 'Годна до']
    const stroka = (s: Stroka) =>
      [
        s.nik,
        s.estTelefon ? s.telefon : '',
        NAZVANIE[s.sostoyanie],
        s.ssylka ? polnaya(s.ssylka) : '',
        s.godnoDo ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(';')

    // BOM, иначе Excel откроет кириллицу кракозябрами
    const text = '﻿' + [shapka.join(';'), ...vidno.map(stroka)].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    a.download = `priglasheniya-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (netPrav) {
    return (
      <div className="form-page narrow">
        <Shapka />
        <header className="form-head">
          <h1>Сюда нельзя</h1>
          <p className="sub">Приглашения выдаёт администратор Ассоциации.</p>
        </header>
        <button className="btn" onClick={() => navigate('/vhod')}>
          Войти
        </button>
      </div>
    )
  }

  if (!stroki) {
    return (
      <div className="form-page">
        <div className="spinner" role="status" aria-label="Загружаем приглашения" />
      </div>
    )
  }

  return (
    <div className="form-page">
      <Shapka />
      <header className="form-head">
        <div className="wordmark">Ассоциация блогеров · приглашения</div>
        <h1>Приглашения</h1>
        <p className="sub">
          Личная ссылка на каждого блогера. Скопируйте по одной или выгрузите таблицей и
          разошлите своими каналами — почтой, в мессенджере, как удобно.
        </p>
      </header>

      {kod && (
        <div className="rezerv" role="alert">
          <span className="v-head">Резервный код для {kod.kto}</span>
          <span className="rezerv-kod">{kod.kod}</span>
          <p className="fine">
            Продиктуйте его человеку голосом. Код живёт {kod.minut} минут и заменяет
            предыдущий. В Telegram он не уходил.
          </p>
          <button className="linkbtn" onClick={() => setKod(null)}>
            закрыть
          </button>
        </div>
      )}

      <div className="tabs">
        {VKLADKI.map((v) => (
          <button
            key={v.key}
            className={`tab${vkladka === v.key ? ' on' : ''}`}
            onClick={() => setVkladka(v.key)}
          >
            {v.label}
            {scheta[v.key] ? <span className="cnt">{scheta[v.key]}</span> : null}
          </button>
        ))}
      </div>

      <div className="kat-panel-ryad prig-panel">
        <input
          className="input poisk-pole"
          type="search"
          value={poisk}
          placeholder="Поиск по нику"
          aria-label="Поиск по нику"
          onChange={(e) => setPoisk(e.target.value)}
        />
        <button className="btn small ghost" onClick={vygruzit} disabled={vidno.length === 0}>
          Выгрузить таблицей ({vidno.length})
        </button>
      </div>

      <div className="note hint">
        Ссылка — это вход в карточку: кто её открыл, тот и зайдёт. Не выкладывайте список в
        общий чат. Срок жизни ссылки 30 дней.
      </div>

      <ul className="prig-spisok">
        {vidno.slice(0, 200).map((s) => (
          <li key={s.chelovekId}>
            <span className="prig-nik">{s.nik || 'без ника'}</span>
            <span className={`pill ${VID[s.sostoyanie]}`}>{NAZVANIE[s.sostoyanie]}</span>
            {s.estTelefon && <span className="prig-tel">{s.telefon}</span>}
            <span className="prig-knopki">
              {s.ssylka && (
                <button className="linkbtn" onClick={() => void skopirovat(s)}>
                  {skopirovan === s.chelovekId ? 'скопировано' : 'скопировать'}
                </button>
              )}
              <button className="linkbtn" disabled={zanyat} onClick={() => void vypustit(s)}>
                {s.ssylka ? 'новая ссылка' : 'выпустить'}
              </button>
              <button className="linkbtn" disabled={zanyat} onClick={() => void rezervnyyKod(s)}>
                резервный код
              </button>
            </span>
          </li>
        ))}
      </ul>

      {vidno.length > 200 && (
        <p className="fine">Показаны первые 200. Уточните поиском или выгрузите таблицей.</p>
      )}
    </div>
  )
}
