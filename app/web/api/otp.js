/**
 * Коды входа через Telegram-бота. Временная замена SMS-оператору.
 *
 *   POST /api/otp  {"action":"start","label":"+7 705 ••• •• 34"}
 *       → шлёт код в чат владельца, возвращает «билет»
 *   POST /api/otp  {"action":"check","ticket":"...","code":"123456"}
 *       → говорит, верный код или нет
 *
 * Почему без базы. Vercel запускает функцию заново на каждый запрос — между
 * двумя запросами ничего не помнится. Поэтому код нигде не хранится, а
 * ВЫВОДИТСЯ из случайного зерна и тайного ключа: сервер считает его заново
 * при проверке. В браузер уезжает только зерно — по нему код не восстановить,
 * не зная ключа.
 *
 * Чем платим: счётчик попыток так не сделать, его негде хранить. Живёт код
 * пять минут. Это временно — на Railway появится база, и счётчик вернётся.
 *
 * Слово владельца 02.09.2026: временно Telegram и Vercel, потом Railway.
 */

import crypto from 'node:crypto'

const ZHIZN_KODA = 5 * 60 // секунд
const DLINA_KODA = 6

const kluch = () => process.env.OTP_SECRET || 'nastroyka-ne-zadana'

const b64 = (buf) => Buffer.from(buf).toString('base64url')
const unb64 = (text) => Buffer.from(text, 'base64url')

const podpis = (text) => crypto.createHmac('sha256', kluch()).update(text).digest()

/** Код выводится из зерна и ключа — одинаково при выдаче и при проверке. */
function kodIzZerna(zerno, do_) {
  const raw = podpis(Buffer.concat([zerno, Buffer.from(String(do_))]))
  const chislo = raw.readUInt32BE(0) % 10 ** DLINA_KODA
  return String(chislo).padStart(DLINA_KODA, '0')
}

function sobratBilet(zerno, do_) {
  const telo = `${b64(zerno)}.${do_}`
  return `${telo}.${b64(podpis(telo).subarray(0, 16))}`
}

/** Возвращает {зерно, срок} либо null, если билет подделан или испорчен. */
function razobratBilet(bilet) {
  const chasti = String(bilet || '').split('.')
  if (chasti.length !== 3) return null
  const [zernoB64, doText, podpisB64] = chasti
  const do_ = Number(doText)
  if (!Number.isFinite(do_)) return null

  const zhdem = podpis(`${zernoB64}.${do_}`).subarray(0, 16)
  let dano
  try {
    dano = unb64(podpisB64)
  } catch {
    return null
  }
  if (dano.length !== zhdem.length || !crypto.timingSafeEqual(zhdem, dano)) return null

  return { zerno: unb64(zernoB64), do: do_ }
}

async function poslatVTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat = process.env.TELEGRAM_CODE_CHAT_ID
  if (!token || !chat) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text }),
      signal: AbortSignal.timeout(10_000),
    })
    return (await res.json()).ok === true
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'only-post' })
  }

  const vhod = typeof req.body === 'string' ? safeJson(req.body) : req.body || {}

  if (vhod.action === 'start') {
    const do_ = Math.floor(Date.now() / 1000) + ZHIZN_KODA
    const zerno = crypto.randomBytes(16)
    const kod = kodIzZerna(zerno, do_)
    const metka = String(vhod.label || 'вход в реестр').slice(0, 80)

    const ushlo = await poslatVTelegram(`Реестр блогеров · ${metka}\nКод входа: ${kod}`)
    if (!ushlo) return res.status(200).json({ ok: false, reason: 'no-delivery' })

    return res.status(200).json({ ok: true, ticket: sobratBilet(zerno, do_), resendAfter: 60 })
  }

  if (vhod.action === 'check') {
    const bilet = razobratBilet(vhod.ticket)
    if (!bilet) return res.status(200).json({ ok: false, reason: 'expired' })
    if (Date.now() / 1000 > bilet.do) {
      return res.status(200).json({ ok: false, reason: 'expired' })
    }

    const vveden = String(vhod.code || '').replace(/\D/g, '')
    const zhdem = kodIzZerna(bilet.zerno, bilet.do)
    const verno =
      vveden.length === zhdem.length &&
      crypto.timingSafeEqual(Buffer.from(zhdem), Buffer.from(vveden))

    return res.status(200).json(verno ? { ok: true } : { ok: false, reason: 'wrong' })
  }

  return res.status(400).json({ ok: false, reason: 'unknown-action' })
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
