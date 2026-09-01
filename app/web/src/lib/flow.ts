import type { Flow } from './types'

/* Экран кода должен пережить обновление страницы, поэтому «откуда пришли»
   лежит в памяти вкладки, а не в адресе — номер телефона в адресной строке
   светиться не должен. */

const KEY = 'anb.flow'

export function saveFlow(flow: Flow): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(flow))
  } catch {
    /* приватное окно — переживём, экран просто попросит номер заново */
  }
}

export function readFlow(): Flow | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Flow) : null
  } catch {
    return null
  }
}

export function clearFlow(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* пусто */
  }
}
