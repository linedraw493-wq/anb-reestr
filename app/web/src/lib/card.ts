import type { SetKey } from './spravochniki'

/** Откуда взялась цифра — это видит рекламодатель. Требование спеки. */
export type Istochnik = 'screen' | 'words'

export type Karta = {
  nick: string
  photo: string | null
  seti: Partial<Record<SetKey, string>>
  screenshot: string | null
  followers: string
  reach: string
  istochnik: Istochnik
  tematiki: string[]
  gorod: string
  rayon: string
  yazyk: string
  stavka: string
  dogovornaya: boolean
  showPhone: boolean
  phoneMasked: string
}

export type CardStatus = 'draft' | 'moderation' | 'published'

/** Что вернуло чтение скрина. */
export type ReadResult =
  | { ok: true; followers: string; reach: string }
  /** не разобрали — не блокируем, человек вводит руками (решение 02.09) */
  | { ok: false }

export interface CardApi {
  load(): Promise<{ karta: Karta; status: CardStatus }>
  readScreenshot(file: File): Promise<ReadResult>
  save(karta: Karta): Promise<{ ok: true; status: CardStatus }>
}

export const pustayaKarta: Karta = {
  nick: '',
  photo: null,
  seti: {},
  screenshot: null,
  followers: '',
  reach: '',
  istochnik: 'words',
  tematiki: [],
  gorod: '',
  rayon: '',
  yazyk: '',
  stavka: '',
  dogovornaya: false,
  showPhone: false,
  phoneMasked: '',
}

/** Обязательные поля. По ним считается «готово N из M» и что подсветить. */
export const OBYAZATELNO: { key: string; label: string; done: (k: Karta) => boolean }[] = [
  { key: 'nick', label: 'Ник', done: (k) => k.nick.trim().length > 1 },
  {
    key: 'seti',
    label: 'Хотя бы одна соцсеть',
    done: (k) => Object.values(k.seti).some((v) => (v ?? '').trim() !== ''),
  },
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

export const fakeCardApi: CardApi = {
  async load() {
    await wait()
    // Настоящий сервер подставит сюда то, что известно из таблицы заказчика.
    return {
      status: 'draft',
      karta: {
        ...pustayaKarta,
        nick: '@aigerim.style',
        phoneMasked: '+7 705 ••• •• 34',
      },
    }
  },

  async readScreenshot() {
    // ЗАГЛУШКА. Настоящее чтение скрина моделью ещё не делалось — это
    // самый непроверенный узел работы, он собирается отдельно.
    await wait(1600)
    return { ok: true, followers: '48200', reach: '12400' }
  },

  async save() {
    await wait(700)
    // Публикация после проверки модератором (слово владельца 02.09.2026).
    return { ok: true, status: 'moderation' }
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
