import { useCallback, useEffect, useMemo, useState } from 'react'
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

/** Публичный каталог: сюда приходит рекламодатель искать блогера. */
export default function Katalog() {
  const spr = useSpravochniki()
  const [adres, setAdres] = useSearchParams()
  const filtry = useMemo(() => izAdresa(adres.toString()), [adres])

  const [vydacha, setVydacha] = useState<Vydacha | null>(null)
  const [gruzim, setGruzim] = useState(true)
  const [beda, setBeda] = useState(false)
  const [naKarte, setNaKarte] = useState(false)
  const [poiskPole, setPoiskPole] = useState(filtry.poisk)
  // На телефоне фильтры прячутся в шторку: иначе до первого блогера
  // надо пролистать весь отбор.
  const [shtorka, setShtorka] = useState(false)

  /** Любая правка фильтра переписывает адрес — и ссылку можно скинуть. */
  const pravit = useCallback(
    (chto: Partial<Filtry>) => {
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
      setAdres(p, { replace: false })
      setShtorka(false)
    },
    [filtry, setAdres],
  )

  useEffect(() => {
    let zhiv = true
    setGruzim(true)
    setBeda(false)
    vzyatKatalog(filtry)
      .then((v) => zhiv && setVydacha(v))
      .catch(() => zhiv && setBeda(true))
      .finally(() => zhiv && setGruzim(false))
    return () => {
      zhiv = false
    }
  }, [filtry])

  // поиск не дёргает сервер на каждую букву
  useEffect(() => {
    if (poiskPole === filtry.poisk) return
    const t = setTimeout(() => pravit({ poisk: poiskPole.trim() }), 400)
    return () => clearTimeout(t)
  }, [poiskPole, filtry.poisk, pravit])

  const naGorod = useCallback((gorod: string) => pravit({ gorod }), [pravit])
  const rayony = spr.goroda[filtry.gorod] ?? []
  const zadano = skolkoZadano(filtry)

  return (
    <div className="form-page katalog">
      <Shapka />

      <header className="form-head">
        <div className="wordmark">Ассоциация блогеров</div>
        <h1>Каталог блогеров</h1>
        <p className="sub">
          Блогеры Казахстана в одном месте. Отберите по тематике, городу, охвату и цене —
          и напишите напрямую в соцсети.
        </p>
      </header>

      {/* только на телефоне: полоска с отбором и числом найденных */}
      <div className="kat-mob-polosa">
        <button className="btn small ghost" onClick={() => setShtorka(true)}>
          Отбор{zadano > 0 ? ` · ${zadano}` : ''}
        </button>
        <span className="kat-skolko malo">
          {gruzim && !vydacha ? 'Ищем…' : `${vydacha?.vsego ?? 0} найдено`}
        </span>
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
              <span className="wordmark">Отбор</span>
              <button className="linkbtn tolko-mob" onClick={() => setShtorka(false)}>
                закрыть
              </button>
              {zadano > 0 && (
                <button className="linkbtn" onClick={() => setAdres(new URLSearchParams())}>
                  сбросить ({zadano})
                </button>
              )}
            </div>

            <label className="fld">
              <span className="field-label">Поиск по нику</span>
              <input
                className="input"
                type="search"
                value={poiskPole}
                placeholder="@nick"
                onChange={(e) => setPoiskPole(e.target.value)}
              />
            </label>

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
                {Object.keys(spr.goroda).map((g) => (
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

            <label className="fld">
              <span className="field-label">Подписчиков не меньше</span>
              <input
                className="input"
                inputMode="numeric"
                value={razdelit(filtry.ot)}
                placeholder="любое"
                onChange={(e) => pravit({ ot: e.target.value.replace(/\D/g, '') })}
              />
            </label>

            <label className="fld">
              <span className="field-label">Охват не меньше</span>
              <input
                className="input"
                inputMode="numeric"
                value={razdelit(filtry.ohvat_ot)}
                placeholder="любой"
                onChange={(e) => pravit({ ohvat_ot: e.target.value.replace(/\D/g, '') })}
              />
            </label>

            <label className="fld">
              <span className="field-label">Цена не выше, ₸</span>
              <input
                className="input"
                inputMode="numeric"
                value={razdelit(filtry.stavka_do)}
                placeholder="любая"
                onChange={(e) => pravit({ stavka_do: e.target.value.replace(/\D/g, '') })}
              />
              <span className="fine">Договорные тоже показываем — цена не названа.</span>
            </label>

            <button className="btn tolko-mob" onClick={() => setShtorka(false)}>
              Показать {vydacha?.vsego ?? 0}
            </button>
          </div>
        </aside>

        {/* ------------------------------------------------------- выдача */}
        <div className="kat-vydacha">
          <div className="kat-verh">
            <span className="kat-skolko">
              {gruzim && !vydacha ? 'Ищем…' : `Найдено ${vydacha?.vsego ?? 0}`}
            </span>
            <div className="kat-upr">
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
                value={filtry.poryadok}
                onChange={(e) => pravit({ poryadok: e.target.value as Poryadok })}
              >
                {PORYADKI.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

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

          {vydacha && vydacha.karty.length === 0 && !gruzim && (
            <div className="pusto">
              <p className="sub">Никого не нашли под такой отбор.</p>
              <button className="btn ghost" onClick={() => setAdres(new URLSearchParams())}>
                Сбросить фильтры
              </button>
            </div>
          )}

          <div className={`kat-setka${gruzim ? ' gruzim' : ''}`}>
            {(vydacha?.karty ?? []).map((k) => (
              <KatalozhnayaKarta key={k.id} k={k} />
            ))}
          </div>

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

/** Карточка в сетке каталога. Кликается целиком. */
function KatalozhnayaKarta({ k }: { k: KartaTip }) {
  const mesto = [k.gorod, k.rayon].filter(Boolean).join(', ')
  const seti = razobratVse(k.ssylki)
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
          <span className="pv-mt">{[...k.tematiki, mesto].filter(Boolean).join(' · ')}</span>
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

function initials(nick: string): string {
  const clean = nick.replace(/^@/, '')
  if (!clean) return '—'
  const parts = clean.split(/[._-]/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
}

export { PUSTYE }
