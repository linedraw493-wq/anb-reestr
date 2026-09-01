/* ---------------------------------------------------------------------------
   Выдача и проверка кода. Отдельный выключатель от остального:

     VITE_OTP=fake — код всегда 000000, ничего никуда не летит
     VITE_OTP=live — код уходит в Telegram-бота через /api/otp

   Всё остальное (приглашения, карточки, заявки) пока живёт на заглушке —
   для них нужна база, а её на Vercel нет. Появится на Railway.
--------------------------------------------------------------------------- */

export const OTP_LIVE = (import.meta.env.VITE_OTP ?? 'fake') === 'live'

export type OtpStart =
  | { ok: true; ticket: string; resendAfter: number }
  | { ok: false; reason: 'no-delivery' }

export interface Otp {
  /** label — что показать в сообщении, чтобы было понятно, чей это код */
  start(label: string): Promise<OtpStart>
  check(ticket: string, code: string): Promise<boolean>
}

const FAKE_CODE = '000000'

export const fakeOtp: Otp = {
  async start() {
    await new Promise((r) => setTimeout(r, 300))
    return { ok: true, ticket: 'fake', resendAfter: 60 }
  },
  async check(_ticket, code) {
    await new Promise((r) => setTimeout(r, 300))
    return code === FAKE_CODE
  },
}

async function post(body: unknown) {
  const res = await fetch('/api/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as { ok: boolean; ticket?: string; resendAfter?: number }
}

export const liveOtp: Otp = {
  async start(label) {
    try {
      const r = await post({ action: 'start', label })
      if (!r.ok || !r.ticket) return { ok: false, reason: 'no-delivery' }
      return { ok: true, ticket: r.ticket, resendAfter: r.resendAfter ?? 60 }
    } catch {
      return { ok: false, reason: 'no-delivery' }
    }
  },
  async check(ticket, code) {
    try {
      return (await post({ action: 'check', ticket, code })).ok
    } catch {
      return false
    }
  },
}

export const otp: Otp = OTP_LIVE ? liveOtp : fakeOtp

export const otpPodskazka = OTP_LIVE
  ? 'Код уходит в Telegram-бота @Kikokpklkbot — все коды падают в один чат'
  : `Заглушка: сервера нет, код всегда ${FAKE_CODE}`
