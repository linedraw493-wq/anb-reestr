import { GORODA } from './spravochniki'

/** Откуда взялась цифра — это видит рекламодатель. Требование спеки. */
export type Istochnik = 'screen' | 'words'

export type Karta = {
  id: string
  nick: string
  photo: string | null
  /** вставленные ссылки на профили — сеть определяется по ссылке */
  ssylki: string[]
  screenshot: string | null
  followers: string
  reach: string
  istochnik: Istochnik
  /** что ИИ увидел на скрине — модератор сверяет с тем, что человек указал */
  proverka: Proverka | null
  tematiki: string[]
  gorod: string
  rayon: string
  yazyk: string
  stavka: string
  dogovornaya: boolean
}

/** Отчёт ИИ-чтения скрина. Модератор смотрит его, а не картинку. */
export type Proverka = {
  /** что прочитали с картинки */
  followers: string | null
  reach: string | null
  /** насколько уверенно, 0–1 */
  tochnost: number
  /** совпало ли с тем, что человек оставил в полях */
  sovpalo: boolean
  /** что смутило — модератору для решения */
  zamechaniya: string[]
}

export type CardStatus = 'draft' | 'moderation' | 'published' | 'rejected'

export type Zayavka = {
  karta: Karta
  status: CardStatus
  podana: string
  prichina?: string
}

export type ReadResult =
  | { ok: true; followers: string; reach: string; proverka: Proverka }
  /** не разобрали — не блокируем, человек вводит руками (решение 02.09) */
  | { ok: false }

export interface CardApi {
  load(): Promise<{ karta: Karta; status: CardStatus }>
  readScreenshot(file: File): Promise<ReadResult>
  save(karta: Karta): Promise<{ ok: true; status: CardStatus }>
}

export interface ModerApi {
  list(): Promise<Zayavka[]>
  approve(id: string): Promise<void>
  reject(id: string, prichina: string): Promise<void>
  remove(id: string): Promise<void>
  update(karta: Karta): Promise<void>
  create(): Promise<Zayavka>
}

export const pustayaKarta: Karta = {
  id: '',
  nick: '',
  photo: null,
  ssylki: [],
  screenshot: null,
  followers: '',
  reach: '',
  istochnik: 'words',
  proverka: null,
  tematiki: [],
  gorod: '',
  rayon: '',
  yazyk: '',
  stavka: '',
  dogovornaya: false,
}

/** Есть ли у города районы — от этого зависит, обязателен ли район. */
export function nuzhenRayon(gorod: string): boolean {
  return (GORODA[gorod] ?? []).length > 0
}

/** Обязательные поля. По ним считается «готово N из M». */
export const OBYAZATELNO: { key: string; label: string; done: (k: Karta) => boolean }[] = [
  { key: 'nick', label: 'Ник', done: (k) => k.nick.trim().length > 1 },
  { key: 'ssylki', label: 'Ссылка на профиль', done: (k) => k.ssylki.length > 0 },
  { key: 'followers', label: 'Подписчики', done: (k) => k.followers.trim() !== '' },
  { key: 'reach', label: 'Охват', done: (k) => k.reach.trim() !== '' },
  { key: 'tematiki', label: 'Тематика', done: (k) => k.tematiki.length > 0 },
  {
    // Адрес обязателен целиком: город, а где есть районы — и район.
    key: 'adres',
    label: 'Адрес',
    done: (k) => k.gorod !== '' && (!nuzhenRayon(k.gorod) || k.rayon !== ''),
  },
  { key: 'yazyk', label: 'Язык', done: (k) => k.yazyk !== '' },
]

export function gotovo(k: Karta): number {
  return OBYAZATELNO.filter((f) => f.done(k)).length
}

/* --------------------------------------------------------------- заглушка */

const wait = (ms = 420) => new Promise((r) => setTimeout(r, ms))

/** Общая память заглушки: то, что видит и блогер, и модератор. */
const zayavki: Zayavka[] = [
  {
    status: 'moderation',
    podana: 'сегодня, 11:20',
    karta: {
      ...pustayaKarta,
      id: 'z1',
      nick: '@dastan.tech',
      ssylki: ['https://instagram.com/dastan.tech', 'https://t.me/dastan_tech'],
      followers: '31700',
      reach: '8900',
      istochnik: 'screen',
      proverka: {
        followers: '31700',
        reach: '8900',
        tochnost: 0.94,
        sovpalo: true,
        zamechaniya: [],
      },
      tematiki: ['IT и технологии', 'Образование'],
      gorod: 'Астана',
      rayon: 'Есильский',
      yazyk: 'Русский',
      stavka: '45000',
    },
  },
  {
    status: 'moderation',
    podana: 'сегодня, 09:04',
    karta: {
      ...pustayaKarta,
      id: 'z2',
      nick: '@meiram.eats',
      ssylki: ['https://tiktok.com/@meiram.eats'],
      followers: '92400',
      reach: '15000',
      istochnik: 'words',
      proverka: {
        followers: '19200',
        reach: null,
        tochnost: 0.71,
        sovpalo: false,
        zamechaniya: [
          'На скрине 19 200 подписчиков, в карточке указано 92 400',
          'Охват на картинке не найден',
        ],
      },
      tematiki: ['Еда и рестораны'],
      gorod: 'Шымкент',
      rayon: 'Аль-Фарабийский',
      yazyk: 'Оба',
      dogovornaya: true,
    },
  },
  {
    status: 'published',
    podana: 'вчера, 16:40',
    karta: {
      ...pustayaKarta,
      id: 'z3',
      nick: '@aigerim.style',
      ssylki: ['https://instagram.com/aigerim.style'],
      followers: '48200',
      reach: '12400',
      istochnik: 'screen',
      proverka: { followers: '48200', reach: '12400', tochnost: 0.97, sovpalo: true, zamechaniya: [] },
      tematiki: ['Мода', 'Красота'],
      gorod: 'Алматы',
      rayon: 'Медеуский',
      yazyk: 'Оба',
      stavka: '60000',
    },
  },
]

export const fakeCardApi: CardApi = {
  async load() {
    await wait()
    // Настоящий сервер подставит сюда то, что известно из таблицы заказчика.
    return { status: 'draft', karta: { ...pustayaKarta, id: 'my', nick: '@aigerim.style' } }
  },

  async readScreenshot() {
    // ЗАГЛУШКА вместо настоящего ИИ-чтения. Настоящее — на сервере, нужен ключ.
    await wait(1600)
    const proverka: Proverka = {
      followers: '48200',
      reach: '12400',
      tochnost: 0.93,
      sovpalo: true,
      zamechaniya: [],
    }
    return { ok: true, followers: '48200', reach: '12400', proverka }
  },

  async save(karta) {
    await wait(700)
    // Публикация только после проверки модератором (слово владельца 02.09.2026).
    zayavki.unshift({
      karta: { ...karta, id: `z${Date.now()}` },
      status: 'moderation',
      podana: 'только что',
    })
    return { ok: true, status: 'moderation' }
  },
}

export const fakeModerApi: ModerApi = {
  async list() {
    await wait(300)
    return zayavki.map((z) => ({ ...z, karta: { ...z.karta } }))
  },
  async approve(id) {
    await wait(250)
    const z = zayavki.find((x) => x.karta.id === id)
    if (z) {
      z.status = 'published'
      delete z.prichina
    }
  },
  async reject(id, prichina) {
    await wait(250)
    const z = zayavki.find((x) => x.karta.id === id)
    if (z) {
      z.status = 'rejected'
      z.prichina = prichina
    }
  },
  async remove(id) {
    await wait(250)
    const i = zayavki.findIndex((x) => x.karta.id === id)
    if (i >= 0) zayavki.splice(i, 1)
  },
  async update(karta) {
    await wait(250)
    const z = zayavki.find((x) => x.karta.id === karta.id)
    if (z) z.karta = { ...karta }
  },
  async create() {
    await wait(250)
    const z: Zayavka = {
      karta: { ...pustayaKarta, id: `z${Date.now()}`, nick: '@новая.карточка' },
      status: 'draft',
      podana: 'заведена вручную',
    }
    zayavki.unshift(z)
    return { ...z, karta: { ...z.karta } }
  },
}

/** 48200 → «48 200». Для показа, не для хранения. */
export function razdelit(n: string): string {
  const d = n.replace(/\D/g, '')
  if (d === '') return ''
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** 48200 → «48.2K». Для карточки в каталоге. */
export function korotko(n: string): string {
  const d = Number(n.replace(/\D/g, ''))
  if (!d) return '—'
  if (d >= 1_000_000) return `${(d / 1_000_000).toFixed(1).replace('.0', '')}M`
  if (d >= 1000) return `${(d / 1000).toFixed(1).replace('.0', '')}K`
  return String(d)
}

export const STATUS_NAZVANIE: Record<CardStatus, string> = {
  draft: 'Черновик',
  moderation: 'На проверке',
  published: 'В каталоге',
  rejected: 'Отклонена',
}
