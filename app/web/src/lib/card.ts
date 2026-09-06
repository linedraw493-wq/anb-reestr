import { nuzhenRayon } from './spravochniki'

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
  /** показы — третье число, которого просит спека. В карточке поля нет */
  pokazy: string | null
  /** насколько уверенно, 0–1 */
  tochnost: number
  /** совпало ли с тем, что человек оставил в полях */
  sovpalo: boolean
  /** что смутило — модератору для решения */
  zamechaniya: string[]
}

export type CardStatus = 'draft' | 'moderation' | 'published' | 'rejected'

export type PravkaCifr = { podpischiki: string; ohvat: string; istochnik: Istochnik }

export type Zayavka = {
  karta: Karta
  status: CardStatus
  podana: string
  prichina?: string | null
  /** цифры, поданные на проверку у уже опубликованной карточки */
  pravkaCifr?: PravkaCifr | null
}

export type ReadResult =
  | { ok: true; followers: string; reach: string; proverka: Proverka }
  /** не разобрали — не блокируем, человек вводит руками (решение 02.09) */
  | { ok: false }

export type ZagruzkaKartochki = {
  karta: Karta
  status: CardStatus
  /** что написал модератор, если карточку вернули */
  prichinaOtkaza?: string | null
}

export interface CardApi {
  load(): Promise<ZagruzkaKartochki>
  readScreenshot(file: File): Promise<ReadResult>
  save(karta: Karta): Promise<{ ok: true; status: CardStatus }>
}

/** Страница очереди модератора. Все 306 карточек разом не тянем. */
export type StranicaZayavok = {
  vsego: number
  stranica: number
  stranic: number
  /** сколько всего в каждом состоянии — для счётчиков на вкладках */
  scheta: Partial<Record<CardStatus, number>>
  zayavki: Zayavka[]
}

export interface ModerApi {
  list(otbor: { status: CardStatus; stranica: number }): Promise<StranicaZayavok>
  approve(id: string): Promise<void>
  reject(id: string, prichina: string): Promise<void>
  remove(id: string): Promise<void>
  update(karta: Karta): Promise<void>
  create(telefon: string, nick: string): Promise<Zayavka>
  /** убрать из каталога, не теряя данных — спека, день 5 */
  skryt(id: string, skryt: boolean): Promise<void>
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
        pokazy: '24100',
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
        pokazy: null,
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
      proverka: {
        followers: '48200',
        reach: '12400',
        pokazy: '31800',
        tochnost: 0.97,
        sovpalo: true,
        zamechaniya: [],
      },
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
    // ИИ-чтение отложено по слову владельца 02.09.2026: пока не притворяемся,
    // что читаем. Скрин принимаем и храним, цифры человек вводит сам.
    // Включится, когда будет сервер и ключ — меняется только эта функция.
    await wait(500)
    return { ok: false }
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
  async list({ status }) {
    await wait(300)
    const scheta: Partial<Record<CardStatus, number>> = {}
    for (const z of zayavki) scheta[z.status] = (scheta[z.status] ?? 0) + 1
    const svoi = zayavki.filter((z) => z.status === status)
    return {
      vsego: svoi.length,
      stranica: 1,
      stranic: 1,
      scheta,
      zayavki: svoi.map((z) => ({ ...z, karta: { ...z.karta } })),
    }
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
  async skryt(id, pryachem) {
    await wait(200)
    const z = zayavki.find((x) => x.karta.id === id)
    if (z) z.status = pryachem ? 'draft' : 'published'
  },
  async create(_telefon: string, nick: string) {
    await wait(250)
    const z: Zayavka = {
      karta: { ...pustayaKarta, id: `z${Date.now()}`, nick: nick || '@новая.карточка' },
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
  // 999 999 округляется до 1000.0K — это читается как ошибка, поэтому
  // округляем сначала, а уже потом решаем, тысячи это или миллионы.
  if (Math.round(d / 100_000) >= 10) return `${(d / 1_000_000).toFixed(1).replace('.0', '')}M`
  if (d >= 1000) return `${(d / 1000).toFixed(1).replace('.0', '')}K`
  return String(d)
}

export const STATUS_NAZVANIE: Record<CardStatus, string> = {
  draft: 'Черновик',
  moderation: 'На проверке',
  published: 'В каталоге',
  rejected: 'Отклонена',
}
