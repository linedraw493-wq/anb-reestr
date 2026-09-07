/* ---------------------------------------------------------------------------
   Код входа на заглушке.

     VITE_OTP=fake — код всегда 000000, ничего никуда не летит
     VITE_OTP=live — код выдаёт и проверяет сервер (`/api/auth/start` и
                     `/api/auth/check`), а сюда никто не заходит

   Раньше здесь жил ещё и «живой» путь — запрос на `/api/otp`, отдельную
   функцию Vercel времён заглушки. Сервера тогда не было, кода негде было
   хранить. Сервер появился 02.09.2026, вход переехал в `/api/auth/*`, и
   тот путь остался мёртвым: маршрута `/api/otp` на сервере нет вовсе.
   Убран 06.09.2026 вместе с функцией `web/api/otp.js`.
--------------------------------------------------------------------------- */

export const OTP_LIVE = (import.meta.env.VITE_OTP ?? 'fake') === 'live'

export type OtpStart =
  { ok: true; ticket: string; resendAfter: number } | { ok: false; reason: 'no-delivery' }

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

/** На заглушке — только заглушка; живой вход идёт мимо этого файла. */
export const otp: Otp = fakeOtp

export const otpPodskazka = OTP_LIVE
  ? 'Код уходит в Telegram-бота @Kikokpklkbot — все коды падают в один чат'
  : `Заглушка: сервера нет, код всегда ${FAKE_CODE}`
