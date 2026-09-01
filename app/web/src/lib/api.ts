import { fakeApi } from './fake'
import type { AuthApi, CheckResult, InviteState, StartResult } from './types'

/* ---------------------------------------------------------------------------
   Выключатель. Одна строка в .env решает, кто отвечает экранам:
     VITE_API=fake  — заглушка в браузере (шаг 1, сервера нет)
     VITE_API=live  — настоящий сервер (шаг 2 и дальше)
   Провайдер SMS переключается на сервере тем же приёмом: OTP=fake|twilio.
--------------------------------------------------------------------------- */

export const USE_FAKE = (import.meta.env.VITE_API ?? 'fake') === 'fake'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin', // cookie сессии ездит сама
  })
  return (await res.json()) as T
}

const liveApi: AuthApi = {
  async invite(token) {
    const res = await fetch(`/api/invite/${encodeURIComponent(token)}`, {
      credentials: 'same-origin',
    })
    if (!res.ok) return { status: 'dead' }
    return (await res.json()) as InviteState
  },
  start: (input) => post<StartResult>('/api/auth/start', input),
  check: (input) => post<CheckResult>('/api/auth/check', input),
}

export const api: AuthApi = USE_FAKE ? fakeApi : liveApi
