import { useEffect, useState } from 'react'

/* ---------------------------------------------------------------------------
   Большая размытая надпись на фоне — слово владельца 07.09.2026: «сделай
   надписи на фоне большим, размытым текстом с эффектом рыбьего глаза,
   чтобы красиво было».

   «Рыбий глаз» — это когда середина картинки выпучена, как через дверной
   глазок: буквы в центре крупнее и толще, к краям сжимаются и уползают.
   Одним CSS так не сделать: он умеет двигать и наклонять целиком, но не
   растягивать середину сильнее краёв. Поэтому надпись рисуется на холсте
   (`canvas`) и там же пересобирается точка за точкой, а размытие и цвет
   вешаются уже CSS-ом на готовую картинку.

   Считается один раз при появлении экрана — примерно сотая доля секунды —
   и дальше просто лежит картинкой. Не получилось (старый браузер, запрет
   на холст) — надписи просто нет, экран от этого не ломается.
--------------------------------------------------------------------------- */

/** Ширина и высота холста. Больше не нужно: картинку всё равно размывают. */
const SHIRINA = 1400
const VYSOTA = 420

/** Насколько выпучена середина. 0 — плоско, 0.5 — уже карикатура. */
const SILA = 0.34

function narisovat(slovo: string, cvet: string): string | null {
  try {
    const holst = document.createElement('canvas')
    holst.width = SHIRINA
    holst.height = VYSOTA
    const ctx = holst.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null

    // 1. Пишем слово во всю ширину холста.
    ctx.fillStyle = cvet
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let razmer = Math.round(VYSOTA * 0.86)
    ctx.font = `900 ${razmer}px Inter, system-ui, sans-serif`
    // Длинное слово ужимаем, чтобы оно не вылезло за края до искажения.
    const shirinaSlova = ctx.measureText(slovo).width
    if (shirinaSlova > SHIRINA * 0.92) {
      razmer = Math.floor((razmer * SHIRINA * 0.92) / shirinaSlova)
      ctx.font = `900 ${razmer}px Inter, system-ui, sans-serif`
    }
    ctx.fillText(slovo, SHIRINA / 2, VYSOTA / 2)

    // 2. Пересобираем: для каждой точки готовой картинки берём точку
    //    исходной ближе к центру. Чем ближе к середине — тем сильнее сдвиг,
    //    поэтому середина растягивается, а края сжимаются. Это и есть глазок.
    const bylo = ctx.getImageData(0, 0, SHIRINA, VYSOTA)
    const stalo = ctx.createImageData(SHIRINA, VYSOTA)
    const cx = SHIRINA / 2
    const cy = VYSOTA / 2
    const radius = Math.max(cx, cy)

    for (let y = 0; y < VYSOTA; y++) {
      for (let x = 0; x < SHIRINA; x++) {
        const dx = (x - cx) / radius
        const dy = (y - cy) / radius
        const r = Math.sqrt(dx * dx + dy * dy)
        // k < 1 у центра — берём точку ближе к середине, значит увеличиваем
        const k = 1 - SILA * Math.max(0, 1 - r * r)
        const sx = Math.round(cx + dx * radius * k)
        const sy = Math.round(cy + dy * radius * k)
        const kuda = (y * SHIRINA + x) * 4
        if (sx < 0 || sy < 0 || sx >= SHIRINA || sy >= VYSOTA) continue
        const otkuda = (sy * SHIRINA + sx) * 4
        stalo.data[kuda] = bylo.data[otkuda]
        stalo.data[kuda + 1] = bylo.data[otkuda + 1]
        stalo.data[kuda + 2] = bylo.data[otkuda + 2]
        stalo.data[kuda + 3] = bylo.data[otkuda + 3]
      }
    }
    ctx.putImageData(stalo, 0, 0)
    return holst.toDataURL('image/png')
  } catch {
    // Приватный режим, запрет на холст, старый браузер — живём без надписи.
    return null
  }
}

/**
 * Кладётся первым ребёнком в фиолетовую шапку страницы или в карточку
 * входа. Сама по себе ничего не занимает: лежит слоем позади текста.
 *
 * `cvet` — каким цветом рисовать буквы. На фиолетовом фоне белым, на
 * светлой карточке входа — фиолетовым: белым по белому её бы не было
 * видно вовсе.
 */
export function Nadpis({ slovo, cvet = '#ffffff' }: { slovo: string; cvet?: string }) {
  const [kartinka, setKartinka] = useState<string | null>(null)

  useEffect(() => {
    let zhiv = true
    // Ждём кадр, чтобы шрифт успел подгрузиться: посчитаем раньше — слово
    // нарисуется запасным шрифтом и будет другой ширины.
    const gotovo = () => {
      const url = narisovat(slovo, cvet)
      if (zhiv) setKartinka(url)
    }
    if (document.fonts?.ready) void document.fonts.ready.then(gotovo)
    else gotovo()
    return () => {
      zhiv = false
    }
  }, [slovo, cvet])

  if (!kartinka) return null
  return (
    <span
      className="fon-nadpis"
      aria-hidden="true"
      style={{ backgroundImage: `url(${kartinka})` }}
    />
  )
}
