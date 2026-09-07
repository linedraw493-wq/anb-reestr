import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi, NetDostupa, type Chelovek } from '../lib/api'
import { Shapka } from '../ui/Shapka'

/* ---------------------------------------------------------------------------
   Кто проверяет карточки — слово владельца 07.09.2026: «добавь в админку
   возможность назначать модератора».

   Модератор в реестре может ровно две вещи: одобрить карточку или отказать
   с причиной. Приглашения, резервные коды, списки, сводка и удаление
   остаются админу — сервер это и проверяет, а не только экран.
--------------------------------------------------------------------------- */

function imenem(c: Chelovek): string {
  return c.nik || c.imya || c.telefon || `без имени (#${c.chelovekId})`
}

export default function Moderatory() {
  const navigate = useNavigate()
  const [moderatory, setModeratory] = useState<Chelovek[] | null>(null)
  const [nayden, setNayden] = useState<Chelovek[]>([])
  const [poisk, setPoisk] = useState('')
  const [netPrav, setNetPrav] = useState(false)
  const [zanyat, setZanyat] = useState(false)
  const [beda, setBeda] = useState<string | null>(null)

  const perechitat = useCallback(async (zapros: string) => {
    try {
      const d = await adminApi.lyudi(zapros)
      setModeratory(d.moderatory)
      setNayden(d.nayden)
      setNetPrav(false)
    } catch (oshibka) {
      if (oshibka instanceof NetDostupa) setNetPrav(true)
      else setBeda('Сервер не отвечает. Обновите страницу.')
      setModeratory([])
    }
  }, [])

  // Поиск ходит на сервер, но не на каждую букву: ждём, пока человек
  // допишет. Первый заход сюда же и попадает — с пустым запросом.
  useEffect(() => {
    const t = setTimeout(() => void perechitat(poisk), poisk === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [poisk, perechitat])

  async function pomenyat(c: Chelovek, rol: 'moderator' | 'blogger') {
    setZanyat(true)
    setBeda(null)
    const r = await adminApi.naznachit(c.chelovekId, rol)
    setZanyat(false)
    if (!r.ok) {
      if (r.reason === 'eto-admin') setBeda('Это админ — его роль отсюда не меняют.')
      else if (r.reason === 'sam-sebe') setBeda('Свою роль себе не поменять.')
      else setBeda('Не вышло поменять роль. Попробуйте ещё раз.')
      return
    }
    await perechitat(poisk)
  }

  if (netPrav) {
    return (
      <div className="form-page narrow">
        <Shapka />
        <header className="form-head">
          <h1>Сюда нельзя</h1>
          <p className="sub">Модераторов назначает администратор Ассоциации.</p>
        </header>
        <button className="btn" onClick={() => navigate('/moderator')}>
          К проверке карточек
        </button>
      </div>
    )
  }

  if (moderatory === null) {
    return (
      <div className="form-page">
        <div className="spinner" role="status" aria-label="Загружаем список" />
      </div>
    )
  }

  return (
    <div className="form-page">
      <Shapka />
      <header className="form-head">
        <div className="wordmark">Ассоциация блогеров · права</div>
        <h1>Модераторы</h1>
        <p className="sub">
          Модератор проверяет карточки: одобряет их или отказывает с причиной. Больше он не может
          ничего — ни приглашений, ни кодов, ни списков, ни удаления.
        </p>
      </header>

      {beda && (
        <div className="note err" role="alert">
          <span className="dot" aria-hidden="true">
            !
          </span>
          <span>{beda}</span>
        </div>
      )}

      <ul className="prig-spisok">
        {moderatory.map((c) => (
          <li key={c.chelovekId}>
            <span className="prig-nik">{imenem(c)}</span>
            <span className={`pill ${c.rol === 'admin' ? 'ok' : 'neutral'}`}>
              {c.rol === 'admin' ? 'администратор' : 'модератор'}
            </span>
            {c.telefon && <span className="prig-tel">{c.telefon}</span>}
            <span className="prig-knopki">
              {c.rol === 'moderator' ? (
                <button
                  className="linkbtn"
                  disabled={zanyat}
                  onClick={() => void pomenyat(c, 'blogger')}
                >
                  снять проверку
                </button>
              ) : (
                <span className="fine">заведён настройками</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {moderatory.filter((c) => c.rol === 'moderator').length === 0 && (
        <p className="fine">
          Модераторов пока нет — карточки проверяют администраторы. Найдите человека ниже и дайте
          ему проверку.
        </p>
      )}

      <div className="kat-panel-ryad prig-panel">
        <input
          className="input poisk-pole"
          type="search"
          value={poisk}
          placeholder="Найти по нику, имени или телефону"
          aria-label="Найти человека"
          onChange={(e) => setPoisk(e.target.value)}
        />
      </div>

      {poisk.trim() === '' ? (
        <p className="fine">
          Начните вводить ник или номер — покажем, кого можно назначить. Назначать можно только тех,
          кто уже есть в реестре.
        </p>
      ) : nayden.length === 0 ? (
        <div className="pusto">
          <span className="znak" aria-hidden="true">
            ⌕
          </span>
          <h2>Никого не нашли</h2>
          <p className="sub">
            По «{poisk}» никого нет. Проверьте написание — искать можно по нику, имени и телефону.
          </p>
        </div>
      ) : (
        <ul className="prig-spisok">
          {nayden.map((c) => (
            <li key={c.chelovekId}>
              <span className="prig-nik">{imenem(c)}</span>
              {c.telefon && <span className="prig-tel">{c.telefon}</span>}
              <span className="prig-knopki">
                <button
                  className="linkbtn"
                  disabled={zanyat}
                  onClick={() => void pomenyat(c, 'moderator')}
                >
                  сделать модератором
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
