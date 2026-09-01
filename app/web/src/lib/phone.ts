import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js'

/* Казахстан. Проверяем, что номер настоящий мобильный, и сами расставляем
   пробелы, пока человек печатает. */

export function formatAsTyped(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return ''
  // человек может начать с 8 — приводим к +7
  const normal = digits.startsWith('8') ? '7' + digits.slice(1) : digits
  return new AsYouType('KZ').input('+' + normal)
}

/** Даёт номер в виде +77051234567, либо null, если номер не настоящий. */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  const normal = digits.startsWith('8') ? '7' + digits.slice(1) : digits
  const parsed = parsePhoneNumberFromString('+' + normal, 'KZ')
  if (!parsed || !parsed.isValid() || parsed.country !== 'KZ') return null
  return parsed.number
}

export function mask(e164: string): string {
  const d = e164.replace(/\D/g, '')
  if (d.length < 11) return e164
  return `+${d[0]} ${d.slice(1, 4)} ••• •• ${d.slice(9, 11)}`
}
