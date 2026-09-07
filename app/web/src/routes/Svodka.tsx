import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Nadpis } from '../ui/Nadpis'
import { Shapka } from '../ui/Shapka'

/* ---------------------------------------------------------------------------
   Дашборд заказчика. Не «красивые графики», а ответ на один вопрос:
   идёт наполнение или встало — и если встало, то на каком шаге.

   Воронка нужна именно поэтому. Без неё видно только «мало карточек», а
   что чинить — непонятно: то ли рассылка плохая, то ли коды не доходят,
   то ли форма пугает.
--------------------------------------------------------------------------- */

type Shag = { chto: string; skolko: number; dolya: number }

type Dannye = {
  v_kataloge: number
  zhdut: number
  zhdut_dolgo: number
  otkloneno: number
  vsego_ssylok: number
  otkryli: number
  za_nedelyu: number
  prosmotry: number
  voronka: Shag[]
  /** чем сейчас уходят коды входа: настоящей SMS или в чат владельца */
  kanalKodov?: 'sms' | 'telegram'
  /** остаток денег у оператора SMS, тенге. null — не спросили или не SMS */
  smsOstatok?: number | null
  /** сколько блогеров на Beeline — им код по SMS сейчас не доходит */
  beelineSkolko?: number
}

export default function Svodka() {
  const navigate = useNavigate()
  const [d, setD] = useState<Dannye | null>(null)
  const [netPrav, setNetPrav] = useState(false)

  useEffect(() => {
    let zhiv = true
    fetch('/api/moder/svodka', { credentials: 'same-origin' })
      .then(async (r) => {
        if (!zhiv) return
        if (r.status === 403) {
          setNetPrav(true)
          return
        }
        setD((await r.json()) as Dannye)
      })
      .catch(() => {
        /* сводка не критична — экран просто не покажет цифр */
      })
    return () => {
      zhiv = false
    }
  }, [])

  if (netPrav) {
    return (
      <div className="form-page narrow">
        <Shapka />
        <header className="form-head">
          <Nadpis slovo="СВОДКА" />
          <h1>Сюда нельзя</h1>
          <p className="sub">Сводка — для администратора Ассоциации.</p>
        </header>
        <button className="btn" onClick={() => navigate('/vhod?kuda=/admin')}>
          Войти
        </button>
      </div>
    )
  }

  if (!d) {
    return (
      <div className="form-page">
        <div className="spinner" role="status" aria-label="Считаем сводку" />
      </div>
    )
  }

  // Меньше двадцати сообщений — это уже завтра. Считаем по дорогому тарифу.
  const malo = typeof d.smsOstatok === 'number' && d.smsOstatok < 20 * 20

  return (
    <div className="form-page">
      <Shapka />
      <header className="form-head">
        <Nadpis slovo="СВОДКА" />
        <div className="wordmark">Ассоциация блогеров · сводка</div>
        <h1>Как идёт наполнение</h1>
        <p className="sub">
          Воронка показывает, на каком шаге теряются люди. Проседает «открыли» — плохая рассылка.
          «Подтвердили» — не доходят коды. «Заполнили» — форма пугает.
        </p>
      </header>

      <div className="plitki4">
        <Plitka v={d.v_kataloge} k="в каталоге" d={`+${d.za_nedelyu} за неделю`} />
        <Plitka
          v={d.zhdut}
          k="ждут проверки"
          d={d.zhdut_dolgo > 0 ? `${d.zhdut_dolgo} больше суток` : 'все свежие'}
          trevoga={d.zhdut_dolgo > 0}
        />
        <Plitka v={d.otkryli} k="открыли ссылку" d={`из ${d.vsego_ssylok}`} />
        <Plitka v={d.prosmotry} k="просмотров карточек" d="всего" />
      </div>

      {/* Коды входа — самое хрупкое место всей цепочки: кончились деньги
          у оператора, и регистрация встаёт молча. Пусть это будет видно
          раньше, чем блогеры начнут жаловаться. */}
      <section
        className={`block kanal-blok${d.kanalKodov === 'telegram' || malo ? ' trevoga' : ''}`}
      >
        <h2>Коды входа</h2>
        {d.kanalKodov === 'sms' ? (
          <p className="sub">
            Уходят настоящей SMS на номер блогера.
            {typeof d.smsOstatok === 'number' && (
              <>
                {' '}
                На счету у оператора <b>{Math.round(d.smsOstatok)} ₸</b> — это примерно{' '}
                <b>{Math.floor(d.smsOstatok / 17)} сообщений</b>.
                {malo
                  ? ' Это мало: пополните счёт, иначе коды перестанут приходить, а снаружи это выглядит как поломка сайта.'
                  : ' Кончатся — коды перестанут приходить.'}
              </>
            )}{' '}
            На номера Beeline код пока не доходит
            {typeof d.beelineSkolko === 'number' && d.beelineSkolko > 0 && (
              <>
                {' '}
                — это <b>{d.beelineSkolko}</b> из ваших блогеров
              </>
            )}
            . Им выдавайте резервный код на экране «Приглашения», они там отмечены.
          </p>
        ) : (
          <p className="sub">
            Сейчас коды падают в один телеграм-чат, а не блогеру на телефон. Это временно: пока так,
            звать блогеров нельзя — чужой код придёт не тому.
          </p>
        )}
      </section>

      <section className="block voronka-blok">
        <h2>Воронка</h2>
        <div className="voronka">
          {d.voronka.map((s, i) => (
            <div className="vor-str" key={s.chto}>
              <span className="vor-imya">{s.chto}</span>
              <span className="vor-pol">
                <i className={i > 2 ? 'p2' : ''} style={{ width: `${Math.max(s.dolya, 1)}%` }} />
              </span>
              <span className="vor-n">
                {s.skolko} · {s.dolya}%
              </span>
            </div>
          ))}
        </div>
        {d.otkloneno > 0 && (
          <p className="fine">
            Отклонено карточек: {d.otkloneno}. Люди могут поправить и подать снова.
          </p>
        )}
      </section>

      <div className="svodka-knopki">
        <button className="btn small" onClick={() => navigate('/admin')}>
          К проверке карточек
        </button>
        <button className="btn small ghost" onClick={() => navigate('/admin/priglasheniya')}>
          Приглашения
        </button>
      </div>
    </div>
  )
}

function Plitka({ v, k, d, trevoga }: { v: number; k: string; d: string; trevoga?: boolean }) {
  return (
    <div className="kp">
      <div className="v">{v}</div>
      <div className="k">{k}</div>
      <div className={`d${trevoga ? ' trevoga' : ''}`}>{d}</div>
    </div>
  )
}
