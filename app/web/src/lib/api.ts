import { fakeCardApi, fakeModerApi } from './card'
import type {
  CardApi,
  CardStatus,
  ModerApi,
  ReadResult,
  StranicaZayavok,
  ZagruzkaKartochki,
  Zayavka,
} from './card'
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
  | {
      vnutri: true
      rol: 'blogger' | 'moderator' | 'admin'
      imya: string | null
      telefon: string
      /** заполнена ли карточка — шапке решать, как её называть */
      kartochkaZapolnena: boolean
    }

export async function ktoYa(): Promise<Ya> {
  if (USE_FAKE)
    return { vnutri: true, rol: 'admin', imya: 'Заглушка', telefon: '', kartochkaZapolnena: true }
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
  async list({ status, stranica }) {
    let otvet: Response
    const adres = `/api/moder/zayavki?status=${status}&stranica=${stranica}`
    try {
      otvet = await fetch(adres, { credentials: 'same-origin' })
    } catch {
      throw new ServerMolchit()
    }
    if (otvet.status === 403) throw new NetDostupa()
    if (!otvet.ok) throw new ServerMolchit()
    const dannye = await otvet.json()
    if (!Array.isArray(dannye?.zayavki)) throw new ServerMolchit()
    return dannye as StranicaZayavok
  },
  approve: async (id) => void (await post('/api/moder/approve', { id })),
  reject: async (id, prichina) => void (await post('/api/moder/reject', { id, prichina })),
  remove: async (id) => void (await post('/api/moder/remove', { id })),
  update: async (karta) => void (await post('/api/moder/update', { ...karta, id: karta.id })),
  create: (telefon, nick) => post<Zayavka>('/api/moder/create', { telefon, nick }),
  skryt: async (id, skryt) => void (await post('/api/moder/skryt', { id, skryt })),
  async prichiny() {
    try {
      const otvet = await get<{ prichiny?: { id: number; tekst: string }[] }>(
        '/api/moder/prichiny',
      )
      return (otvet.prichiny ?? []).map((p) => p.tekst)
    } catch {
      // Список — подсказка, а не условие работы: не пришёл, модератор пишет руками.
      return []
    }
  },
}

export const moderApi: ModerApi = USE_FAKE ? fakeModerApi : liveModerApi

/* ------------------------------------------------- назначение модератора */

export type Rol = 'blogger' | 'moderator' | 'admin'

export type Chelovek = {
  chelovekId: number
  telefon: string | null
  nik: string | null
  imya: string | null
  rol: Rol
  /** админ заведён настройками сервера — нажатием его не снять */
  izNastroek: boolean
  /** это вы: свою роль себе не меняют */
  etoYa: boolean
}

/**
 * Кто есть кто. Только для админа: модератору эта дверь отвечает 403,
 * и экран «Модераторы» ему в меню не показывается.
 */
export const adminApi = {
  async lyudi(poisk: string): Promise<{ moderatory: Chelovek[]; nayden: Chelovek[] }> {
    if (USE_FAKE) return { moderatory: [], nayden: [] }
    const adres = `/api/moder/lyudi${poisk.trim() ? `?poisk=${encodeURIComponent(poisk.trim())}` : ''}`
    const otvet = await fetch(adres, { credentials: 'same-origin' })
    if (otvet.status === 403) throw new NetDostupa()
    if (!otvet.ok) throw new ServerMolchit()
    return (await otvet.json()) as { moderatory: Chelovek[]; nayden: Chelovek[] }
  },

  naznachit: (chelovekId: number, rol: Rol) =>
    post<{ ok: boolean; reason?: string }>('/api/moder/rol', { chelovekId, rol }),
}
