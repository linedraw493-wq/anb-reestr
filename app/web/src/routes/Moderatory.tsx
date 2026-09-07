import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi, NetDostupa, type Chelovek, type Rol } from '../lib/api'
import { Shapka } from '../ui/Shapka'

/* ---------------------------------------------------------------------------
   Кто в админке — слово владельца 07.09.2026: «сделай возможность назначать
   админа в панели админки».

   Ролей две: блогер и админ. Отдельная узкая роль модератора прожила день и
   убрана тем же владельцем — «пускай чисто будет админ, с функционалом и
   модера, и админ с его фишками». Права проверяет сервер, экран лишь не
   показывает лишнего.
--------------------------------------------------------------------------- */

const NAZVANIE: Record<Rol, string> = {
  admin: 'администратор',
  blogger: 'блогер',
}

const POCHEMU_NELZYA: Record<string, string> = {
  'admin-iz-nastroek':
    'Этот админ заведён настройками сервера — нажатием его не снять: сервер вернёт ему права при первом же запуске.',
  'poslednii-admin':
    'Это последний администратор. Сначала назначьте другого — иначе в админку будет не войти.',
  'sam-sebe': 'Свою роль себе не поменять. Пусть это сделает другой администратор.',
  'no-person': 'Такого человека уже нет в реестре. Обновите страницу.',
}

function imenem(c: Chelovek): string {
  return c.nik || c.imya || c.telefon || `без имени (#${c.chelovekId})`
}

export default function Moderatory() {
  const navigate = useNavigate()
  const [pravaU, setPravaU] = useState<Chelovek[] | null>(null)
  const [nayden, setNayden] = useState<Chelovek[]>([])
  const [poisk, setPoisk] = useState('')
  const [netPrav, setNetPrav] = useState(false)
  const [zanyat, setZanyat] = useState(false)
  const [beda, setBeda] = useState<string | null>(null)

  const perechitat = useCallback(async (zapros: string) => {
    try {
      const d = await adminApi.lyudi(zapros)
      setPravaU(d.moderatory)
      setNayden(d.nayden)
      setNetPrav(false)
    } catch (oshibka) {
      if (oshibka instanceof NetDostupa) setNetPrav(true)
      else setBeda('Сервер не отвечает. Обновите страницу.')
      setPravaU([])
    }
  }, [])

  // Поиск ходит на сервер, но не на каждую букву: ждём, пока человек
  // допишет. Первый заход сюда же и попадает — с пустым запросом.
  useEffect(() => {
    const t = setTimeout(() => void perechitat(poisk), poisk === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [poisk, perechitat])

  async function pomenyat(c: Chelovek, rol: Rol) {
    if (rol === 'blogger' && c.rol === 'admin') {
      if (!confirm(`Снять права администратора с ${imenem(c)}? Он останется обычным блогером.`))
        return
    }
    setZanyat(true)
    setBeda(null)
    const r = await adminApi.naznachit(c.chelovekId, rol)
    setZanyat(false)
    if (!r.ok) {
      setBeda(POCHEMU_NELZYA[r.reason ?? ''] ?? 'Не вышло поменять роль. Попробуйте ещё раз.')
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
          <p className="sub">Права раздаёт администратор Ассоциации.</p>
        </header>
        <button className="btn" onClick={() => navigate('/admin')}>
          К проверке карточек
        </button>
      </div>
    )
  }

  if (pravaU === null) {
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
        <h1>Права</h1>
        <p className="sub">
          Администратор может всё, что есть в админке: проверять карточки, выдавать приглашения и
          резервные коды, править списки, смотреть сводку и раздавать права. Все остальные —
          блогеры, им сюда не нужно.
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
        {pravaU.map((c) => (
          <li key={c.chelovekId}>
            <span className="prig-nik">{imenem(c)}</span>
            <span className={`pill ${c.rol === 'admin' ? 'rol-admin' : 'neutral'}`}>
              {NAZVANIE[c.rol]}
            </span>
            {c.etoYa && <span className="pill say">это вы</span>}
            {c.telefon && <span className="prig-tel">{c.telefon}</span>}
            <span className="prig-knopki">
              {c.etoYa ? (
                <span className="fine">свою роль себе не меняют</span>
              ) : c.rol === 'admin' && c.izNastroek ? (
                <span className="fine">заведён настройками сервера</span>
              ) : c.rol === 'admin' ? (
                <button
                  className="linkbtn"
                  disabled={zanyat}
                  onClick={() => void pomenyat(c, 'blogger')}
                >
                  снять админа
                </button>
              ) : (
                <button
                  className="linkbtn"
                  disabled={zanyat}
                  onClick={() => void pomenyat(c, 'admin')}
                >
                  сделать админом
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

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
          Начните вводить ник, имя или номер — покажем, кого можно сделать админом. Позвать можно
          только того, кто уже есть в реестре: админ входит своим номером, как все.
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
                  onClick={() => void pomenyat(c, 'admin')}
                >
                  сделать админом
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
