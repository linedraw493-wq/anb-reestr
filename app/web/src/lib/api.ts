import { fakeCardApi, fakeModerApi } from './card'
import type { CardApi, CardStatus, ModerApi, ReadResult, ZagruzkaKartochki, Zayavka } from './card'
import { fakeApi } from './fake'
import { USE_FAKE } from './rezhim'
import type { AuthApi, CheckResult, InviteState, StartResult } from './types'

export { USE_FAKE }

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin', // cookie сессии ездит сама
  })
  return (await res.json()) as T
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin' })
  return (await res.json()) as T
}

/* ---------------------------------------------------------------- вход */

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

export async function vyyti(): Promise<void> {
  if (!USE_FAKE) await post('/api/auth/exit', {})
}

export type Ya =
  | { vnutri: false }
  | { vnutri: true; rol: 'blogger' | 'moderator' | 'admin'; imya: string | null; telefon: string }

export async function ktoYa(): Promise<Ya> {
  if (USE_FAKE) return { vnutri: true, rol: 'admin', imya: 'Заглушка', telefon: '' }
  try {
    return await get<Ya>('/api/me')
  } catch {
    return { vnutri: false }
  }
}

/* ------------------------------------------------------------ карточка */

const liveCardApi: CardApi = {
  load: () => get<ZagruzkaKartochki>('/api/card'),

  async readScreenshot(file) {
    const telo = new FormData()
    telo.append('file', file)
    const res = await fetch('/api/card/screenshot', {
      method: 'POST',
      body: telo,
      credentials: 'same-origin',
    })
    if (!res.ok) return { ok: false }
    return (await res.json()) as ReadResult
  },

  save: (karta) => post<{ ok: true; status: CardStatus }>('/api/card', karta),
}

export const cardApi: CardApi = USE_FAKE ? fakeCardApi : liveCardApi

/** Загрузить фото. Возвращает адрес картинки на сервере либо локальный. */
export async function zagruzitFoto(file: File): Promise<string> {
  if (USE_FAKE) return URL.createObjectURL(file)
  const telo = new FormData()
  telo.append('file', file)
  const res = await fetch('/api/card/photo', {
    method: 'POST',
    body: telo,
    credentials: 'same-origin',
  })
  const otvet = (await res.json()) as { ok: boolean; url?: string }
  return otvet.url ?? URL.createObjectURL(file)
}

/* ----------------------------------------------------------- модератор */

/** Сервер может ответить «нет прав» или лечь. Это не список — и экран об этом узнает. */
export class NetDostupa extends Error {}
export class ServerMolchit extends Error {}

const liveModerApi: ModerApi = {
  async list() {
    let otvet: Response
    try {
      otvet = await fetch('/api/moder/zayavki', { credentials: 'same-origin' })
    } catch {
      throw new ServerMolchit()
    }
    if (otvet.status === 403) throw new NetDostupa()
    if (!otvet.ok) throw new ServerMolchit()
    const dannye = await otvet.json()
    if (!Array.isArray(dannye)) throw new ServerMolchit()
    return dannye as Zayavka[]
  },
  approve: async (id) => void (await post('/api/moder/approve', { id })),
  reject: async (id, prichina) => void (await post('/api/moder/reject', { id, prichina })),
  remove: async (id) => void (await post('/api/moder/remove', { id })),
  update: async (karta) => void (await post('/api/moder/update', { ...karta, id: karta.id })),
  create: (telefon, nick) => post<Zayavka>('/api/moder/create', { telefon, nick }),
}

export const moderApi: ModerApi = USE_FAKE ? fakeModerApi : liveModerApi
