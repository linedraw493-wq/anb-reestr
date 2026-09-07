import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js'

/* ---------------------------------------------------------------------------
   Номер телефона: как его набирают и как проверяют.

   Слово владельца 07.09.2026: «сделай корректную валидацию при вводе номера
   телефона (чтобы нажатие 7-ки было нормой), возможность делать номера
   других стран создай».

   Отсюда два правила:

   1. **Начал не с плюса — считаем казахстанским.** Человек набирает «747…»,
      «8 747…» или «+7 747…» — во всех трёх случаях выйдет один номер. Первая
      семёрка больше не съедается: раньше её принимали за код страны, и
      номера вида 747/771 начинались криво.
   2. **Начал с плюса — набирает любую страну.** +44, +971, +996 — раскладку
      и проверку делает libphonenumber, она знает все планы нумерации.

   Раскладываем библиотекой, а не руками: своя раскладка держалась только на
   Казахстане и на других странах врала.
--------------------------------------------------------------------------- */

/** Похоже ли, что человек набирает местный номер (без кода страны). */
function mestnyy(syroe: string): boolean {
  return !syroe.trim().startsWith('+')
}

/**
 * Местный набор → международный вид. «747…» и «8 747…» → «+7 747…».
 *
 * Тут же лечится старая беда: поле показывает «+7 705», человек жмёт ещё
 * цифру, и нам приходит вся строка вместе с нашим же плюсом. Пока строка
 * начинается с плюса, эта ветка не работает вовсе — и семёрка не копится.
 */
function kazahstanskiy(syroe: string): string {
  let d = syroe.replace(/\D/g, '')
  if (d.startsWith('8')) d = '7' + d.slice(1)
  else if (!d.startsWith('7')) d = '7' + d
  return '+' + d.slice(0, 11)
}

/** Показать номер так, как его пишут: +7 747 123 45 67, +44 20 7183 8750.
 *
 * Казахстанский раскладываем сами — по привычке здешних мест, 3-3-2-2.
 * Библиотека делит хвост иначе (747 123 4567), и поле расходилось бы с тем,
 * как номер показан в остальных местах сайта. Все прочие страны — ей: своих
 * правил на весь мир у нас нет.
 */
export function formatAsTyped(syroe: string): string {
  if (syroe.trim() === '') return ''
  const mezhdunarodnyy = mestnyy(syroe) ? kazahstanskiy(syroe) : syroe.trim()
  const d = mezhdunarodnyy.replace(/\D/g, '')
  if (mezhdunarodnyy.startsWith('+7') && d.length <= 11) {
    const svoi = d.slice(1)
    const chasti = [svoi.slice(0, 3), svoi.slice(3, 6), svoi.slice(6, 8), svoi.slice(8, 10)]
    return ('+7 ' + chasti.filter(Boolean).join(' ')).trimEnd()
  }
  return new AsYouType().input(mezhdunarodnyy)
}

/** Номер в виде +77051234567, либо null, если такого номера не бывает. */
export function toE164(syroe: string): string | null {
  if (syroe.trim() === '') return null
  const mezhdunarodnyy = mestnyy(syroe) ? kazahstanskiy(syroe) : syroe.trim()
  const razobran = parsePhoneNumberFromString(mezhdunarodnyy)
  // isValid() — не просто «столько-то цифр», а есть ли такой план нумерации
  // в этой стране. Опечатку в коде оператора он ловит.
  if (!razobran || !razobran.isValid()) return null
  return razobran.number
}

/** Из какой страны номер: «KZ», «RU», «AE». Пусто — не разобрали. */
export function strana(syroe: string): string {
  const nomer = toE164(syroe)
  if (!nomer) return ''
  return parsePhoneNumberFromString(nomer)?.country ?? ''
}

/** Спрятать середину: +7 778 ••• •• 92. Годится для номера любой страны. */
export function mask(e164: string): string {
  const d = e164.replace(/\D/g, '')
  if (d.length < 7) return e164
  // Казахстан и Россия — привычный вид, к нему все притерпелись.
  if (d.length === 11 && d.startsWith('7')) {
    return `+${d[0]} ${d.slice(1, 4)} ••• •• ${d.slice(9, 11)}`
  }
  // Любая другая страна: видно начало и две последние цифры.
  return `+${d.slice(0, 4)} ••• ${d.slice(-2)}`
}
