import { parsePhoneNumberFromString } from 'libphonenumber-js'

/* Казахстан. Проверяем, что номер настоящий мобильный, и сами расставляем
   пробелы, пока человек печатает. */

/**
 * Из того, что стоит в поле, — только собственные цифры номера, без кода
 * страны. Десять цифр: 705 281 93 42.
 *
 * Почему так, а не «дописать семёрку»:
 *
 * Поле само себя перечитывает. Мы показываем «+7 705», человек нажимает ещё
 * цифру — и нам приходит уже вся строка вместе с нашей же семёркой. Если
 * дописывать её каждый раз, она копится: получалось «+7 77777052819342»
 * (снимок владельца 02.09.2026). Поэтому код страны сначала снимается, а
 * приписывается только при показе — и разбор не зависит от того, сколько раз
 * его прогнали.
 *
 * Казахстанские номера сами начинаются с семёрки (705, 747, 771…), поэтому
 * «первая цифра — это код страны» верно не всегда; смотрим на вид записи.
 */
function svoiCifry(syroe: string): string {
  const stroka = syroe.trim()
  let d = stroka.replace(/\D/g, '')

  if (stroka.startsWith('+')) {
    d = d.slice(1) // «+7 705…» — семёрка это код страны
  } else if (d.startsWith('8')) {
    d = d.slice(1) // «8 705…» — старая привычка
  } else if (d.length === 11 && d.startsWith('7')) {
    d = d.slice(1) // вставили «77052819342» целиком
  }

  return d.slice(0, 10) // больше десяти цифр в номере не бывает
}

/**
 * Показать номер так, как его пишут здесь: +7 705 281 93 42.
 *
 * Раскладываем сами, а не готовой библиотекой: она для Казахстана делит
 * хвост иначе (705 281 9342), и поле расходилось с подсказкой в нём же и с
 * тем, как номер показан в остальных местах.
 */
export function formatAsTyped(syroe: string): string {
  const d = svoiCifry(syroe)
  if (d === '') return ''
  const chasti = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)]
  return ('+7 ' + chasti.filter(Boolean).join(' ')).trimEnd()
}

/** Даёт номер в виде +77051234567, либо null, если номер не настоящий. */
export function toE164(syroe: string): string | null {
  const svoi = svoiCifry(syroe)
  if (svoi.length !== 10) return null
  const razobran = parsePhoneNumberFromString('+7' + svoi, 'KZ')
  if (!razobran || !razobran.isValid() || razobran.country !== 'KZ') return null
  return razobran.number
}

export function mask(e164: string): string {
  const d = e164.replace(/\D/g, '')
  if (d.length < 11) return e164
  return `+${d[0]} ${d.slice(1, 4)} ••• •• ${d.slice(9, 11)}`
}
