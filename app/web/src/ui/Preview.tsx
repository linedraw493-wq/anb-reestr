import { korotko, razdelit, type Karta } from '../lib/card'
import { SETI } from '../lib/spravochniki'

/** Карточка ровно в том виде, в каком её увидит рекламодатель в каталоге. */
export function Preview({ k }: { k: Karta }) {
  const mesto = [k.gorod, k.rayon].filter(Boolean).join(', ')
  const podpis = [...k.tematiki, mesto].filter(Boolean).join(' · ')
  const seti = SETI.filter((s) => (k.seti[s.key] ?? '').trim() !== '')

  return (
    <article className="preview">
      <div className="pv-top">
        {k.photo ? (
          <img className="ava ava-img" src={k.photo} alt="" />
        ) : (
          <span className="ava" aria-hidden="true">
            {initials(k.nick)}
          </span>
        )}
        <span className="pv-txt">
          <span className="pv-nm">{k.nick || 'Ваш ник'}</span>
          <span className="pv-mt">{podpis || 'Тематика и город'}</span>
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
          {seti.length > 0 ? (
            seti.map((s) => (
              <span key={s.key} className="ic" title={s.name}>
                {s.short}
              </span>
            ))
          ) : (
            <span className="ic empty" aria-hidden="true">
              +
            </span>
          )}
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
        {k.showPhone && k.phoneMasked && ` · ${k.phoneMasked}`}
      </div>
    </article>
  )
}

function initials(nick: string): string {
  const clean = nick.replace(/^@/, '')
  if (!clean) return '—'
  const parts = clean.split(/[._-]/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
}
