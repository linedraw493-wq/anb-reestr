import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { moderApi, NetDostupa } from '../lib/api'
import {
  razdelit,
  STATUS_NAZVANIE,
  type CardStatus,
  type Karta,
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

/** Инструмент модератора: заявки, проверка, правка, удаление, добавление. */
export default function Moderator() {
  const navigate = useNavigate()
  const spr = useSpravochniki()
  const [vse, setVse] = useState<Zayavka[] | null>(null)
  const [vkladka, setVkladka] = useState<CardStatus>('moderation')
  const [vybran, setVybran] = useState<string | null>(null)
  const [pravka, setPravka] = useState<Karta | null>(null)
  const [otkaz, setOtkaz] = useState('')
  const [zanyat, setZanyat] = useState(false)
  const [beda, setBeda] = useState<'net-prav' | 'net-svyazi' | null>(null)

  async function perechitat(ostavit?: string | null) {
    let list: Zayavka[]
    try {
      list = await moderApi.list()
    } catch (oshibka) {
      setBeda(oshibka instanceof NetDostupa ? 'net-prav' : 'net-svyazi')
      setVse([])
      return
    }
    setBeda(null)
    setVse(list)
    const id = ostavit !== undefined ? ostavit : vybran
    const nashli = list.find((z) => z.karta.id === id)
    setVybran(nashli ? nashli.karta.id : null)
    setPravka(nashli ? { ...nashli.karta } : null)
  }

  useEffect(() => {
    void perechitat(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const spisok = useMemo(
    () => (vse ?? []).filter((z) => z.status === vkladka),
    [vse, vkladka],
  )
  const scheta = useMemo(() => {
    const c: Partial<Record<CardStatus, number>> = {}
    for (const z of vse ?? []) c[z.status] = (c[z.status] ?? 0) + 1
    return c
  }, [vse])

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
          Карточка попадает в каталог только после вашего одобрения. Сверяйте цифры со
          скрином статистики — чтение скрина ИИ ещё не включено.
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
            <p className="fine empty-note">Здесь пусто.</p>
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
                      <span className="ava" aria-hidden="true">
                        {initials(z.karta.nick)}
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
        </div>

        {/* ------------------------------------------------------- карточка */}
        <div className="moder-detail">
          {!tekushchaya || !pravka ? (
            <p className="fine empty-note">Выберите заявку слева.</p>
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

                <div className="two">
                  <label className="fld">
                    <span className="field-label">Город</span>
                    <select
                      className="input"
                      value={pravka.gorod}
                      onChange={(e) =>
                        setPravka({ ...pravka, gorod: e.target.value, rayon: '' })
                      }
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
                  <input
                    className="input"
                    value={otkaz}
                    placeholder="Цифры не сходятся со скрином"
                    onChange={(e) => setOtkaz(e.target.value)}
                  />
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
          Заглушка: сервера нет, заявки живут до обновления страницы. ИИ-проверка тоже
          поддельная.
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
        <span className="p-head">
          Скрин ещё не проверяется
          <span className="pill soon">скоро</span>
        </span>
        <p className="fine">
          Здесь будет отчёт ИИ: что он прочитал со скрина и сходится ли это с тем, что
          указал блогер. Пока сверяйте картинку глазами.
        </p>
      </div>
    )
  }
  return (
    <div className={`proverka${p.sovpalo ? ' ok' : ' bad'}`}>
      <span className="p-head">
        {p.sovpalo ? 'ИИ: цифры сходятся' : 'ИИ: цифры расходятся'}
        <span className="pill say">точность {Math.round(p.tochnost * 100)}%</span>
        <span className="pill soon">пример</span>
      </span>
      <p className="fine">
        Так это будет выглядеть, когда ИИ-проверку включат. Сейчас данные показаны для
        примера.
      </p>
      <dl className="p-rows">
        <div>
          <dt>На скрине</dt>
          <dd>
            {p.followers ? razdelit(p.followers) : '—'} подписчиков ·{' '}
            {p.reach ? razdelit(p.reach) : '—'} охват
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

function initials(nick: string): string {
  const clean = nick.replace(/^@/, '')
  if (!clean) return '—'
  const parts = clean.split(/[._-]/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
}
