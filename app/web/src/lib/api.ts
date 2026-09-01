import { fakeCardApi, fakeModerApi } from './card'
import type { CardApi, CardStatus, Karta, ModerApi, ReadResult, Zayavka } from './card'
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

const liveCardApi: CardApi = {
  async load() {
    const res = await fetch('/api/card', { credentials: 'same-origin' })
    return (await res.json()) as { karta: Karta; status: CardStatus }
  },
  async readScreenshot(file) {
    const body = new FormData()
    body.append('file', file)
    const res = await fetch('/api/card/screenshot', {
      method: 'POST',
      body,
      credentials: 'same-origin',
    })
    if (!res.ok) return { ok: false }
    return (await res.json()) as ReadResult
  },
  save: (karta) => post<{ ok: true; status: CardStatus }>('/api/card', karta),
}

export const cardApi: CardApi = USE_FAKE ? fakeCardApi : liveCardApi

const liveModerApi: ModerApi = {
  async list() {
    const res = await fetch('/api/moder/zayavki', { credentials: 'same-origin' })
    return (await res.json()) as Zayavka[]
  },
  approve: async (id) => void (await post('/api/moder/approve', { id })),
  reject: async (id, prichina) => void (await post('/api/moder/reject', { id, prichina })),
  remove: async (id) => void (await post('/api/moder/remove', { id })),
  update: async (karta) => void (await post('/api/moder/update', karta)),
  create: () => post<Zayavka>('/api/moder/create', {}),
}

export const moderApi: ModerApi = USE_FAKE ? fakeModerApi : liveModerApi
