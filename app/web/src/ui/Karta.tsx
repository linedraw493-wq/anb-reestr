import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Tochka } from '../lib/katalog'

/**
 * Карта Казахстана с точками по городам.
 *
 * Точка ставится на город, а не на дом: домашних адресов мы не собираем и
 * показывать не будем. Размер кружка — сколько блогеров в городе.
 *
 * Карта от OpenStreetMap: бесплатно и без ключа. У Яндекса теперь нужен ключ
 * и аккаунт, а выглядит так же.
 */
export function Karta({
  tochki,
  vybran,
  naGorod,
}: {
  tochki: Tochka[]
  vybran: string
  naGorod: (gorod: string) => void
}) {
  const korobka = useRef<HTMLDivElement>(null)
  const karta = useRef<L.Map | null>(null)
  const sloy = useRef<L.LayerGroup | null>(null)

  // Карта создаётся один раз: пересоздавать её на каждый фильтр — дёргано.
  useEffect(() => {
    if (!korobka.current || karta.current) return
    const m = L.map(korobka.current, { scrollWheelZoom: false, attributionControl: true })
    m.setView([48.0, 67.0], 4) // весь Казахстан целиком
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 12,
    }).addTo(m)
    sloy.current = L.layerGroup().addTo(m)
    karta.current = m
    return () => {
      m.remove()
      karta.current = null
      sloy.current = null
    }
  }, [])

  // Точки перерисовываем при каждой смене выборки.
  useEffect(() => {
    const gruppa = sloy.current
    if (!gruppa) return
    gruppa.clearLayers()

    // Цвет кружков берём из тех же переменных, что и весь сайт: иначе после
    // смены оформления карта осталась бы прежнего цвета одна на весь сайт.
    const stili = getComputedStyle(document.documentElement)
    const akcent = stili.getPropertyValue('--accent').trim() || '#4a4de8'
    const akcentTemnee = stili.getPropertyValue('--accent-ink').trim() || '#3739c4'

    const maks = Math.max(1, ...tochki.map((t) => t.skolko))
    for (const t of tochki) {
      const dolya = t.skolko / maks
      const krug = L.circleMarker([t.shirota, t.dolgota], {
        radius: 7 + dolya * 16,
        weight: vybran === t.gorod ? 3 : 1.5,
        color: vybran === t.gorod ? akcentTemnee : akcent,
        fillColor: akcent,
        fillOpacity: vybran === t.gorod ? 0.75 : 0.4,
      })
      krug.bindTooltip(`${t.gorod} · ${t.skolko}`, { direction: 'top' })
      krug.on('click', () => naGorod(vybran === t.gorod ? '' : t.gorod))
      krug.addTo(gruppa)
    }
  }, [tochki, vybran, naGorod])

  return (
    <div className="karta-korobka">
      <div ref={korobka} className="karta" role="application" aria-label="Карта Казахстана" />
      <p className="fine karta-podpis">
        {tochki.length === 0
          ? 'Пока никто из отобранных не указал город — на карте пусто. Город появляется, когда блогер заполняет свою карточку.'
          : 'Кружок — город, размер по числу блогеров. Нажмите, чтобы отобрать только его. Домашних адресов мы не храним.'}
      </p>
    </div>
  )
}
