import { useEffect, useRef, useState } from 'react'
import { cardApi, zagruzitFoto } from '../lib/api'
import {
  gotovo,
  OBYAZATELNO,
  pustayaKarta,
  razdelit,
  type CardStatus,
  type Karta,
  type ReadResult,
} from '../lib/card'
import { razobrat, razobratVse } from '../lib/seti'
import { MAX_TEMATIK, useSpravochniki } from '../lib/spravochniki'
import { USE_FAKE } from '../lib/rezhim'
import { Preview } from '../ui/Preview'
import { Shapka } from '../ui/Shapka'

type ScreenState = 'empty' | 'reading' | 'done' | 'failed'

/** Окно регистрации карточки. Вариант А — форма и живой предпросмотр. */
export default function Card() {
  const spr = useSpravochniki()
  const [k, setK] = useState<Karta>(pustayaKarta)
  const [status, setStatus] = useState<CardStatus | null>(null)
  const [scan, setScan] = useState<ScreenState>('empty')
  const [sending, setSending] = useState(false)
  const [tried, setTried] = useState(false)
  const [vstavka, setVstavka] = useState('')
  const [ssylkaBad, setSsylkaBad] = useState(false)
  const [otkaz, setOtkaz] = useState<string | null>(null)
  // Карточку, уже стоящую в каталоге, блогер правит сам — спека, день 3–4.
  // Раньше экран предлагал «напишите администратору», хотя сервер правку умел.
  const [pravim, setPravim] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const shotRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    cardApi.load().then((r) => {
      if (!alive) return
      setK(r.karta)
      setStatus(r.status)
      setOtkaz(r.prichinaOtkaza ?? null)
    })
    return () => {
      alive = false
    }
  }, [])

  function set<K extends keyof Karta>(key: K, value: Karta[K]) {
    setK((prev) => ({ ...prev, [key]: value }))
  }

  function dobavitSsylku() {
    const razobrana = razobrat(vstavka)
    if (!razobrana) {
      setSsylkaBad(true)
      return
    }
    setSsylkaBad(false)
    setVstavka('')
    setK((prev) =>
      prev.ssylki.includes(razobrana.url)
        ? prev
        : { ...prev, ssylki: [...prev.ssylki, razobrana.url] },
    )
  }

  function toggleTema(t: string) {
    setK((prev) => {
      if (prev.tematiki.includes(t))
        return { ...prev, tematiki: prev.tematiki.filter((x) => x !== t) }
      if (prev.tematiki.length >= MAX_TEMATIK) return prev
      return { ...prev, tematiki: [...prev.tematiki, t] }
    })
  }

  async function onShot(file: File | undefined) {
    if (!file) return
    setK((prev) => ({ ...prev, screenshot: URL.createObjectURL(file) }))
    setScan('reading')
    const res = (await cardApi.readScreenshot(file)) as ReadResult & { url?: string }
    if (res.url) setK((prev) => ({ ...prev, screenshot: res.url! }))
    if (res.ok) {
      setK((prev) => ({
        ...prev,
        followers: res.followers,
        reach: res.reach,
        istochnik: 'screen',
        proverka: res.proverka,
      }))
      setScan('done')
    } else {
      // Не блокируем: цифры вводятся руками, на карточке «со слов».
      setScan('failed')
      setK((prev) => ({ ...prev, istochnik: 'words', proverka: null }))
    }
  }

  async function send() {
    setTried(true)
    if (gotovo(k) < OBYAZATELNO.length || sending) return
    setSending(true)
    const res = await cardApi.save(k)
    setSending(false)
    setStatus(res.status)
    setOtkaz(null)
    setPravim(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (status === null) {
    return (
      <div className="form-page">
        <div className="spinner" role="status" aria-label="Загружаем карточку" />
      </div>
    )
  }

  if ((status === 'moderation' || status === 'published') && !pravim) {
    return (
      <Sent
        k={k}
        published={status === 'published'}
        pravit={() => {
          setPravim(true)
          setTried(false)
        }}
      />
    )
  }

  const nedostaet = OBYAZATELNO.filter((f) => !f.done(k))
  /* Слово владельца 07.09.2026: «обязательные поля при регистрации должны
     подсвечиваться ярко красным». Подсвечиваем не сразу — человек только
     открыл форму, он ещё ничего не пропустил, — а после первой попытки
     отправить. Класс `trebuem` красит рамку и подпись. */
  const nado = (key: string) => (tried && nedostaet.some((f) => f.key === key) ? ' trebuem' : '')
  const seti = razobratVse(k.ssylki)

  return (
    <div className="form-page">
      <Shapka />
      <header className="form-head">
        <div className="wordmark">Ассоциация блогеров</div>
        <h1>Ваша карточка</h1>
        <p className="sub">
          {status === 'published'
            ? 'Правьте, что нужно, и сохраните. Ник, ссылки, тематика и ставка меняются в каталоге сразу.'
            : 'Это ваше объявление в реестре: по нему рекламодатели будут вас находить. Заполните и отправьте — карточка появится в каталоге.'}
        </p>
      </header>

      {otkaz && (
        <div className="vernuli" role="alert">
          <span className="v-head">Карточку вернули на доработку</span>
          <p className="v-txt">{otkaz}</p>
          <p className="fine">Поправьте, что просят, и отправьте снова.</p>
        </div>
      )}

      <div className="form-grid">
        <aside className="side">
          <div className="side-inner">
            <div className="wordmark">Так вас увидят</div>
            <Preview k={k} />
            <ul className="ready">
              {OBYAZATELNO.map((f) => (
                <li key={f.key} className={f.done(k) ? 'on' : tried ? 'trebuem' : ''}>
                  <span className="tick" aria-hidden="true">
                    {f.done(k) ? '✓' : '○'}
                  </span>
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="fields">
          {/* ------------------------------------------------------ кто вы */}
          <section className="block">
            <h2>Кто вы</h2>

            <div className="photo-row">
              {k.photo ? (
                <img className="ava ava-img big" src={k.photo} alt="" />
              ) : (
                <span className="ava big" aria-hidden="true">
                  ?
                </span>
              )}
              <div>
                <button className="btn small ghost" onClick={() => photoRef.current?.click()}>
                  {k.photo ? 'Заменить фото' : 'Загрузить фото'}
                </button>
                <p className="fine">Необязательно, но с фото карточку открывают чаще.</p>
              </div>
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) set('photo', await zagruzitFoto(f))
                }}
              />
            </div>

            <label className={`fld${nado('nick')}`}>
              <span className="field-label">Ник</span>
              <input
                className={`input${nado('nick')}`}
                value={k.nick}
                placeholder="@vash.nick"
                onChange={(e) => set('nick', e.target.value)}
              />
              {nado('nick') && <span className="trebuem-txt">Без ника карточку не найдут</span>}
            </label>

            <label className={`fld${nado('fio')}`}>
              <span className="field-label">Имя и фамилия</span>
              <input
                className={`input${nado('fio')}`}
                value={k.fio}
                maxLength={120}
                placeholder="Айгерим Сериковна"
                onChange={(e) => set('fio', e.target.value)}
              />
              {nado('fio') ? (
                <span className="trebuem-txt">Напишите, как к вам обращаться</span>
              ) : (
                <span className="fine">Рекламодателю проще писать человеку по имени, чем нику.</span>
              )}
            </label>

            <label className="fld">
              <span className="field-label">О себе · по желанию</span>
              <textarea
                className="input pole-bio"
                value={k.bio}
                maxLength={400}
                rows={3}
                placeholder="Пара строк: о чём ваш блог и кто вас читает"
                onChange={(e) => set('bio', e.target.value)}
              />
              <span className="fine">{k.bio.length} из 400 знаков</span>
            </label>

            <div className={`fld${nado('ssylki')}`}>
              <span className="field-label">Ссылки на профили · хотя бы одна</span>
              <div className="paste">
                <input
                  className={`input${ssylkaBad ? ' bad' : ''}`}
                  type="url"
                  inputMode="url"
                  value={vstavka}
                  placeholder="Вставьте ссылку на профиль"
                  aria-label="Ссылка на профиль"
                  onChange={(e) => {
                    setVstavka(e.target.value)
                    setSsylkaBad(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      dobavitSsylku()
                    }
                  }}
                />
                <button
                  className="btn small"
                  disabled={vstavka.trim() === ''}
                  onClick={dobavitSsylku}
                >
                  Добавить
                </button>
              </div>
              {ssylkaBad && <p className="warn-txt small-txt">Это не похоже на ссылку.</p>}
              <p className="fine">
                Откройте свой профиль, скопируйте адрес из строки браузера и вставьте сюда. Сеть
                определим сами.
              </p>

              {seti.length > 0 && (
                <ul className="links">
                  {seti.map((s) => (
                    <li key={s.url}>
                      <span className="ic" aria-hidden="true">
                        {s.short}
                      </span>
                      <span className="link-txt">
                        <span className="link-nm">{s.name}</span>
                        <span className="link-h">{s.handle}</span>
                      </span>
                      <button
                        className="linkbtn"
                        aria-label={`Убрать ${s.name}`}
                        onClick={() =>
                          set(
                            'ssylki',
                            k.ssylki.filter((u) => u !== s.url),
                          )
                        }
                      >
                        Убрать
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* ------------------------------------------------------- цифры */}
          <section className="block">
            <h2>Цифры</h2>

            {k.screenshot ? (
              <div className="shot">
                <img src={k.screenshot} alt="Загруженный скрин статистики" />
                <div className="shot-txt">
                  {scan === 'reading' && <p className="reading">Читаем цифры со скрина…</p>}
                  {scan === 'done' && (
                    <p className="ok-txt">Готово — цифры ниже взяты отсюда. Можно поправить.</p>
                  )}
                  {scan === 'failed' && (
                    <p className="reading">
                      Скрин сохранён. Впишите подписчиков и охват сами — с этой картинки прочитать
                      не вышло.
                    </p>
                  )}
                  <button className="btn small ghost" onClick={() => shotRef.current?.click()}>
                    Заменить скрин
                  </button>
                </div>
              </div>
            ) : (
              <button className="drop" onClick={() => shotRef.current?.click()}>
                <span className="big" aria-hidden="true">
                  ▤
                </span>
                Загрузите скрин статистики
                <span className="fine">
                  Экран «Статистика» из Instagram или TikTok. Модератор сверит по нему ваши цифры.
                </span>
                <span className="pill soon">скоро: цифры прочитаются сами</span>
              </button>
            )}
            <input
              ref={shotRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void onShot(e.target.files?.[0])}
            />

            <div className="two">
              <label className={`fld${nado('followers')}`}>
                <span className="field-label">Подписчики</span>
                <span className="input-wrap">
                  <input
                    className={`input${nado('followers')}`}
                    inputMode="numeric"
                    value={razdelit(k.followers)}
                    placeholder="48 200"
                    onChange={(e) => {
                      set('followers', e.target.value.replace(/\D/g, ''))
                      set('istochnik', 'words')
                    }}
                  />
                  <span className={`pill ${k.istochnik === 'screen' ? 'ok' : 'say'}`}>
                    {k.istochnik === 'screen' ? 'со скрина' : 'со слов'}
                  </span>
                </span>
              </label>

              <label className={`fld${nado('reach')}`}>
                <span className="field-label">Охват одного поста</span>
                <input
                  className={`input${nado('reach')}`}
                  inputMode="numeric"
                  value={razdelit(k.reach)}
                  placeholder="12 400"
                  onChange={(e) => {
                    set('reach', e.target.value.replace(/\D/g, ''))
                    set('istochnik', 'words')
                  }}
                />
              </label>
            </div>
          </section>

          {/* --------------------------------------------------- про работу */}
          <section className="block">
            <h2>Про работу</h2>

            <div className="fld">
              <span className="field-label">
                Тематика · до {MAX_TEMATIK} · выбрано {k.tematiki.length}
              </span>
              <div className={`chips${nado('tematiki')}`}>
                {spr.tematiki.map((t: string) => {
                  const on = k.tematiki.includes(t)
                  return (
                    <button
                      key={t}
                      className={`chip${on ? ' on' : ''}`}
                      disabled={!on && k.tematiki.length >= MAX_TEMATIK}
                      aria-pressed={on}
                      onClick={() => toggleTema(t)}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>

            <label className={`fld${nado('gorod')}`}>
              <span className="field-label">Город</span>
              <select
                className={`input${nado('gorod')}`}
                value={k.gorod}
                onChange={(e) => {
                  set('gorod', e.target.value)
                }}
              >
                <option value="">Выберите</option>
                {Object.keys(spr.goroda).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>

            <div className={`fld${nado('yazyk')}`}>
              <span className="field-label">Язык контента</span>
              <div className="chips">
                {spr.yazyki.map((y: string) => (
                  <button
                    key={y}
                    className={`chip${k.yazyk === y ? ' on' : ''}`}
                    aria-pressed={k.yazyk === y}
                    onClick={() => set('yazyk', y)}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            <div className="fld">
              <span className="field-label">Ставка за пост</span>
              <div className="two tight">
                <input
                  className="input"
                  inputMode="numeric"
                  disabled={k.dogovornaya}
                  value={razdelit(k.stavka)}
                  placeholder="60 000 ₸"
                  onChange={(e) => set('stavka', e.target.value.replace(/\D/g, ''))}
                />
                <label className="consent tight">
                  <input
                    type="checkbox"
                    checked={k.dogovornaya}
                    onChange={(e) => set('dogovornaya', e.target.checked)}
                  />
                  <span>Договорная</span>
                </label>
              </div>
            </div>
          </section>

          {tried && nedostaet.length > 0 && (
            <div className="note err" role="alert">
              <span className="dot" aria-hidden="true">
                !
              </span>
              <span>
                Осталось заполнить: {nedostaet.map((f) => f.label.toLowerCase()).join(', ')}.
              </span>
            </div>
          )}

          <button className="btn" disabled={sending} onClick={send}>
            {sending
              ? 'Сохраняем…'
              : status === 'published'
                ? 'Сохранить'
                : otkaz
                  ? 'Отправить на проверку снова'
                  : 'Отправить на проверку'}
          </button>
          <p className="fine">
            Потом карточку можно поправить в любой момент — вы всегда войдёте по своему номеру.
          </p>

          {USE_FAKE && (
            <div className="note hint" role="status">
              Заглушка: сервера нет, заявки живут до обновления страницы.
            </div>
          )}
        </div>
      </div>

      <div className="bar">
        <span className="bar-txt">
          Готово {gotovo(k)} из {OBYAZATELNO.length}
        </span>
        <button className="btn small" disabled={sending} onClick={send}>
          {sending
            ? 'Сохраняем…'
            : status === 'published'
              ? 'Сохранить'
              : otkaz
                ? 'Отправить снова'
                : 'Отправить'}
        </button>
      </div>
    </div>
  )
}

/** Экран после отправки. */
function Sent({ k, published, pravit }: { k: Karta; published: boolean; pravit: () => void }) {
  return (
    <div className="form-page narrow">
      <Shapka />
      <header className="form-head">
        <div className="wordmark">Ассоциация блогеров</div>
        <h1>{published ? 'Карточка в каталоге' : 'Карточка на проверке'}</h1>
        <p className="sub">
          {published
            ? 'Вас уже могут найти по фильтрам каталога.'
            : 'Модератор Ассоциации посмотрит её и опубликует в каталоге. Обычно это занимает день. Мы сообщим, когда карточка появится.'}
        </p>
      </header>
      <div className="sent-card">
        <div className="wordmark">Так вас увидят</div>
        <Preview k={k} />
      </div>
      <button className="btn" onClick={pravit}>
        Поправить карточку
      </button>
      <p className="fine center">
        {published
          ? 'Ник, ссылки, тематику и ставку меняем сразу. Новые цифры и скрин уходят на проверку — до неё в каталоге висят прежние.'
          : 'Правку увидит модератор вместе с самой карточкой.'}
      </p>
    </div>
  )
}
