import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { initsialy, korotko, razdelit, ton, type Karta } from '../lib/card'
import { vzyatOdnogo } from '../lib/katalog'
import { razobratVse } from '../lib/seti'
import { Shapka } from '../ui/Shapka'

/** Страница одного блогера в каталоге. Телефон здесь не показывается никогда. */
/** «2026-09-07» → «7 сентября». Год пишем только у прошлогодних цифр. */
function denPropisyu(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  const tekushchiy = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(tekushchiy ? {} : { year: 'numeric' }),
  })
}

export default function Blogger() {
  const { id = '' } = useParams()
  const [karta, setKarta] = useState<Karta | null>(null)
  const [prosmotry, setProsmotry] = useState(0)
  const [netu, setNetu] = useState(false)

  useEffect(() => {
    let zhiv = true
    vzyatOdnogo(id).then((r) => {
      if (!zhiv) return
      if (r.ok && r.karta) {
        setKarta(r.karta)
        setProsmotry(r.prosmotry ?? 0)
      } else {
        setNetu(true)
      }
    })
    return () => {
      zhiv = false
    }
  }, [id])

  if (netu) {
    return (
      <div className="form-page narrow">
        <Shapka />
        <header className="form-head">
          <h1>Карточки нет</h1>
          <p className="sub">Она снята с публикации или её никогда не было. Поищите в каталоге.</p>
        </header>
        <Link className="btn" to="/katalog">
          В каталог
        </Link>
      </div>
    )
  }

  if (!karta) {
    return (
      <div className="form-page">
        <div className="spinner" role="status" aria-label="Загружаем карточку" />
      </div>
    )
  }

  const mesto = [karta.gorod, karta.rayon].filter(Boolean).join(', ')
  const seti = razobratVse(karta.ssylki)

  return (
    <div className="form-page narrow">
      <Shapka />
      <Link className="linkbtn nazad" to="/katalog">
        ← В каталог
      </Link>

      <div className="blg">
        <div className="blg-verh">
          {karta.photo ? (
            <img className="ava ava-img ogromnaya" src={karta.photo} alt="" />
          ) : (
            <span
              className="ava ogromnaya ton"
              style={ton(karta.nick) as React.CSSProperties}
              aria-hidden="true"
            >
              {initsialy(karta.nick)}
            </span>
          )}
          <div>
            <h1>{karta.nick}</h1>
            <p className="sub">{[...karta.tematiki, mesto].filter(Boolean).join(' · ')}</p>
          </div>
        </div>

        <div className="blg-cifry">
          <div className="num">
            <span className="v">{korotko(karta.followers)}</span>
            <span className="k">подписчиков</span>
          </div>
          <div className="num">
            <span className="v">{korotko(karta.reach)}</span>
            <span className="k">охват поста</span>
          </div>
          <div className="num">
            <span className="v">
              {karta.dogovornaya ? '—' : karta.stavka ? razdelit(karta.stavka) : '—'}
            </span>
            <span className="k">{karta.dogovornaya ? 'договорная' : '₸ за пост'}</span>
          </div>
          <div className="num">
            <span className="v">{cenaZaTysyachu(karta)}</span>
            <span className="k">₸ за 1000 охвата</span>
          </div>
        </div>

        <div className={`proverka${karta.istochnik === 'screen' ? ' ok' : ''}`}>
          <span className="p-head">
            {karta.istochnik === 'screen'
              ? 'Цифры взяты со скрина статистики'
              : 'Цифры указаны блогером со слов'}
            {/* Спека, день 4: пометка источника **и дата**. Цифра без даты
                не говорит рекламодателю, вчерашняя она или прошлогодняя. */}
            {karta.cifryOt && <span className="pill neutral">от {denPropisyu(karta.cifryOt)}</span>}
          </span>
          <p className="fine">
            {/* Три разных случая, а не два: скрин может быть загружен, но
                цифры с ним ещё не сверены. Раньше таким карточкам писали
                «скрин не загружался» — неправда, и рекламодатель по ней
                делал неверный вывод. */}
            {karta.istochnik === 'screen'
              ? 'Блогер загрузил скрин из соцсети, модератор Ассоциации его видел.'
              : karta.screenshot
                ? 'Скрин загружен, но цифры с ним пока не сверены. Спросите статистику при переговорах.'
                : 'Скрин не загружался — цифры не подтверждены. Спросите статистику при переговорах.'}
          </p>
        </div>

        <section className="block">
          <h2>Где смотреть и как написать</h2>
          {seti.length === 0 ? (
            <p className="fine">Ссылки не указаны.</p>
          ) : (
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
                  <a
                    className="linkbtn"
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    Открыть
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="fine">
            Телефон блогера реестр не публикует. Пишите в соцсети по ссылкам выше.
          </p>
        </section>

        <p className="fine center">
          Язык контента: {karta.yazyk?.toLowerCase() || 'не указан'} · карточку смотрели {prosmotry}{' '}
          раз
        </p>
      </div>
    </div>
  )
}

/** Понятная рекламодателю мерка: во сколько обходится тысяча охвата. */
function cenaZaTysyachu(k: Karta): string {
  const ohvat = Number(k.reach.replace(/\D/g, ''))
  const stavka = Number(k.stavka.replace(/\D/g, ''))
  if (!ohvat || !stavka || k.dogovornaya) return '—'
  return razdelit(String(Math.round((stavka / ohvat) * 1000)))
}
