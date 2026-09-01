import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { korotko, razdelit, type Karta } from '../lib/card'
import { razobratVse } from '../lib/seti'
import { Shapka } from '../ui/Shapka'

/* ---------------------------------------------------------------------------
   Витрина. Сюда попадает и рекламодатель, и блогер — у них разные дела,
   поэтому две двери с самого верха, а не одна кнопка «войти».
--------------------------------------------------------------------------- */

type Svodka = {
  vsego: number
  gorodov: number
  ohvat: number
  tematiki: { nazvanie: string; skolko: number }[]
  goroda: { nazvanie: string; skolko: number }[]
  vitrina: Karta[]
}

export default function Glavnaya() {
  const [s, setS] = useState<Svodka | null>(null)

  useEffect(() => {
    let zhiv = true
    fetch('/api/glavnaya')
      .then((r) => r.json())
      .then((d: Svodka) => zhiv && setS(d))
      .catch(() => {
        /* витрина без цифр всё равно работает */
      })
    return () => {
      zhiv = false
    }
  }, [])

  return (
    <div className="glav">
      <div className="glav-vnutri">
        <Shapka />

        {/* ------------------------------------------------------- обложка */}
        <section className="geroy">
          <div className="geroy-txt">
            <div className="wordmark">Ассоциация блогеров Казахстана</div>
            <h1 className="geroy-h">
              Реестр, по которому находят <em>блогеров</em>
            </h1>
            <p className="geroy-p">
              Один каталог вместо переписок и слухов. Рекламодатель отбирает по тематике,
              городу, охвату и цене — и пишет напрямую. Блогер заполняет карточку один раз.
            </p>
            <div className="geroy-knopki">
              <Link className="btn shirokaya" to="/katalog">
                Найти блогера
              </Link>
              <Link className="btn ghost shirokaya" to="/vhod">
                Я блогер — войти
              </Link>
            </div>
            <p className="fine">
              Регистрация блогеров — по личной ссылке от Ассоциации. Каталог открыт всем.
            </p>
          </div>

          {s && s.vitrina.length > 0 && (
            <div className="geroy-vitrina" aria-hidden="true">
              {s.vitrina.map((k, i) => (
                <MiniKarta key={k.id} k={k} smeshchenie={i} />
              ))}
            </div>
          )}
        </section>

        {/* --------------------------------------------------------- цифры */}
        <section className="cifry">
          <div className="cifra">
            <span className="v">{s ? s.vsego : '—'}</span>
            <span className="k">блогеров в каталоге</span>
          </div>
          <div className="cifra">
            <span className="v">{s ? s.gorodov : '—'}</span>
            <span className="k">городов Казахстана</span>
          </div>
          <div className="cifra">
            <span className="v">{s ? korotko(String(s.ohvat)) : '—'}</span>
            <span className="k">общий охват за пост</span>
          </div>
        </section>

        {/* ----------------------------------------------------- как это идёт */}
        <section className="kak-blok">
          <div className="kak-stolb">
            <span className="kak-kto">Рекламодателю</span>
            <ol className="kak-shagi">
              <li>
                <b>Отберите</b> по тематике, городу, охвату и цене — фильтры прямо в каталоге.
              </li>
              <li>
                <b>Сравните</b> цифры. У кого статистика подтверждена скрином — видно значком.
              </li>
              <li>
                <b>Напишите</b> в соцсети по ссылкам с карточки. Посредник не нужен.
              </li>
            </ol>
            <Link className="linkbtn" to="/katalog">
              Открыть каталог →
            </Link>
          </div>

          <div className="kak-stolb">
            <span className="kak-kto">Блогеру</span>
            <ol className="kak-shagi">
              <li>
                <b>Откройте ссылку</b> от Ассоциации и подтвердите телефон кодом.
              </li>
              <li>
                <b>Заполните карточку</b>: соцсети, тематика, город, охват, ставка. Один раз.
              </li>
              <li>
                <b>Ждите заявок.</b> После проверки модератором карточка попадает в каталог.
              </li>
            </ol>
            <Link className="linkbtn" to="/vhod">
              Войти по номеру →
            </Link>
          </div>
        </section>

        {/* ------------------------------------------------------- тематики */}
        {s && s.tematiki.length > 0 && (
          <section className="podborki">
            <h2 className="razdel-h">По тематике</h2>
            <div className="plitki">
              {s.tematiki.map((t) => (
                <Link
                  key={t.nazvanie}
                  className="plitka"
                  to={`/katalog?tematika=${encodeURIComponent(t.nazvanie)}`}
                >
                  <span className="pl-nm">{t.nazvanie}</span>
                  <span className="pl-n">{t.skolko}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* --------------------------------------------------------- города */}
        {s && s.goroda.length > 0 && (
          <section className="podborki">
            <h2 className="razdel-h">По городам</h2>
            <div className="plitki">
              {s.goroda.map((g) => (
                <Link
                  key={g.nazvanie}
                  className="plitka gorod"
                  to={`/katalog?gorod=${encodeURIComponent(g.nazvanie)}`}
                >
                  <span className="pl-nm">{g.nazvanie}</span>
                  <span className="pl-n">{g.skolko}</span>
                </Link>
              ))}
            </div>
            <Link className="linkbtn" to="/katalog">
              Посмотреть на карте →
            </Link>
          </section>
        )}

        {/* --------------------------------------------------------- подвал */}
        <footer className="podval">
          <div>
            <div className="wordmark">Ассоциация блогеров</div>
            <p className="fine">
              Реестр блогеров Казахстана. Телефоны участников не публикуются — связь только
              через соцсети, указанные самим блогером.
            </p>
          </div>
          <nav className="podval-ssylki">
            <Link to="/katalog">Каталог</Link>
            <Link to="/vhod">Вход для блогеров</Link>
          </nav>
        </footer>
      </div>
    </div>
  )
}

/** Карточка-обманка на обложке: показать, как выглядит выдача. */
function MiniKarta({ k, smeshchenie }: { k: Karta; smeshchenie: number }) {
  const seti = razobratVse(k.ssylki)
  return (
    <div className="mini" style={{ '--sdvig': smeshchenie } as React.CSSProperties}>
      <div className="mini-top">
        <span className="ava" aria-hidden="true">
          {(k.nick.replace(/^@/, '')[0] ?? '?').toUpperCase()}
        </span>
        <span className="pv-txt">
          <span className="pv-nm">{k.nick}</span>
          <span className="pv-mt">
            {[k.tematiki[0], k.gorod].filter(Boolean).join(' · ')}
          </span>
        </span>
      </div>
      <div className="mini-nums">
        <span>
          <b>{korotko(k.followers)}</b> подписчиков
        </span>
        <span>
          <b>{korotko(k.reach)}</b> охват
        </span>
      </div>
      <div className="mini-niz">
        <span className="pv-icons">
          {seti.slice(0, 3).map((x) => (
            <span key={x.url} className="ic">
              {x.short}
            </span>
          ))}
        </span>
        <span className="fine">
          {k.dogovornaya ? 'договорная' : k.stavka ? `${razdelit(k.stavka)} ₸` : '—'}
        </span>
      </div>
    </div>
  )
}
