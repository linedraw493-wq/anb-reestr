import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { moderApi, NetDostupa } from '../lib/api'
import {
  initsialy,
  razdelit,
  STATUS_NAZVANIE,
  ton,
  type CardStatus,
  type Karta,
  type StranicaZayavok,
  type Zayavka,
} from '../lib/card'
import { razobratVse } from '../lib/seti'
import { USE_FAKE } from '../lib/rezhim'
import { MAX_TEMATIK, nuzhenRayon, useSpravochniki } from '../lib/spravochniki'
import { Preview } from '../ui/Preview'
import { Shapka } from '../ui/Shapka'

const VKLADKI: { key: CardStatus; label: string }[] = [
  { key: 'moderation', label: 'На проверке' },
  { key: 'published', label: 'В каталоге' },
  { key: 'rejected', label: 'Отклонённые' },
  { key: 'draft', label: 'Черновики' },
]

/** Пустая вкладка — это чаще всего хорошая новость, а не поломка. */
const PUSTAYA_VKLADKA: Record<CardStatus, { zagolovok: string; poyasnenie: string }> = {
  moderation: {
    zagolovok: 'Проверять нечего',
    poyasnenie:
      'Карточки идут в каталог сразу. Сюда попадают только спорные — те, где цифры разошлись со скрином или скрин не прочитался.',
  },
  published: {
    zagolovok: 'В каталоге пусто',
    poyasnenie: 'Ни одна карточка ещё не опубликована. Разошлите приглашения блогерам.',
  },
  rejected: {
    zagolovok: 'Отклонённых нет',
    poyasnenie: 'Никому пока не отказывали. Причина отказа видна блогеру в его карточке.',
  },
  draft: {
    zagolovok: 'Черновиков нет',
    poyasnenie: 'Черновик — это карточка, которую блогер начал, но ещё не отправил.',
  },
}

/** Инструмент модератора: заявки, проверка, правка, удаление, добавление. */
export default function Moderator() {
  const navigate = useNavigate()
  const spr = useSpravochniki()
  const [vse, setVse] = useState<Zayavka[] | null>(null)
  const [scheta, setScheta] = useState<Partial<Record<CardStatus, number>>>({})
  const [stranica, setStranica] = useState(1)
  const [stranic, setStranic] = useState(1)
  const [vkladka, setVkladka] = useState<CardStatus>('moderation')
  const [vybran, setVybran] = useState<string | null>(null)
  const [pravka, setPravka] = useState<Karta | null>(null)
  const [otkaz, setOtkaz] = useState('')
  const [prichiny, setPrichiny] = useState<string[]>([])
  const [zanyat, setZanyat] = useState(false)
  const [beda, setBeda] = useState<'net-prav' | 'net-svyazi' | null>(null)
  const pervyyRaz = useRef(true)

  /* Страницами и по вкладке: раньше экран тянул все 306 карточек разом и
     ждал секунды. Теперь сервер отдаёт одну вкладку по пятьдесят штук. */
  async function perechitat(ostavit?: string | null) {
    let stranicaZayavok: StranicaZayavok
    try {
      stranicaZayavok = await moderApi.list({ status: vkladka, stranica })
    } catch (oshibka) {
      setBeda(oshibka instanceof NetDostupa ? 'net-prav' : 'net-svyazi')
      setVse([])
      return
    }
    setBeda(null)
    setVse(stranicaZayavok.zayavki)
    setScheta(stranicaZayavok.scheta ?? {})
    setStranic(stranicaZayavok.stranic)
    // Проверка сейчас выключена — на вкладке «на проверке» пусто всегда.
    // Не встречаем модератора пустым экраном: открываем то, где есть работа.
    if (
      pervyyRaz.current &&
      vkladka === 'moderation' &&
      stranicaZayavok.zayavki.length === 0 &&
      (stranicaZayavok.scheta?.published ?? 0) > 0
    ) {
      pervyyRaz.current = false
      setVkladka('published')
      return
    }
    pervyyRaz.current = false
    const id = ostavit !== undefined ? ostavit : vybran
    const nashli = stranicaZayavok.zayavki.find((z) => z.karta.id === id)
    setVybran(nashli ? nashli.karta.id : null)
    setPravka(nashli ? { ...nashli.karta } : null)
  }

  useEffect(() => {
    void perechitat(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vkladka, stranica])

  // Готовые причины отказа. Читаются один раз: список короткий и меняется
  // редко, а модератору важно не набирать одно и то же по двадцать раз.
  useEffect(() => {
    void moderApi.prichiny().then(setPrichiny)
  }, [])

  const spisok = vse ?? []

  const tekushchaya = (vse ?? []).find((z) => z.karta.id === vybran) ?? null

  function otkryt(z: Zayavka) {
    setVybran(z.karta.id)
    setPravka({ ...z.karta })
    setOtkaz('')
  }

  async function deystvie(fn: () => Promise<void>, posle: 'zakryt' | 'ostavit' = 'zakryt') {
    setZanyat(true)
    await fn()
    setZanyat(false)
    await perechitat(posle === 'zakryt' ? null : vybran)
  }

  if (vse === null) {
    return (
      <div className="form-page">
        <div className="spinner" role="status" aria-label="Загружаем заявки" />
      </div>
    )
  }

  if (beda) {
    return (
      <div className="form-page narrow">
        <Shapka />
        <header className="form-head">
          <h1>{beda === 'net-prav' ? 'Сюда нельзя' : 'Сервер не отвечает'}</h1>
          <p className="sub">
            {beda === 'net-prav'
              ? 'Проверка карточек — для модераторов Ассоциации. Войдите под своим номером.'
              : 'Не получилось забрать заявки. Обновите страницу — если не поможет, сервер лежит.'}
          </p>
        </header>
        <button className="btn" onClick={() => navigate('/vhod')}>
          {beda === 'net-prav' ? 'Войти' : 'На вход'}
        </button>
      </div>
    )
  }

  return (
    <div className={`form-page moder${vybran ? ' open' : ''}`}>
      <Shapka />
      <header className="form-head">
        <div className="wordmark">Ассоциация блогеров · модератор</div>
        <h1>Проверка карточек</h1>
        <p className="sub">
          Проверка при регистрации временно выключена — карточки идут в каталог сразу. Отсюда их всё
          равно можно править, скрывать и возвращать.
        </p>
      </header>

      <div className="moder-grid">
        {/* ------------------------------------------------------- список */}
        <div className="moder-list">
          <div className="tabs">
            {VKLADKI.map((v) => (
              <button
                key={v.key}
                className={`tab${vkladka === v.key ? ' on' : ''}`}
                onClick={() => {
                  setVkladka(v.key)
                  setStranica(1)
                  setVybran(null)
                  setPravka(null)
                }}
              >
                {v.label}
                {scheta[v.key] ? <span className="cnt">{scheta[v.key]}</span> : null}
              </button>
            ))}
          </div>

          <button
            className="btn small ghost wide"
            disabled={zanyat}
            onClick={() =>
              void deystvie(async () => {
                const telefon = prompt('Номер телефона блогера (можно оставить пустым):') ?? ''
                const nik = prompt('Ник блогера:') ?? ''
                const z = await moderApi.create(telefon, nik)
                setVkladka('draft')
                setVybran(z.karta.id)
              }, 'ostavit')
            }
          >
            + Завести карточку вручную
          </button>

          {spisok.length === 0 ? (
            <div className="pusto malo">
              <span className="znak" aria-hidden="true">
                ✓
              </span>
              <h2>{PUSTAYA_VKLADKA[vkladka].zagolovok}</h2>
              <p className="sub">{PUSTAYA_VKLADKA[vkladka].poyasnenie}</p>
            </div>
          ) : (
            <ul className="zayavki">
              {spisok.map((z) => {
                const sporno = z.karta.proverka && !z.karta.proverka.sovpalo
                return (
                  <li key={z.karta.id}>
                    <button
                      className={`zayavka${vybran === z.karta.id ? ' on' : ''}`}
                      onClick={() => otkryt(z)}
                    >
                      <span
                        className="ava ton"
                        style={ton(z.karta.nick) as React.CSSProperties}
                        aria-hidden="true"
                      >
                        {initsialy(z.karta.nick)}
                      </span>
                      <span className="z-txt">
                        <span className="z-nm">{z.karta.nick || 'без ника'}</span>
                        <span className="z-mt">
                          {[z.karta.gorod, ...z.karta.tematiki].filter(Boolean).join(' · ') ||
                            'не заполнена'}
                        </span>
                        <span className="z-mt">{z.podana}</span>
                      </span>
                      {sporno && (
                        <span className="pill say" title="ИИ нашёл расхождение">
                          спорно
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {stranic > 1 && (
            <div className="stranicy">
              <button
                className="btn small ghost"
                disabled={stranica <= 1}
                onClick={() => setStranica((n) => n - 1)}
              >
                Назад
              </button>
              <span className="mono-str">
                {stranica} из {stranic}
              </span>
              <button
                className="btn small ghost"
                disabled={stranica >= stranic}
                onClick={() => setStranica((n) => n + 1)}
              >
                Дальше
              </button>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------- карточка */}
        <div className="moder-detail">
          {!tekushchaya || !pravka ? (
            <div className="pusto malo">
              <span className="znak" aria-hidden="true">
                ←
              </span>
              <h2>Выберите карточку</h2>
              <p className="sub">
                Слева список. Нажмите на карточку — здесь откроются её поля, скрин и решение.
              </p>
            </div>
          ) : (
            <div className="detail-inner">
              <button className="linkbtn back" onClick={() => setVybran(null)}>
                ← К списку
              </button>

              <div className="detail-head">
                <span className={`pill ${statusPill(tekushchaya.status)}`}>
                  {STATUS_NAZVANIE[tekushchaya.status]}
                </span>
                <span className="fine">подана {tekushchaya.podana}</span>
              </div>

              {tekushchaya.prichina && (
                <div className="note err">
                  <span className="dot" aria-hidden="true">
                    !
                  </span>
                  <span>Отклонена: {tekushchaya.prichina}</span>
                </div>
              )}

              <Preview k={pravka} />

              {tekushchaya.pravkaCifr && (
                <div className="proverka bad">
                  <span className="p-head">Блогер поменял цифры — ждут проверки</span>
                  <dl className="p-rows">
                    <div>
                      <dt>В каталоге</dt>
                      <dd>
                        {razdelit(tekushchaya.karta.followers) || '—'} подписчиков ·{' '}
                        {razdelit(tekushchaya.karta.reach) || '—'} охват
                      </dd>
                    </div>
                    <div>
                      <dt>Просит</dt>
                      <dd>
                        {razdelit(tekushchaya.pravkaCifr.podpischiki) || '—'} подписчиков ·{' '}
                        {razdelit(tekushchaya.pravkaCifr.ohvat) || '—'} охват
                      </dd>
                    </div>
                  </dl>
                  <p className="fine">
                    До вашего решения в каталоге висят старые цифры. Одобрите — встанут новые.
                  </p>
                </div>
              )}

              <ProverkaBlok k={pravka} />

              {/* ------------------------------------------------ правка */}
              <section className="block">
                <h2>Правка</h2>

                <label className="fld">
                  <span className="field-label">Ник</span>
                  <input
                    className="input"
                    value={pravka.nick}
                    onChange={(e) => setPravka({ ...pravka, nick: e.target.value })}
                  />
                </label>

                <div className="two">
                  <label className="fld">
                    <span className="field-label">Подписчики</span>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={razdelit(pravka.followers)}
                      onChange={(e) =>
                        setPravka({ ...pravka, followers: e.target.value.replace(/\D/g, '') })
                      }
                    />
                  </label>
                  <label className="fld">
                    <span className="field-label">Охват</span>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={razdelit(pravka.reach)}
                      onChange={(e) =>
                        setPravka({ ...pravka, reach: e.target.value.replace(/\D/g, '') })
                      }
                    />
                  </label>
                </div>

                {/* Пометка достоверности — спека, день 5. Модератор сверил
                    цифры со скрином сам: ставит «со скрина». Не сошлось —
                    возвращает на «со слов», и в каталоге это видно всем. */}
                <div className="fld">
                  <span className="field-label">Откуда цифры</span>
                  <div className="chips">
                    <button
                      className={`chip${pravka.istochnik === 'screen' ? ' on' : ''}`}
                      onClick={() => setPravka({ ...pravka, istochnik: 'screen' })}
                    >
                      со скрина — проверено
                    </button>
                    <button
                      className={`chip${pravka.istochnik === 'words' ? ' on' : ''}`}
                      onClick={() => setPravka({ ...pravka, istochnik: 'words' })}
                    >
                      со слов
                    </button>
                  </div>
                </div>

                <div className="two">
                  <label className="fld">
                    <span className="field-label">Город</span>
                    <select
                      className="input"
                      value={pravka.gorod}
                      onChange={(e) => setPravka({ ...pravka, gorod: e.target.value, rayon: '' })}
                    >
                      <option value="">Выберите</option>
                      {Object.keys(spr.goroda).map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="fld">
                    <span className="field-label">Район</span>
                    <select
                      className="input"
                      value={pravka.rayon}
                      disabled={!nuzhenRayon(pravka.gorod)}
                      onChange={(e) => setPravka({ ...pravka, rayon: e.target.value })}
                    >
                      <option value="">
                        {nuzhenRayon(pravka.gorod) ? 'Выберите' : 'Не нужен'}
                      </option>
                      {(spr.goroda[pravka.gorod] ?? []).map((r: string) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="fld">
                  <span className="field-label">Тематика · до {MAX_TEMATIK}</span>
                  <div className="chips">
                    {spr.tematiki.map((t: string) => {
                      const on = pravka.tematiki.includes(t)
                      return (
                        <button
                          key={t}
                          className={`chip${on ? ' on' : ''}`}
                          disabled={!on && pravka.tematiki.length >= MAX_TEMATIK}
                          onClick={() =>
                            setPravka({
                              ...pravka,
                              tematiki: on
                                ? pravka.tematiki.filter((x) => x !== t)
                                : [...pravka.tematiki, t],
                            })
                          }
                        >
                          {t}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="fld">
                  <span className="field-label">Язык</span>
                  <div className="chips">
                    {spr.yazyki.map((y: string) => (
                      <button
                        key={y}
                        className={`chip${pravka.yazyk === y ? ' on' : ''}`}
                        onClick={() => setPravka({ ...pravka, yazyk: y })}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="fld">
                  <span className="field-label">Ссылки на профили</span>
                  {pravka.ssylki.length === 0 ? (
                    <p className="fine">Не указаны.</p>
                  ) : (
                    <ul className="links">
                      {razobratVse(pravka.ssylki).map((s) => (
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
                            onClick={() =>
                              setPravka({
                                ...pravka,
                                ssylki: pravka.ssylki.filter((u) => u !== s.url),
                              })
                            }
                          >
                            Убрать
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  className="btn ghost"
                  disabled={zanyat}
                  onClick={() => void deystvie(() => moderApi.update(pravka), 'ostavit')}
                >
                  Сохранить правки
                </button>
              </section>

              {/* -------------------------------------------------- решение */}
              <section className="block">
                <h2>Решение</h2>
                <button
                  className="btn"
                  disabled={zanyat || tekushchaya.status === 'published'}
                  onClick={() =>
                    void deystvie(async () => {
                      await moderApi.update(pravka)
                      await moderApi.approve(pravka.id)
                    })
                  }
                >
                  Одобрить и опубликовать
                </button>

                <label className="fld">
                  <span className="field-label">Причина отказа</span>
                  {prichiny.length > 0 ? (
                    <div className="chips prichiny">
                      {prichiny.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`chip${otkaz === p ? ' on' : ''}`}
                          onClick={() => setOtkaz(otkaz === p ? '' : p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <input
                    className="input"
                    value={otkaz}
                    placeholder="Или своя причина текстом"
                    onChange={(e) => setOtkaz(e.target.value)}
                  />
                  <span className="fine">
                    Блогер увидит эту строку — он по ней и будет исправлять карточку.
                  </span>
                </label>
                <button
                  className="btn ghost"
                  disabled={zanyat || otkaz.trim() === ''}
                  onClick={() => void deystvie(() => moderApi.reject(pravka.id, otkaz.trim()))}
                >
                  Отклонить
                </button>

                {tekushchaya.status === 'published' ? (
                  <button
                    className="btn ghost"
                    disabled={zanyat}
                    onClick={() => void deystvie(() => moderApi.skryt(pravka.id, true))}
                  >
                    Скрыть из каталога
                  </button>
                ) : (
                  <button
                    className="btn ghost"
                    disabled={zanyat}
                    onClick={() => void deystvie(() => moderApi.skryt(pravka.id, false))}
                  >
                    Вернуть в каталог
                  </button>
                )}
                <p className="fine">
                  Скрытая карточка пропадает из каталога, но данные целы и её можно вернуть.
                </p>

                <button
                  className="btn danger"
                  disabled={zanyat}
                  onClick={() => {
                    if (
                      confirm(
                        `Удалить ${pravka.nick} НАВСЕГДА? Вместе с карточкой пропадёт человек ` +
                          `и его приглашение. Если нужно просто убрать из каталога — жмите «Скрыть».`,
                      )
                    )
                      void deystvie(() => moderApi.remove(pravka.id))
                  }}
                >
                  Удалить навсегда
                </button>
              </section>
            </div>
          )}
        </div>
      </div>

      {USE_FAKE && (
        <div className="note hint moder-hint" role="status">
          Заглушка: сервера нет, заявки живут до обновления страницы. ИИ-проверка тоже поддельная.
        </div>
      )}
    </div>
  )
}

/** Что увидел ИИ на скрине — модератору для решения. */
function ProverkaBlok({ k }: { k: Karta }) {
  const p = k.proverka
  if (!p) {
    return (
      <div className="proverka none">
        <span className="p-head">Скрин не прочитан</span>
        <p className="fine">
          {k.screenshot
            ? 'Цифры с этой картинки прочитать не вышло — сверьте глазами.'
            : 'Блогер не приложил скрин статистики. Цифры в карточке — с его слов.'}
        </p>
      </div>
    )
  }
  const uverenno = p.tochnost >= 0.5
  return (
    <div className={`proverka${p.sovpalo ? ' ok' : ' bad'}`}>
      <span className="p-head">
        {p.sovpalo ? 'Со скрина: цифры сходятся' : 'Со скрина: цифры расходятся'}
        <span className="pill say">
          {uverenno ? 'уверенно' : 'неуверенно'} · {Math.round(p.tochnost * 100)}%
        </span>
      </span>
      {!uverenno && (
        <p className="fine">Читалось плохо — решайте по картинке, а не по этим цифрам.</p>
      )}
      <dl className="p-rows">
        <div>
          <dt>На скрине</dt>
          <dd>
            {p.followers ? razdelit(p.followers) : '—'} подписчиков ·{' '}
            {p.reach ? razdelit(p.reach) : '—'} охват
            {p.pokazy ? ` · ${razdelit(p.pokazy)} показов` : ''}
          </dd>
        </div>
        <div>
          <dt>В карточке</dt>
          <dd>
            {razdelit(k.followers) || '—'} подписчиков · {razdelit(k.reach) || '—'} охват
          </dd>
        </div>
      </dl>
      {p.zamechaniya.length > 0 && (
        <ul className="p-notes">
          {p.zamechaniya.map((z) => (
            <li key={z}>{z}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function statusPill(s: CardStatus): string {
  if (s === 'published') return 'ok'
  if (s === 'rejected') return 'say'
  return 'neutral'
}
