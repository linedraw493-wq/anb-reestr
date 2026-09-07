/** Откуда взялась цифра — это видит рекламодатель. Требование спеки. */
export type Istochnik = 'screen' | 'words'

export type Karta = {
  id: string
  nick: string
  /** имя и фамилия — по желанию, 07.09.2026 */
  fio: string
  /** короткий рассказ о себе, до 400 знаков */
  bio: string
  photo: string | null
  /** вставленные ссылки на профили — сеть определяется по ссылке */
  ssylki: string[]
  screenshot: string | null
  followers: string
  reach: string
  istochnik: Istochnik
  /** когда цифры записаны в последний раз, `2026-09-07`. Спека, день 4:
      «с пометкой источника и датой». Пусто — карточка старше 07.09.2026 */
  cifryOt: string | null
  /** что ИИ увидел на скрине — модератор сверяет с тем, что человек указал */
  proverka: Proverka | null
  tematiki: string[]
  gorod: string
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
  /** готовые причины отказа: список правится в базе, тут только читаем */
  prichiny(): Promise<string[]>
}

export const pustayaKarta: Karta = {
  id: '',
  nick: '',
  fio: '',
  bio: '',
  photo: null,
  ssylki: [],
  screenshot: null,
  followers: '',
  reach: '',
  istochnik: 'words',
  cifryOt: null,
  proverka: null,
  tematiki: [],
  gorod: '',
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
  { key: 'gorod', label: 'Город', done: (k) => k.gorod !== '' },
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
      fio: '',
      bio: '',
      ssylki: ['https://instagram.com/dastan.tech', 'https://t.me/dastan_tech'],
      followers: '31700',
      reach: '8900',
      istochnik: 'screen',
      cifryOt: null,
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
      fio: '',
      bio: '',
      ssylki: ['https://tiktok.com/@meiram.eats'],
      followers: '92400',
      reach: '15000',
      istochnik: 'words',
      cifryOt: null,
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
      fio: '',
      bio: '',
      ssylki: ['https://instagram.com/aigerim.style'],
      followers: '48200',
      reach: '12400',
      istochnik: 'screen',
      cifryOt: null,
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
  async prichiny() {
    await wait(150)
    return [...PRICHINY_ZAPASNYE]
  },
}

/** Те же формулировки, что лежат в базе (миграция 006). Для заглушки. */
const PRICHINY_ZAPASNYE = [
  'Цифры не сходятся со скрином статистики',
  'Скрин нечитаемый — загрузите чёткий',
  'Ссылка ведёт не на ваш профиль',
  'Тематика не соответствует содержанию профиля',
  'Профиль закрыт — рекламодатель не сможет его посмотреть',
  'Ставка выглядит ошибочной',
]

/* -------------------------------------------------------------- кружок ника */

/**
 * Две буквы для кружка: «@alina_makeup_uka» → «AM».
 *
 * Жила в двух экранах слово в слово — каталог и страница блогера; сведена
 * сюда 06.09.2026, когда к ней добавился цвет.
 */
export function initsialy(nick: string): string {
  const clean = nick.replace(/^@/, '')
  if (!clean) return '—'
  const parts = clean.split(/[._-]/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
}

/**
 * Цвет кружка — из ника.
 *
 * Фото есть у одной карточки из трёхсот шести, у остальных стоят буквы.
 * Одним цветом они сливались в серую кашу. Оттенок считается из букв: тот же
 * блогер всегда того же цвета, а не случайного при каждой перерисовке.
 * Сам цвет собирает CSS (`.ava.ton`) — здесь только число градусов.
 */
export function ton(nick: string): { '--ton': string } {
  let s = 0
  for (const ch of nick) s = (s * 31 + ch.codePointAt(0)!) % 360
  return { '--ton': `${s}deg` }
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

/* Состояний карточки четыре, и называются они одинаково везде: у блогера,
   в админке и в списках. Слово владельца 07.09.2026 — «оптимизируй
   статусы»; до этого одно и то же состояние в разных местах звалось
   по-разному, и понять, что происходит, было нельзя. */
export const STATUS_NAZVANIE: Record<CardStatus, string> = {
  draft: 'Не заполнена',
  moderation: 'На проверке',
  published: 'В каталоге',
  rejected: 'Возвращена',
}

/** Что это значит человеческим языком — под названием состояния. */
export const STATUS_POYASNENIE: Record<CardStatus, string> = {
  draft: 'Блогер ещё не отправил карточку. В каталоге её нет.',
  moderation: 'Ждёт решения администратора. В каталоге пока нет.',
  published: 'Видна в каталоге, рекламодатели её находят.',
  rejected: 'Возвращена блогеру с причиной. В каталоге нет, пока он не поправит.',
}

/** Цвет плашки состояния — один и тот же во всех списках. */
export const STATUS_VID: Record<CardStatus, string> = {
  draft: 'say',
  moderation: 'neutral',
  published: 'ok',
  rejected: 'err',
}
