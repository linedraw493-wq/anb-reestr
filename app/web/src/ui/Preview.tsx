import { initsialy, korotko, razdelit, ton, type Karta } from '../lib/card'
import { razobratVse } from '../lib/seti'

/** Карточка ровно в том виде, в каком её увидит рекламодатель в каталоге. */
export function Preview({ k }: { k: Karta }) {
  const mesto = k.gorod
  const podpis = [...k.tematiki, mesto].filter(Boolean).join(' · ')
  const seti = razobratVse(k.ssylki)

  return (
    <article className="preview">
      <div className="pv-top">
        {k.photo ? (
          <img className="ava ava-img" src={k.photo} alt="" />
        ) : (
          <span className="ava ton" style={ton(k.nick) as React.CSSProperties} aria-hidden="true">
            {initsialy(k.nick)}
          </span>
        )}
        <span className="pv-txt">
          <span className="pv-nm">{k.nick || 'Ваш ник'}</span>
          <span className="pv-mt">{podpis || 'Тематика и адрес'}</span>
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
              <span key={s.url} className="ic" title={`${s.name} · ${s.handle}`}>
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
      </div>
    </article>
  )
}
