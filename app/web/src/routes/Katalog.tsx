import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { korotko, razdelit, type Karta as KartaTip } from '../lib/card'
import {
  izAdresa,
  PORYADKI,
  PUSTYE,
  skolkoZadano,
  vzyatKatalog,
  type Filtry,
  type Poryadok,
  type Vydacha,
} from '../lib/katalog'
import { razobratVse } from '../lib/seti'
import { useSpravochniki } from '../lib/spravochniki'
import { Karta } from '../ui/Karta'
import { Shapka } from '../ui/Shapka'

/** Главная страница сайта: сюда приходит рекламодатель искать блогера. */
export default function Katalog() {
  const spr = useSpravochniki()
  const [adres, setAdres] = useSearchParams()
  const filtry = useMemo(() => izAdresa(adres.toString()), [adres])

  const [vydacha, setVydacha] = useState<Vydacha | null>(null)
  const [gruzim, setGruzim] = useState(true)
  const [beda, setBeda] = useState(false)
  const [naKarte, setNaKarte] = useState(false)
  const [shtorka, setShtorka] = useState(false)

  /**
   * Правка фильтра переписывает адрес — ссылку с выборкой можно скинуть.
   * `zamenit` — для полей, которые человек набирает: иначе каждая цифра
   * оставляет свой след в истории, и «назад» приходится жать двадцать раз.
   */
  const pravit = useCallback(
    (chto: Partial<Filtry>, zamenit = false) => {
      const novye: Filtry = { ...filtry, ...chto }
      // сменил фильтр — вернулись на первую страницу, иначе покажется пусто
      if (!('stranica' in chto)) novye.stranica = 1
      if ('gorod' in chto) novye.rayon = ''
      const p = new URLSearchParams()
      for (const [k, v] of Object.entries(novye)) {
        if (k === 'poryadok' && v === 'ohvat') continue
        if (k === 'stranica' && Number(v) <= 1) continue
        if (v) p.set(k, String(v))
      }
      setAdres(p, { replace: zamenit })
    },
    [filtry, setAdres],
  )

  /* ---------------------------------------------------------------- выдача */

  useEffect(() => {
    const stop = new AbortController()
    setGruzim(true)
    setBeda(false)
    vzyatKatalog(filtry, stop.signal)
      .then((v) => setVydacha(v))
      .catch((e: unknown) => {
        if ((e as Error)?.name === 'AbortError') return
        setBeda(true)
      })
      .finally(() => {
        if (!stop.signal.aborted) setGruzim(false)
      })
    // Ушли с этой выборки — прошлый запрос больше не нужен: его ответ
    // приходил поверх нового и сетка прыгала.
    return () => stop.abort()
  }, [filtry])

  const naGorod = useCallback((gorod: string) => pravit({ gorod }), [pravit])
  const rayony = spr.goroda[filtry.gorod] ?? []
  const zadano = skolkoZadano(filtry)
  const pervayaZagruzka = vydacha === null && gruzim

  return (
    <div className="form-page katalog">
      <Shapka />

      <header className="form-head">
        <h1>Каталог блогеров</h1>
        <p className="sub">
          Блогеры Казахстана в одном месте. Отберите по тематике, городу, охвату и цене —
          и напишите напрямую в соцсети.
        </p>
      </header>

      {/* Панель управления. Фильтры — за кнопкой: в каталоге главное это
          карточки, а не отбор во всю страницу. */}
      <div className="kat-panel">
        <div className="kat-panel-ryad">
          <button
            className={`btn small${zadano > 0 ? '' : ' ghost'} filtr-knopka`}
            onClick={() => setShtorka(true)}
          >
            Фильтры{zadano > 0 ? ` · ${zadano}` : ''}
          </button>

          <PoiskPole znachenie={filtry.poisk} pravit={pravit} />

          <div className="perekl">
            <button
              className={`perekl-b${!naKarte ? ' on' : ''}`}
              onClick={() => setNaKarte(false)}
            >
              Списком
            </button>
            <button
              className={`perekl-b${naKarte ? ' on' : ''}`}
              onClick={() => setNaKarte(true)}
            >
              На карте
            </button>
          </div>

          <select
            className="input malen"
            aria-label="Порядок"
            value={filtry.poryadok}
            onChange={(e) => pravit({ poryadok: e.target.value as Poryadok })}
          >
            {PORYADKI.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>

          <span className="kat-skolko">
            {pervayaZagruzka ? 'Ищем…' : `${vydacha?.vsego ?? 0} найдено`}
          </span>
        </div>

        {/* Что отобрано — видно и снимается одним нажатием. */}
        {zadano > 0 && (
          <div className="vybrano">
            {aktivnye(filtry).map((a) => (
              <button
                key={a.key}
                className="chip on snyat"
                onClick={() => pravit({ [a.key]: '' } as Partial<Filtry>)}
              >
                {a.label} <span aria-hidden="true">×</span>
              </button>
            ))}
            <button className="linkbtn" onClick={() => setAdres(new URLSearchParams())}>
              сбросить всё
            </button>
          </div>
        )}
      </div>

      <div className="kat-grid">
        {/* ------------------------------------------------------ фильтры */}
        <aside className={`kat-filtry${shtorka ? ' otkryta' : ''}`}>
          <button
            className="shtorka-fon"
            aria-label="Закрыть отбор"
            onClick={() => setShtorka(false)}
          />
          <div className="kat-filtry-inner">
            <div className="kat-fhead">
              <span className="wordmark">Фильтры</span>
              <button className="linkbtn" onClick={() => setShtorka(false)}>
                закрыть
              </button>
              {zadano > 0 && (
                <button className="linkbtn" onClick={() => setAdres(new URLSearchParams())}>
                  сбросить ({zadano})
                </button>
              )}
            </div>

            <div className="fld">
              <span className="field-label">Тематика</span>
              <div className="chips">
                {spr.tematiki.map((t: string) => (
                  <button
                    key={t}
                    className={`chip${filtry.tematika === t ? ' on' : ''}`}
                    onClick={() => pravit({ tematika: filtry.tematika === t ? '' : t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <label className="fld">
              <span className="field-label">Город</span>
              <select
                className="input"
                value={filtry.gorod}
                onChange={(e) => pravit({ gorod: e.target.value })}
              >
                <option value="">Любой</option>
                {/* Городов семьдесят с лишним — без разбивки по областям
                    в этом списке не найти нужный. */}
                {spr.oblasti
                  ? spr.oblasti.map((o) => (
                      <optgroup key={o.oblast} label={o.oblast}>
                        {o.goroda.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  : Object.keys(spr.goroda).map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
              </select>
            </label>

            {rayony.length > 0 && (
              <label className="fld">
                <span className="field-label">Район</span>
                <select
                  className="input"
                  value={filtry.rayon}
                  onChange={(e) => pravit({ rayon: e.target.value })}
                >
                  <option value="">Любой</option>
                  {rayony.map((r: string) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="fld">
              <span className="field-label">Язык</span>
              <div className="chips">
                {spr.yazyki.map((y: string) => (
                  <button
                    key={y}
                    className={`chip${filtry.yazyk === y ? ' on' : ''}`}
                    onClick={() => pravit({ yazyk: filtry.yazyk === y ? '' : y })}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            <div className="fld">
              <span className="field-label">Подписчиков</span>
              <div className="two">
                <ChislovoePole
                  imya="Подписчиков не меньше"
                  mesto="от"
                  znachenie={filtry.ot}
                  postavit={(v) => pravit({ ot: v }, true)}
                />
                <ChislovoePole
                  imya="Подписчиков не больше"
                  mesto="до"
                  znachenie={filtry.do}
                  postavit={(v) => pravit({ do: v }, true)}
                />
              </div>
            </div>

            <div className="fld">
              <span className="field-label">Охват не меньше</span>
              <ChislovoePole
                imya="Охват не меньше"
                mesto="любой"
                znachenie={filtry.ohvat_ot}
                postavit={(v) => pravit({ ohvat_ot: v }, true)}
              />
            </div>

            <div className="fld">
              <span className="field-label">Цена не выше, ₸</span>
              <ChislovoePole
                imya="Цена не выше"
                mesto="любая"
                znachenie={filtry.stavka_do}
                postavit={(v) => pravit({ stavka_do: v }, true)}
              />
              <span className="fine">Договорные тоже показываем — цена не названа.</span>
            </div>

            <button className="btn" onClick={() => setShtorka(false)}>
              Показать {vydacha?.vsego ?? 0}
            </button>
          </div>
        </aside>

        {/* ------------------------------------------------------- выдача */}
        <div className="kat-vydacha">
          {beda && (
            <div className="note err" role="alert">
              <span className="dot" aria-hidden="true">
                !
              </span>
              <span>Каталог не отвечает. Обновите страницу.</span>
            </div>
          )}

          {naKarte && vydacha && (
            <Karta tochki={vydacha.tochki} vybran={filtry.gorod} naGorod={naGorod} />
          )}

          {/* Первая загрузка: показываем места под карточки, а не пустоту. */}
          {pervayaZagruzka && (
            <div className="kat-setka">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="kk skelet" aria-hidden="true" />
              ))}
            </div>
          )}

          {vydacha && vydacha.karty.length === 0 && !gruzim && (
            <div className="pusto">
              <p className="sub">Никого не нашли под такой отбор.</p>
              <button className="btn ghost" onClick={() => setAdres(new URLSearchParams())}>
                Сбросить фильтры
              </button>
            </div>
          )}

          {vydacha && (
            <div className={`kat-setka${gruzim ? ' gruzim' : ''}`}>
              {vydacha.karty.map((k) => (
                <KatalozhnayaKarta key={k.id} k={k} />
              ))}
            </div>
          )}

          {vydacha && vydacha.stranic > 1 && (
            <div className="stranicy">
              <button
                className="btn small ghost"
                disabled={filtry.stranica <= 1}
                onClick={() => pravit({ stranica: filtry.stranica - 1 })}
              >
                Назад
              </button>
              <span className="mono-str">
                {vydacha.stranica} из {vydacha.stranic}
              </span>
              <button
                className="btn small ghost"
                disabled={filtry.stranica >= vydacha.stranic}
                onClick={() => pravit({ stranica: filtry.stranica + 1 })}
              >
                Дальше
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- поля ввода */

/**
 * Поле, которое человек набирает.
 *
 * Отчего лагало: каждая цифра шла прямо в адресную строку, а адрес — это
 * новый запрос к серверу и новая запись в истории. Наберёшь «100000» —
 * шесть запросов и шесть шагов назад. Теперь цифры живут в самом поле, а
 * наружу уходят, когда человек на полсекунды остановился.
 */
function ChislovoePole({
  imya,
  mesto,
  znachenie,
  postavit,
}: {
  imya: string
  mesto: string
  znachenie: string
  postavit: (v: string) => void
}) {
  const [svoyo, setSvoyo] = useState(znachenie)
  const posledneeOtpravlennoe = useRef(znachenie)

  // Фильтр сняли снаружи (крестиком или «сбросить всё») — поле идёт следом.
  useEffect(() => {
    if (znachenie !== posledneeOtpravlennoe.current) {
      posledneeOtpravlennoe.current = znachenie
      setSvoyo(znachenie)
    }
  }, [znachenie])

  useEffect(() => {
    if (svoyo === posledneeOtpravlennoe.current) return
    const t = setTimeout(() => {
      posledneeOtpravlennoe.current = svoyo
      postavit(svoyo)
    }, 450)
    return () => clearTimeout(t)
  }, [svoyo, postavit])

  return (
    <input
      className="input"
      inputMode="numeric"
      aria-label={imya}
      placeholder={mesto}
      value={razdelit(svoyo)}
      onChange={(e) => setSvoyo(e.target.value.replace(/\D/g, ''))}
    />
  )
}

/** Поиск по нику — та же выдержка, что и у числовых полей. */
function PoiskPole({
  znachenie,
  pravit,
}: {
  znachenie: string
  pravit: (chto: Partial<Filtry>, zamenit?: boolean) => void
}) {
  const [svoyo, setSvoyo] = useState(znachenie)
  const poslednee = useRef(znachenie)

  useEffect(() => {
    if (znachenie !== poslednee.current) {
      poslednee.current = znachenie
      setSvoyo(znachenie)
    }
  }, [znachenie])

  useEffect(() => {
    if (svoyo.trim() === poslednee.current) return
    const t = setTimeout(() => {
      poslednee.current = svoyo.trim()
      pravit({ poisk: svoyo.trim() }, true)
    }, 450)
    return () => clearTimeout(t)
  }, [svoyo, pravit])

  return (
    <input
      className="input poisk-pole"
      type="search"
      value={svoyo}
      placeholder="Поиск по нику"
      aria-label="Поиск по нику"
      onChange={(e) => setSvoyo(e.target.value)}
    />
  )
}

/* ----------------------------------------------------------------- карточка */

/** Карточка в сетке каталога. Кликается целиком. */
function KatalozhnayaKarta({ k }: { k: KartaTip }) {
  const mesto = [k.gorod, k.rayon].filter(Boolean).join(', ')
  const seti = razobratVse(k.ssylki)
  const podpis = [...k.tematiki, mesto].filter(Boolean).join(' · ')
  return (
    <Link to={`/b/${k.id}`} className="kk">
      <div className="kk-top">
        {k.photo ? (
          <img className="ava ava-img" src={k.photo} alt="" />
        ) : (
          <span className="ava" aria-hidden="true">
            {initials(k.nick)}
          </span>
        )}
        <span className="pv-txt">
          <span className="pv-nm">{k.nick}</span>
          {/* Заготовка из таблицы Ассоциации: человек ещё не заходил и ничего
              о себе не указал. Честно говорим это, а не оставляем пусто. */}
          <span className="pv-mt">{podpis || 'профиль ещё не заполнен'}</span>
        </span>
      </div>

      <div className="pv-nums">
        <span className="num">
          <span className="v">{korotko(k.followers)}</span>
          <span className="k">подписчиков</span>
        </span>
        <span className="num">
          <span className="v">{korotko(k.reach)}</span>
          <span className="k">охват</span>
        </span>
      </div>

      <div className="pv-row">
        <span className="pv-icons">
          {seti.map((s) => (
            <span key={s.url} className="ic" title={s.name}>
              {s.short}
            </span>
          ))}
        </span>
        <span className={`pill ${k.istochnik === 'screen' ? 'ok' : 'say'}`}>
          {k.istochnik === 'screen' ? '✓ со скрина' : 'со слов'}
        </span>
      </div>

      <div className="pv-foot">
        {k.dogovornaya
          ? 'Ставка договорная'
          : k.stavka
            ? `${razdelit(k.stavka)} ₸ за пост`
            : 'Ставка не указана'}
        {k.yazyk && ` · ${k.yazyk.toLowerCase()}`}
      </div>
    </Link>
  )
}

/** Что сейчас отобрано — для чипов «снять». */
function aktivnye(f: Filtry): { key: keyof Filtry; label: string }[] {
  const spisok: { key: keyof Filtry; label: string }[] = []
  if (f.tematika) spisok.push({ key: 'tematika', label: f.tematika })
  if (f.gorod) spisok.push({ key: 'gorod', label: f.gorod })
  if (f.rayon) spisok.push({ key: 'rayon', label: f.rayon })
  if (f.yazyk) spisok.push({ key: 'yazyk', label: f.yazyk })
  if (f.ot) spisok.push({ key: 'ot', label: `от ${razdelit(f.ot)} подписчиков` })
  if (f.do) spisok.push({ key: 'do', label: `до ${razdelit(f.do)} подписчиков` })
  if (f.ohvat_ot) spisok.push({ key: 'ohvat_ot', label: `охват от ${razdelit(f.ohvat_ot)}` })
  if (f.stavka_do) spisok.push({ key: 'stavka_do', label: `до ${razdelit(f.stavka_do)} ₸` })
  if (f.poisk) spisok.push({ key: 'poisk', label: `«${f.poisk}»` })
  return spisok
}

function initials(nick: string): string {
  const clean = nick.replace(/^@/, '')
  if (!clean) return '—'
  const parts = clean.split(/[._-]/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
}

export { PUSTYE }
